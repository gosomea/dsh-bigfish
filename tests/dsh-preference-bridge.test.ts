import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferenceBridge } from '../src/client/dsh-preference-bridge.js';
import {PreferenceStore} from '../src/client/preferences-store.js';
import {decodePreferences, preferenceDefaults} from '../src/contract/preferences.js';
import {presetConfig} from '../src/companion/config.js';

const snapshot = { status: 'ready', value: { enabled: true }, writable: true, mode: 'host', revision: 7 };

test('legacy settingsScope binds the Bigfish namespace without changing mutation semantics', async () => {
  let spec: { namespace: string; decode: (value: unknown) => any } | undefined;
  let revision: number | undefined;
  const bridge = createPreferenceBridge({
    settingsScope: { bind: value => {
      spec = value;
      return {
        getSnapshot: () => snapshot,
        subscribe: () => () => {},
        mutate: async (_ops, expected) => { revision = expected; },
      };
    } },
  });
  assert.equal(bridge.kind, 'settings-scope');
  assert.equal(spec?.namespace, 'bigfish');
  assert.deepEqual(spec?.decode({ enabled: false }), { enabled: false });
  await bridge.scope?.mutate([{ op: 'set', path: ['enabled'], value: false }], 7);
  assert.equal(revision, 7);
});

test('configForms uses the Bigfish entry and converts false into a rejected mutation', async () => {
  let entryId: string | undefined;
  let accepted = true;
  const bridge = createPreferenceBridge({
    configForms: { get: id => {
      entryId = id;
      return {
        getSnapshot: () => snapshot,
        subscribe: () => () => {},
        mutate: async () => accepted,
      };
    } },
  });
  assert.equal(bridge.kind, 'config-forms');
  assert.equal(entryId, 'bigfish');
  assert.ok(bridge.scope);
  await bridge.scope.mutate([{ op: 'set', path: ['enabled'], value: false }], 7);
  accepted = false;
  await assert.rejects(
    bridge.scope.mutate([{ op: 'set', path: ['enabled'], value: false }], 7),
    /Host rejected settings mutation/,
  );
});

test('configForms wins during a transitional dual-service host and absence falls back locally', () => {
  let legacyBound = false;
  const current = createPreferenceBridge({
    configForms: { get: () => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, mutate: async () => true }) },
    settingsScope: { bind: () => { legacyBound = true; throw new Error('must not bind legacy service'); } },
  });
  assert.equal(current.kind, 'config-forms');
  assert.equal(legacyBound, false);
  assert.deepEqual(createPreferenceBridge({}), { kind: 'local', scope: null });
});

test('current ConfigForm without mode persists disabled task and memory groups through the Host revision', async () => {
  let value = {...preferenceDefaults}, revision = 11, writes = 0;
  const listeners = new Set<() => void>();
  const bridge = createPreferenceBridge({configForms: {get: () => ({
    getSnapshot: () => ({status: 'ready', value, writable: true, revision}),
    subscribe: listener => {listeners.add(listener); return () => {listeners.delete(listener);};},
    mutate: async (ops, expected) => {
      assert.equal(expected, revision);
      writes++;
      value = decodePreferences({...value, ...Object.fromEntries(ops.map(op => [op.path[0], op.value]))});
      revision++;
      for (const listener of listeners) listener();
      return true;
    },
  })}});
  const store = new PreferenceStore(bridge.scope, null);
  try {
    assert.equal(store.getSnapshot().persistence, 'host');
    const lifestyle = presetConfig('balanced');
    lifestyle.groups.steward = false;
    lifestyle.groups.memory = false;
    const lifestyleJson = JSON.stringify(lifestyle);
    await store.update({lifestyleJson});
    assert.equal(writes, 1);
    assert.equal(value.lifestyleJson, lifestyleJson);
    assert.equal(store.getSnapshot().persistence, 'host');
    const reopened = new PreferenceStore(bridge.scope, null);
    try {
      const saved = JSON.parse(reopened.getSnapshot().value.lifestyleJson);
      assert.equal(saved.groups.steward, false);
      assert.equal(saved.groups.memory, false);
    } finally {reopened.dispose();}
  } finally {store.dispose();}
});

test('loading or refused mode-less ConfigForms fail visibly instead of saving memory-only preferences', async () => {
  let status = 'loading', writes = 0;
  const bridge = createPreferenceBridge({configForms: {get: () => ({
    getSnapshot: () => ({status, value: preferenceDefaults, writable: true, revision: 4}),
    subscribe: () => () => {},
    mutate: async () => {writes++; return false;},
  })}});
  const store = new PreferenceStore(bridge.scope, null);
  try {
    await assert.rejects(store.update({size: 220}), /Read-only host settings/);
    assert.equal(writes, 0);
    assert.equal(store.getSnapshot().value.size, preferenceDefaults.size);
    assert.equal(store.getSnapshot().error, 'preferencesWrite');
    status = 'ready';
    await assert.rejects(store.update({size: 220}), /Host rejected settings mutation/);
    assert.equal(writes, 1);
    assert.equal(store.getSnapshot().value.size, preferenceDefaults.size);
    assert.equal(store.getSnapshot().persistence, 'host');
  } finally {store.dispose();}
});
