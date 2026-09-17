import { Activities, extensionActivity, toolResults, type ActivitySummary } from '../domain/activities.js';
import { parseRules } from '../contract/dialogue.js';
import { HarnessAdapter, type AgentHandle } from '../host/adapter.js';
import { engineConfig } from '../contract/preferences.js';
import type { Channel, ObservedOutput, Snapshot, WorkState } from '../contract/types.js';
import type { Binding, Entry, NativeServices } from './native-contract.js';
import { PreferenceStore } from './preferences-store.js';

export interface CompanionView { recentTools?:readonly string[]; activity?: ActivitySummary | null; snapshot: Snapshot; model: string; issue: string | null; demo: boolean }
export interface Companion {
  preferences: PreferenceStore; getSnapshot(): CompanionView; subscribe(fn: () => void): () => void;
  resetLearning(all?: boolean): void; dispose(): void;
}
const terminalState: Record<string, WorkState> = { completed: 'completed', aborted: 'cancelled', error: 'failed',
  blocked: 'blocked', 'max-tokens': 'limited', interrupted: 'interrupted' };
/** Consume the existing public event source; no extra socket or model-visible writes. */
export class NativeCompanion implements Companion {
  readonly preferences: PreferenceStore;
  private adapter: HarnessAdapter;
  private activities = new Activities();
  private listeners = new Set<() => void>();
  private globalOff: (() => void)[] = [];
  private bindingOff: (() => void)[] = [];
  private binding: Binding | undefined;
  private agent: AgentHandle | null = null;
  private attempt: string | null = null;
  private frameIndex = 0;
  private frameRevision = 0;
  private windowRevision = -1;
  private waiting = false;
  private hostRunning = false;
  private starting = false;
  private view: CompanionView;
  private timer: ReturnType<typeof setInterval>;
  private disposed = false;
  private historyKey: string;
  private historyIssue: string | null = null;
  private now: () => number;
  constructor(private ctx: NativeServices, private storage: Storage | null) {
    const epoch = Date.now(), mono = performance.now(); this.now = () => epoch + performance.now() - mono;
    this.preferences = new PreferenceStore(ctx.settingsScope.bind({ namespace: 'bigfish', decode: value => value }), storage);
    this.historyKey = `bigfish.history.v1:${typeof location === 'undefined' ? 'test' : location.origin}`;
    this.adapter = new HarnessAdapter({ now: this.now }, engineConfig(this.preferences.getSnapshot().value), undefined, (agent, counter) => ({
      endpointId: agent.options.provider ?? 'unknown', model: agent.options.model ?? 'unknown', reasoning: agent.options.reasoningEffort ?? 'default',
      channels: this.preferences.getSnapshot().value.includeReasoning ? ['text', 'reasoning', 'tool-arguments'] : ['text', 'tool-arguments'], counter: counter.id,
    }));
    if (this.preferences.getSnapshot().value.learnHistory && storage) {
      try { const raw = storage.getItem(this.historyKey); if (raw) this.adapter.history.restore(JSON.parse(raw), this.now()); }
      catch { this.historyIssue = 'historyRead'; }
    }
    this.view = { snapshot: this.adapter.session('idle').snapshot(), model: '', issue: this.historyIssue, demo: false };
    let previous = this.preferences.getSnapshot().value;
    this.globalOff.push(this.preferences.subscribe(() => {
      const next = this.preferences.getSnapshot().value;
      this.adapter.configure(engineConfig(next));
      const rebind = next.enabled !== previous.enabled || next.includeReasoning !== previous.includeReasoning;
      if (!next.learnHistory && previous.learnHistory) {
        this.adapter.history.reset();
        try { this.storage?.removeItem(this.historyKey); } catch { this.historyIssue = 'historyWrite'; }
      }
      previous = next;
      if (rebind) this.select(true); else this.publish();
    }));
    this.globalOff.push(ctx.sessions.list.subscribe(() => this.select()));
    this.globalOff.push(ctx.uiSession.pendingInteractions.subscribe(() => this.interaction()));
    this.globalOff.push(ctx.connection.state.subscribe(() => {
      if (this.binding) this.adapter.session(this.binding.sessionId).accept({ type: 'connection', active: ctx.connection.state.getSnapshot() === 'connected' });
      this.publish();
    }));
    if (typeof window !== 'undefined') {
      const receive = (event: Event) => { const e = extensionActivity((event as CustomEvent).detail);
        if (e && this.binding?.sessionId === e.sessionId && this.preferences.getSnapshot().value.enabled) { this.activities.extension(e, this.now()); this.publish(); } };
      window.addEventListener('dsh-bigfish:activity', receive);
      this.globalOff.push(() => window.removeEventListener('dsh-bigfish:activity', receive));
    }
    this.select();
    this.timer = setInterval(() => this.publish(), 200);
  }
  getSnapshot = (): CompanionView => this.view;
  subscribe = (fn: () => void): (() => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private persist() {
    if (!this.preferences.getSnapshot().value.learnHistory || !this.storage) return;
    try { this.storage.setItem(this.historyKey, JSON.stringify(this.adapter.history.export(this.now()))); }
    catch { this.historyIssue = 'historyWrite'; }
  }
  private select(force = false) {
    if (this.disposed) return;
    const id = this.preferences.getSnapshot().value.enabled ? this.ctx.sessions.list.getSnapshot().current : undefined;
    const next = id === undefined ? undefined : this.ctx.sessions.binding(id);
    if (!force && next === this.binding) return;
    for (const off of this.bindingOff.splice(0)) off();
    if (this.binding) { this.persist(); this.adapter.disposeSession(this.binding.sessionId); }
    this.activities.clear();
    this.binding = next; this.agent = null; this.attempt = null; this.windowRevision = -1; this.waiting = false;
    this.starting = false; this.hostRunning = next?.session.getSnapshot().running ?? false;
    if (next) {
      this.hydrate();
      this.bindingOff.push(next.eventSource.subscribe(() => this.changed()));
      this.bindingOff.push(next.session.subscribe(() => {
        const running = next.session.getSnapshot().running;
        if (running && !this.hostRunning) this.starting = true;
        if (!running) this.starting = false;
        this.hostRunning = running; this.publish();
      }));
    }
    this.publish();
  }
  private hydrate() {
    const binding = this.binding!;
    this.adapter.disposeSession(binding.sessionId);
    this.agent = { session: { id: binding.sessionId }, options: {} };
    this.attempt = null; this.frameRevision = 0; this.frameIndex = 0;
    const window = binding.eventSource.getSnapshot(); this.windowRevision = window.revision;
    let turn = 0, start = this.now(), end: Entry['event'] | null = null;
    let live: Entry['event'] | null = null, observed: ObservedOutput | undefined, retry = false;
    const tools = new Set<string>();
    this.activities.clear();
    for (const { event } of window.entries) {
      this.activities.accept(event.type, event.data, event.time, true);
      if (event.type === 'turn/start') { turn = event.data.turn; start = event.time; end = null; tools.clear(); live = null; observed = undefined; retry = false; }
      if (event.type === 'turn/end' && event.data.turn === turn) end = event;
      if (event.type === 'tool/call') tools.add(event.data.callId);
      if (event.type === 'tool/result') for (const r of toolResults(event.data)) tools.delete(r.id);
      if (event.type === 'llm/retry') { retry = true; observed = undefined; }
      if (event.type === 'llm/retry-started') retry = false;
      if (event.type === 'assistant/live-chunk' && event.data.turn === turn) {
        if (live?.data.attemptId !== event.data.attemptId) observed = undefined;
        live = event; retry = false;
        const chunk = event.data.chunk;
        const channel: Channel | null = chunk?.type === 'text-delta' ? 'text' : chunk?.type === 'reasoning-delta' ? 'reasoning'
          : chunk?.type === 'tool-call-delta' ? 'tool-arguments' : null;
        if (channel && (channel !== 'reasoning' || this.preferences.getSnapshot().value.includeReasoning) &&
          (channel === 'tool-arguments' ? chunk.argumentsDelta : chunk.text)) {
          observed = { channel, ageMs: Math.max(0, this.now() - event.time) };
        }
      }
    }
    const engine = this.adapter.session(binding.sessionId);
    const running = binding.session.getSnapshot().running;
    const state: WorkState = running ? 'awaiting-output' : end ? terminalState[end.data.reason?.kind] ?? 'unknown-end' : 'idle';
    engine.accept({ type: 'resume', turn, wallElapsed: turn ? Math.max(0, (end?.time ?? this.now()) - start) : 0, workElapsed: 0, state });
    if (!running) this.activities.clear();
    if (running && !end) for (const id of tools) engine.accept({ type: 'tool-start', id });
    const connection = this.ctx.connection.state.getSnapshot();
    if (connection !== undefined) engine.accept({ type: 'connection', active: connection === 'connected' });
    // Reopening a running session includes its unsettled transient chunks. Restore
    // the attempt/phase, never replay those chunks into rate or baseline learning.
    if (running && !end && live) this.startAttempt(live.data, connection === 'connected' ? observed : undefined);
    if (running && !end && retry) engine.accept({ type: 'retry', active: true });
    this.waiting = false; this.interaction();
  }
  private startAttempt(data: { attemptId: string; turn: number; step: number }, observed?: ObservedOutput) {
    this.attempt = data.attemptId; this.frameIndex = 0;
    const p = this.binding!.session.projections.faceOf('modelSelection').getSnapshot() as any;
    this.agent!.options = p?.lastUsed ?? p?.next ?? { provider: `unresolved:${this.binding!.sessionId}`, model: 'unresolved-model' };
    this.adapter.frame(this.agent!, { type: 'start', attemptId: data.attemptId, revision: ++this.frameRevision,
      turn: data.turn, step: data.step, ...(observed ? { observed } : {}) });
  }
  private interaction() {
    if (!this.binding) return;
    const waiting = this.ctx.uiSession.pendingInteractions.getSnapshot().has(this.binding.sessionId);
    if (waiting !== this.waiting) { this.waiting = waiting; this.adapter.session(this.binding.sessionId).accept({ type: 'waiting', active: waiting }); this.publish(); }
  }
  private changed() {
    if (!this.binding || !this.agent) return;
    const w = this.binding.eventSource.getSnapshot();
    if (w.revision === this.windowRevision) return;
    this.windowRevision = w.revision;
    if (w.change.kind === 'replace') { this.hydrate(); this.publish(); return; }
    if (w.change.kind === 'append') for (const entry of w.change.entries ?? []) this.entry(entry);
    if (w.change.kind === 'settle-assistant') {
      if (w.change.attemptId === this.attempt) {
        this.adapter.frame(this.agent, { type: 'end', attemptId: this.attempt!, revision: ++this.frameRevision, index: this.frameIndex, outcome: {} });
        this.attempt = null; this.persist();
      }
      if (w.change.entry) this.entry(w.change.entry);
    }
    // Older prepended history must not become live output.
    this.interaction();
    const chunksOnly = w.change.kind === 'append' && w.change.entries?.every(e => e.event.type === 'assistant/live-chunk');
    if (!chunksOnly || this.adapter.session(this.binding.sessionId).snapshot().state !== this.view.snapshot.state) this.publish();
  }
  private entry({ event }: Entry) {
    if (!this.binding || !this.agent) return;
    this.activities.accept(event.type, event.data, this.now());
    if (event.type === 'turn/start' || event.type === 'turn/end' || event.type === 'assistant/live-chunk') this.starting = false;
    if (event.type === 'assistant/live-chunk') {
      const data = event.data;
      if (this.attempt !== data.attemptId) this.startAttempt(data);
      this.adapter.frame(this.agent, { type: 'chunk', attemptId: this.attempt!, revision: ++this.frameRevision, index: this.frameIndex++, time: event.time, chunk: data.chunk });
    } else {
      this.adapter.event(this.agent.session, event);
      if (event.type === 'turn/end') this.persist();
    }
  }
  private publish() {
    if (this.disposed) return;
    let snapshot = this.adapter.session(this.binding?.sessionId ?? 'idle').snapshot();
    const session = this.binding?.session.getSnapshot();
    // The browser publishes this echo synchronously, before serialization or network I/O.
    // Present readiness without inventing a turn, token count, or completion event.
    const pending = session?.pendingSubmissions?.some(s => s.placement === 'transcript');
    if ((pending || session?.awaitingFirstTurn || this.starting) &&
      (snapshot.state === 'idle' || Object.values(terminalState).includes(snapshot.state) || snapshot.state === 'unknown-end')) {
      snapshot = { ...snapshot, state: 'awaiting-output', rate: null, tokens: 0, wallElapsed: 0,
        workElapsed: 0, generationElapsed: 0, pressure: 0, whipHz: 0, modelKey: null, baseline: null };
    }
    this.view = { snapshot, recentTools:this.activities.recentTools, activity: this.activities.summary(this.now(), parseRules(this.preferences.getSnapshot().value.toolRulesJson)), model: this.agent?.options.model ?? '',
      issue: session?.openState === 'error' ? 'connectionError' : this.historyIssue, demo: false };
    for (const fn of this.listeners) fn();
  }
  resetLearning(all = false): void {
    const key = this.view.snapshot.modelKey;
    if (!all && !key) return;
    this.adapter.history.reset(all ? undefined : key!); this.persist(); this.select(true);
  }
  dispose(): void {
    if (this.disposed) return;
    this.persist(); this.disposed = true; clearInterval(this.timer);
    for (const off of [...this.bindingOff, ...this.globalOff]) off();
    this.preferences.dispose(); this.adapter.dispose(); this.listeners.clear();
  }
}
