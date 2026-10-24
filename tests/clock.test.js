import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createClock } from '../src/channel/clock.js';

test('the clock follows real time, from another moment and at another speed if asked', () => {
  let real = 1_000_000;
  const realNow = () => real;
  const plain = createClock({ realNow });
  const shifted = createClock({ realNow, at: 5_000 });
  const fast = createClock({ realNow, at: 5_000, speed: 60 });
  real += 1_000;
  assert.equal(plain.now(), 1_001_000);
  assert.equal(shifted.now(), 6_000);
  assert.equal(fast.now(), 65_000);
  assert.throws(() => createClock({ realNow, speed: 0 }), RangeError);
});

test('the clock never goes backwards when the computer\'s clock steps back; it holds until real time catches up', () => {
  let real = 1_000_000;
  const clock = createClock({ realNow: () => real, at: 5_000_000 });
  real += 10_000;
  assert.equal(clock.now(), 5_010_000);
  real -= 1_800; // a time sync nudges the wall clock back
  assert.equal(clock.now(), 5_010_000, 'holds still');
  real += 1_000;
  assert.equal(clock.now(), 5_010_000, 'still catching up');
  real += 1_800;
  assert.equal(clock.now(), 5_011_000, 'moving again once real time passes where it was');
});
