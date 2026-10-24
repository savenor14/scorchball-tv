// The ball's spin (Tom, 2026-10-16; on ballspin.html, the core's pixel on a round ball): how far it has turned, kept frame to
// frame, at a rate that follows its speed: still at a player's feet, quick off a shot, slowing as a pass arrives. Pure
// and DOM-free; pitch.js drawBall draws it. See docs/channel.md §6.

/**
 * @typedef {{ x: number, y: number, at: number, turn: number }} SpinState  Where the ball was last drawn (stage px), when
 *   (ms on its match's clock), and how far it has turned (the core's steps; 4 make a whole turn).
 * @typedef {{ perPixel: number, maxSteps: number, jumpMs: number }} SpinSettings  settings.animation.ballSpin.
 */

/**
 * The ball's turn this frame, and the state for the next.
 * @param {SpinState | null} prev  Last frame's, or null.
 * @param {{ x: number, y: number } | null} at  Where the ball is drawn now (stage px); null for no ball.
 * @param {boolean} moving  Travelling (not at a player's feet).
 * @param {number} now  ms on the match's clock.
 * @param {SpinSettings} s
 * @returns {SpinState | null}
 */
export function spinOn(prev, at, moving, now, s) {
  if (!at) return null;
  const dt = prev ? now - prev.at : 0;
  // A jump (a replay, a re-air's skip, turning back) starts the turn afresh where it was.
  if (!prev || dt < 0 || dt > s.jumpMs) return { ...at, at: now, turn: prev?.turn ?? 0 };
  if (!moving || dt === 0) return { ...at, at: now, turn: prev.turn };
  const speed = (Math.hypot(at.x - prev.x, at.y - prev.y) * 1000) / dt;
  const rate = Math.min(s.maxSteps, speed * s.perPixel);
  return { ...at, at: now, turn: prev.turn + (rate * dt) / 1000 };
}
