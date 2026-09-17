import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeCompanion } from '../src/client/controller.js';
import { preferenceDefaults } from '../src/contract/preferences.js';
import type { Binding, EventWindow, Entry, NativeServices } from '../src/client/native-contract.js';
class Store<T> {
  listeners = new Set<() => void>();
  constructor(private value: T) {}
  getSnapshot = () => this.value;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  set(value: T) { this.value = value; for (const fn of this.listeners) fn(); }
}
function fixture() {
  const makeSession = (id: string) => {
    const source = new Store<EventWindow>({ revision: 0, entries: [], change: { kind: 'replace' } });
    const session = Object.assign(new Store({ running: false, openState: 'open', lastAgentError: null }), {
      projections: { faceOf: () => new Store({ lastUsed: { provider: 'local', model: `model-${id}` } }) },
    });
    const binding: Binding = { sessionId: id, session, eventSource: source };
    let seq = 0;
    const append = (type: string, data: any, time = Date.now()) => {
      const e: Entry = { type: 'event', event: { type, data, seq: ++seq, time } }, old = source.getSnapshot();
      source.set({ revision: old.revision + 1, entries: [...old.entries, e], change: { kind: 'append', entries: [e] } });
    };
    return { source, session, binding, append,
      start() { session.set({ ...session.getSnapshot(), running: true }); append('turn/start', { turn: 1 }); },
      chunk(text: string, type = 'text-delta', time = Date.now()) { append('assistant/live-chunk', { attemptId: `${id}-attempt`, turn: 1, step: 1, chunk: { type, text } }, time); },
      end(kind = 'completed') { append('turn/end', { turn: 1, reason: { kind } }); session.set({ ...session.getSnapshot(), running: false }); },
    };
  };
  const a = makeSession('a'), b = makeSession('b');
  const list = new Store<{ current: string | undefined }>({ current: 'a' });
  const pending = new Store<ReadonlyMap<string, unknown>>(new Map());
  const connection = new Store<string | undefined>('connected');
  const preferences = Object.assign(new Store({ status: 'ready', writable: true, value: { ...preferenceDefaults }, mode: 'host', revision: 1 }), { mutate: async () => {} });
  const services: NativeServices = { sessions: { list, binding: id => id === 'a' ? a.binding : b.binding },
    uiSession: { pendingInteractions: pending }, connection: { state: connection }, settingsScope: { bind: () => preferences } };
  const controller = new NativeCompanion(services, null);
  return { a, b, list, pending, connection, preferences, controller, view: () => controller.getSnapshot(), select: (current: string | undefined) => list.set({ current }) };
}

test('concurrent sessions: only selected output, tools, confirmation and endings affect the pet', () => {
  const f = fixture(); try {
    f.a.start(); f.a.chunk('甲输出'); f.b.start(); f.b.chunk('乙输出很多很多');
    f.b.append('tool/call', { callId: 'b-tool', name: 'read_file', arguments: { path: '/b/secret.txt' } });
    f.pending.set(new Map([['b', {}]]));
    assert.equal(f.view().snapshot.sessionId, 'a'); assert.equal(f.view().snapshot.tokens, 3);
    assert.equal(f.view().snapshot.state, 'generating'); assert.equal(f.view().activity, null);
    f.b.end('error'); assert.equal(f.view().snapshot.state, 'generating');
    assert.equal(f.view().snapshot.completionSerial, 0);
    f.select('b'); assert.equal(f.view().snapshot.state, 'failed'); assert.equal(f.view().snapshot.tokens, 0);
  } finally { f.controller.dispose(); }
});
test('switching into active output restores role and model without recounting history or inventing speed', () => {
  const f = fixture(); try {
    f.a.start(); f.a.chunk('甲'); f.b.start(); f.b.chunk('乙的推理', 'reasoning-delta'); f.select('b');
    assert.equal(f.view().snapshot.state, 'reasoning'); assert.equal(f.view().model, 'model-b');
    assert.equal(f.view().snapshot.tokens, 0); assert.equal(f.view().snapshot.rate, null); assert.equal(f.view().snapshot.pressure, .15);
    f.b.chunk('新推理', 'reasoning-delta'); f.b.append('tool/call', { callId: 'b-tool', name: 'read_file' });
    assert.equal(f.view().snapshot.tokens, 3);
    assert.ok(f.view().snapshot.modelKey?.includes('model-b'));
    f.select('a'); assert.equal(f.view().snapshot.state, 'generating'); assert.equal(f.view().model, 'model-a');
    assert.equal(f.view().snapshot.tokens, 0); assert.equal(f.view().activity, null);
  } finally { f.controller.dispose(); }
});
test('switching into an output gap restores the gap, not an active stream', () => {
  const f = fixture(); try {
    f.b.start(); f.b.chunk('十秒前', 'text-delta', Date.now() - 10000); f.select('b');
    assert.equal(f.view().snapshot.state, 'streaming-gap'); assert.equal(f.view().snapshot.rate, null); assert.ok(f.view().snapshot.pressure <= .25);
    f.b.append('tool/call', { callId: 'b-tool', name: 'read_file' }); assert.equal(f.view().snapshot.state, 'tool-running');
  } finally { f.controller.dispose(); }
});
test('retry is restored on switch and released by retry-started', () => {
  const f = fixture(); try {
    f.b.start(); f.b.chunk('乙'); f.b.append('llm/retry', {}); f.select('b');
    assert.equal(f.view().snapshot.state, 'retrying'); assert.equal(f.view().snapshot.whipHz, 0);
    f.b.append('llm/retry-started', {}); assert.equal(f.view().snapshot.state, 'awaiting-output');
    f.b.chunk('继续'); assert.equal(f.view().snapshot.state, 'generating');
  } finally { f.controller.dispose(); }
});
test('waiting and tool state are scoped to selected session; old completion never replays', () => {
  const f = fixture(); try {
    f.a.start(); f.a.chunk('甲'); f.b.start(); f.b.append('tool/call', { callId: 'tool', name: 'read_file' });
    f.pending.set(new Map([['b', {}]])); f.select('b'); assert.equal(f.view().snapshot.state, 'waiting-user');
    f.pending.set(new Map()); assert.equal(f.view().snapshot.state, 'tool-running');
    f.select('a'); f.b.end(); assert.equal(f.view().snapshot.state, 'generating');
    f.select('b'); assert.equal(f.view().snapshot.state, 'completed'); assert.equal(f.view().snapshot.completionSerial, 0);
    assert.equal(f.view().activity, null); assert.equal(f.view().snapshot.tools, 0);
  } finally { f.controller.dispose(); }
});
test('repeated switches release inactive listeners, list updates do not reset live counters, no current session is idle', () => {
  const f = fixture(); try {
    f.a.start(); f.a.chunk('甲'); f.select('a'); assert.equal(f.view().snapshot.tokens, 1);
    f.b.start();
    for (let i = 0; i < 100; i++) { f.select('b'); f.select('a'); }
    for (const store of [f.a.source, f.a.session]) assert.equal(store.listeners.size, 1);
    for (const store of [f.b.source, f.b.session]) assert.equal(store.listeners.size, 0);
    f.select(undefined); assert.equal(f.view().snapshot.state, 'idle');
    f.b.chunk('乙'); assert.equal(f.view().snapshot.state, 'idle');
  } finally { f.controller.dispose(); }
  for (const store of [f.a.source, f.a.session, f.b.source, f.b.session, f.list, f.pending, f.connection, f.preferences]) assert.equal(store.listeners.size, 0);
});
test('replaced host window restores current output without counting baseline text or replaying completion', () => {
  const f = fixture(); try {
    f.a.start(); f.a.chunk('旧'); const old = f.a.source.getSnapshot();
    f.a.source.set({ ...old, revision: old.revision + 1, change: { kind: 'replace' } });
    assert.equal(f.view().snapshot.state, 'generating'); assert.equal(f.view().snapshot.tokens, 0);
    f.a.chunk('新'); f.a.end(); assert.equal(f.view().snapshot.tokens, 1); assert.equal(f.view().snapshot.completionSerial, 1);
  } finally { f.controller.dispose(); }
});
test('restored attempt settles normally and duplicate snapshot notifications do not replay old text', () => {
  const f = fixture(); try {
    f.b.start(); f.b.chunk('乙旧'); f.select('b'); f.b.source.set(f.b.source.getSnapshot());
    assert.equal(f.view().snapshot.tokens, 0);
    const old = f.b.source.getSnapshot();
    f.b.source.set({ revision: old.revision + 1, entries: old.entries.filter(e => e.event.type !== 'assistant/live-chunk'), change: { kind: 'settle-assistant', attemptId: 'b-attempt' } });
    assert.equal(f.view().snapshot.state, 'awaiting-output');
    f.b.append('tool/call', { callId: 't', name: 'read_file' });
    f.select('a'); f.select('b'); assert.equal(f.view().snapshot.state, 'tool-running'); assert.equal(f.view().snapshot.tokens, 0);
  } finally { f.controller.dispose(); }
});
test('disconnected switch does not restore an active swing and reconnect waits for fresh output', () => {
  const f = fixture(); try {
    f.b.start(); f.b.chunk('乙旧'); f.connection.set('disconnected'); f.select('b');
    assert.equal(f.view().snapshot.state, 'disconnected'); assert.equal(f.view().snapshot.whipHz, 0);
    f.connection.set('connected'); assert.equal(f.view().snapshot.state, 'awaiting-output');
    f.b.chunk('新'); assert.equal(f.view().snapshot.state, 'generating'); assert.equal(f.view().snapshot.tokens, 1);
  } finally { f.controller.dispose(); }
});
test('excluded reasoning and metadata do not restore output animation', () => {
  const f = fixture(); try {
    const prefs = f.preferences.getSnapshot(); f.preferences.set({ ...prefs, revision: 2, value: { ...prefs.value, includeReasoning: false } });
    f.b.start(); f.b.chunk('推理', 'reasoning-delta'); f.b.chunk('', 'usage'); f.select('b');
    assert.equal(f.view().snapshot.state, 'awaiting-output'); assert.equal(f.view().snapshot.tokens, 0);
  } finally { f.controller.dispose(); }
});

test('task cues follow only the selected session and clear when no session is selected',()=>{
 const f=fixture(),user=(text:string)=>({role:'user',source:{kind:'user'},content:[{type:'text',text}]});try{
  f.a.append('user/message',user('甲的任务'));f.b.append('user/message',user('乙的任务'));assert.equal(f.view().task,'甲的任务');
  f.select('b');assert.equal(f.view().task,'乙的任务');f.a.append('user/message',user('甲的新任务'));assert.equal(f.view().task,'乙的任务');
  f.select('a');assert.equal(f.view().task,'甲的新任务');f.select(undefined);assert.equal(f.view().task,'');
 }finally{f.controller.dispose();}
});
