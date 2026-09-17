import test from 'node:test';
import assert from 'node:assert/strict';
import { HarnessAdapter, estimatedCounter, attach, type EventContext } from '../src/index.js';
import { TestClock } from './helpers.js';
const agent = () => ({ session: { id: 's' }, options: { model: 'fish', provider: 'local' } });
const opening = { type: 'start', attemptId: 'a', revision: 1, turn: 1, step: 1 } as const;
test('adapter ignores usage, durable embedded streams and duplicate raw frames', () => {
  const h = new HarnessAdapter(new TestClock()); const a = agent();
  h.frame(a, opening);
  const frame = { type: 'chunk', attemptId: 'a', revision: 2, index: 0, time: 0, chunk: { type: 'text-delta', text: 'abcd' } } as const;
  h.frame(a, frame); h.frame(a, frame);
  h.frame(a, { ...frame, revision: 3, index: 1, chunk: { type: 'usage' } });
  h.event(a.session, { type: 'assistant/message', seq: 1, data: { stream: [frame], usage: { outputTokens: 99 } } });
  assert.equal(h.session('s').snapshot().tokens, 1); assert.equal(h.session('s').snapshot().quality, 'estimated');
});
test('new agent epoch with a reused attempt id ignores frames from the retired agent', () => {
  const h = new HarnessAdapter(new TestClock()); const old = agent(); const next = agent();
  h.frame(old, opening); h.frame(next, opening);
  h.frame(old, { type: 'chunk', attemptId: 'a', revision: 2, index: 0, time: 0, chunk: { type: 'text-delta', text: 'abcd' } });
  assert.equal(h.session('s').snapshot().tokens, 0);
  h.frame(next, { type: 'chunk', attemptId: 'a', revision: 2, index: 0, time: 0, chunk: { type: 'text-delta', text: 'abcd' } });
  assert.equal(h.session('s').snapshot().tokens, 1);
});
test('duplicate session events do not restart a tool, unknown termination is not success', () => {
  const h = new HarnessAdapter(new TestClock()); const a = agent(); h.frame(a, opening);
  const call = { type: 'tool/call', seq: 1, data: { callId: 't' } };
  h.event(a.session, call); h.event(a.session, { type: 'tool/result', seq: 2, data: { callId: 't' } }); h.event(a.session, call);
  assert.equal(h.session('s').snapshot().tools, 0);
  h.event(a.session, { type: 'turn/end', seq: 3, data: { turn: 1, reason: { kind: 'extension' } } });
  assert.equal(h.session('s').snapshot().state, 'unknown-end');
});
test('estimator is invariant to splitting Unicode text at codepoint boundaries', () => {
  const s = '你好 fish 🐋'; const c = estimatedCounter();
  assert.equal(c.count(s, 'text'), [...s].reduce((sum, ch) => sum + c.count(ch, 'text')!, 0));
});
test('duplicate indices never reach a stateful counter, even with a newer revision', () => {
  let calls = 0;
  const h = new HarnessAdapter(new TestClock(), {}, () => ({ id: 'stateful', quality: 'exact', count() { calls++; return 1; } }));
  const a = agent(); h.frame(a, opening);
  const chunk = { type: 'chunk', attemptId: 'a', revision: 2, index: 0, time: 0, chunk: { type: 'text-delta', text: 'x' } } as const;
  h.frame(a, chunk); h.frame(a, { ...chunk, revision: 3 });
  assert.equal(calls, 1); assert.equal(h.session('s').snapshot().tokens, 1);
});
test('retry lifecycle pauses and restores request waiting without becoming success', () => {
  const h = new HarnessAdapter(new TestClock()); const a = agent(); h.frame(a, opening);
  h.event(a.session, { type: 'llm/retry', seq: 1, data: { turn: 1 } });
  assert.equal(h.session('s').snapshot().state, 'retrying');
  h.event(a.session, { type: 'llm/retry-started', seq: 2, data: { turn: 1 } });
  assert.equal(h.session('s').snapshot().state, 'awaiting-output');
  assert.equal(h.session('s').snapshot().completionSerial, 0);
});
test('Host attachment is observational, releases listeners and contains errors', () => {
  const listeners = new Map<string, (...args: any[]) => void>(); let release: () => void = () => {};
  const ctx = { on(name: string, cb: (...args: any[]) => void) { listeners.set(name, cb); return () => { listeners.delete(name); }; },
    effect(fn: () => () => void) { release = fn(); } } as EventContext;
  const errors: unknown[] = []; const h = new HarnessAdapter(new TestClock(), {}, () => ({ id: 'throwing', quality: 'exact', count() { throw new Error('counter failed'); } }));
  const dispose = attach(ctx, h, e => errors.push(e));
  const a = agent(); listeners.get('agent/assistant-stream')!({ agent: a, frame: opening });
  listeners.get('agent/assistant-stream')!({ agent: a, frame: { type: 'chunk', attemptId: 'a', revision: 2, index: 0, time: 0, chunk: { type: 'text-delta', text: 'x' } } });
  assert.equal(errors.length, 1); release(); dispose(); assert.equal(listeners.size, 0); assert.equal(h.sessionCount, 0);
});
