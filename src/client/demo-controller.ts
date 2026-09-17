import { Baselines } from '../domain/baselines.js';
import { SessionTelemetry } from '../domain/session.js';
import { modelKey, type WorkState, type ModelIdentity } from '../contract/types.js';
import { engineConfig } from '../contract/preferences.js';
import { PreferenceStore } from './preferences-store.js';
import type { Companion, CompanionView } from './controller.js';
export class DemoCompanion implements Companion {
  preferences: PreferenceStore;
  base = 100; ratio = 1; state: WorkState = 'generating';
  private clock = Date.now(); private turn = 0; private index = 0;
  private history: Baselines; private engine: SessionTelemetry;
  private listeners = new Set<() => void>(); private view: CompanionView;
  private timer: ReturnType<typeof setInterval>; private off: () => void;
  constructor(storage: Storage | null) {
    this.preferences = new PreferenceStore(null, storage, 'bigfish.demo.preferences.v1');
    const config = engineConfig(this.preferences.getSnapshot().value);
    this.history = new Baselines(config); this.engine = new SessionTelemetry('demo', { now: () => this.clock }, this.history, config);
    this.view = { snapshot: this.engine.snapshot(), model: 'Demo · 100 tok/s', issue: null, demo: true };
    this.setState('idle');
    this.off = this.preferences.subscribe(() => { Object.assign(this.engine.config, engineConfig(this.preferences.getSnapshot().value)); this.publish(); });
    this.timer = setInterval(() => this.tick(), 100);
  }
  getSnapshot = () => this.view;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  restart(seed = true) {
    this.turn++; this.index = 0;
    const identity: ModelIdentity = { endpointId: 'demo-only', model: `demo-${this.base}`, reasoning: 'normal', channels: ['text', 'reasoning'], counter: 'exact-demo-v1' };
    if (seed) for (let i = 0; i < 3; i++) this.history.commit(modelKey(identity), Array(20).fill(this.base), this.clock);
    this.engine.accept({ type: 'turn-start', turn: this.turn });
    this.engine.accept({ type: 'attempt-start', id: String(this.turn), epoch: 'demo', turn: this.turn, model: identity });
    this.state = 'generating'; this.publish();
  }
  setBase(base: number) { this.base = base; this.restart(); }
  setRatio(ratio: number) { this.ratio = ratio; this.publish(); }
  setState(state: WorkState) {
    this.restart(); this.state = state;
    if (state === 'completed' || state === 'cancelled' || state === 'failed') this.engine.accept({ type: 'turn-end', turn: this.turn,
      reason: state === 'completed' ? 'completed' : state === 'cancelled' ? 'aborted' : 'error' });
    else if (state === 'waiting-user') this.engine.accept({ type: 'waiting', active: true });
    else if (state === 'retrying') this.engine.accept({ type: 'retry', active: true });
    else if (state === 'disconnected') this.engine.accept({ type: 'connection', active: false });
    else if (state === 'tool-running') {
      this.engine.accept({ type: 'attempt-end', id: String(this.turn), epoch: 'demo' });
      this.engine.accept({ type: 'tool-start', id: 'demo-tool' });
    } else if (state === 'idle') this.engine.accept({ type: 'resume', turn: this.turn, wallElapsed: 0, workElapsed: 0, state: 'idle' });
    this.publish();
  }
  private tick() {
    this.clock += 100;
    if (this.state === 'generating' || this.state === 'reasoning') this.engine.accept({ type: 'chunk', id: String(this.turn), epoch: 'demo', index: this.index++,
      tokens: this.base * this.ratio / 10, quality: 'exact', channel: this.state === 'reasoning' ? 'reasoning' : 'text' });
    this.publish();
  }
  private publish() { this.view = { snapshot: this.engine.snapshot(), model: `Demo · ${this.base} tok/s`, issue: null, demo: true }; for (const fn of this.listeners) fn(); }
  resetLearning(all = false) { this.history.reset(all ? undefined : this.view.snapshot.modelKey ?? undefined); this.restart(false); }
  dispose() { clearInterval(this.timer); this.off(); this.preferences.dispose(); this.listeners.clear(); }
}
