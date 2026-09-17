import test from 'node:test';
import assert from 'node:assert/strict';
import { Baselines, resolveConfig } from '../src/index.js';
import { PreferenceStore } from '../src/client/preferences-store.js';
import { decodePreferences, preferenceDefaults } from '../src/contract/preferences.js';
class Memory implements Storage {
  map = new Map<string, string>(); get length() { return this.map.size; }
  clear() { this.map.clear(); } getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); } setItem(k: string, v: string) { this.map.set(k, v); }
}
test('persisted baseline round-trips with bounded validated data', () => {
  const history = new Baselines(resolveConfig()); history.commit('a', [20, 20, 20, 20], 1000);
  const copy = new Baselines(resolveConfig()); copy.restore(history.export(1100), 1200);
  assert.equal(copy.get('a', 1200)?.p50, 20);
  assert.throws(() => copy.restore({ version: 2, rows: [] }, 1200));
  assert.throws(() => copy.restore({ version: 1, rows: [{ key: 'a', samples: [Infinity] }] }, 1200));
});
test('local settings serialize rapid updates and reload across entry points', async () => {
  const storage = new Memory(); const first = new PreferenceStore(null, storage);
  await Promise.all([first.update({ size: 220 }), first.update({ mode: 'rhythm' })]);
  const second = new PreferenceStore(null, storage);
  assert.equal(second.getSnapshot().value.size, 220); assert.equal(second.getSnapshot().value.mode, 'rhythm');
  first.dispose(); second.dispose();
});
test('failed persistence leaves the previously confirmed preference visible', async () => {
  const storage = new Memory(); const store = new PreferenceStore(null, storage);
  storage.setItem = () => { throw new Error('quota'); };
  await assert.rejects(store.update({ size: 240 }));
  assert.equal(store.getSnapshot().value.size, preferenceDefaults.size);
  assert.equal(store.getSnapshot().error, 'preferencesWrite'); store.dispose();
});
test('host writes retain revision fencing and rejected writes do not pretend success', async () => {
  const scope = { getSnapshot: () => ({ status: 'ready', value: preferenceDefaults, writable: true, mode: 'host', revision: 7 }),
    subscribe: () => () => {}, mutate: async (_ops: unknown, revision?: number) => { assert.equal(revision, 7); throw new Error('conflict'); } };
  const store = new PreferenceStore(scope, null);
  await assert.rejects(store.update({ mode: 'rhythm' }));
  assert.equal(store.getSnapshot().value.mode, 'urge'); assert.equal(store.getSnapshot().saving, false);
});
test('preference parser rejects unsupported versions and invalid bounds', () => {
  assert.throws(() => decodePreferences({ version: 3 }));
  assert.throws(() => decodePreferences({ size: 999 }));
  assert.throws(() => decodePreferences({ richness: .5 }));
});
test('native scope recovering a rejected write without throwing is still reported as failure', async () => {
  const store = new PreferenceStore({ getSnapshot: () => ({ status: 'ready', value: preferenceDefaults, writable: true, mode: 'host', revision: 7 }), subscribe: () => () => {}, mutate: async () => {} }, null);
  await assert.rejects(store.update({ mode: 'rhythm' }));
  assert.equal(store.getSnapshot().error, 'preferencesWrite'); store.dispose();
});

test('first Host edit migrates legacy settings atomically without losing custom content',async()=>{
 let value:Record<string,unknown>={version:1,richness:2,dialogueJson:'{"read":["custom"]}',toolRulesJson:'[]',bubbleText:false,bubbleStatus:false};
 const store=new PreferenceStore({getSnapshot:()=>({status:'ready',value,writable:true,mode:'host',revision:7}),subscribe:()=>()=>{},mutate:async ops=>{value={...value};for(const op of ops)value[op.path[0]!]=op.value;}},null);
 assert.equal(store.getSnapshot().value.bubbleEnabled,false);await store.update({idleMode:'occasional'});assert.equal(value.version,2);assert.equal(value.idleMode,'occasional');assert.equal(value.dialogueJson,'{"read":["custom"]}');assert.equal(value.richness,2);store.dispose();
});

test('restore compare-and-set checks at execution time, preserving edits queued after preview',async()=>{
 const store=new PreferenceStore(null,new Memory()),before=JSON.stringify(store.getSnapshot().value);
 const edit=store.update({size:210});const restore=store.update({...preferenceDefaults,whipEnabled:false},before);
 await edit;await assert.rejects(restore,/已变化/);assert.equal(store.getSnapshot().value.size,210);assert.equal(store.getSnapshot().value.whipEnabled,true);store.dispose();
});
