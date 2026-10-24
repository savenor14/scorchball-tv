// The ball's spin by its speed (Tom, 2026-10-16; src/channel/ballSpin.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spinOn } from '../src/channel/ballSpin.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const s = (await loadConfigFromDisk()).settings.animation.ballSpin;

test('the ball turns with its speed: still at a player\'s feet, quicker the faster it goes, never past maxSteps', () => {
  let st = spinOn(null, { x: 100, y: 100 }, true, 0, s);
  assert.equal(st?.turn, 0);
  // 50 px/s for a second, in 16 ms frames: perPixel × 50 steps.
  for (let t = 16; t <= 1008; t += 16) st = spinOn(st, { x: 100 + (t * 50) / 1000, y: 100 }, true, t, s);
  const slow = /** @type {any} */ (st).turn;
  assert.ok(Math.abs(slow - s.perPixel * 50 * 1.008) < 0.05, `slow ${slow}`);
  // Much faster: capped at maxSteps a second.
  let fast = spinOn(null, { x: 0, y: 0 }, true, 0, s);
  for (let t = 16; t <= 1008; t += 16) fast = spinOn(fast, { x: t * 2, y: 0 }, true, t, s);
  assert.ok(Math.abs(/** @type {any} */ (fast).turn - s.maxSteps * 1.008) < 0.05);
  // At a player's feet it holds where it was.
  const held = spinOn(fast, { x: 5000, y: 0 }, false, 1024, s);
  assert.equal(held?.turn, fast?.turn);
  // A jump (a replay) starts afresh where it was; no ball, no state.
  assert.equal(spinOn(fast, { x: 0, y: 0 }, true, 1008 + s.jumpMs + 1, s)?.turn, fast?.turn);
  assert.equal(spinOn(fast, { x: 0, y: 0 }, true, 10, s)?.turn, fast?.turn);
  assert.equal(spinOn(fast, null, true, 1100, s), null);
});
