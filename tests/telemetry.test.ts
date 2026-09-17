import test from 'node:test';
import assert from 'node:assert/strict';
import { Baselines, modelKey, feedback, resolveConfig } from '../src/index.js';
import { fixture, identity, start, emit, stream, TestClock } from './helpers.js';
import { RateWindow } from '../src/domain/rate-window.js';

test('A1: 20/100/400 models produce the same feedback across a slowdown and recovery', () => {
  const runs = [20, 100, 400].map(base => {
    const { clock, history, engine } = fixture();
    for (let i = 0; i < 3; i++) history.commit(modelKey(identity), Array(20).fill(base), 0);
    start(engine); let index = 0; const output: number[] = [];
    for (const ratio of [1, .5, 1.25, 1]) {
      index = stream(engine, clock, base * ratio, 12, index);
      output.push(engine.snapshot().pressure);
    }
    assert.ok(output[1]! > output[0]! + .4);
    assert.ok(output[2]! < output[1]!);
    return output;
  });
  for (const output of runs.slice(1)) output.forEach((value, i) => assert.ok(Math.abs(value - runs[0]![i]!) <= .02));
});
test('A2: cold start stays neutral, then gains a provisional baseline', () => {
  const { clock, engine } = fixture(); start(engine);
  let index = stream(engine, clock, 20, 6);
  assert.equal(engine.snapshot().baseline, null);
  assert.equal(engine.snapshot().pressure, .15);
  stream(engine, clock, 20, 9, index);
  assert.ok(engine.snapshot().baseline);
  assert.equal(engine.snapshot().baseline?.confidence, .25);
});
test('A3: a mature baseline is frozen for the current attempt', () => {
  const { clock, engine, history } = fixture();
  for (let i = 0; i < 3; i++) history.commit(modelKey(identity), Array(20).fill(100), 0);
  start(engine); stream(engine, clock, 20, 60);
  assert.equal(engine.snapshot().baseline?.p50, 100);
  engine.accept({ type: 'attempt-end', id: 'a', epoch: '1' });
  assert.ok(history.get(modelKey(identity), clock.now())!.p50 >= 90);
});
test('A4: persistent performance shifts eventually move the bounded baseline', () => {
  const c = resolveConfig({ maxSamples: 20, maxAttemptSamples: 10 }); const h = new Baselines(c);
  h.commit('model', Array(10).fill(100), 0);
  for (let i = 1; i <= 20; i++) h.commit('model', Array(10).fill(20), i * 1000);
  assert.ok(h.get('model', 20000)!.p50 < 30);
  assert.ok(h.get('model', 20000)!.p50 >= 20);
});
test('A6: endpoint and counter/channel changes have separate model keys', () => {
  assert.notEqual(modelKey(identity), modelKey({ ...identity, endpointId: 'second' }));
  assert.notEqual(modelKey(identity), modelKey({ ...identity, counter: 'estimated' }));
  assert.notEqual(modelKey(identity), modelKey({ ...identity, channels: ['text'] }));
  assert.equal(modelKey(identity), modelKey({ ...identity, channels: [...identity.channels].reverse() }));
  const { engine, clock } = fixture(); start(engine); stream(engine, clock, 20, 15);
  engine.accept({ type: 'attempt-start', turn: 1, id: 'b', epoch: '1', model: { ...identity, endpointId: 'new' } });
  assert.equal(engine.snapshot().rate, null); assert.equal(engine.snapshot().baseline, null);
});
test('history expires, evicts and can reset only one model', () => {
  const h = new Baselines(resolveConfig({ maxModels: 2, baselineTtlMs: 1000 }));
  h.commit('a', [1, 1, 1, 1], 0); h.commit('b', [2, 2, 2, 2], 0);
  h.get('a', 10); h.commit('c', [3, 3, 3, 3], 20);
  assert.equal(h.size, 2); assert.equal(h.get('b', 20), null);
  h.reset('c'); assert.equal(h.size, 1); assert.equal(h.get('a', 1001), null);
});
test('L1: attempt-end is not task completion and tools do not generate model tokens', () => {
  const { engine, clock } = fixture(); start(engine); stream(engine, clock, 20, 1);
  engine.accept({ type: 'attempt-end', id: 'a', epoch: '1' });
  engine.accept({ type: 'tool-start', id: 'tool' });
  assert.equal(engine.snapshot().state, 'tool-running');
  assert.equal(engine.snapshot().completionSerial, 0);
  const tokens = engine.snapshot().tokens; clock.step(10000);
  assert.equal(engine.snapshot().tokens, tokens); assert.equal(engine.snapshot().whipHz, 0);
  engine.accept({ type: 'tool-end', id: 'tool' });
  engine.accept({ type: 'turn-end', turn: 1, reason: 'completed' });
  assert.equal(engine.snapshot().completionSerial, 1);
  engine.accept({ type: 'turn-end', turn: 1, reason: 'completed' });
  assert.equal(engine.snapshot().completionSerial, 1);
});
test('L2: gaps cap pressure; explicit waits and disconnection stop it immediately', () => {
  const { engine, clock } = fixture({ manualRate: 100 }); start(engine); stream(engine, clock, 20, 4);
  assert.ok(engine.snapshot().pressure > .5);
  clock.step(4000); assert.equal(engine.snapshot().state, 'streaming-gap');
  assert.ok(engine.snapshot().pressure <= .25);
  engine.accept({ type: 'waiting', active: true });
  assert.equal(engine.snapshot().state, 'waiting-user'); assert.equal(engine.snapshot().whipHz, 0);
  engine.accept({ type: 'connection', active: false }); assert.equal(engine.snapshot().state, 'disconnected');
  engine.accept({ type: 'connection', active: true }); assert.equal(engine.snapshot().rate, null);
});
test('L3: duplicate frames and superseded attempt frames do not add twice', () => {
  const { engine } = fixture(); start(engine); emit(engine, 0, 5); emit(engine, 0, 5);
  assert.equal(engine.snapshot().tokens, 5);
  engine.accept({ type: 'attempt-start', id: 'b', epoch: '1', turn: 1, model: identity });
  emit(engine, 1, 5); assert.equal(engine.snapshot().tokens, 5);
  engine.accept({ type: 'chunk', id: 'b', epoch: 'stale', index: 2, tokens: 30, channel: 'text', quality: 'exact' });
  assert.equal(engine.snapshot().tokens, 5);
});
test('L4: a terminal resume snapshot never creates a new completion', () => {
  const { engine } = fixture();
  engine.accept({ type: 'resume', turn: 4, wallElapsed: 10000, workElapsed: 8000, state: 'completed' });
  assert.equal(engine.snapshot().completionSerial, 0); assert.equal(engine.snapshot().state, 'completed');
  assert.equal(engine.snapshot().rate, null);
});
test('L5: waiting/retry time excluded from work, end freezes all counters', () => {
  const { engine, clock } = fixture(); start(engine); clock.step(1000); engine.snapshot();
  engine.accept({ type: 'waiting', active: true }); clock.step(5000);
  engine.accept({ type: 'waiting', active: false }); clock.step(1000);
  engine.accept({ type: 'retry', active: true }); clock.step(4000);
  engine.accept({ type: 'turn-end', turn: 1, reason: 'aborted' });
  assert.equal(engine.snapshot().wallElapsed, 11000); assert.equal(engine.snapshot().workElapsed, 2000);
  clock.step(1000); assert.equal(engine.snapshot().wallElapsed, 11000);
  assert.equal(engine.snapshot().state, 'cancelled'); assert.equal(engine.snapshot().completionSerial, 0);
});
test('all native termination reasons remain distinct', () => {
  for (const [reason, state] of [['error', 'failed'], ['blocked', 'blocked'], ['max-tokens', 'limited'], ['interrupted', 'interrupted'], ['unknown', 'unknown-end']] as const) {
    const { engine } = fixture(); start(engine); engine.accept({ type: 'turn-end', turn: 1, reason });
    assert.equal(engine.snapshot().state, state); assert.equal(engine.snapshot().completionSerial, 0);
  }
});
test('output has priority over concurrent tools, while waiting takes precedence over both', () => {
  const { engine, clock } = fixture(); start(engine); engine.accept({ type: 'tool-start', id: 't' });
  stream(engine, clock, 20, 1); assert.equal(engine.snapshot().state, 'generating');
  engine.accept({ type: 'waiting', active: true }); assert.equal(engine.snapshot().state, 'waiting-user');
});
test('unavailable counts never masquerade as zero tok/s', () => {
  const { engine } = fixture(); start(engine);
  engine.accept({ type: 'chunk', id: 'a', epoch: '1', index: 0, tokens: null, quality: 'unavailable', channel: 'reasoning' });
  assert.equal(engine.snapshot().rate, null); assert.equal(engine.snapshot().quality, 'unavailable');
  assert.equal(engine.snapshot().state, 'reasoning');
});
test('time pressure is opt-in, and cannot activate during a tool call', () => {
  const base = { p25: 100, p50: 100, p75: 100, attempts: 5, seconds: 100, confidence: 1 };
  const off = feedback('generating', 100, base, 300000, resolveConfig());
  const on = feedback('generating', 100, base, 300000, resolveConfig({ timePressure: true }));
  assert.ok(on.pressure > off.pressure);
  assert.equal(feedback('tool-running', 0, base, 300000, resolveConfig({ timePressure: true })).pressure, 0);
});
test('rhythm mode becomes more active with faster relative speed', () => {
  const c = resolveConfig({ mode: 'rhythm', manualRate: 20 });
  assert.ok(feedback('generating', 30, null, 0, c).pressure > feedback('generating', 10, null, 0, c).pressure);
});
test('rate memory is bounded independently of number of chunks', () => {
  const rate = new RateWindow(resolveConfig());
  for (let i = 0; i < 50000; i++) rate.add(1, i);
  assert.ok(rate.size <= 31);
});
test('steady exact rates do not include an extra bucket at the left window boundary', () => {
  const { engine, clock } = fixture(); start(engine); stream(engine, clock, 400, 20);
  assert.ok(Math.abs(engine.snapshot().rate! - 400) < .1);
});
test('invalid config and backwards clocks fail at boundaries', () => {
  for (const bad of [{ maxWhipHz: NaN }, { manualRate: 0 }, { maxModels: .5 }, { timeWeight: 2 }]) {
    assert.throws(() => resolveConfig(bad));
  }
  const { engine, clock } = fixture(); clock.step(100); engine.snapshot(); clock.time = 50;
  assert.throws(() => engine.snapshot(), /monotonic/);
});
