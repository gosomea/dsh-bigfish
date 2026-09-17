import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePack, loadPack, canWhip, Director, seeded } from '../src/index.js';
const raw = () => JSON.parse(readFileSync(new URL('../packs/logic-fixture/manifest.json', import.meta.url), 'utf8'));
const pack = () => parsePack(raw(), () => true);
const input = { sessionId: 's', turn: 1, state: 'generating' as const, pressure: .7, fatigue: .2 };
test('V4: new content loads without hardcoded scene ids; duplicate or unsupported packs fall back explicitly', () => {
  const p = raw(); p.id = 'extension'; p.scenes[0].id = p.fallbackSceneId = 'new-room';
  assert.equal(new Director(parsePack(p, () => true)).tick(input, 0).sceneId, 'new-room');
  p.schemaVersion = 99; const result = loadPack(p, () => true, pack());
  assert.ok(result.error); assert.equal(result.pack.id, 'bigfish-logic-fixture');
  p.schemaVersion = 1; p.scenes.push(p.scenes[0]); assert.throws(() => parsePack(p, () => true), /Duplicate/);
});
test('scene parser refuses missing files, traversal and invalid ranges', () => {
  for (const path of ['../secret', '/tmp/image.png', 'https://example.com/x', 'a/../x']) {
    const p = raw(); p.assets = [path]; assert.throws(() => parsePack(p, () => true));
  }
  const p = raw(); p.assets = ['textures/body.png']; assert.throws(() => parsePack(p, () => false), /Missing asset/);
  p.assets = []; p.scenes[0].actions[0].pressure = [1, 0]; assert.throws(() => parsePack(p, () => true), /range/);
});
test('V1: overlapping full hulls suppress every whip regardless of pressure', () => {
  const p = raw(); p.scenes[0].whipHull.x = 120;
  const d = new Director(parsePack(p, () => true));
  assert.equal(d.tick(input, 0).whipAllowed, false);
  const safe = new Director(pack()); safe.tick(input, 0);
  assert.equal(safe.tick(input, 100).whipAllowed, true);
  assert.equal(canWhip({ x: 100, y: 0, width: 100, height: 180 }, { x: 0, y: 0, width: 88, height: 100 }, 12), false);
});
test('V3: seeded replay is identical and cooldown avoids repeated reactions', () => {
  const a = new Director(pack(), seeded(44)); const b = new Director(pack(), seeded(44));
  const observed: (string | null)[] = [];
  for (let t = 0; t <= 4000; t += 500) {
    const x = a.tick(input, t); assert.deepEqual(x, b.tick(input, t)); observed.push(x.reactionId);
  }
  assert.notEqual(observed[0], observed[1]); assert.ok(observed.includes(null));
});
test('channel conflicts prevent a reaction from fighting the main body action', () => {
  const p = raw(); for (const a of p.scenes[0].actions.slice(1)) a.channels = ['body'];
  assert.equal(new Director(parsePack(p, () => true)).tick(input, 0).reactionId, null);
});
test('state interrupts and session switches bypass pressure band hold', () => {
  const d = new Director(pack()); d.tick(input, 0); assert.ok(d.tick(input, 2000).band > 0);
  assert.equal(d.tick({ ...input, state: 'cancelled' }, 2001).whipAllowed, false);
  assert.equal(d.tick({ ...input, state: 'waiting-user' }, 2002).band, 0);
  assert.equal(d.tick({ ...input, sessionId: 'other' }, 2003).band, 0);
});
test('scene transitions suppress whip motion until renderer acknowledgement', () => {
  const p = raw(); const second = structuredClone(p.scenes[0]); second.id = 'second';
  p.scenes[0].states = ['idle']; for (const a of p.scenes[0].actions) a.states = ['idle'];
  p.scenes.push(second);
  const d = new Director(parsePack(p, () => true));
  d.tick({ ...input, state: 'idle' }, 0);
  assert.ok(d.tick(input, 100).transition);
  assert.equal(d.tick(input, 1000).whipAllowed, false);
  d.completeTransition(); assert.equal(d.tick(input, 1001).whipAllowed, true);
});
