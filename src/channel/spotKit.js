// What the ads share (Task 157, split from spotArt.js): the fire and the wordmark (also the ident's), the backdrops, the
// brand name and lines of text, the end card's timing, a stand of fans, and the stills' small text and tiny font. The
// ads themselves are spotBrands.js (the brands') and spotLeague.js (the league's own); spotArt.js puts them together.
import { PALETTE } from './palette.js';
import { sharpBlock, sharpText } from './sharpText.js';
import { blockWidth, clamp01, ease, lightBars, mix, rgba, shade } from './sceneArt.js';
import { GLYPHS } from './stands.js';

/**
 * @typedef {import('./sceneArt.js').Rect} Rect
 * @typedef {(ctx: CanvasRenderingContext2D, R: Rect, ms: number) => void} Back  A backdrop at a moment (the light bars).
 * @typedef {{ id: string, brand: string, tagline: string, colours: string[], scene: string }} Ad  One of data/spots.json's ads.
 * @typedef {import('./spots.js').TicketFacts} TicketFacts
 * @typedef {{ scorchers: number, playoffs: import('./spots.js').PlayoffFacts, tickets?: TicketFacts, seasonTickets?: import('./spots.js').SeasonTicketFacts, season?: number, numbersSeason?: number, lastSeason?: boolean, burns?: number, goals?: number, shop?: import('./spots.js').ShopFacts, back?: Back }} AdFacts
 *   What the ads show from the league: the season's scorchers so far (Foundry Fuel), the playoffs (the promo: its
 *   version, the times, the finalists), the next live match (Tickets), a team and season (Season tickets), and (Task
 *   161) the season's burns (Ember & Co.), goals (the Almanac) and the League Shop's kits; the numbers last season's
 *   (`lastSeason`, from `numbersSeason`) until a new season's first match has finished (Task 277b).
 * @typedef {(ctx: CanvasRenderingContext2D, R: Rect, ms: number, ad: Ad, facts: AdFacts) => void} AdDraw
 */

/** The fire's colours, from the hottest (newest) to the coolest (oldest). */
export const FIRE = ['#fff6c8', '#ffd23f', '#ff8a1f', '#ff3b1f', '#a8240f', '#5a1208'];
/** The wordmark's rows, top to bottom: white-hot to red. */
const WORD_ROWS = ['#fff6c8', '#ffe27a', '#ffb627', '#ff8a1f', '#ff5a1f', '#e8392f'];

/** A repeatable pseudo-random number in [0, 1) for an integer: the same particle looks the same every frame. @param {number} n */
export const hash = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };

// ---------------------------------------------------------------- the fireball

/**
 * @typedef {(ms: number) => { x: number, y: number }} Path  Where the ball is at a moment.
 * @typedef {{ r: number, life?: number, rate?: number, speed?: number, spread?: number, from?: number, core?: (ms: number) => string, seed?: number }} FireOpts
 *   life: how long a flame lasts (ms). rate: flames a tick. from: when it starts burning. core: the ball's colour.
 */
/**
 * A ball wrapped in fire: flames stream off its back while it moves, and lick upward round it once it's still. Every
 * flame is worked out from its birth tick, so any moment draws the same (no state, any frame rate).
 * @param {CanvasRenderingContext2D} ctx @param {number} ms @param {Path} path @param {FireOpts} o
 */
export function fireball(ctx, ms, path, o) {
  const { r, life = 650, rate = 5, speed = 46, spread = 0.9, from = 0, seed = 1 } = o;
  const TICK = 16;
  const first = Math.max(Math.ceil(from / TICK), Math.floor((ms - life) / TICK));
  /** @type {[number, number, number, number][]} x, y, age share, size */
  const flames = [];
  for (let k = first; k * TICK <= ms; k++) {
    const e = k * TICK;
    const p = path(e);
    const q = path(e - 30);
    let dx = p.x - q.x;
    let dy = p.y - q.y;
    const moving = Math.hypot(dx, dy) > 0.6;
    // Flames go off the back when it moves, upward when it's still.
    const back = moving ? Math.atan2(-dy, -dx) : -Math.PI / 2;
    for (let j = 0; j < rate; j++) {
      const n = seed * 7919 + k * 31 + j;
      const a = back + (hash(n) - 0.5) * spread * Math.PI;
      const age = ms - e;
      const v = speed * (0.45 + hash(n + 1)) * (moving ? 1 : 0.7);
      const sx = p.x + Math.cos(a) * r * 0.85;
      const sy = p.y + Math.sin(a) * r * 0.85;
      const t = age / 1000;
      flames.push([sx + Math.cos(a) * v * t, sy + Math.sin(a) * v * t - 70 * t * t, age / life, (1 - age / life) * r * (0.35 + 0.4 * hash(n + 2))]);
    }
  }
  flames.sort((a, b) => b[2] - a[2]);
  for (const [x, y, f, s] of flames) {
    if (f >= 1) continue;
    ctx.fillStyle = FIRE[Math.min(FIRE.length - 1, Math.floor(f * FIRE.length))];
    const size = Math.max(1, Math.round(s));
    ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);
  }
  // The ball: a hot core with a brighter top.
  const p = path(ms);
  const core = o.core ? o.core(ms) : '#fff6c8';
  for (let y = -r; y <= r; y++) {
    const half = Math.round(Math.sqrt(r * r - y * y));
    ctx.fillStyle = y < -r * 0.35 ? '#ffffff' : y < r * 0.4 ? core : shade(core, 0.85);
    ctx.fillRect(Math.round(p.x) - half, Math.round(p.y) + y, half * 2 + 1, 1);
  }
  ctx.fillStyle = rgba('#ff8a1f', 0.55);
  const pr = Math.max(1, Math.round(r / 3));
  ctx.fillRect(Math.round(p.x) - Math.floor(pr / 2), Math.round(p.y) - Math.floor(pr / 2), pr, pr);
}

/**
 * The wordmark in the block font, each row a shade from white-hot to red, with a dark shadow. Letters can light up one
 * by one (`lit`: 0 → 1 per letter) with a white flash as they come on. `skip`: a letter left out (the ball takes its place).
 * @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y @param {number} s
 * @param {(i: number) => number} [lit] @param {number} [skip]
 */
export function wordmark(ctx, text, x, y, s, lit = () => 1, skip = -1) {
  [...text].forEach((ch, i) => {
    if (i === skip) return;
    const l = lit(i);
    if (l <= 0) return;
    const rows = GLYPHS[ch] ?? [];
    const gx = x + i * 6 * s;
    rows.forEach((row, r) => [...row].forEach((cell, k) => {
      if (cell !== '#') return;
      ctx.fillStyle = 'rgba(40,8,4,0.85)';
      ctx.fillRect(gx + k * s + Math.ceil(s / 2), y + r * s + Math.ceil(s / 2), s, s);
    }));
    rows.forEach((row, r) => [...row].forEach((cell, k) => {
      if (cell !== '#') return;
      ctx.fillStyle = l < 1 ? mix('#ffffff', WORD_ROWS[r], l) : WORD_ROWS[r];
      ctx.fillRect(gx + k * s, y + r * s, s, s);
    }));
  });
}

/**
 * The ident's (and the promo's) backdrop: the light bars, dimmed so the fire stands out.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} ms @param {Back} [back]
 */
export const identBack = (ctx, R, ms, back = lightBars) => {
  back(ctx, R, ms);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fillRect(R.x, R.y, R.w, R.h);
};

// ---------------------------------------------------------------- for the ads

/** A brand name in big capitals with a shadow, centred; sharp (Task 200; sharpText.js). @param {CanvasRenderingContext2D} ctx @param {string} name @param {number} cx @param {number} y @param {number} s @param {string} fill @param {string} edge */
export const brand = (ctx, name, cx, y, s, fill, edge) => {
  const x = Math.round(cx - blockWidth(name, s) / 2);
  sharpBlock(ctx, name, x + 1, y + 1, s, edge);
  sharpBlock(ctx, name, x, y, s, fill);
};
/** A line of text in VT323, centred; sharp (Task 200). @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} cx @param {number} y @param {number} size @param {string} colour */
export const line = (ctx, text, cx, y, size, colour) => {
  sharpText(ctx, text, cx, y, { size, colour, align: 'center', baseline: 'middle' });
};
/** The end card's fade in (from 6.5 s), 0 → 1. @param {number} ms */
export const endCard = (ms) => ease(clamp01((ms - 6500) / 400));
/** Vertical bands, for quick skies. @param {CanvasRenderingContext2D} ctx @param {Rect} r @param {string[]} cols */
export const sky = (ctx, r, cols) => cols.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(r.x, r.y + Math.floor((i * r.h) / cols.length), r.w, Math.ceil(r.h / cols.length) + 1); });

/** Shirt colours for a crowd of mixed fans (no team's in particular). */
export const FANS = ['#d62d2d', '#2f6fd6', '#f2c230', '#1fa3a3', '#6b3fa0', '#e8641e', '#f2efe6', '#3a8a3a'];
export const SKINS = [PALETTE.skin1, PALETTE.skin2, PALETTE.skin3, PALETTE.skin4];

/**
 * A stand of fans in rows over `r`, lit by `light` (0 dark → 1); from `bounceFrom` ms they bob up and down, cheering.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} r @param {number} ms @param {number} light @param {number} bounceFrom
 */
export function crowd(ctx, r, ms, light, bounceFrom) {
  sky(ctx, r, ['#2a2f3d', '#323848', '#2a2f3d']);
  const rows = Math.max(3, Math.floor(r.h / 11));
  for (let row = 0; row < rows; row++) {
    const y = r.y + 4 + row * 11;
    ctx.fillStyle = '#1d2230';
    ctx.fillRect(r.x, y + 8, r.w, 2);
    for (let x = r.x + (row % 2) * 4; x < r.x + r.w - 4; x += 8) {
      const k = hash(row * 131 + x);
      const up = ms > bounceFrom && k > 0.3 ? Math.round(Math.abs(Math.sin((ms - bounceFrom) / 170 + k * 7)) * 2) : 0;
      ctx.fillStyle = FANS[Math.floor(k * FANS.length)];
      ctx.fillRect(x, y + 3 - up, 5, 5);
      ctx.fillStyle = SKINS[Math.floor(hash(k * 99) * SKINS.length)];
      ctx.fillRect(x + 1, y - up, 3, 3);
      if (up > 1) ctx.fillRect(x - 1, y - 2 - up, 1, 3);
    }
  }
  ctx.fillStyle = `rgba(4,5,9,${0.92 * (1 - light)})`;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

/** A filled oval, row by row. @param {CanvasRenderingContext2D} ctx @param {string} c @param {number} cx @param {number} cy @param {number} rx @param {number} ry */
export const oval = (ctx, c, cx, cy, rx, ry) => {
  ctx.fillStyle = c;
  const n = Math.max(1, Math.round(ry));
  for (let y = -n; y <= n; y++) {
    const h = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y / (ry || 1)) ** 2)));
    ctx.fillRect(Math.round(cx - h), Math.round(cy + y), h * 2 + 1, 1);
  }
};
/** A line of 1 px squares from (x0, y0) to (x1, y1), `w` thick. @param {CanvasRenderingContext2D} ctx @param {string} c @param {number} x0 @param {number} y0 @param {number} x1 @param {number} y1 @param {number} [w] */
export const pixelLine = (ctx, c, x0, y0, x1, y1, w = 1) => {
  ctx.fillStyle = c;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) ctx.fillRect(Math.round(x0 + ((x1 - x0) * i) / n - w / 2), Math.round(y0 + ((y1 - y0) * i) / n - w / 2), w, w);
};

// ---------------------------------------------------------------- for the stills (Task 113)

/**
 * An ad's still: a snapshot of its animated ad, small enough for the strip above the ground in Full (right of the
 * scorebug), with its brand. No moment: the still is the same every frame.
 * @typedef {(ctx: CanvasRenderingContext2D, R: Rect, ad: Ad, facts: AdFacts) => void} StillDraw
 */
/** Small capitals, left-aligned, with a pixel of shadow; sharp (Task 200). @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y @param {string} fill @param {string} edge @param {number} [s] */
export const small = (ctx, text, x, y, fill, edge, s = 1) => {
  sharpBlock(ctx, text, x + 1, y + 1, s, edge, true);
  sharpBlock(ctx, text, x, y, s, fill, true);
};
/** A rect of colour. @param {CanvasRenderingContext2D} ctx @param {string} c @param {number} x @param {number} y @param {number} w @param {number} h */
export const box = (ctx, c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
/** @param {string} text */
const tinyWidth = (text) => text.length * 4 - 1;
/** Tiny text, left-aligned, its bottom level with the block font's (5 rows against 6), with a pixel of shadow; returns its width. @param {CanvasRenderingContext2D} ctx @param {string} text @param {number} x @param {number} y @param {string} fill @param {string} edge */
export const tiny = (ctx, text, x, y, fill, edge) => {
  // Sharp capitals five pixels tall (Task 200; sharpText.js), in the tiny letters' place and width.
  for (const [dx, colour] of /** @type {[number, string][]} */ ([[1, edge], [0, fill]])) sharpBlock(ctx, text, x + dx, y + 1 + dx, 5 / 6, colour, true);
  return tinyWidth(text);
};
