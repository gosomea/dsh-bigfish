import {motionAllowed} from './motion-policy.js';
import type { Action, Scene, ScenePack } from '../contract/scenes.js';
import { canWhip } from '../contract/scenes.js';
import type { Snapshot, WorkState } from '../contract/types.js';
const mayWhip = new Set<WorkState>(['generating', 'reasoning', 'streaming-gap']);
export interface Direction {
  sceneId: string; actionId: string; reactionId: string | null; band: number;
  transition: { fromPose: string; toPose: string } | null; whipAllowed: boolean;
}
/** Seeded selection is replayable and never relies on a module-global RNG. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
}
export class Director {
  private scene: Scene | null = null;
  private action: Action | null = null;
  private reaction: Action | null = null;
  private until = 0;
  private reactionUntil = 0;
  private sceneAt = -Infinity;
  private lastAt = -Infinity;
  private bandAt = -Infinity;
  private band = 0;
  private task = '';
  private lastState = '';
  private recent: string[] = [];
  private policyKey = '';
  private readonly cooldown = new Map<string, number>();
  private previous = '';
  private pendingTransition: Direction['transition'] = null;
  constructor(private readonly pack: ScenePack, private readonly random = seeded(1)) {}
  /** The renderer acknowledges completion; until then all whip motion stays disabled. */
  completeTransition(): void { this.pendingTransition = null; }
  private select<T extends { weight: number }>(items: T[]): T | null {
    let target = this.random() * items.reduce((sum, item) => sum + item.weight, 0);
    for (const item of items) { target -= item.weight; if (target < 0) return item; }
    return items.at(-1) ?? null;
  }
  tick(input: Pick<Snapshot, 'sessionId' | 'turn' | 'state' | 'pressure' | 'fatigue'>, now: number, policy: {richness:number;reduced:boolean;idleMotion:string;switchReady?:boolean;whipEnabled?:boolean} = {richness: 2, reduced: false, idleMotion: ''}): Direction {
    if (!Number.isFinite(now) || now < this.lastAt) throw new Error('Director clock must be monotonic');
    this.lastAt = now;
    const stateChanged=this.lastState!==input.state;this.lastState=input.state;
    const switchReady=policy.switchReady!==false||stateChanged;
    const task = `${input.sessionId}:${input.turn}`;
    if (task !== this.task) {
      this.task = task; this.scene = null; this.action = this.reaction = null;
      this.cooldown.clear(); this.recent=[]; this.previous = ''; this.band = 0; this.bandAt = now;
      this.pendingTransition = null;
    }
    const policyKey=`${policy.richness}:${policy.reduced}:${policy.whipEnabled!==false}`;
    if(policyKey!==this.policyKey){this.policyKey=policyKey;this.action=null;this.scene=null;this.until=0;}
    const desired = Math.min(4, Math.floor(input.pressure * 5));
    if (!mayWhip.has(input.state)) { this.band = 0; this.bandAt = now; }
    else if (desired !== this.band && now - this.bandAt >= 1500) {
      const threshold = desired > this.band ? (this.band + 1) / 5 + .05 : this.band / 5 - .05;
      if (desired > this.band ? input.pressure >= threshold : input.pressure <= threshold) {
        this.band = desired; this.bandAt = now;
      }
    }
    const stable=policy.reduced||policy.richness===0;
    const permitted=(a:Action)=>motionAllowed(a.motion,policy.richness,policy.reduced)&&(policy.whipEnabled!==false||!['flinch','dodge'].includes(a.motion))&&a.states.includes(input.state)&&(stable||(input.pressure>=a.pressure[0]&&input.pressure<=a.pressure[1]&&input.fatigue>=a.fatigue[0]&&input.fatigue<=a.fatigue[1]));
    const eligible = this.pack.scenes.filter(s => s.states.includes(input.state)&&s.actions.some(a=>a.kind==='loop'&&permitted(a)));
    const previousAction = this.action;
    const fallback = this.pack.scenes.find(s => s.id === this.pack.fallbackSceneId)!;
    const forced = !this.scene || !eligible.some(scene => scene.id === this.scene!.id);
    let changed = false;
    if ((forced && (switchReady || !this.scene)) || (switchReady && this.scene && !stable && now - this.sceneAt >= Math.max(this.scene.minHoldMs,policy.richness===1?60000:0))) {
      const next = (stable ? eligible[0] : this.select(eligible.map(s => ({ ...s, weight: 1 })))) ?? fallback;
      if (next.id !== this.scene?.id) {
        this.scene = next; this.sceneAt = now; this.action = this.reaction = null; changed = true;
      }
    }
    const scene = this.scene ?? fallback;
    const valid = (a: Action) => permitted(a) && (!policy.idleMotion || input.state!=='idle' || a.motion===policy.idleMotion);
    let transition: Direction['transition'] = null;
    if (changed || !this.action || (switchReady && (!valid(this.action) || now >= this.until)) || (input.state==='idle' && policy.idleMotion!==this.action.motion)) {
      const loops = scene.actions.filter(a => a.kind === 'loop' && valid(a));
      const available = loops.filter(a => a.id !== this.action?.id && (this.cooldown.get(`${scene.id}:${a.id}`) ?? 0) <= now);
      const recentFree=available.filter(a=>!this.recent.includes(a.id));
      const fresh = recentFree.length ? recentFree : available.length ? available : loops.filter(a => a.id !== this.action?.id);
      const next = (stable ? loops[0] : null) ?? (!this.action && input.state === 'idle' ? loops.find(a => a.motion === 'wait-sign') : null) ?? this.select(fresh.length ? fresh : loops) ?? scene.actions.find(a => a.kind === 'loop')!;
      if (this.action && this.action.exitPose !== next.entryPose) transition = { fromPose: this.action.exitPose, toPose: next.entryPose };
      this.action = next; this.until = stable || (input.state==='idle' && policy.idleMotion) ? Infinity : now + Math.max(next.durationMs,policy.richness===1?12000:6000);
      this.recent=[...this.recent.filter(id=>id!==next.id),next.id].slice(-3);
      this.cooldown.set(`${scene.id}:${next.id}`, this.until + next.cooldownMs);
      this.reaction = null;
    }
    if (changed && previousAction) transition = { fromPose: previousAction.exitPose, toPose: this.action!.entryPose };
    if (transition) this.pendingTransition = transition;
    if (this.reaction && (!valid(this.reaction) || now >= this.reactionUntil)) this.reaction = null;
    if (!this.reaction) {
      const candidates = scene.actions.filter(a => a.kind !== 'loop' && valid(a)
        && !a.channels.some(c => this.action!.channels.includes(c))
        && (this.cooldown.get(`${scene.id}:${a.id}`) ?? 0) <= now);
      const fresh = candidates.filter(a => a.id !== this.previous);
      this.reaction = this.select(fresh.length ? fresh : candidates);
      if (this.reaction) {
        this.previous = this.reaction.id; this.reactionUntil = now + this.reaction.durationMs;
        this.cooldown.set(`${scene.id}:${this.reaction.id}`, this.reactionUntil + this.reaction.cooldownMs);
      }
    }
    const safe = [this.action!, ...(this.reaction ? [this.reaction] : [])]
      .every(a => canWhip(a.envelope, scene.whipHull, scene.margin));
    return { sceneId: scene.id, actionId: this.action!.id, reactionId: this.reaction?.id ?? null, band: this.band,
      transition: this.pendingTransition, whipAllowed: policy.whipEnabled!==false && mayWhip.has(input.state) && safe && !changed && this.pendingTransition === null };
  }
}
