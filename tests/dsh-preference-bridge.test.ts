import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferenceBridge } from '../src/client/dsh-preference-bridge.js';

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
