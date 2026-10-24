// The phone readout's numbers (phones, step 1; src/channel/perf.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPerf, tallyLines } from '../src/channel/perf.js';

test('frames: their intervals, the worst, the slow ones, and the parts of drawing per frame', () => {
  const perf = createPerf({ windowMs: 1000 });
  let now = 0;
  for (const gap of [16, 16, 50, 16]) {
    now += gap;
    perf.frameStart(now);
    perf.mark('match', now + 4);
    perf.add('text', 1);
    perf.mark('scene', now + 6);
    perf.frameEnd(now + 6);
  }
  perf.frameStart(0); // the very first frame has no interval: left out
  const t = perf.total;
  // The first frameStart (at 16) only starts the clock: three intervals counted, then the backwards one ignored.
  assert.equal(t.frames, 3);
  assert.equal(t.worstMs, 50);
  assert.equal(t.slow, 1);
  assert.equal(t.phases.match / t.frames, 4);
  assert.equal(t.phases.scene / t.frames, 2);
  assert.equal(t.phases['+text'] / t.frames, 1);
  const lines = tallyLines(t, 'ALL').join('\n');
  assert.match(lines, /3 frames, avg 27\.3 ms/);
  assert.match(lines, /of which: text 1\.00/);
});

test('a hidden tab\'s gap is not a slow frame', () => {
  const perf = createPerf();
  perf.frameStart(0);
  perf.frameStart(16);
  perf.frameStart(5016);
  perf.frameStart(5032);
  assert.equal(perf.total.frames, 2);
  assert.equal(perf.total.worstMs, 16);
});

test('sounds: how late they start, the late ones, renders waited on, ones left out; RESET starts afresh', () => {
  const perf = createPerf();
  perf.sound(-3);
  perf.sound(20);
  perf.sound(120);
  perf.rendered(400);
  perf.dropped();
  assert.deepEqual([perf.total.sounds, perf.total.late, perf.total.worstLateMs, perf.total.lateSumMs], [3, 1, 120, 140]);
  assert.deepEqual([perf.total.takes, perf.total.takesLate, perf.total.dropped], [1, 1, 1]);
  perf.reset();
  assert.equal(perf.total.sounds, 0);
  assert.deepEqual(tallyLines(perf.total, 'ALL'), ['ALL: no frames yet']);
});

test('"now" is the last full window, the one filling until there is one', () => {
  const perf = createPerf({ windowMs: 100 });
  for (let now = 0; now <= 100; now += 10) perf.frameStart(now);
  // At 100 the first window (10 intervals) closed.
  assert.equal(perf.recent.frames, 10);
  perf.frameStart(140);
  assert.equal(perf.recent.frames, 10);
  assert.equal(perf.recent.worstMs, 10);
});
