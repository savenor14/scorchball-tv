// The channel's icon (the launch, Task 277): a heat ball alight, 16 × 16 pixels in the heat meter's colours (palette.js),
// drawn from a few shapes and written as the browser-tab icon (favicon.svg, sharp at any size), PNGs for browsers and
// phones that want them (32 and 180 pixels, the 180 on the channel's panel colour), and the picture shared with the
// link (og.png, drawn by og.html). A developer tool: npm run icon writes them into assets/icon/.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { PALETTE } from '../channel/palette.js';

export const SIZE = 16;
const { panel, heatHot: r, heatOrange: o, heatWarm: y, heatBurn: w } = PALETTE;
const k = panel;

/**
 * The icon's pixels, row by row: a colour, or null (see-through).
 * @returns {(string | null)[][]}
 */
export function iconPixels() {
  /** @type {(string | null)[][]} */
  const px = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  const set = (/** @type {number} */ x, /** @type {number} */ yy, /** @type {string} */ c) => { if (x >= 0 && x < SIZE && yy >= 0 && yy < SIZE) px[yy][x] = c; };
  // Flame tongues: a tall one in the middle and two shorter, each a narrowing column, yellow at its heart.
  /** @param {number} cx @param {number} top @param {number} spread @param {number} bottom */
  const tongue = (cx, top, spread, bottom) => {
    for (let yy = top; yy <= bottom; yy++) {
      const half = (yy - top + 0.6) * spread;
      for (let x = 0; x < SIZE; x++) {
        const d = Math.abs(x + 0.5 - cx);
        if (d <= half) set(x, yy, d <= half * 0.45 && yy > top ? y : yy - top < 2 ? o : r);
      }
    }
  };
  tongue(8, 0, 0.42, 7);
  tongue(4.5, 3, 0.4, 8);
  tongue(11.5, 2, 0.4, 8);
  // The ball, hot through to white at its highlight.
  for (let yy = 0; yy < SIZE; yy++) {
    for (let x = 0; x < SIZE; x++) {
      if ((x + 0.5 - 8) ** 2 + (yy + 0.5 - 10.5) ** 2 > 4.9 ** 2) continue;
      const h = Math.hypot(x + 0.5 - 6.5, yy + 0.5 - 9);
      set(x, yy, h < 1.3 ? w : h < 2.7 ? y : h < 4.1 ? o : r);
    }
  }
  // A dark outline round the whole shape, so it reads on a light tab or a dark one.
  const filled = px.map((row) => row.map((c) => c !== null));
  for (let yy = 0; yy < SIZE; yy++) {
    for (let x = 0; x < SIZE; x++) {
      if (filled[yy][x]) continue;
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => filled[yy + dy]?.[x + dx]);
      if (near) px[yy][x] = k;
    }
  }
  return px;
}

/** The icon as SVG: one square a pixel, crisp at any size. @param {(string | null)[][]} px */
export function iconSvg(px) {
  const rects = px.flatMap((row, yy) => row.map((c, x) => (c ? `<rect x="${x}" y="${yy}" width="1" height="1" fill="${c}"/>` : ''))).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" shape-rendering="crispEdges">${rects}</svg>\n`;
}

/** CRC-32 for the PNG's chunks. @param {Uint8Array} bytes */
function crc32(bytes) {
  let c = ~0;
  for (const b of bytes) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

/**
 * The icon as a PNG, each pixel `scale` across, on `background` (null: see-through).
 * @param {(string | null)[][]} px @param {number} scale @param {string | null} [background] @param {number} [pad]  Pixels of background round it.
 */
export function iconPng(px, scale, background = null, pad = 0) {
  const side = (SIZE + 2 * pad) * scale;
  const rgba = (/** @type {string | null} */ c) => (c ? [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255] : [0, 0, 0, 0]);
  const raw = Buffer.alloc(side * (side * 4 + 1));
  for (let yy = 0; yy < side; yy++) {
    raw[yy * (side * 4 + 1)] = 0;
    for (let x = 0; x < side; x++) {
      const sx = Math.floor(x / scale) - pad;
      const sy = Math.floor(yy / scale) - pad;
      const c = px[sy]?.[sx] ?? background;
      raw.set(rgba(c), yy * (side * 4 + 1) + 1 + x * 4);
    }
  }
  /** @param {string} type @param {Buffer} data */
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(side, 0);
  ihdr.writeUInt32BE(side, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

if (import.meta.main) {
  const px = iconPixels();
  const ascii = { [k]: 'k', [r]: 'r', [o]: 'o', [y]: 'y', [w]: 'w' };
  console.log(px.map((row) => row.map((c) => (c ? ascii[c] : '.')).join('')).join('\n'));
  if (process.argv.includes('--write')) {
    const dir = resolve(import.meta.dirname, '..', '..', 'assets', 'icon');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'favicon.svg'), iconSvg(px));
    writeFileSync(join(dir, 'icon-32.png'), iconPng(px, 2));
    writeFileSync(join(dir, 'icon-180.png'), iconPng(px, 9, panel, 2));
    // A phone's home screen (phones, step 4; manifest.webmanifest): 192 and 512 pixels, room round the fire to be cut to a circle.
    writeFileSync(join(dir, 'icon-192.png'), iconPng(px, 8, panel, 4));
    writeFileSync(join(dir, 'icon-512.png'), iconPng(px, 16, panel, 8));
    console.log(`Written to ${dir}`);
  }
}
