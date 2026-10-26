// Shared pixel art for the between-matches mock-ups (scene.html, studio.html): small colour and drawing helpers, the
// channel's mark, and the light bars (Tom's pick for the scene, Task 92). Canvas only; nothing here is used by the
// channel yet (Task 96 builds the real scene).
import { createRng } from '../sim/rng.js';
import { PALETTE } from './palette.js';
import { GLYPHS } from './stands.js';

export const W = 480;
export const H = 270;

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

/** A blank stage-sized canvas. @param {number} [w] @param {number} [h] */
export function canvasOf(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  ctx.imageSmoothingEnabled = false;
  return { c, ctx };
}

// ---------------------------------------------------------------- colour and pixel helpers

/** @param {string} hex @returns {[number, number, number]} */
export const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** @param {string} a @param {string} b @param {number} f */
export function mix(a, b, f) {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * Math.min(1, Math.max(0, f))).toString(16).padStart(2, '0')).join('')}`;
}
/** @param {string} hex @param {number} a */
export const rgba = (hex, a) => `rgba(${rgbOf(hex).join(',')},${a})`;
/** @param {string} hex @param {number} k  Brightness scale. */
export const shade = (hex, k) => `#${rgbOf(hex).map((v) => Math.round(Math.min(255, v * k)).toString(16).padStart(2, '0')).join('')}`;
/**
 * A team's kit swatch on a canvas, as the scorebug and the ticker draw theirs (index.html .kit): its main colour, a
 * one-pixel stripe of its second down the right, a faint light outline (the page's is half a stage pixel; here one,
 * fainter). `x`, `y` its top-left; 4 × 8 stage pixels, or `w` × `h` where the text beside it is smaller (the ads).
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {{ colours: { primary: string, secondary: string } }} team
 * @param {number} [w] @param {number} [h]
 */
export function drawKitSwatch(ctx, x, y, team, w = 4, h = 8) {
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = team.colours.primary;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = team.colours.secondary;
  ctx.fillRect(x + w - 1, y, 1, h);
}
export const clamp01 = (/** @type {number} */ v) => Math.min(1, Math.max(0, v));
export const ease = (/** @type {number} */ v) => { const t = clamp01(v); return t * t * (3 - 2 * t); };
export const mod = (/** @type {number} */ a, /** @type {number} */ n) => ((a % n) + n) % n;

/** A filled convex polygon, row by row, so its edges stay crisp pixels. @param {CanvasRenderingContext2D} ctx @param {[number, number][]} pts */
export function fillPoly(ctx, pts) {
  const ys = pts.map((p) => p[1]);
  const top = Math.ceil(Math.min(...ys));
  const bottom = Math.floor(Math.max(...ys));
  for (let y = top; y <= bottom; y++) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y < Math.min(y1, y2)) || (y > Math.max(y1, y2)) || y1 === y2) continue;
      const x = x1 + ((y - y1) / (y2 - y1)) * (x2 - x1);
      lo = Math.min(lo, x);
      hi = Math.max(hi, x);
    }
    if (hi >= lo) ctx.fillRect(Math.round(lo), y, Math.max(1, Math.round(hi) - Math.round(lo)), 1);
  }
}

/** @type {Map<string, HTMLCanvasElement>} */
const bandCache = new Map();
/** A vertical stepped gradient in `n` bands, with a row of checker dither where bands meet. Cached. @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {string} top @param {string} bottom @param {number} n */
export function bands(ctx, R, top, bottom, n) {
  const key = `${R.w}x${R.h}|${top}|${bottom}|${n}`;
  let pic = bandCache.get(key);
  if (!pic) {
    const { c, ctx: b } = canvasOf(R.w, R.h);
    const colours = Array.from({ length: n }, (_, i) => mix(top, bottom, i / (n - 1)));
    colours.forEach((col, i) => {
      b.fillStyle = col;
      const y0 = Math.floor((i * R.h) / n);
      b.fillRect(0, y0, R.w, Math.ceil(R.h / n) + 1);
      if (i > 0) {
        b.fillStyle = colours[i - 1];
        for (let x = 0; x < R.w; x += 2) b.fillRect(x, y0, 1, 1);
        for (let x = 1; x < R.w; x += 4) b.fillRect(x, y0 + 1, 1, 1);
      }
    });
    bandCache.set(key, (pic = c));
  }
  ctx.drawImage(pic, R.x, R.y);
}

/** Twinkling seeded pixels. @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} t @param {{ x: number, y: number, p: number, s: number }[]} pts @param {string} colour */
export function sparkles(ctx, R, t, pts, colour) {
  for (const s of pts) {
    const b = Math.max(0, Math.sin(t / s.s + s.p)) ** 6;
    if (b < 0.05) continue;
    const x = R.x + Math.round(s.x * R.w);
    const y = R.y + Math.round(s.y * R.h);
    ctx.fillStyle = rgba(colour, b);
    ctx.fillRect(x, y, 1, 1);
    if (b > 0.6) {
      ctx.fillStyle = rgba(colour, b * 0.5);
      ctx.fillRect(x - 1, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1); ctx.fillRect(x, y - 1, 1, 1); ctx.fillRect(x, y + 1, 1, 1);
    }
  }
}
/** @param {string} seed @param {number} n */
export function seededPoints(seed, n) {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => ({ x: rng.float(0, 1), y: rng.float(0, 1), p: rng.float(0, 6.28), s: rng.float(500, 1400) }));
}

/** Text in the block font (5×6), at a scale. @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y @param {number} scale @param {string} colour */
export function blockText(ctx, text, x, y, scale, colour) {
  ctx.fillStyle = colour;
  [...text].forEach((ch, i) => (GLYPHS[ch] ?? []).forEach((row, r) => [...row].forEach((cell, k) => {
    if (cell === '#') ctx.fillRect(x + (i * 6 + k) * scale, y + r * scale, scale, scale);
  })));
}
/** @param {string} text @param {number} scale */
export const blockWidth = (text, scale) => (text.length * 6 - 1) * scale;

// ---------------------------------------------------------------- the light bars (scene A)

/** A: slow diagonal bars of light on deep blue. */
const BARS = [{ w: 46, speed: 9, off: 0, a: 0.1 }, { w: 18, speed: 14, off: 150, a: 0.16 }, { w: 30, speed: 6, off: 270, a: 0.08 }, { w: 9, speed: 22, off: 340, a: 0.2 }, { w: 64, speed: 4, off: 430, a: 0.07 }, { w: 14, speed: 11, off: 520, a: 0.12 }];
const SPARKS_A = seededPoints('scene|A', 16);
/** @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} t */
export function lightBars(ctx, R, t) {
  bands(ctx, R, PALETTE.sceneTop, PALETTE.sceneBottom, 12);
  const slope = 0.6;
  for (const b of BARS) {
    const period = R.w + R.h * slope + b.w + 60;
    const x0 = mod(b.off + (t / 1000) * b.speed, period) - b.w - R.h * slope;
    ctx.fillStyle = rgba(PALETTE.sceneBar, b.a);
    for (let row = 0; row < R.h; row++) ctx.fillRect(R.x + Math.round(x0 + (R.h - row) * slope), R.y + row, b.w, 1);
    ctx.fillStyle = rgba(PALETTE.sceneEdge, 0.45);
    for (let row = 0; row < R.h; row++) ctx.fillRect(R.x + Math.round(x0 + (R.h - row) * slope) + b.w - 1, R.y + row, 1, 1);
  }
  // An orange line low down, with a bright run along it.
  const ly = R.y + Math.round(R.h * 0.82);
  ctx.fillStyle = rgba(PALETTE.accent, 0.35);
  ctx.fillRect(R.x, ly, R.w, 1);
  const run = mod((t / 1000) * 70, R.w + 60) - 60;
  ctx.fillStyle = rgba(PALETTE.sceneRun, 0.95);
  ctx.fillRect(R.x + Math.max(0, Math.round(run)), ly, Math.max(0, Math.min(60, R.w - Math.round(run))), 1);
  sparkles(ctx, R, t, SPARKS_A, PALETTE.sceneSparkle);
}
