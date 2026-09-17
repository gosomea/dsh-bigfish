import { toolResults } from '../domain/activities.js';
import type { Clock, CountQuality, EndReason, ModelIdentity, ObservedOutput } from '../contract/types.js';
import { Baselines } from '../domain/baselines.js';
import { resolveConfig, type Config } from '../domain/config.js';
import { SessionTelemetry } from '../domain/session.js';
export interface AgentHandle { session: { id: string }; options: { provider?: string; model?: string; reasoningEffort?: string } }
export type StreamFrame =
  | { type: 'start'; attemptId: string; revision: number; turn: number; step: number; observed?: ObservedOutput }
  | { type: 'chunk'; attemptId: string; revision: number; index: number; time: number; chunk: Chunk }
  | { type: 'end'; attemptId: string; revision: number; index: number; outcome: unknown };
export interface Chunk { type: string; text?: string; argumentsDelta?: string }
export interface SessionEvent { type: string; seq: number; data: unknown }
export interface TokenCounter {
  readonly id: string;
  readonly quality: CountQuality;
  /** Incremental, scoped to one attempt and one channel. */
  count(text: string, channel: string): number | null;
}
/** Explicit estimate; never equates packet or character counts to exact tokens. */
export function estimatedCounter(): TokenCounter {
  return { id: 'weighted-codepoints-v1', quality: 'estimated', count(text) {
    let tokens = 0;
    for (const ch of text) tokens += /[\u3400-\u9fff]/u.test(ch) ? 1 : ch.codePointAt(0)! > 0xFFFF ? 1 : .25;
    return tokens;
  } };
}
interface AgentCursor { epoch: string; revision: number; counter: TokenCounter; attempt: string | null; index: number }
interface SessionCursor { engine: SessionTelemetry; seq: number; touched: number; owner: AgentHandle | null }
/** Structural adapter checked against the pinned Harness declarations by probe:harness. */
export class HarnessAdapter {
  readonly history: Baselines;
  private readonly sessions = new Map<string, SessionCursor>();
  private readonly agents = new WeakMap<AgentHandle, AgentCursor>();
  private nextEpoch = 0;
  readonly config: Config;
  constructor(private readonly clock: Clock, config: Partial<Config> = {},
    private readonly counters: () => TokenCounter = estimatedCounter,
    private readonly identify: (agent: AgentHandle, counter: TokenCounter) => ModelIdentity = (agent, counter) => ({
      endpointId: agent.options.provider ?? 'default-route', model: agent.options.model ?? 'configured-default',
      reasoning: agent.options.reasoningEffort ?? 'default', channels: ['text', 'reasoning', 'tool-arguments'], counter: counter.id,
    })) {
    this.config = resolveConfig(config); this.history = new Baselines(this.config);
  }
  session(id: string): SessionTelemetry {
    let entry = this.sessions.get(id);
    if (!entry) {
      entry = { engine: new SessionTelemetry(id, this.clock, this.history, this.config), seq: -1, touched: this.clock.now(), owner: null };
      this.sessions.set(id, entry);
    }
    entry.touched = this.clock.now();
    return entry.engine;
  }
  /** Durable events are already validated by dsh; unknown extensible events are ignored. */
  event(session: { id: string }, event: SessionEvent): void {
    const engine = this.session(session.id);
    const cursor = this.sessions.get(session.id)!;
    if (event.seq <= cursor.seq) return;
    cursor.seq = event.seq;
    const data = event.data as { turn?: number; reason?: { kind: string }; callId?: string };
    if (event.type === 'turn/start' && data.turn !== undefined) engine.accept({ type: 'turn-start', turn: data.turn });
    if (event.type === 'turn/end' && data.turn !== undefined) {
      const kind = data.reason?.kind;
      const known = ['completed', 'aborted', 'blocked', 'error', 'max-tokens', 'interrupted'];
      engine.accept({ type: 'turn-end', turn: data.turn, reason: known.includes(kind ?? '') ? kind as EndReason : 'unknown' });
    }
    if (event.type === 'tool/result') for (const result of toolResults(event.data)) engine.accept({ type: 'tool-end', id: result.id });
    if (event.type === 'tool/call' && data.callId !== undefined) {
      engine.accept({ type: event.type === 'tool/call' ? 'tool-start' : 'tool-end', id: data.callId });
    }
    if (event.type === 'llm/retry') engine.accept({ type: 'retry', active: true });
    if (event.type === 'llm/retry-started') engine.accept({ type: 'retry', active: false });
  }
  frame(agent: AgentHandle, frame: StreamFrame): void {
    const engine = this.session(agent.session.id);
    const entry = this.sessions.get(agent.session.id)!;
    let cursor = this.agents.get(agent);
    if (!cursor) {
      cursor = { epoch: String(++this.nextEpoch), revision: 0, counter: this.counters(), attempt: null, index: -1 };
      this.agents.set(agent, cursor);
    }
    if (frame.revision <= cursor.revision) return;
    cursor.revision = frame.revision;
    if (frame.type === 'start') {
      if (cursor.attempt === frame.attemptId && entry.owner === agent) return;
      // A retired agent cannot reclaim a session after its replacement started.
      if (entry.owner && Number(this.agents.get(entry.owner)?.epoch ?? 0) > Number(cursor.epoch)) return;
      entry.owner = agent;
      cursor.attempt = frame.attemptId; cursor.index = -1;
      cursor.counter = this.counters();
      if (engine.snapshot().turn < frame.turn) engine.accept({ type: 'turn-start', turn: frame.turn });
      engine.accept({ type: 'attempt-start', id: frame.attemptId, epoch: cursor.epoch, turn: frame.turn,
        model: this.identify(agent, cursor.counter), ...(frame.observed ? { observed: frame.observed } : {}) });
    } else if (entry.owner === agent && frame.type === 'end') {
      if (cursor.attempt !== frame.attemptId) return;
      engine.accept({ type: 'attempt-end', id: frame.attemptId, epoch: cursor.epoch });
      cursor.attempt = null;
    } else if (entry.owner === agent && frame.type === 'chunk') {
      if (cursor.attempt !== frame.attemptId || frame.index <= cursor.index) return;
      cursor.index = frame.index;
      const chunk = frame.chunk;
      const channel = chunk.type === 'text-delta' ? 'text' : chunk.type === 'reasoning-delta' ? 'reasoning'
        : chunk.type === 'tool-call-delta' ? 'tool-arguments' : null;
      if (channel === null) return; // usage, finish, and unknown metadata never add tokens.
      const text = channel === 'tool-arguments' ? chunk.argumentsDelta ?? '' : chunk.text ?? '';
      if (!text) return;
      engine.accept({ type: 'chunk', id: frame.attemptId, epoch: cursor.epoch, index: frame.index,
        tokens: cursor.counter.count(text, channel), quality: cursor.counter.quality, channel });
    }
  }
  disposeSession(id: string): void { this.sessions.delete(id); }
  dispose(): void { this.sessions.clear(); this.history.reset(); }
  get sessionCount(): number { return this.sessions.size; }
  configure(config: Partial<Config>): void {
    const next = resolveConfig({ ...this.config, ...config });
    Object.assign(this.config, next);
    for (const { engine } of this.sessions.values()) Object.assign(engine.config, next);
  }
}
