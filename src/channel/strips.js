// Full mode's empty areas (Tasks 112–113; docs/channel.md §17.1): the strip above the ground and the strip between the
// ground and the ticker. Tom's picks: in match pictures (the stadium), one ad still above the ground, right of the
// scorebug (spotArt.js), and Broadcast's turf with the home team's name above the ticker; in everything else, a quiet band
// in the scene's blues in both. Canvas only, in stage px, Full only: Broadcast fills these areas with its stands.
import { STILL } from './spotArt.js';
import { PALETTE } from './palette.js';
import { drawGroundTurf, GROUND, GROUND_TURF } from './stands.js';

/** The two strips in Full (stage px): above the ground (the scorebug sits over its left end) and below it, down to the ticker. */
export const TOP_STRIP = Object.freeze({ x: 0, y: 0, w: GROUND.w, h: GROUND.top });
export const BOTTOM_STRIP = Object.freeze({ x: 0, y: GROUND.bottom, w: GROUND.w, h: 256 - GROUND.bottom });
/**
 * The turf in Full: Broadcast's, from just under the bottom boards down to the ticker, stopping GAP short of it so a
 * dark line runs above the ticker like the one under the scorebug and the ad still (Tom, Task 118).
 */
const GAP = GROUND.top - STILL.h;
export const FULL_TURF = Object.freeze({ y: GROUND_TURF.y, h: BOTTOM_STRIP.y + BOTTOM_STRIP.h - GAP - GROUND_TURF.y });
/** The gap between the scorebug and the ad still (stage px). */
const STILL_GAP = 4;

/**
 * @typedef {object} StripContext
 * @property {'stadium' | 'other'} picture  A match picture (the ground) or anything else.
 * @property {boolean} topFree  False in the final round, when the match picker uses the top strip.
 * @property {{ name: string, city: string, colours: { primary: string, secondary: string } } | null} home  Whose ground it is.
 * @property {number} bugEnd  Where the scorebug ends (stage px), as laid out now: its width changes with its label.
 * @property {(ctx: CanvasRenderingContext2D, R: import('./sceneArt.js').Rect) => void} still  Draws the ad still that's up now.
 * @property {(ctx: CanvasRenderingContext2D, R: import('./sceneArt.js').Rect) => boolean} [board]  Draws FAN BOARD if one is
 *   up (Fan Coins; Tom, 2026-10-21), in the still's place, in any picture; whether it did.
 * @property {number} clashDistance  settings.kits.clashDistance.
 */

/**
 * Draw the strips for the picture on screen. Call with no transform, after the ground and before the scene.
 * @param {CanvasRenderingContext2D} ctx @param {StripContext} c
 */
export function drawStrips(ctx, c) {
  // From just past the scorebug, whatever its width, to the side panel (never narrower than STILL.w).
  const x = Math.min(TOP_STRIP.x + TOP_STRIP.w - STILL.w, c.bugEnd + STILL_GAP);
  const still = { x, y: TOP_STRIP.y, w: TOP_STRIP.x + TOP_STRIP.w - x, h: STILL.h };
  if (c.picture === 'stadium') {
    if (c.topFree && !c.board?.(ctx, still)) c.still(ctx, still);
    if (c.home) drawGroundTurf(ctx, 0, c.home, c.clashDistance, FULL_TURF);
  } else {
    if (c.topFree) {
      band(ctx, TOP_STRIP, 'bottom');
      c.board?.(ctx, still);
    }
    band(ctx, BOTTOM_STRIP, 'top');
  }
}

/**
 * The bottom strip's quiet band (what it shows outside match pictures) in `R`: for the transitions, which cover the
 * strip in Full and lay this down on the scene side (Task 139).
 * @param {CanvasRenderingContext2D} ctx @param {import('./sceneArt.js').Rect} R
 */
export const drawBottomBand = (ctx, R) => band(ctx, R, 'top');

/**
 * A still band in the scene's blues, brightest by the picture, with a thin bright edge on that side.
 * @param {CanvasRenderingContext2D} ctx @param {import('./sceneArt.js').Rect} R @param {'top' | 'bottom'} edge  The side by the picture.
 */
function band(ctx, R, edge) {
  const rows = 4;
  for (let i = 0; i < rows; i++) {
    const f = (i + 0.5) / rows;
    ctx.fillStyle = mixHex(PALETTE.sceneBottom, PALETTE.sceneTop, edge === 'bottom' ? f : 1 - f);
    const y0 = R.y + Math.round((R.h * i) / rows);
    ctx.fillRect(R.x, y0, R.w, R.y + Math.round((R.h * (i + 1)) / rows) - y0);
  }
  ctx.fillStyle = PALETTE.sceneEdge;
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * 0.7;
  ctx.fillRect(R.x, edge === 'bottom' ? R.y + R.h - 1 : R.y, R.w, 1);
  ctx.globalAlpha = alpha;
}

/** @param {string} a @param {string} b @param {number} f */
function mixHex(a, b, f) {
  const p = (/** @type {string} */ h, /** @type {number} */ i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * f)).join(',')})`;
}
