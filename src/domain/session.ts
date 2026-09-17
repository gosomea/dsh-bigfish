import type { Baseline, Clock, CountQuality, EndReason, InputEvent, Snapshot, WorkState } from '../contract/types.js';
import { modelKey } from '../contract/types.js';
import { Baselines } from './baselines.js';
import { clamp, resolveConfig, type Config } from './config.js';
import { feedback } from './feedback.js';
import { RateWindow } from './rate-window.js';
const endings: Record<EndReason, WorkState> = {
  completed: 'completed', aborted: 'cancelled', blocked: 'blocked', error: 'failed',
  'max-tokens': 'limited', interrupted: 'interrupted', unknown: 'unknown-end',
};
const terminal = new Set<WorkState>(Object.values(endings));
const working = new Set<WorkState>(['awaiting-output', 'reasoning', 'generating', 'streaming-gap', 'tool-running']);
interface Attempt {
  id: string; epoch: string; index: number; key: string; channels: readonly string[];
  samples: number[]; sampleStart: number | null; sampleTokens: number; baseline: Baseline | null;
}
/** One session's deterministic projection. Host owns clocks and cross-session history. */
export class SessionTelemetry {
  readonly config: Config;
  private readonly rate: RateWindow;
  private attempt: Attempt | null = null;
  private tools = new Set<string>();
  private turn = 0;
  private active = false;
  private lastAt: number;
  private state: WorkState = 'idle';
  private endState: WorkState | null = null;
  private waiting = false;
  private retry = false;
  private disconnected = false;
  private channel: WorkState = 'generating';
  private quality: CountQuality = 'unavailable';
  private key: string | null = null;
  private lastBaseline: Baseline | null = null;
  private lastOutputAt: number | null = null;
  private wallMs = 0;
  private workMs = 0;
  private generationMs = 0;
  private tokens = 0;
  private sequence = 0;
  private completionSerial = 0;
  private whipHz = 0;
  private lastWhipAt: number;
  constructor(readonly sessionId: string, private readonly clock: Clock, readonly history: Baselines,
    config: Partial<Config> = {}) {
    this.config = resolveConfig(config);
    this.rate = new RateWindow(this.config);
    this.lastAt = this.lastWhipAt = clock.now();
  }
  private now(): number {
    const now = this.clock.now();
    if (!Number.isFinite(now) || now < this.lastAt) throw new Error('Clock must be finite and monotonic');
    return now;
  }
  private choose(now: number): WorkState {
    if (this.endState) return this.endState;
    if (this.disconnected) return 'disconnected';
    if (!this.active) return 'idle';
    if (this.retry) return 'retrying';
    if (this.waiting) return 'waiting-user';
    const last = this.lastOutputAt;
    if (this.attempt && last !== null && now - last < this.config.gapMs) return this.channel;
    if (this.tools.size) return 'tool-running';
    if (this.attempt && last !== null) return 'streaming-gap';
    return 'awaiting-output';
  }
  private advance(now: number): void {
    const dt = now - this.lastAt;
    if (this.active) {
      this.wallMs += dt;
      if (working.has(this.state)) this.workMs += dt;
      if (this.state === 'generating' || this.state === 'reasoning') {
        const until = Math.min(now, (this.lastOutputAt ?? now) + this.config.gapMs);
        this.generationMs += Math.max(0, until - this.lastAt);
      }
    }
    this.lastAt = now;
    this.state = this.choose(now);
  }
  private resetWindow(): void {
    this.rate.reset(); this.quality = 'unavailable';
    this.lastOutputAt = null;
    if (this.attempt) { this.attempt.sampleStart = null; this.attempt.sampleTokens = 0; }
  }
  private settle(now: number): void {
    if (this.attempt) {
      this.history.commit(this.attempt.key, this.attempt.samples, now);
      this.lastBaseline = this.history.get(this.attempt.key, now);
    }
    this.attempt = null;
    this.resetWindow();
  }
  accept(event: InputEvent): void {
    const now = this.now(); this.advance(now);
    switch (event.type) {
      case 'turn-start':
        if (event.turn <= this.turn) break;
        this.settle(now);
        this.turn = event.turn; this.active = true; this.endState = null;
        this.wallMs = this.workMs = this.generationMs = this.tokens = 0;
        this.waiting = this.retry = false; this.tools.clear();
        this.key = null; this.lastBaseline = null;
        break;
      case 'turn-end':
        if (!this.active || event.turn !== this.turn) break;
        this.settle(now); this.active = false; this.tools.clear();
        this.endState = endings[event.reason];
        if (event.reason === 'completed') this.completionSerial++;
        break;
      case 'attempt-start':
        if (!this.active || event.turn !== this.turn) break;
        if (this.attempt?.id === event.id && this.attempt.epoch === event.epoch) break;
        this.settle(now); this.retry = false;
        this.key = modelKey(event.model);
        this.attempt = { id: event.id, epoch: event.epoch, index: -1, key: this.key,
          channels: event.model.channels, samples: [], sampleStart: null, sampleTokens: 0,
          baseline: this.history.get(this.key, now) };
        if (event.observed && event.model.channels.includes(event.observed.channel) && Number.isFinite(event.observed.ageMs)) {
          this.channel = event.observed.channel === 'reasoning' ? 'reasoning' : 'generating';
          this.lastOutputAt = now - Math.max(0, event.observed.ageMs);
        }
        break;
      case 'chunk': {
        const a = this.attempt;
        if (!this.active || !a || a.id !== event.id || a.epoch !== event.epoch || event.index <= a.index) break;
        if (!Number.isInteger(event.index) || event.index < 0) throw new Error('Invalid frame index');
        a.index = event.index;
        if (!a.channels.includes(event.channel)) break;
        this.channel = event.channel === 'reasoning' ? 'reasoning' : 'generating';
        if (event.tokens === null || event.quality === 'unavailable') { this.resetWindow(); this.lastOutputAt = now; break; }
        if (!Number.isFinite(event.tokens) || event.tokens < 0) throw new Error('Invalid token increment');
        if (this.quality !== 'unavailable' && this.quality !== event.quality) {
          throw new Error('Counter quality changed inside an attempt; use a separate counter identity');
        }
        const prevToken = this.rate.lastTokenAt;
        if (prevToken !== null && now - prevToken >= this.config.gapMs) this.resetWindow();
        this.quality = event.quality;
        this.lastOutputAt = now;
        if (a.sampleStart !== null && now - a.sampleStart >= this.config.sampleMs) {
          // A delayed tick cannot turn a long silent interval into a valid sample.
          if (now - a.sampleStart <= this.config.sampleMs + 250 && a.sampleTokens > 0) {
            a.samples.push(a.sampleTokens * 1000 / (now - a.sampleStart));
            if (a.samples.length > this.config.maxAttemptSamples) a.samples.shift();
            a.baseline ??= this.history.provisional(a.samples);
          }
          a.sampleStart = now; a.sampleTokens = 0;
        }
        if (event.tokens > 0) {
          a.sampleStart ??= now; a.sampleTokens += event.tokens;
          this.tokens += event.tokens; this.rate.add(event.tokens, now);
        }
        break;
      }
      case 'attempt-end':
        if (this.attempt?.id === event.id && this.attempt.epoch === event.epoch) this.settle(now);
        break;
      case 'tool-start': if (this.active) this.tools.add(event.id); break;
      case 'tool-end': this.tools.delete(event.id); break;
      case 'waiting': this.waiting = event.active; this.resetWindow(); break;
      case 'retry': this.retry = event.active; this.resetWindow(); break;
      case 'connection': this.disconnected = !event.active; this.resetWindow(); break;
      case 'resume':
        this.settle(now); this.tools.clear();
        this.turn = event.turn; this.wallMs = event.wallElapsed; this.workMs = event.workElapsed;
        this.generationMs = this.tokens = 0;
        this.active = event.state !== 'idle' && !terminal.has(event.state);
        this.endState = terminal.has(event.state) ? event.state : null;
        this.waiting = event.state === 'waiting-user'; this.retry = event.state === 'retrying';
        this.disconnected = event.state === 'disconnected';
        this.key = null; this.lastBaseline = null;
        break;
    }
    this.state = this.choose(now); this.sequence++;
  }
  snapshot(): Snapshot {
    const now = this.now(); this.advance(now);
    const rate = this.rate.read(now);
    const baseline = this.attempt ? this.attempt.baseline : this.lastBaseline;
    const f = feedback(this.state, rate, baseline, this.workMs, this.config);
    const target = f.pressure * this.config.maxWhipHz;
    const maxChange = this.config.slewHzPerSecond * (now - this.lastWhipAt) / 1000;
    this.whipHz = target === 0 ? 0 : this.whipHz + clamp(target - this.whipHz, -maxChange, maxChange);
    this.lastWhipAt = now;
    return { sessionId: this.sessionId, turn: this.turn, sequence: this.sequence, state: this.state,
      modelKey: this.key, rate, quality: this.quality, baseline, ...f, whipHz: this.whipHz,
      wallElapsed: this.wallMs, workElapsed: this.workMs, generationElapsed: this.generationMs,
      tools: this.tools.size, tokens: this.tokens, completionSerial: this.completionSerial };
  }
}
