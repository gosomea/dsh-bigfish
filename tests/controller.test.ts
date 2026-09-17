import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeCompanion } from '../src/client/controller.js';
import { preferenceDefaults } from '../src/contract/preferences.js';
import type { EventWindow, Entry, NativeServices } from '../src/client/native-contract.js';
class Store<T> {
  listeners = new Set<() => void>(); constructor(private value: T) {}
  getSnapshot = () => this.value;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  set(value: T) { this.value = value; for (const fn of this.listeners) fn(); }
}
const entry = (type: string, data: any, seq = 1): Entry => ({ type: 'event', event: { type, data, seq, time: Date.now() } });
function fixture(history: Entry[] = []) {
  const source = new Store<EventWindow>({ revision: 0, entries: history, change: { kind: 'replace' } });
  const session = Object.assign(new Store({ running: false, openState: 'open', lastAgentError: null }), { projections: { faceOf: () => new Store({ lastUsed: { provider: 'local', model: 'test' } }) } });
  const list = new Store<{ current: string | undefined }>({ current: 's1' });
  const pending = new Store<ReadonlyMap<string, unknown>>(new Map());
  const connection = new Store<string | undefined>('connected');
  const preferences = new Store({ status: 'ready', writable: true, value: { ...preferenceDefaults }, mode: 'host', revision: 1 });
  const scope = Object.assign(preferences, { mutate: async (ops: readonly { path: string[]; value: any }[]) => {
    const s = preferences.getSnapshot(); const value = { ...s.value }; for (const op of ops) (value as any)[op.path[0]!] = op.value;
    preferences.set({ ...s, value, revision: s.revision + 1 });
  } });
  const services: NativeServices = { sessions: { list, binding: () => ({ sessionId: 's1', session, eventSource: source }) },
    uiSession: { pendingInteractions: pending }, connection: { state: connection }, settingsScope: { bind: () => scope } };
  // Real ISessions returns the same retained binding until a lifecycle replacement.
  const binding = services.sessions.binding('s1'); services.sessions.binding = () => binding;
  const controller = new NativeCompanion(services, null);
  let seq = history.length + 1;
  const append = (type: string, data: any) => {
    const e = entry(type, data, seq++), prev = source.getSnapshot();
    source.set({ revision: prev.revision + 1, entries: [...prev.entries, e], change: { kind: 'append', entries: [e] } });
  };
  const chunk = (text: string, type = 'text-delta') => append('assistant/live-chunk', { attemptId: 'a1', turn: 1, step: 1, chunk: { type, index: 0, text } });
  return { controller, source, session, list, pending, connection, append, chunk, preferences };
}
test('native history hydration never recounts text or replays completion', () => {
  const f = fixture([entry('turn/start', { turn: 1 }), entry('assistant/live-chunk', { chunk: { text: '旧内容' } }), entry('turn/end', { turn: 1, reason: { kind: 'completed' } }, 3)]);
  try { const s = f.controller.getSnapshot().snapshot; assert.equal(s.tokens, 0); assert.equal(s.completionSerial, 0); assert.equal(s.state, 'completed'); }
  finally { f.controller.dispose(); }
});
test('native append counts actual live text once and settles only at turn end', () => {
  const f = fixture();
  try {
    f.append('turn/start', { turn: 1 }); f.chunk('大肥鱼');
    assert.equal(f.controller.getSnapshot().snapshot.tokens, 3);
    assert.equal(f.controller.getSnapshot().model, 'test');
    f.source.set(f.source.getSnapshot()); assert.equal(f.controller.getSnapshot().snapshot.tokens, 3);
    const prev = f.source.getSnapshot(); f.source.set({ ...prev, revision: prev.revision + 1, change: { kind: 'settle-assistant', attemptId: 'a1' } });
    assert.equal(f.controller.getSnapshot().snapshot.completionSerial, 0);
    f.append('tool/call', { callId: 'tool' }); assert.equal(f.controller.getSnapshot().snapshot.state, 'tool-running');
    f.append('turn/end', { turn: 1, reason: { kind: 'completed' } }); assert.equal(f.controller.getSnapshot().snapshot.completionSerial, 1);
  } finally { f.controller.dispose(); }
});
test('native pending interaction and connection recovery stop whip and discard stale rates', () => {
  const f = fixture();
  try {
    f.append('turn/start', { turn: 1 }); f.chunk('写代码');
    f.pending.set(new Map([['s1', {}]])); assert.equal(f.controller.getSnapshot().snapshot.state, 'waiting-user');
    assert.equal(f.controller.getSnapshot().snapshot.whipHz, 0);
    f.pending.set(new Map()); f.connection.set('disconnected'); assert.equal(f.controller.getSnapshot().snapshot.state, 'disconnected');
    f.connection.set('connected'); assert.equal(f.controller.getSnapshot().snapshot.state, 'awaiting-output');
    f.chunk('继续'); assert.equal(f.controller.getSnapshot().snapshot.state, 'generating');
  } finally { f.controller.dispose(); }
});
test('disable unsubscribes from session stream and teardown removes every observer', async () => {
  const f = fixture();
  await f.controller.preferences.update({ enabled: false }); assert.equal(f.source.listeners.size, 0);
  await f.controller.preferences.update({ enabled: true }); assert.equal(f.source.listeners.size, 1);
  f.controller.dispose();
  for (const store of [f.source, f.session, f.list, f.pending, f.connection, f.preferences]) assert.equal(store.listeners.size, 0);
});
test('reasoning exclusion and prepended history do not invent output', async () => {
  const f = fixture();
  try {
    await f.controller.preferences.update({ includeReasoning: false });
    f.append('turn/start', { turn: 1 }); f.chunk('推理内容', 'reasoning-delta'); assert.equal(f.controller.getSnapshot().snapshot.tokens, 0);
    f.chunk('结果'); assert.equal(f.controller.getSnapshot().snapshot.tokens, 2);
    const prev = f.source.getSnapshot(); f.source.set({ ...prev, revision: prev.revision + 1, change: { kind: 'prepend', entries: [entry('turn/end', { turn: 1, reason: { kind: 'completed' } })] } });
    assert.equal(f.controller.getSnapshot().snapshot.state, 'generating');
  } finally { f.controller.dispose(); }
});

test('local submission leaves waiting sign synchronously before any host event, and rolls back on rejection', () => {
  const f = fixture();
  try {
    const idle = f.session.getSnapshot();
    f.session.set({ ...idle, pendingSubmissions: [{ placement: 'transcript' }] } as typeof idle);
    const pending = f.controller.getSnapshot().snapshot;
    assert.equal(pending.state, 'awaiting-output'); assert.equal(pending.turn, 0);
    assert.equal(pending.tokens, 0); assert.equal(pending.whipHz, 0);
    f.session.set(idle); assert.equal(f.controller.getSnapshot().snapshot.state, 'idle');
    f.session.set({ ...idle, running: true });
    assert.equal(f.controller.getSnapshot().snapshot.state, 'awaiting-output');
    f.append('turn/start', { turn: 1 }); f.chunk('开始');
    assert.equal(f.controller.getSnapshot().snapshot.state, 'generating');
    assert.equal(f.controller.getSnapshot().snapshot.tokens, 2);
    f.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
    assert.equal(f.controller.getSnapshot().snapshot.state, 'completed');
  } finally { f.controller.dispose(); }
});
test('queued submissions do not interrupt an active output animation', () => {
  const f = fixture();
  try {
    f.append('turn/start', { turn: 1 }); f.chunk('正在写');
    const s = f.session.getSnapshot();
    f.session.set({ ...s, running: true, pendingSubmissions: [{ placement: 'queued' }] } as typeof s);
    assert.equal(f.controller.getSnapshot().snapshot.state, 'generating');
  } finally { f.controller.dispose(); }
});

test('native real result shape ends tools and updates dialogue category for nested calls',()=>{
 const f=fixture();try{
 f.append('turn/start',{turn:1});f.append('tool/call',{callId:'root',name:'run_code'});
 f.append('tool/ptc-dispatch-start',{parentCallId:'root',subCallId:'read',name:'read_file',arguments:{path:'/a/file.ts'}});
 assert.equal(f.controller.getSnapshot().activity?.category,'read');
 f.append('tool/result',{message:{content:[{type:'tool-result',toolCallId:'root'}]}});
 assert.equal(f.controller.getSnapshot().snapshot.tools,0);assert.equal(f.controller.getSnapshot().activity,null);
 assert.equal(f.controller.getSnapshot().snapshot.state,'awaiting-output');
 }finally{f.controller.dispose();}
});
