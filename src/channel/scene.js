// The scene between matches (Task 96; docs/channel.md §16.1): Tom's pick from scene.html, the light bars: slow diagonal
// bars of light on deep blue, an orange line low down with a bright run along it,
// and a few twinkling pixels. It covers the ground in Full and the whole screen in Broadcast (the scorebug floats
// over it), behind everything that isn't the pre-match, a match, or the post-match's full-time card and highlights.
// sceneState is pure (where everything is at a moment, seeded, the same on every screen); drawScene draws it.
import { createRng } from '../sim/rng.js';
import { sharpText } from './sharpText.js';
import { PALETTE } from './palette.js';
import { GROUND } from './stands.js';
import { pictureOf } from './transitions.js';

/** The stage, stage px. */
const STAGE = Object.freeze({ w: 480, h: 270 });

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Rect
 * @typedef {{ w: number, speed: number, offset: number, alpha: number }} Bar
 * @typedef {{ bands: number, slope: number, bars: Bar[], lineAt: number,
 *   runPxPerSecond: number, runPx: number, sparkles: number }} SceneSettings  settings.scene
 * @typedef {{ bars: { x: number, w: number, alpha: number }[], line: number, run: number,
 *   sparkles: { x: number, y: number, b: number }[] }} SceneState
 *   x: where each bar's top row starts, from the rect's left (each row below shifts right by slope); line: the
 *   orange line's row; run: where the bright run along it starts; sparkles: each
 *   twinkle's spot and brightness (0–1).
 */

/** Whether a segment shows the scene: talk, studio cards, ads, the opening, the champions, the off-season. @param {import('./programme.js').Segment} seg */
export function showsScene(seg) {
  return pictureOf(seg) === 'scene';
}

/**
 * Where the scene goes: over the ground in Full, the whole screen in Broadcast (Tom, 2026-10-05), and in between
 * while the layout slides (`slide`: 0 Full → 1 Broadcast).
 * @param {number} slide
 * @returns {Rect}
 */
export function sceneRect(slide) {
  const full = { x: 0, y: GROUND.top, w: GROUND.w, h: GROUND.bottom - GROUND.top };
  const lerp = (/** @type {number} */ a, /** @type {number} */ b) => Math.round(a + (b - a) * slide);
  return { x: lerp(full.x, 0), y: lerp(full.y, 0), w: lerp(full.w, STAGE.w), h: lerp(full.h, STAGE.h) };
}

/** @type {Map<number, { x: number, y: number, p: number, s: number }[]>} The twinkles' seeded spots and rhythms. */
const sparkleCache = new Map();
/** @param {number} n */
function sparklePoints(n) {
  let pts = sparkleCache.get(n);
  if (!pts) {
    const rng = createRng('scene|sparkles');
    pts = Array.from({ length: n }, () => ({ x: rng.float(0, 1), y: rng.float(0, 1), p: rng.float(0, 2 * Math.PI), s: rng.float(500, 1400) }));
    sparkleCache.set(n, pts);
  }
  return pts;
}

const mod = (/** @type {number} */ a, /** @type {number} */ n) => ((a % n) + n) % n;

/**
 * Where everything is at a moment (`t`, ms; the league's clock, so every screen agrees).
 * @param {SceneSettings} s @param {Rect} R @param {number} t
 * @returns {SceneState}
 */
export function sceneState(s, R, t) {
  const sec = t / 1000;
  const lean = R.h * s.slope;
  const bars = s.bars.map((b) => {
    // Each bar slides right and wraps round once it's fully off the right edge.
    const period = R.w + lean + b.w + 60;
    return { x: mod(b.offset + sec * b.speed, period) - b.w - lean, w: b.w, alpha: b.alpha };
  });
  const line = Math.round(R.h * s.lineAt);
  const run = mod(sec * s.runPxPerSecond, R.w + s.runPx) - s.runPx;
  const sparkles = sparklePoints(s.sparkles).map((p) => ({ x: Math.round(p.x * R.w), y: Math.round(p.y * R.h), b: Math.max(0, Math.sin(t / p.s + p.p)) ** 6 }));
  return { bars, line, run, sparkles };
}

/** @param {string} hex @param {number} a */
const rgba = (hex, a) => `rgba(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',')},${a})`;
/** @param {string} a @param {string} b @param {number} f */
function mix(a, b, f) {
  const ch = (/** @type {string} */ c, /** @type {number} */ i) => parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `#${[0, 1, 2].map((i) => Math.round(ch(a, i) + (ch(b, i) - ch(a, i)) * f).toString(16).padStart(2, '0')).join('')}`;
}

/** @type {{ key: string, pic: HTMLCanvasElement } | null} The backdrop's stepped gradient, drawn once per size. */
let bandCache = null;
/**
 * The backdrop: deep blue darkening downward in stepped bands, a row of checker dither where bands meet.
 * @param {number} w @param {number} h @param {number} n
 */
function bandsPicture(w, h, n) {
  const key = `${w}x${h}|${n}`;
  if (bandCache?.key === key) return bandCache.pic;
  const pic = document.createElement('canvas');
  pic.width = Math.max(1, w);
  pic.height = Math.max(1, h);
  const b = /** @type {CanvasRenderingContext2D} */ (pic.getContext('2d'));
  const colours = Array.from({ length: n }, (_, i) => mix(PALETTE.sceneTop, PALETTE.sceneBottom, i / Math.max(1, n - 1)));
  colours.forEach((col, i) => {
    const y0 = Math.floor((i * h) / n);
    b.fillStyle = col;
    b.fillRect(0, y0, w, Math.ceil(h / n) + 1);
    if (i > 0) {
      b.fillStyle = colours[i - 1];
      for (let x = 0; x < w; x += 2) b.fillRect(x, y0, 1, 1);
      for (let x = 1; x < w; x += 4) b.fillRect(x, y0 + 1, 1, 1);
    }
  });
  bandCache = { key, pic };
  return pic;
}

/**
 * Draw the scene into `R` (stage px), clipped to it.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} t @param {SceneSettings} s
 */
export function drawScene(ctx, R, t, s) {
  if (R.w <= 0 || R.h <= 0) return;
  const st = sceneState(s, R, t);
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  ctx.drawImage(bandsPicture(R.w, R.h, s.bands), R.x, R.y);
  // The bars, a row at a time so their edges stay crisp pixels, each with a brighter leading edge.
  /** @param {number} x0 @param {number} w @param {string} colour */
  const slanted = (x0, w, colour) => {
    ctx.fillStyle = colour;
    for (let row = 0; row < R.h; row++) ctx.fillRect(R.x + Math.round(x0 + (R.h - row) * s.slope), R.y + row, w, 1);
  };
  for (const b of st.bars) {
    slanted(b.x, b.w, rgba(PALETTE.sceneBar, b.alpha));
    slanted(b.x + b.w - 1, 1, rgba(PALETTE.sceneEdge, 0.45));
  }
  // The orange line low down, and the bright run along it.
  ctx.fillStyle = rgba(PALETTE.accent, 0.35);
  ctx.fillRect(R.x, R.y + st.line, R.w, 1);
  const runX = Math.max(0, Math.round(st.run));
  ctx.fillStyle = rgba(PALETTE.sceneRun, 0.95);
  ctx.fillRect(R.x + runX, R.y + st.line, Math.max(0, Math.min(s.runPx, R.w - runX, Math.round(st.run) + s.runPx)), 1);
  for (const p of st.sparkles) {
    if (p.b < 0.05) continue;
    ctx.fillStyle = rgba(PALETTE.sceneSparkle, p.b);
    ctx.fillRect(R.x + p.x, R.y + p.y, 1, 1);
    if (p.b > 0.6) {
      ctx.fillStyle = rgba(PALETTE.sceneSparkle, p.b * 0.5);
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ctx.fillRect(R.x + p.x + dx, R.y + p.y + dy, 1, 1);
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------- transitions (Task 97)

/** @type {{ key: string, c: HTMLCanvasElement } | null} An offscreen canvas for the scene under a sweep. */
let sweepCanvas = null;
/** @param {number} w @param {number} h */
function offscreen(w, h) {
  const key = `${w}x${h}`;
  if (sweepCanvas?.key !== key) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    sweepCanvas = { key, c };
  }
  return sweepCanvas.c;
}

/**
 * The glass sweep (Tom's pick, Task 92): a band of glass, edged white and orange, crosses `R` left to right on the
 * scene's diagonal. Going into the scene it lays the scene over everything it has passed; coming out it leaves the
 * scene only where it hasn't got to yet. Drawn over the stadium, which is drawn as usual underneath.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} p  0 → 1. @param {'into' | 'out'} dir
 * @param {number} t @param {SceneSettings} s @param {number} band  The glass band's width, stage px.
 * @param {(o: CanvasRenderingContext2D, r: Rect) => void} [picture]  What the glass lays down instead of the scene
 *   (Task 100: the interview's board, going into a re-air's recorded interview).
 */
export function drawSweep(ctx, R, p, dir, t, s, band, picture) {
  if (R.w <= 0 || R.h <= 0) return;
  const off = offscreen(R.w, R.h);
  const o = /** @type {CanvasRenderingContext2D} */ (off.getContext('2d'));
  if (picture) picture(o, { x: 0, y: 0, w: R.w, h: R.h });
  else drawScene(o, { x: 0, y: 0, w: R.w, h: R.h }, t, s);
  const slope = s.slope;
  const lead = -band + Math.min(1, Math.max(0, p)) * (R.w + R.h * slope + 2 * band);
  for (let row = 0; row < R.h; row++) {
    // Leaning like the bars ("/"): the top row leads.
    const bx = Math.round(lead - row * slope);
    const edge = Math.min(R.w, Math.max(0, bx));
    if (dir === 'into' && edge > 0) ctx.drawImage(off, 0, row, edge, 1, R.x, R.y + row, edge, 1);
    if (dir === 'out' && edge < R.w) ctx.drawImage(off, edge, row, R.w - edge, 1, R.x + edge, R.y + row, R.w - edge, 1);
    // The glass: a tinted band trailing the edge, white at its leading edge, orange at its back.
    const g0 = Math.max(0, bx - band);
    const g1 = Math.min(R.w, bx);
    if (g1 > g0) {
      ctx.fillStyle = 'rgba(140,200,255,0.35)';
      ctx.fillRect(R.x + g0, R.y + row, g1 - g0, 1);
      ctx.fillStyle = 'rgba(200,230,255,0.5)';
      if (bx - 9 >= 0 && bx - 9 < R.w) ctx.fillRect(R.x + bx - 9, R.y + row, 2, 1);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    if (bx >= 0 && bx < R.w) ctx.fillRect(R.x + bx, R.y + row, 1, 1);
    ctx.fillStyle = rgba(PALETTE.accent, 0.9);
    if (bx - band >= 0 && bx - band < R.w) ctx.fillRect(R.x + bx - band, R.y + row, 1, 1);
  }
}

/**
 * The diagonal band (Tom's pick, Task 92): a wide band in the channel's colours (an orange and white leading edge, a
 * dark middle, a blue tail) sweeping across `R` on the scene's diagonal, covering it completely at q = 0.5.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} q  0 → 1. @param {SceneSettings} s
 */
export function drawBand(ctx, R, q, s) {
  const slope = s.slope;
  const width = R.w + R.h * slope + 30;
  const lead = Math.min(1, Math.max(0, q)) * (R.w + R.h * slope + width);
  const stripes = /** @type {[number, string][]} */ ([[8, PALETTE.accent], [4, '#ffffff'], [width - 22, PALETTE.panel], [10, PALETTE.replay]]);
  for (let row = 0; row < R.h; row++) {
    let x = Math.round(lead - row * slope);
    for (const [w, colour] of stripes) {
      const x0 = Math.max(0, x - w);
      const x1 = Math.min(R.w, x);
      if (x1 > x0) {
        ctx.fillStyle = colour;
        ctx.fillRect(R.x + x0, R.y + row, x1 - x0, 1);
      }
      x -= w;
    }
  }
}

/**
 * The opening sting's plate, while the band is down: HIGHLIGHTS, the two teams with their kits, and when it was
 * played (never the score); or a reel's name and its playoffs (Task 213).
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R
 * @param {{ home: string, away: string, homeKit: string, awayKit: string, played: string } | { title: string, sub: string, head?: string }} plate
 *   head: in place of HIGHLIGHTS (OFF THE BALL's way back to the studio, 2026-10-21).
 */
export function drawStingTitle(ctx, R, plate) {
  const cx = Math.round(R.x + R.w / 2);
  const cy = Math.round(R.y + R.h / 2);
  ctx.save();
  ctx.fillStyle = rgba(PALETTE.panel, 0.92);
  ctx.fillRect(cx - 110, cy - 40, 220, 80);
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(cx - 110, cy - 40, 220, 2);
  // The words sharp (Task 200; sharpText.js).
  const words = (/** @type {string} */ s, /** @type {number} */ y, /** @type {number} */ size, /** @type {string} */ colour) => sharpText(ctx, s, cx, y, { size, colour, align: 'center', baseline: 'middle' });
  words('head' in plate && plate.head ? plate.head : 'HIGHLIGHTS', cy - 26, 14, PALETTE.accent);
  // A reel (Task 213): its name and the playoffs it's from.
  if ('title' in plate) {
    words(plate.title, cy - 2, 26, PALETTE.panelInk);
    words(plate.sub, cy + 24, 12, PALETTE.panelMuted);
    ctx.restore();
    return;
  }
  const text = `${plate.home} v ${plate.away}`;
  words(text, cy - 2, 26, PALETTE.panelInk);
  ctx.font = '26px "VT323"';
  const half = ctx.measureText(text).width / 2;
  ctx.fillStyle = plate.homeKit;
  ctx.fillRect(Math.round(cx - half - 12), cy - 9, 6, 13);
  ctx.fillStyle = plate.awayKit;
  ctx.fillRect(Math.round(cx + half + 6), cy - 9, 6, 13);
  words(`PLAYED ${plate.played}`, cy + 24, 12, PALETTE.panelMuted);
  ctx.restore();
}
