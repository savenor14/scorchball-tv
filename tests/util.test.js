import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDayTime } from '../src/util.js';

test('parseDayTime reads "day N HH:MM" as wall-clock minutes from day 1 00:00', () => {
  assert.deepEqual(parseDayTime('day 1 00:30'), { day: 1, hour: 0, minute: 30, minutes: 30 });
  assert.deepEqual(parseDayTime('day 6 20:00'), { day: 6, hour: 20, minute: 0, minutes: 5 * 1440 + 1200 });
  for (const bad of ['day 0 10:00', 'day 1 24:00', 'day 1 9:00', 'Day 1 09:00', 'day 1 09:60']) {
    assert.throws(() => parseDayTime(bad), RangeError, bad);
  }
});
