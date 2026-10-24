// The in-universe ads, the bumpers either side of a break, the channel's ident and the dissolve between ads (Task 105;
// drawn first as mock-ups in ads.html, Task 94; docs/channel.md §16.11). Canvas only: each ad is a function of the
// moment into it, so any frame draws the same. The ads themselves are in spotBrands.js (the brands') and spotLeague.js
// (the league's own and the promo), what they share in spotKit.js (Task 157). Used by the channel (main.js) and spotsSheet.js.
import { PALETTE } from './palette.js';
import { blockWidth, clamp01, lightBars } from './sceneArt.js';
import { fireball, identBack, line, wordmark } from './spotKit.js';
import { BRAND_SCENES, BRAND_STILLS } from './spotBrands.js';
import { LEAGUE_SCENES, LEAGUE_STILLS } from './spotLeague.js';

/**
 * @typedef {import('./sceneArt.js').Rect} Rect
 * @typedef {import('./spotKit.js').Back} Back
 * @typedef {import('./spotKit.js').Ad} Ad
 * @typedef {import('./spotKit.js').AdFacts} AdFacts
 * @typedef {import('./spotKit.js').AdDraw} AdDraw
 * @typedef {import('./spotKit.js').StillDraw} StillDraw
 * @typedef {import('./spotKit.js').Path} Path
 */
// ---------------------------------------------------------------- the bumpers

/**
 * In or out of a break: the light bars, a small fireball crossing, a line.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} ms @param {string} text
 * @param {number} BUMPER_MS  How long the bumper is. @param {Back} [back]  The light bars (the channel's scene, or the mock-ups').
 */
export function drawBumper(ctx, R, ms, text, BUMPER_MS, back = lightBars) {
  back(ctx, R, ms);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(R.x, R.y, R.w, R.h);
  const cy = R.y + R.h / 2;
  /** @type {Path} */
  const path = (t) => ({ x: R.x - 20 + (R.w + 40) * clamp01(t / BUMPER_MS), y: cy - 34 });
  fireball(ctx, ms, path, { r: 6, life: 450, rate: 4, speed: 30, seed: 9 });
  const a = clamp01(ms / 250) * clamp01((BUMPER_MS - ms) / 250);
  ctx.globalAlpha = a;
  ctx.fillStyle = 'rgba(21,25,36,0.9)';
  ctx.fillRect(R.x + 70, cy - 16, R.w - 140, 32);
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(R.x + 70, cy - 16, R.w - 140, 2);
  line(ctx, text, R.x + R.w / 2, cy + 1, 24, '#f2efe6');
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- the ad stills (Task 113)

/** The still's height (down to the heat meter's bottom edge, so it ends level with the scorebug) and its narrowest width, beside the widest scorebug (HIGHLIGHTS). Stills stretch to fill
 * from just past the scorebug to the side panel: the scenery widens, the brand stays left and the product right. */
export const STILL = Object.freeze({ w: 180, h: 20 });

/** Each ad's still by its scene name in data/spots.json (Task 113). @type {Record<string, StillDraw>} */
export const AD_STILLS = Object.freeze({ ...BRAND_STILLS, ...LEAGUE_STILLS });

/**
 * Draw an ad's still in `R` (STILL's size), clipped to it.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {Ad} ad @param {AdFacts} facts
 */
export function drawAdStill(ctx, R, ad, facts) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  AD_STILLS[ad.scene](ctx, R, ad, facts);
  ctx.restore();
}

/** Each drawn ad by its scene name in data/spots.json. @type {Record<string, AdDraw>} */
export const AD_SCENES = Object.freeze({ ...BRAND_SCENES, ...LEAGUE_SCENES });

/**
 * Draw one ad, `ms` into it, over `R` (the ground in Full, the whole screen in Broadcast), clipped to it.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} ms @param {Ad} ad @param {AdFacts} facts
 */
export function drawAd(ctx, R, ms, ad, facts) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  AD_SCENES[ad.scene](ctx, R, ms, ad, facts);
  ctx.restore();
}

/**
 * A new season's countdown to the opening (Task 277b, Tom), after the night's closing ads and before the ident: over the
 * ident's backdrop, THE SCORCH LEAGUE, SEASON N in the ident's block font (lighting up from the middle as it comes on),
 * and the time to the opening ticking down to the ident, which then takes the screen.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} ms  Into it. @param {number} left  Ms to the opening.
 * @param {number} season @param {{ back?: Back }} [o]
 */
export function drawCountdown(ctx, R, ms, left, season, o = {}) {
  identBack(ctx, R, ms, o.back);
  const s = 5;
  const text = `SEASON ${season}`;
  const cx = R.x + R.w / 2;
  const cy = R.y + R.h * 0.48;
  const x0 = Math.round(cx - blockWidth(text, s) / 2);
  const mid = (text.length - 1) / 2;
  line(ctx, 'THE SCORCH LEAGUE', cx, Math.round(cy - 28), 10, PALETTE.panelMuted);
  wordmark(ctx, text, x0, Math.round(cy - 15), s, (i) => clamp01((ms - Math.abs(i - mid) * 110) / 200));
  const secs = Math.max(0, Math.ceil(left / 1000));
  line(ctx, `THE OPENING IN ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`, cx, Math.round(cy + 30), 10, PALETTE.accent);
}

/**
 * The channel's opening ident (Tom's pick from Task 94, C, the O; Task 106): an empty screen; the comet comes in from
 * the left, makes one full turn of an oval round where the name will be, carries on over the top to just above the O's
 * place and drops straight down into it as the O; only then do SCORCHBALL's letters come in, lighting up outward from it
 * (Task 277b: they sat dim before). `fade`: fade to black over the last half second (the mock-up's loop; on the channel
 * a band cuts to the welcome instead).
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} ms @param {number} total  The ident's length.
 * @param {{ back?: Back, fade?: boolean }} [o]
 */
export function drawIdent(ctx, R, ms, total, o = {}) {
  identBack(ctx, R, ms, o.back);
  const s = 5;
  const text = 'SCORCHBALL';
  const cx = R.x + R.w / 2;
  const cy = R.y + R.h * 0.48;
  const x0 = Math.round(cx - blockWidth(text, s) / 2);
  const y0 = Math.round(cy - 15);
  const { path, START, LAND } = identPath(R);
  // The name comes in only once the ball has landed (Task 277b, Tom; it sat dim before), lighting from the O outward.
  wordmark(ctx, text, x0, y0, s, (i) => clamp01((ms - LAND - Math.abs(i - 2) * 110) / 200), 2);
  fireball(ctx, ms, path, { r: 12, life: 900, rate: 6, speed: 26, spread: 0.7, from: START });
  if (o.fade !== false) {
    const f = clamp01((ms - (total - 500)) / 500);
    if (f > 0) { ctx.fillStyle = `rgba(0,0,0,${f})`; ctx.fillRect(R.x, R.y, R.w, R.h); }
  }
}

/**
 * The landing hook's shape (stage px): how far it carries on along the oval, how far right of the gap and above it it
 * swings. Searched (Task 249): the gentlest curl (about 10 px at its tightest, the old drop a corner) that keeps the ball
 * above the letters until it's over the gap.
 */
const HOOK = Object.freeze({ reach: 20, swing: 20, above: 30 });

/** A point on a cubic Bézier. @param {{ x: number, y: number }[]} P @param {number} u */
const bezier = ([a, b, c, d], u) => {
  const v = 1 - u;
  return {
    x: v * v * v * a.x + 3 * v * v * u * b.x + 3 * v * u * u * c.x + u * u * u * d.x,
    y: v * v * v * a.y + 3 * v * v * u * b.y + 3 * v * u * u * c.y + u * u * u * d.y,
  };
};

/**
 * The ident's comet, where it is at each moment (ms into the ident), for the picture and its fire sound (Task 249).
 * Tom's pick, with his changes: in from the left, one full turn of the oval round the name, on over the top to above
 * the gap, then down into it as the O, never sliding across the S and C. Smooth all the way (Tom, Task 249: it made
 * odd turns): it comes in on a curve that bends up into the oval going its way, at the oval's pace, and leaves the top
 * on a hook that carries on a little, then curls down into the gap, easing as it lands. Pure.
 * @param {Rect} R
 */
export function identPath(R) {
  const s = 5;
  const cx = R.x + R.w / 2;
  const cy = R.y + R.h * 0.48;
  const x0 = Math.round(cx - blockWidth('SCORCHBALL', s) / 2);
  const oX = x0 + 2 * 6 * s + 12;
  const oY = Math.round(cy - 15) + 15;
  const AX = 175;
  const AY = 58;
  const START = 300;
  const ENTER = 600;
  const LOOP = 3000;
  const over = Math.acos((cx - oX) / AX);
  const ARC = (LOOP * over) / (2 * Math.PI);
  const DROP = 450;
  const LAND = identLanding(R).land;
  const on = (/** @type {number} */ a) => ({ x: cx + AX * Math.cos(a), y: cy + AY * Math.sin(a) });
  // In: from below the left end, bending up into the oval's leftmost point, leaving the curve at about the oval's pace.
  const left = on(Math.PI);
  const IN = [{ x: R.x - 30, y: cy + 50 }, { x: left.x, y: cy + 50 }, { x: left.x, y: cy + 25 }, left];
  // Out: from the top above the gap, carrying on along the oval's way (its pace, an ease-out's start), then down into it.
  const top = on(3 * Math.PI + over);
  const ω = (2 * Math.PI) / LOOP;
  const tx = -AX * Math.sin(Math.PI + over) * ω;
  const ty = AY * Math.cos(Math.PI + over) * ω;
  const reach = HOOK.reach / Math.hypot(tx, ty);
  const OUT = [top, { x: top.x + tx * reach, y: top.y + ty * reach }, { x: oX + HOOK.swing, y: oY - HOOK.above }, { x: oX, y: oY }];
  /** @type {Path} */
  const path = (t) => {
    if (t < START) return IN[0];
    if (t < START + ENTER) return bezier(IN, (t - START) / ENTER);
    if (t < START + ENTER + LOOP + ARC) return on(Math.PI + (t - START - ENTER) * ω);
    const f = clamp01((t - START - ENTER - LOOP - ARC) / DROP);
    return bezier(OUT, 1 - (1 - f) ** 2);
  };
  return { path, START, LAND, cx, cy, AX, AY };
}

/**
 * The comet's course for its fire sound (Task 249): every `stepMs` from its entry to its landing, seconds from the
 * entry, left−right across the oval (−1…1), how near its front (0 the back, 1 the front: the bottom of the oval, nearest
 * the viewer), and how fast (1 is about the loop's pace). Pure.
 * @param {Rect} R @param {number} [stepMs]
 * @returns {import('./soundRecipes.js').FireTrack}
 */
export function identTrack(R, stepMs = 80) {
  const { path, START, LAND, cx, cy, AX, AY } = identPath(R);
  const out = [];
  for (let t = START; t <= LAND; t += stepMs) {
    const p = path(t);
    const q = path(Math.min(LAND, t + stepMs));
    const pace = Math.hypot(q.x - p.x, q.y - p.y) / stepMs / 0.3;
    out.push({ t: (t - START) / 1000, pan: Math.max(-1, Math.min(1, (p.x - cx) / AX)), near: Math.max(0, Math.min(1, (p.y - (cy - AY)) / (2 * AY))), speed: Math.min(1.5, pace) });
  }
  return out;
}

/**
 * When the ident's comet comes in and when it lands as the O (ms into the ident), for its sounds. Pure.
 * @param {Rect} R
 */
export function identLanding(R) {
  const s = 5;
  const cx = R.x + R.w / 2;
  const x0 = Math.round(cx - blockWidth('SCORCHBALL', s) / 2);
  const oX = x0 + 2 * 6 * s + 12;
  const over = Math.acos((cx - oX) / 175);
  return { enter: 300, land: 300 + 600 + 3000 + (3000 * over) / (2 * Math.PI) + 450 };
}


// ---------------------------------------------------------------- the dissolve between ads (Task 118)

/** A 4×4 ordered-dither order (Bayer): which cells go first. */
const BAYER = Object.freeze([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);
/** The dissolve's cells (stage px) and the dark it passes through. */
const CELL = 3;
const DISSOLVE_DARK = '#05070c';
/** @type {Map<string, { from: HTMLCanvasElement, to: HTMLCanvasElement, mask: HTMLCanvasElement }>} Work canvases by size. */
const dissolveCanvases = new Map();

/**
 * From one ad to the next (Tom: the pixel dissolve from the scene mock-ups, darker): the old picture breaks up cell by
 * cell into near-black in an ordered dither, then the new one appears out of it the same way. `p`: 0 → 1 through it.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} p
 * @param {(c: CanvasRenderingContext2D, r: Rect) => void} drawFrom  The old ad, as it ended.
 * @param {(c: CanvasRenderingContext2D, r: Rect) => void} drawTo  The new ad, now.
 */
export function drawAdDissolve(ctx, R, p, drawFrom, drawTo) {
  const key = `${R.w}x${R.h}`;
  let w = dissolveCanvases.get(key);
  if (!w) {
    const make = () => Object.assign(document.createElement('canvas'), { width: R.w, height: R.h });
    dissolveCanvases.set(key, (w = { from: make(), to: make(), mask: make() }));
  }
  const local = { x: 0, y: 0, w: R.w, h: R.h };
  // The first half covers the old ad with dark, cell by cell; the second uncovers the new one from it.
  const first = p < 0.5;
  const level = Math.round(clamp01(first ? p * 2 : (p - 0.5) * 2) * 16);
  const pic = first ? w.from : w.to;
  const g = /** @type {CanvasRenderingContext2D} */ (pic.getContext('2d'));
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, R.w, R.h);
  (first ? drawFrom : drawTo)(g, local);
  ctx.fillStyle = DISSOLVE_DARK;
  ctx.fillRect(R.x, R.y, R.w, R.h);
  // The cells still showing: the old ad's not yet gone (first half), the new ad's already come (second half).
  const m = /** @type {CanvasRenderingContext2D} */ (w.mask.getContext('2d'));
  m.globalCompositeOperation = 'source-over';
  m.clearRect(0, 0, R.w, R.h);
  m.drawImage(pic, 0, 0);
  m.globalCompositeOperation = 'destination-in';
  m.fillStyle = '#fff';
  m.beginPath();
  for (let y = 0; y < R.h; y += CELL) for (let x = 0; x < R.w; x += CELL) {
    const order = BAYER[((x / CELL) % 4) + ((y / CELL) % 4) * 4];
    if (first ? order >= level : order < level) m.rect(x, y, CELL, CELL);
  }
  m.fill();
  m.globalCompositeOperation = 'source-over';
  ctx.drawImage(w.mask, R.x, R.y);
}
