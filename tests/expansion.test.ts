import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { parsePet, type PetAnimation, type PetBundle } from '../src/pet/contract.js';
import { PetDirector, idleFrameAt } from '../src/pet/director.js';
import { actionIdle } from '../src/pet/action-dialogue.js';

const idle = { active: true, showText: true, motion: 'wave', text: '通用等候', serial: 1, durationMs: 12000 };
const input = { state: 'idle' as const, richness: 2, reduced: false, activity: 0, pressure: 0, idle, signPreference: 'balanced' as const };
function animation(id: string, family: string, sign = false): PetAnimation {
  return { id, label: id, tags: ['greeting', 'idle'], family, intensity: 0, loop: false, weight: 1, cooldownMs: 0, speed: [1, 1],
    frames: [450, 550, 600, 4800, 1800, 700].map((durationMs, i) => ({ asset: 'main', rect: [i * 64, 0, 64, 64], durationMs, ...(sign && i === 3 ? { sign: { x: 10, y: 30, width: 40, height: 15, angle: 0 } } : {}) })), holdFrame: 3 };
}
function bundle(): PetBundle {
  const fallback = { ...animation('rest', 'rest'), tags: ['idle'], loop: true, holdFrame: undefined };
  return { manifest: { fallbacks: { idle: 'rest', working: 'rest', attention: 'rest', error: 'rest', success: 'rest' } },
    animations: [fallback, animation('sign', 'sign', true), animation('daily', 'daily'), animation('rare', 'easter')], dialogue: {}, files: {}, warnings: [] } as unknown as PetBundle;
}
test('5, 12 and 30 second idle budgets preserve entry, a readable hold and final recovery', () => {
  const a = animation('sign', 'sign', true);
  for (const budget of [5000, 12000, 30000]) {
    assert.equal(idleFrameAt(a, 0, budget), a.frames[0]);
    assert.equal(idleFrameAt(a, 2000, budget), a.frames[3]);
    assert.equal(idleFrameAt(a, budget - 1, budget), a.frames.at(-1));
    assert.equal(idleFrameAt(a, budget + 100, budget), a.frames.at(-1));
  }
  assert.equal(idleFrameAt(a, 9999, 12000, true), a.frames[0]);
});
test('balanced idle budgets alternate signs and daily activities, no-sign excludes every sign', () => {
  const d = new PetDirector(bundle(), () => 0);
  assert.equal(d.choose({ ...input, idle: { ...idle, motion: 'wait-sign' } }, 0).animation.id, 'sign');
  assert.equal(d.choose({ ...input, idle: { ...idle, serial: 2 } }, 15000).animation.id, 'daily');
  assert.equal(d.choose({ ...input, signPreference: 'none', idle: { ...idle, motion: 'wait-sign', serial: 3 } }, 30000).animation.id, 'daily');
});
test('many variants in one family do not crowd out another and rare scenes wait ten minutes', () => {
  const p = bundle(); p.animations.push(...Array.from({ length: 20 }, (_, i) => animation('daily-' + i, 'daily')));
  const d = new PetDirector(p, () => .99);
  for (let serial = 1; serial < 10; serial++) assert.notEqual(d.choose({ ...input, idle: { ...idle, serial } }, serial * 15000).animation.family, 'easter');
  const chosen = d.choose({ ...input, idle: { ...idle, serial: 10 } }, 630000);
  assert.equal(chosen.animation.family, 'easter');
  assert.notEqual(d.choose({ ...input, idle: { ...idle, serial: 11 } }, 645000).animation.family, 'easter');
});
test('action dialogue follows its pose while explicit idle overrides and silence are preserved', () => {
  const dialogue = { 'fish:biscuit': ['分你半块～', '给你留了一半'] };
  assert.equal(actionIdle(idle, dialogue, 'fish:biscuit', '{}').text, '给你留了一半');
  assert.equal(actionIdle(idle, dialogue, 'fish:biscuit', JSON.stringify({ idle: ['用户的等候句'] })), idle);
  assert.equal(actionIdle(idle, dialogue, 'fish:biscuit', JSON.stringify({ idle: [] })), idle);
  assert.equal(actionIdle({ ...idle, active: false }, dialogue, 'fish:biscuit', '{}').text, idle.text);
});
test('shipped playful pack has 72 six-pose sequences plus five real fallbacks and bounded resources', async () => {
  const files: Record<string, Uint8Array> = {};
  for (const name of await readdir('examples/bigfish-playful')) files[name] = new Uint8Array(await readFile('examples/bigfish-playful/' + name));
  const p = parsePet(files);
  const actions = p.animations.filter(a => !a.id.startsWith('bigfish:base-'));
  assert.equal(actions.length, 72); assert.equal(p.animations.length, 77);
  assert.equal(actions.reduce((n, a) => n + a.frames.length, 0), 432);
  assert.equal(p.animations.reduce((n, a) => n + a.frames.length, 0), 452);
  assert.equal(new Set(actions.map(a => a.id)).size, 72);
  assert.ok(Object.values(p.manifest.assets).reduce((n, a) => n + a.width * a.height, 0) <= 32 * 1024 * 1024);
  assert.equal(actions.filter(a => a.tags.includes('near-miss')).length, 5);
  assert.equal(actions.filter(a => a.family === 'sign' && a.frames.some(f => f.sign)).length, 13);
  assert.ok(actions.every(a => !a.tags.includes('near-miss') || !a.tags.includes('working')));
  for (const [state, tag] of [['awaiting-output', 'start'], ['retrying', 'retry'], ['tool-running', 'web'], ['tool-running', 'image'], ['tool-running', 'agent']] as const) {
    assert.ok(new PetDirector(p, () => 0).choose({ ...input, state, tag, idle: undefined }, Date.now()).animation.tags.includes(tag));
  }
  const bad = structuredClone(p.animations); bad[0]!.holdFrame = 999;
  assert.throws(() => parsePet({ ...files, 'animations.json': new TextEncoder().encode(JSON.stringify(bad)) }), /数值/);
});
