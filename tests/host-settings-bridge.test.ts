import test from 'node:test';
import assert from 'node:assert/strict';
import { Config, apply } from '../src/host/plugin.js';
import { preferenceDefaults } from '../src/contract/preferences.js';

function host(settings: object) {
  const effects: (() => void)[] = [];
  const ctx = {
    fiber: { id: 'bigfish-fiber' },
    inject(keys: string[], callback: (scope: any) => void) {
      if (keys.includes('settings')) callback({ settings, effect: (setup: () => () => void) => { effects.push(setup()); } });
    },
  };
  return { ctx, effects };
}

test('exported Config resolves every Bigfish preference for current DSH forms', () => {
  const resolved = Config({});
  assert.deepEqual(Object.fromEntries(Object.entries(resolved).map(([key, value]) => [key, value.get()])), preferenceDefaults);
  const json = Config.toJSON() as unknown as {
    uid: number;
    refs: Record<string, { dict?: Record<string, number>; meta?: { volatile?: boolean } }>;
  };
  const dict = json.refs[String(json.uid)]?.dict ?? {};
  for (const key of Object.keys(preferenceDefaults)) {
    assert.equal(json.refs[String(dict[key])]?.meta?.volatile, true, key);
  }
});

test('legacy settings service retains the registered Bigfish namespace', () => {
  let registered: { namespace: string; schema: unknown; base: unknown } | undefined;
  const { ctx } = host({ register(namespace: string, schema: unknown, options: { base: unknown }) {
    registered = { namespace, schema, base: options.base };
  } });
  apply(ctx, { enabled: { get: () => false } });
  assert.equal(registered?.namespace, 'bigfish');
  assert.notEqual(registered?.schema, Config);
  assert.deepEqual((registered?.schema as typeof Config)({}), preferenceDefaults);
  assert.deepEqual(registered?.base, { enabled: false });
});

test('current settings service disables the generated page in favor of the custom section', () => {
  let presentation: unknown;
  let owner: unknown;
  let disposed = false;
  const { ctx, effects } = host({ configure(value: unknown, fiber: unknown) {
    presentation = value; owner = fiber; return () => { disposed = true; };
  } });
  apply(ctx);
  assert.deepEqual(presentation, { auto: false });
  assert.equal(owner, ctx.fiber);
  assert.equal(effects.length, 1);
  effects[0]?.();
  assert.equal(disposed, true);
});
