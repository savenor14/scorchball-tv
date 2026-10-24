// The pitch map page (pitchmap.html, a dev page for Task 78): the same numbers as `npm run pitchmap`, plus heat maps
// over the channel's own pitch for the ball and each position. Everything is seen from the team with the ball,
// attacking left to right. ?matches=N (default 12) and ?seed=S (default baseline) pick the matches.
import { loadConfig } from '../config.js';
import { drawPitch, PITCH } from './pitch.js';
import { addMatch, emptyMap, firstMatches, formatMeasure, formatTarget, GRID, measures, meets, TARGETS } from './pitchmap.js';

/** Stage px round the pitch kept in each map (the boards and nets). */
const MARGIN = 12;
/** On-screen scale of each map. */
const SCALE = 2;
/** The heat colour (the channel's accent). */
const HEAT = [255, 182, 39];
const ROLES = Object.freeze([
  ['with D', 'Defenders, with the ball'], ['with M', 'Midfielder, with the ball'], ['with S', 'Striker, with the ball'], ['with K', 'Keeper, with the ball'],
  ['without D', 'Defenders, without it'], ['without M', 'Midfielder, without it'], ['without S', 'Striker, without it'], ['without K', 'Keeper, without it'],
]);

/** @param {string} path */
async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** @param {string} tag @param {string} [cls] @param {(Node | string)[]} [children] */
function el(tag, cls = '', children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children);
  return node;
}

/** The pitch, drawn once on a stage canvas. */
function pitchImage() {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 270;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  ctx.imageSmoothingEnabled = false;
  drawPitch(ctx);
  return c;
}

/**
 * One heat map: the pitch, each grid cell shaded by its share (against the busiest cell), and the share in it.
 * @param {HTMLCanvasElement} pitch @param {number[]} cells @param {number} total @param {string} title
 */
function heatMap(pitch, cells, total, title) {
  const w = PITCH.w + 2 * MARGIN;
  const h = PITCH.h + 2 * MARGIN;
  const c = document.createElement('canvas');
  c.width = w * SCALE;
  c.height = h * SCALE;
  const ctx = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(pitch, PITCH.x - MARGIN, PITCH.y - MARGIN, w, h, 0, 0, w * SCALE, h * SCALE);
  const busiest = Math.max(...cells, 1);
  const cw = (PITCH.w / GRID.along) * SCALE;
  const ch = (PITCH.h / GRID.across) * SCALE;
  ctx.font = `${8 * SCALE}px VT323`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < GRID.along; i++) {
    for (let j = 0; j < GRID.across; j++) {
      const v = cells[i * GRID.across + j];
      const x = MARGIN * SCALE + i * cw;
      const y = MARGIN * SCALE + j * ch;
      ctx.fillStyle = `rgba(${HEAT.join(',')}, ${(0.75 * v) / busiest})`;
      ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)';
      ctx.strokeRect(x + 0.5, y + 0.5, cw - 1, ch - 1);
      const pct = (100 * v) / (total || 1);
      ctx.fillStyle = '#0b0c10';
      ctx.fillText(pct >= 0.05 ? pct.toFixed(1) : '·', x + cw / 2 + 1, y + ch / 2 + 1);
      ctx.fillStyle = '#f2efe6';
      ctx.fillText(pct >= 0.05 ? pct.toFixed(1) : '·', x + cw / 2, y + ch / 2);
    }
  }
  return el('figure', '', [c, el('figcaption', '', [title])]);
}

async function boot() {
  const params = new URLSearchParams(location.search);
  const count = Number(params.get('matches') ?? 12);
  const seed = params.get('seed') ?? 'baseline';
  const status = /** @type {HTMLElement} */ (document.getElementById('status'));
  const config = await loadConfig(fetchText);
  await document.fonts.load('24px VT323');

  status.textContent = `Simulating a season of seed "${seed}"…`;
  await new Promise((r) => setTimeout(r, 0));
  const matches = firstMatches(config, seed, count);
  const map = emptyMap();
  for (const [i, m] of matches.entries()) {
    status.textContent = `Sampling match ${i + 1} of ${matches.length}…`;
    await new Promise((r) => setTimeout(r, 0)); // let the page show progress
    addMatch(map, m.timeline, m.motion, { homeId: m.homeId, keeperSlot: config.positions.keeper, shotMs: config.settings.animation.shotMs });
  }
  status.textContent = `${map.matches} matches of seed "${seed}", ${map.samples.toLocaleString()} moments of play. ?matches=N and ?seed=S for others.`;

  const ms = measures(map, config.settings.play.tether);
  const table = el('table');
  table.append(el('tr', '', [el('th', '', ['Measure']), el('th', '', ['Now']), el('th', '', ['Target'])]));
  for (const [key, t] of Object.entries(TARGETS)) {
    const ok = meets(key, ms[key]);
    table.append(el('tr', ok === null ? '' : ok ? 'ok' : 'bad', [el('td', '', [t.label]), el('td', 'num', [formatMeasure(key, ms[key])]), el('td', 'num', [formatTarget(key)])]));
  }
  /** @type {HTMLElement} */ (document.getElementById('measures')).append(table);

  const pitch = pitchImage();
  /** @type {HTMLElement} */ (document.getElementById('ball')).append(heatMap(pitch, map.ball, map.samples, 'The ball: % of play in each cell'));
  const roles = /** @type {HTMLElement} */ (document.getElementById('roles'));
  for (const [key, title] of ROLES) {
    const cells = map.players[key];
    roles.append(heatMap(pitch, cells, cells.reduce((s, v) => s + v, 0), `${title}: % of their time`));
  }
}

boot().catch((err) => {
  /** @type {HTMLElement} */ (document.getElementById('status')).textContent = `Failed: ${err.message}`;
  throw err;
});
