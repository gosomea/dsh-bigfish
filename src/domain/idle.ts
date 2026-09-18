import type { Preferences } from '../contract/preferences.js';
import { defaultLines, parseLines } from '../contract/dialogue.js';
import { motionAllowed } from './motion-policy.js';

export interface IdleMemory { greeted: boolean; nextAt: number; lastMotion: number; lastLine: number; nonSignStreak?: number; lastMotionId?: string }
export interface IdlePresentation { active: boolean; showText: boolean; motion: string; text: string; serial: number; nextInSeconds?: number; reason?: 'work'|'hidden'|'reduced'|'quiet'|'rest'|'active' }
const resting: IdlePresentation = { active: false, showText: false, motion: 'breathe', text: '', serial: 0 };
export const isSign = (motion: string) => motion === 'wait-sign' || motion.startsWith('sign-');
export function idleInterval(p: Preferences): [number, number] {
  switch (p.idleMode) {
    case 'occasional': return [60, 120];
    case 'natural': return [15, 30];
    case 'continuous': return [1, 3];
    case 'custom': return [p.idleMinSeconds, p.idleMaxSeconds];
    default: return [5, 10];
  }
}
/** Deadlines survive backgrounding. The interval is rest AFTER a whole gesture. */
export class IdleDirector {
  private until = 0; private textUntil = 0; private serial = 0;
  private motion = 'breathe'; private text = ''; private policy = '';
  private wasIdle = false; private wasVisible = true; private wasReduced = false;
  readonly memory: IdleMemory;
  constructor(memory?: Partial<IdleMemory>, private random = () => Math.random()) {
    this.memory = { greeted: memory?.greeted === true, nextAt: Number.isFinite(memory?.nextAt) ? memory!.nextAt! : 0,
      lastMotion: memory?.lastMotion ?? -1, lastLine: memory?.lastLine ?? -1,
      nonSignStreak: memory?.nonSignStreak === 1 ? 1 : 0, lastMotionId: memory?.lastMotionId ?? '' };
  }
  private schedule(after: number, p: Preferences) {
    const [min, max] = idleInterval(p);
    this.memory.nextAt = after + (min + this.random() * (max - min)) * 1000;
  }
  tick(now: number, idle: boolean, visible: boolean, p: Preferences, reduced = false, roleLines?: string[]): IdlePresentation {
    const key = [p.idleMode, p.idleMinSeconds, p.idleMaxSeconds, p.idleHoldSeconds, p.idleSignPreference, p.richness, p.dialogueJson, roleLines?.join('\n')].join(':');
    if (!idle) {
      this.until = this.textUntil = 0; this.wasIdle = false;
      this.wasVisible = visible; this.wasReduced = reduced;
      return { ...resting, reason: 'work' };
    }
    const entered = !this.wasIdle;
    if ((entered && this.memory.nextAt <= 0) || (this.policy && key !== this.policy)) {
      this.until = this.textUntil = 0; this.schedule(now, p);
    }
    // A completed task gets a short return-to-idle delay, not an expired backlog.
    if (entered && this.policy) this.schedule(now, p);
    this.policy = key; this.wasIdle = true;
    if (!visible || reduced) {
      if (this.wasVisible && !this.wasReduced && this.until > now) this.memory.nextAt = now;
      this.until = this.textUntil = 0; this.wasVisible = visible; this.wasReduced = reduced;
      return { ...resting, reason: !visible ? 'hidden' : 'reduced' };
    }
    this.wasVisible = true; this.wasReduced = false;
    const first = !this.memory.greeted; this.memory.greeted = true;
    if ((first && p.greetOnOpen) || (p.idleMode !== 'quiet' && now >= this.memory.nextAt && now >= this.until)) {
      const lines = parseLines(p.dialogueJson).idle ?? roleLines ?? defaultLines.idle;
      const lineChoices = lines.map((_, i) => i).filter(i => i !== this.memory.lastLine);
      const line = p.idleRandomText ? (lineChoices[Math.floor(this.random() * lineChoices.length)] ?? 0) : 0;
      this.text = lines[line] ?? ''; this.memory.lastLine = line;
      const motions = ['wait-sign','sign-overhead','sign-peek','sign-tail','sign-bounce','wave','peek','stretch','tea','tail-wag'];
      const pool = motions.filter(m => motionAllowed(m, p.richness, false) && (!isSign(m) || (this.text && p.idleSignPreference !== 'none')));
      const signs = pool.filter(isSign), other = pool.filter(m => !isSign(m));
      const prefer = p.idleSignPreference === 'prefer';
      const requireSign = signs.length > 0 && ((first && p.greetOnOpen) || (prefer && ((this.memory.nonSignStreak ?? 0) > 0 || this.random() < .7)));
      const candidates = requireSign ? signs : p.idleSignPreference === 'balanced' && isSign(this.memory.lastMotionId ?? '') && other.length ? other : pool;
      const choices = candidates.filter(m => m !== this.memory.lastMotionId);
      this.motion = first && requireSign ? 'wait-sign' : choices[Math.floor(this.random() * choices.length)] ?? candidates[0] ?? 'breathe';
      this.memory.lastMotionId = this.motion; this.memory.lastMotion = motions.indexOf(this.motion);
      this.memory.nonSignStreak = isSign(this.motion) ? 0 : 1;
      this.until = now + (p.idleMode === 'quiet' ? 5 : p.idleHoldSeconds) * 1000;
      this.textUntil = now + Math.min(6000, this.until - now); this.serial++;
      this.schedule(this.until, p);
    }
    const active = now < this.until;
    return { active, showText: now < this.textUntil && Boolean(this.text), motion: active ? this.motion : 'breathe', text: this.text, serial: this.serial,
      reason: active ? 'active' : p.idleMode === 'quiet' ? 'quiet' : 'rest',
      ...(p.idleMode !== 'quiet' && !active ? { nextInSeconds: Math.max(0, Math.ceil((this.memory.nextAt - now) / 1000)) } : {}) };
  }
}
