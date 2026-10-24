import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coinsFor, watcher } from '../src/channel/coinCount.js';

const MIN = 60_000;
/** A made-up hour: 10 min of studio, 30 live, a 20-min re-air in two halves with no half-time. */
const air = /** @type {any} */ ({
  spans: [
    { kind: 'studio', from: 0, until: 10 * MIN },
    { kind: 'live', from: 10 * MIN, until: 40 * MIN },
    { kind: 'reair', from: 40 * MIN, until: 60 * MIN },
  ],
  units: [{ kind: 'reair', from: 40 * MIN, until: 50 * MIN }, { kind: 'reair', from: 50 * MIN, until: 60 * MIN }],
});

test('a stretch of watching earns live by the minute, everything else at the studio\'s rate', () => {
  const watch = watcher(air);
  // 30 live minutes; 10 of studio and 20 of re-air: 30 at 1 every 5.
  assert.deepEqual(coinsFor(watch(0, 60 * MIN), { liveMinutes: 1, offseasonMinutes: 1, studioMinutes: 5 }), { live: 30, offseason: 0, highlights: 0, other: 6, total: 36 });
  // From 4 min to 55 min: 6 studio and 15 re-air minutes (4 coins), all 30 live.
  assert.deepEqual(coinsFor(watch(4 * MIN, 55 * MIN), { liveMinutes: 1, offseasonMinutes: 1, studioMinutes: 5 }), { live: 30, offseason: 0, highlights: 0, other: 4, total: 34 });
});
