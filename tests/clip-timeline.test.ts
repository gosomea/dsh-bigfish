import test from 'node:test';
import assert from 'node:assert/strict';
import {ClipTimeline, atlasFrameRect,sequenceClip,companionTiming, type AnimationClip} from '../src/companion/clip-timeline.js';

const frames = (...indexes: number[]) => indexes.map(frame => ({frame, durationMs: 100}));
const walking: AnimationClip = {id: 'walk', entry: frames(0, 1), loop: frames(2, 3), exit: frames(4, 5)};
const stop: AnimationClip = {id: 'stop', entry: frames(10, 11), exit: frames(12), holdMs: 3000};

test('normal transitions complete the entry or loop and exit before changing clip', () => {
  const player = new ClipTimeline(walking);
  assert.equal(player.advance(150).frame, 1);
  player.request(stop);
  assert.equal(player.advance(49).frame, 1);
  assert.equal(player.advance(1).phase, 'exit');
  assert.equal(player.advance(100).frame, 5);
  assert.equal(player.advance(100).clip, 'stop');
  const loop = new ClipTimeline(walking);
  assert.equal(loop.advance(250).frame, 2);
  loop.request(stop);
  assert.equal(loop.advance(149).clip, 'walk');
  assert.equal(loop.advance(1).phase, 'exit');
  assert.equal(loop.advance(200).clip, 'stop');
});

test('one-shots hold the final pose for real seconds even at high playback rates', () => {
  const player = new ClipTimeline(stop);
  assert.equal(player.advance(150, 2).phase, 'hold');
  assert.equal(player.snapshot().frame, 12);
  player.request(walking);
  assert.equal(player.advance(2999, 4).clip, 'stop');
  assert.equal(player.advance(1, 4).clip, 'walk');
  const completed = new ClipTimeline({id: 'wave', entry: frames(0, 1)});
  assert.equal(completed.advance(2699).finished, false);
  assert.equal(completed.advance(1).finished, true);
  assert.deepEqual(completed.advance(100000), completed.snapshot());
});

test('direct interaction and work start interrupt the hold or exit immediately', () => {
  const player = new ClipTimeline(stop);
  player.advance(300);
  player.request(walking, 'urgent');
  assert.deepEqual(player.snapshot(), {clip: 'walk', phase: 'entry', frame: 0, index: 0, finished: false});
  player.request(stop);
  player.advance(200);
  assert.equal(player.snapshot().phase, 'exit');
  player.request({id: 'work', loop: frames(20, 21)}, 'urgent');
  assert.equal(player.snapshot().frame, 20);
});

test('changing playback speed accumulates only the new delta and never skips backwards', () => {
  const player = new ClipTimeline({id: 'typing', loop: frames(0, 1, 2, 3)});
  assert.equal(player.advance(90).frame, 0);
  assert.equal(player.advance(5, 2).frame, 1);
  assert.equal(player.advance(90, .5).frame, 1);
  assert.equal(player.advance(110, .5).frame, 2);
  assert.equal(player.advance(1000000, 1).frame, 2);
});

test('latest request replaces pending work; requesting the current clip cancels stale transition', () => {
  const player = new ClipTimeline(walking);
  player.request(stop);
  player.request({id: 'tea', entry: frames(20)});
  assert.equal(player.advance(400).clip, 'tea');
  const cancelled = new ClipTimeline(walking);
  cancelled.request(stop);
  cancelled.request(walking);
  assert.equal(cancelled.advance(1000).clip, 'walk');
  cancelled.request(stop);
  assert.equal(cancelled.advance(200).phase, 'exit');
  cancelled.request(walking);
  assert.equal(cancelled.advance(200).phase, 'loop');
  assert.equal(cancelled.advance(1000).clip, 'walk');
});

test('reduced motion stays on one authored pose while lifecycle and urgent response still work', () => {
  const player = new ClipTimeline({...walking, reducedFrame: 3}, {reducedMotion: true});
  for (let i = 0; i < 10; i++) assert.equal(player.advance(147).frame, 3);
  player.request(stop, 'urgent');
  assert.equal(player.snapshot().frame, 10);
  assert.equal(player.advance(10000).frame, 10);
  assert.equal(player.snapshot().finished, true);
});

test('atlas rects cover the actual image without overlap or clipped remainder pixels', () => {
  const rects = Array.from({length: 8}, (_, i) => atlasFrameRect(1774, 887, 4, 2, i));
  assert.deepEqual(rects[0], {x: 0, y: 0, width: 444, height: 444});
  assert.deepEqual(rects[7], {x: 1331, y: 444, width: 443, height: 443});
  for (let row = 0; row < 2; row++) {
    assert.equal(rects.slice(row * 4, row * 4 + 4).reduce((sum, rect) => sum + rect.width, 0), 1774);
    for (let column = 0; column < 3; column++) {
      const i = row * 4 + column;
      assert.equal(rects[i]!.x + rects[i]!.width, rects[i + 1]!.x);
    }
  }
  assert.equal(atlasFrameRect(1, 1, 1, 1, 0).width, 1);
  assert.throws(() => atlasFrameRect(1774, 887, 4, 2, 8));
  assert.throws(() => atlasFrameRect(2, 2, 4, 2, 0));
});

test('malformed timings cannot hang playback and zero hold finishes at the frame boundary', () => {
  assert.throws(() => new ClipTimeline({id: 'empty'}));
  assert.throws(() => new ClipTimeline({id: 'bad', loop: [{frame: 0, durationMs: 0}]}));
  assert.throws(() => new ClipTimeline({id: 'bad', loop: frames(0), holdMs: Infinity}));
  const player = new ClipTimeline({id: 'stop', entry: frames(0), holdMs: 0});
  assert.equal(player.advance(100).finished, true);
  assert.throws(() => player.advance(-1));
  assert.throws(() => player.advance(1, 0));
  const subnormal = new ClipTimeline({id: 'tiny', loop: [{frame: 0, durationMs: Number.MIN_VALUE}]});
  assert.throws(() => subnormal.advance(1, Number.MAX_VALUE));
});

test('per-frame timing and defensive copies preserve authored playback', () => {
  const authored = [{frame: 0, durationMs: 80}, {frame: 1, durationMs: 240}, {frame: 2, durationMs: 160}];
  const player = new ClipTimeline({id: 'turn', entry: authored, holdMs: 2000});
  authored[0]!.durationMs = 1;
  assert.equal(player.advance(79).frame, 0);
  assert.equal(player.advance(1).frame, 1);
  assert.equal(player.advance(239).frame, 1);
  assert.equal(player.advance(1).frame, 2);
  assert.equal(player.advance(160).phase, 'hold');
  assert.equal(player.advance(1999).finished, false);
  assert.equal(player.advance(1).finished, true);
});
test('the actual locomotion loop yields at its eight-frame boundary before the stop one-shot',()=>{
 const walk=sequenceClip({id:'walk',frames:8,frameMs:180,loop:true});
 const stop=sequenceClip({id:'stop',frames:8,frameMs:280,holdMs:3000});
 const player=new ClipTimeline(walk);player.advance(181);player.request(stop);
 assert.equal(player.advance(companionTiming.walkLoopMs-182).clip,'walk');
 assert.equal(player.advance(1).clip,'stop');assert.equal(player.snapshot().frame,0);
 assert.equal(player.advance(companionTiming.oneShotMs).frame,7);assert.equal(player.snapshot().phase,'hold');
 assert.equal(player.advance(2999).finished,false);assert.equal(player.advance(1).finished,true);
});
