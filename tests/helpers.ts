import { Baselines, SessionTelemetry, resolveConfig, type Config, type ModelIdentity } from '../src/index.js';
export class TestClock { time = 0; now = () => this.time; step(ms: number) { this.time += ms; } }
export const identity: ModelIdentity = { endpointId: 'test', model: 'fish', reasoning: 'normal', channels: ['text', 'reasoning', 'tool-arguments'], counter: 'fixture-exact-v1' };
export function fixture(config: Partial<Config> = {}) {
  const clock = new TestClock(); const c = resolveConfig(config); const history = new Baselines(c);
  const engine = new SessionTelemetry('session', clock, history, c);
  return { clock, history, engine, c };
}
export function start(engine: SessionTelemetry, turn = 1, id = 'a', model = identity) {
  engine.accept({ type: 'turn-start', turn });
  engine.accept({ type: 'attempt-start', turn, id, epoch: '1', model });
}
export function emit(engine: SessionTelemetry, index: number, tokens: number, id = 'a') {
  engine.accept({ type: 'chunk', id, epoch: '1', index, tokens, quality: 'exact', channel: 'text' });
}
export function stream(engine: SessionTelemetry, clock: TestClock, rate: number, seconds: number, index = 0, id = 'a') {
  for (let i = 0; i < seconds * 10; i++) { clock.step(100); emit(engine, index++, rate / 10, id); engine.snapshot(); }
  return index;
}
