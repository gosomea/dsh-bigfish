import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parsePack, motions } from '../src/contract/scenes.js';
import { Director, seeded } from '../src/domain/director.js';
const raw = JSON.parse(readFileSync(new URL('../packs/classic/manifest.json', import.meta.url), 'utf8'));
const pack = parsePack(raw, () => true);
test('all 29 motions and five different sign animations are reachable from the built-in pack', () => {
  const present = new Set(pack.scenes.flatMap(s => s.actions.map(a => a.motion)));
  assert.deepEqual([...present].sort(), [...motions].sort());
  const signs = pack.scenes.flatMap(s => s.actions).filter(a => a.motion === 'wait-sign' || a.motion.startsWith('sign-'));
  assert.equal(signs.length, 5); assert.ok(signs.every(a => a.animation && a.states.includes('idle')));
});
test('idle first raises the waiting sign and later cycles without consecutive repeats', () => {
  const d = new Director(pack, seeded(23)); const input = { sessionId: 'idle', turn: 0, state: 'idle' as const, pressure: 0, fatigue: 0 };
  const first = d.tick(input, 0); assert.equal(first.actionId, 'wait-sign'); assert.equal(first.whipAllowed, false);
  const ids: string[] = [first.actionId];
  for (let at = 500; at < 180000; at += 500) { const next = d.tick(input, at); if (next.actionId !== ids.at(-1)) ids.push(next.actionId); assert.equal(next.whipAllowed, false); }
  assert.ok(new Set(ids.filter(id => id === 'wait-sign' || id.startsWith('sign-'))).size === 5);
});
test('frame packs reject out-of-atlas coordinates and unsupported frame rates', () => {
  const invalid = structuredClone(raw); invalid.scenes[0].actions[0].animation = { atlas: 'signs', frames: [16], fps: 4, pingPong: false };
  assert.throws(() => parsePack(invalid, () => true));
  invalid.scenes[0].actions[0].animation.frames = [0]; invalid.scenes[0].actions[0].animation.fps = 100;
  assert.throws(() => parsePack(invalid, () => true));
});
test('eligible scenes retain their minimum hold instead of rerolling each animation frame', () => {
  const director = new Director(pack, seeded(23));
  const input = { sessionId: 'working', turn: 1, state: 'generating' as const, pressure: .8, fatigue: .2 };
  const initial = director.tick(input, 0).sceneId;
  let allowed = 0;
  for (let now = 40; now < 19000; now += 40) {
    const next = director.tick(input, now); assert.equal(next.sceneId, initial);
    if (next.whipAllowed) allowed++; director.completeTransition();
  }
  assert.ok(allowed > 400, 'air swings remain enabled during steady generation');
});
