import test from 'node:test';
import assert from 'node:assert/strict';
import { whipBeat } from '../src/client/whip-choreography.js';
test('character anticipates then reacts to the same swing, with three bounded responses', () => {
  for (let cycle = 0; cycle < 3; cycle++) {
    assert.equal(whipBeat(cycle + .1, 1).reaction, 0);
    assert.equal(whipBeat(cycle + .35, 1).stage, 'sweep');
    assert.equal(whipBeat(cycle + .47, 1).pose, 8);
    assert.equal(whipBeat(cycle + .6, 1).pose, [9, 10, 6][cycle]);
    assert.equal(whipBeat(cycle + .99, 1).pose, 4);
  }
  for (let t = 0; t < 3; t += .001) {
    const b = whipBeat(t, 1);
    assert.ok(b.dx >= 0 && b.dx <= 12); // Character moves away from the air-swing hull.
    assert.ok(b.dy >= -6 && b.dy <= 5);
    assert.ok(b.squash >= .96 && b.squash <= 1);
  }
});
