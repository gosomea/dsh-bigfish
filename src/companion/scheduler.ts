export type Priority = 'interaction' | 'urgent' | 'foreground' | 'background' | 'life' | 'easter';
const rank: Record<Priority, number> = {interaction:6, urgent:5, foreground:4, background:3, life:2, easter:1};
export interface Intent {
  id: string; key: string; priority: Priority; motion: string; text: string;
  createdAt: number; expiresAt: number; durationMs: number; interruptibleAfterMs: number;
  cooldownMs: number; sources?: {workspace: string; session: string; seq: number}[];
}
export interface Scheduled { intent: Intent; startedAt: number }
export type NoticeSource={workspace:string;session:string;seq:number};
/** Projection revisions do not turn one committed event into two completion performances. */
export const noticeSourceKey=(source:NoticeSource)=>JSON.stringify([source.workspace,source.session,source.seq]);
export function sourcesCovered(sources:readonly NoticeSource[]|undefined,covered:ReadonlySet<string>):boolean {
  return !!sources?.length&&sources.every(source=>covered.has(noticeSourceKey(source)));
}
export interface PresentationGate {
  /** Another ordinary chain owns the actor; direct touch and important facts still win. */
  occupied?:boolean;
  /** Only ordinary preemption waits for the visible loop/exit boundary. */
  boundary?:boolean;
}
/** One actor and one bubble. Pending items coalesce by key rather than forming a notification train. */
export class BehaviorScheduler {
  private pending = new Map<string, Intent>();
  private cooldown = new Map<string, number>();
  private active: Scheduled | null = null;
  quietUntil = 0;
  importantOnly = false;
  submit(intent: Intent, now: number): boolean {
    if (!Number.isFinite(intent.durationMs) || intent.durationMs <= 0 || intent.expiresAt <= now ||
        intent.createdAt > now || !Object.hasOwn(rank, intent.priority)) return false;
    if (this.active?.intent.id === intent.id || this.pending.get(intent.key)?.id === intent.id) return false;
    if ((this.cooldown.get(intent.key) ?? 0) > now && intent.priority !== 'urgent') return false;
    this.pending.set(intent.key, intent);
    if (this.pending.size > 32) {
      const discard = [...this.pending.values()].sort((a,b) => rank[a.priority]-rank[b.priority] || a.createdAt-b.createdAt)[0]!;
      this.pending.delete(discard.key);
    }
    return true;
  }
  cancel(key: string, id?: string): void {
    if(id===undefined||this.pending.get(key)?.id===id)this.pending.delete(key);
    if(this.active?.intent.key===key&&(id===undefined||this.active.intent.id===id))this.active=null;
  }
  revise(key:string,patch:Pick<Intent,'motion'|'durationMs'>):void {
    if(!Number.isFinite(patch.durationMs)||patch.durationMs<=0)return;
    if(this.active?.intent.key===key)this.active={...this.active,intent:{...this.active.intent,...patch}};
    const pending=this.pending.get(key);if(pending)this.pending.set(key,{...pending,...patch});
  }
  quiet(now: number, minutes = 30): void { this.quietUntil = now + minutes*60000; this.pending.clear(); this.active=null; }
  tick(now: number, dragging = false, gate:PresentationGate={}): Scheduled | null {
    if (dragging) { this.active = null; this.pending.clear(); return null; }
    const allowed = (i: Intent) => i.priority === 'interaction' || i.priority === 'urgent' || (!(this.quietUntil > now) && !this.importantOnly);
    for (const [key,i] of this.pending) if (i.expiresAt <= now || !allowed(i)) this.pending.delete(key);
    for (const [key,time] of this.cooldown) if(time <= now) this.cooldown.delete(key);
    if (this.active && (!allowed(this.active.intent) || now >= this.active.intent.expiresAt || now-this.active.startedAt >= this.active.intent.durationMs)) this.active=null;
    const next = [...this.pending.values()].filter(i=>rank[i.priority]>=5||!gate.occupied).sort((a,b) => rank[b.priority]-rank[a.priority] || b.createdAt-a.createdAt)[0];
    if (next && (!this.active || (rank[next.priority] > rank[this.active.intent.priority] &&
        (rank[next.priority]>=5 || (gate.boundary!==false&&now-this.active.startedAt >= this.active.intent.interruptibleAfterMs))))) {
      this.pending.delete(next.key); this.active={intent:next,startedAt:now}; this.cooldown.set(next.key,now+next.cooldownMs);
    }
    return this.active;
  }
}
