// The kit review sheet (kits.html, a dev page): every team's sprites on the turf and its swatch on the dark panel,
// then all matchups with the kit-clash rule applied. ?clash=N tries another threshold. See docs/channel.md §9.
import { loadConfig } from '../config.js';
import { colourDistance, matchKits } from './kits.js';
import { PALETTE } from './palette.js';
import { drawSprite, keeperShirt } from './pitch.js';

const SKINS = [PALETTE.skin1, PALETTE.skin2, PALETTE.skin3, PALETTE.skin4];

/** @param {string} path */
async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * A strip of striped turf, `w`×`h` stage pixels drawn at `zoom` CSS pixels each, with sprites on it.
 * @param {number} w @param {number} h @param {number} zoom
 * @param {(ctx: CanvasRenderingContext2D) => void} draw
 */
function turfTile(w, h, zoom, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.style.width = `${w * zoom}px`;
  canvas.style.height = `${h * zoom}px`;
  const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  for (let x = 0; x < w; x += 8) {
    ctx.fillStyle = (x / 8) % 2 ? PALETTE.turfStripe : PALETTE.turf;
    ctx.fillRect(x, 0, 8, h);
  }
  draw(ctx);
  return canvas;
}

/** @param {string} tag @param {string} [cls] @param {(Node | string)[]} [children] */
function el(tag, cls = '', children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children);
  return node;
}

/** The table panel's kit swatch, as overlays/dom.js draws it. @param {{ primary: string, secondary: string }} c */
function swatch(c) {
  const s = el('span', 'kit');
  s.style.background = c.primary;
  s.style.setProperty('--kit2', c.secondary);
  return s;
}

async function boot() {
  const config = await loadConfig(fetchText);
  const teams = config.teams.teams;
  const clashParam = new URLSearchParams(location.search).get('clash');
  const clash = clashParam === null ? config.settings.kits.clashDistance : Number(clashParam);
  const d = (/** @type {string} */ a, /** @type {string} */ b) => Math.round(colourDistance(a, b));

  document.getElementById('threshold')?.append(`Clash threshold: ${clash} (RGB distance, 0–442)${clashParam === null ? ' from settings.kits.clashDistance' : ' from ?clash='}; matchups closer than this get a change kit.`);

  // 1. Each team: sprites on the turf (zoomed, and at the channel's real size at 1280×720), and its panel swatch.
  const teamRows = document.getElementById('teams');
  for (const t of teams) {
    const c = t.colours;
    const squad = (/** @type {CanvasRenderingContext2D} */ ctx) => {
      SKINS.forEach((skin, i) => drawSprite(ctx, 6 + i * 9, 13, { shirt: c.primary, trim: c.secondary, skin, stride: i % 2 }));
      drawSprite(ctx, 46, 13, { shirt: keeperShirt('home'), trim: c.primary, skin: SKINS[1], stride: 0 });
      drawSprite(ctx, 55, 13, { shirt: keeperShirt('away'), trim: c.primary, skin: SKINS[2], stride: 1 });
    };
    teamRows?.append(el('div', 'team', [
      el('div', 'name', [el('b', '', [t.name]), el('div', 'muted', [`${t.abbr}  ${c.primary} / ${c.secondary}`])]),
      turfTile(62, 15, 5, squad),
      turfTile(62, 15, 2, squad),
      el('div', 'panel', [swatch(c), ` ${t.abbr}`]),
      el('div', 'nums', [`turf ${d(c.primary, PALETTE.turf)}  panel ${d(c.primary, PALETTE.panel)}  trim on turf ${d(c.secondary, PALETTE.turf)}`]),
    ]));
  }

  // 2. Every matchup, home down the side and away across the top, with the clash rule applied.
  const grid = document.getElementById('matchups');
  if (!grid) return;
  grid.style.gridTemplateColumns = `auto repeat(${teams.length}, auto)`;
  grid.append(el('div', 'corner', ['home ↓  away →']), ...teams.map((t) => el('div', 'head', [swatch(t.colours), ` ${t.abbr}`])));
  for (const home of teams) {
    grid.append(el('div', 'head', [swatch(home.colours), ` ${home.abbr}`]));
    for (const away of teams) {
      if (home === away) {
        grid.append(el('div', 'cell same'));
        continue;
      }
      const kits = matchKits(home.colours, away.colours, clash);
      const tile = turfTile(44, 13, 3, (ctx) => {
        [5, 19].forEach((x, i) => drawSprite(ctx, x, 11, { shirt: kits.home.primary, trim: kits.home.secondary, skin: SKINS[i], stride: i % 2 }));
        [12, 26].forEach((x, i) => drawSprite(ctx, x, 11, { shirt: kits.away.primary, trim: kits.away.secondary, skin: SKINS[i + 2], stride: (i + 1) % 2 }));
        drawSprite(ctx, 37, 11, { shirt: keeperShirt('away'), trim: kits.away.primary, skin: SKINS[1], stride: 0 });
      });
      grid.append(el('div', `cell${kits.awayChanged ? ' changed' : ''}`, [
        tile,
        el('div', 'tag', [String(Math.round(kits.distance)), kits.awayChanged ? ' · away change' : '']),
      ]));
    }
  }
}

boot().catch((err) => {
  document.body.append(el('pre', 'bad', [String(err instanceof Error ? err.message : err)]));
  console.error(err);
});
