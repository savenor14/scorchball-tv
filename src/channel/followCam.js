// The vertical camera's framing (clips.html; getting the word out, docs/launch-plan.md): a window onto the picture,
// in stage pixels, that eases after the ball and stays inside its bounds. Pure, for the tests; the page draws it.

/**
 * @typedef {{ x: number, y: number, nudgeX: number, nudgeY: number, held: boolean }} Camera  Its centre (stage px), a
 *   nudge added to the ball (the arrow keys), and whether it's held still.
 * @typedef {{ x0: number, x1: number, y0: number, y1: number }} Bounds  Where it may look (stage px).
 */

/** Where the camera may look: the pitch and a little round it in Full; the whole picture in Broadcast. */
export function followBounds(/** @type {'full' | 'broadcast'} */ layout, /** @type {{ x: number, y: number, w: number, h: number }} */ pitch, /** @type {{ w: number, h: number }} */ stage) {
  return layout === 'broadcast'
    ? { x0: 0, x1: stage.w, y0: 0, y1: stage.h }
    : { x0: pitch.x - 8, x1: pitch.x + pitch.w + 8, y0: pitch.y - 30, y1: pitch.y + pitch.h + 14 };
}

/** Within lo..hi, or their middle when the window is wider than the room. @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

/**
 * One frame: the camera eased toward the ball (plus its nudge), or toward the bounds' middle without a ball (a card,
 * the studio), then kept inside the bounds for a window of `half` stage px each side. Held, it stays put (clamped).
 * @param {Camera} cam  Changed in place.
 * @param {{ x: number, y: number } | null} ball
 * @param {Bounds} b @param {{ w: number, h: number }} half  The window's half size, stage px.
 * @param {number} dt  Seconds since the last frame. @param {{ x: number, y: number }} ease  Seconds to close most of the gap.
 */
export function followStep(cam, ball, b, half, dt, ease) {
  if (!cam.held) {
    const tx = (ball ? ball.x : (b.x0 + b.x1) / 2) + cam.nudgeX;
    const ty = (ball ? ball.y : (b.y0 + b.y1) / 2) + cam.nudgeY;
    cam.x += (tx - cam.x) * (1 - Math.exp(-dt / ease.x));
    cam.y += (ty - cam.y) * (1 - Math.exp(-dt / ease.y));
  }
  cam.x = clamp(cam.x, b.x0 + half.w, b.x1 - half.w);
  cam.y = clamp(cam.y, b.y0 + half.h, b.y1 - half.h);
  return cam;
}
