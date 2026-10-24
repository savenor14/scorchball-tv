// The share card (getting the word out; the Director's TODAY tab): a day's post as a picture for Bluesky, 1200 × 675
// (shown uncropped in the feed), in the channel's art: the light bars between matches as the backdrop (drawn at the
// stage's 480 × 270 and scaled up, so it stays pixel art), the studio cards' panel with its amber head, the crests,
// sharp VT323. Tom's pick D (2026-10-22, of four on the mock-up page, retired): the whole table, the day's results,
// the player of the day. Canvas only; the card's data comes from dailyPost.js.
import { crestSize, drawCrestCentred } from '../channel/crests.js';
import { PALETTE } from '../channel/palette.js';
import { lightBars } from '../channel/sceneArt.js';

export const CARD = Object.freeze({ w: 1200, h: 675 });
/** The stage's pixels to the card's (the backdrop scaled up). */
const K = 2.5;

/** @typedef {import('./dailyPost.js').DayCard} DayCard */
/** @typedef {Record<string, { id: string, abbr: string, shortName: string, colours: { primary: string, secondary: string } }>} Teams */

/** The backdrop: the light bars at the stage's size, scaled up whole. @param {CanvasRenderingContext2D} ctx */
function backdrop(ctx) {
  const small = document.createElement('canvas');
  small.width = Math.ceil(CARD.w / K);
  small.height = Math.ceil(CARD.h / K);
  const g = /** @type {CanvasRenderingContext2D} */ (small.getContext('2d'));
  lightBars(g, { x: 0, y: 0, w: small.width, h: small.height }, 4200);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, small.width * K, small.height * K);
}

/** Text in VT323. @param {CanvasRenderingContext2D} ctx */
function text(ctx, s, x, y, size, colour, align = /** @type {CanvasTextAlign} */ ('left'), max = undefined) {
  ctx.font = `${size}px "VT323"`;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (max) ctx.fillText(s, x, y, max);
  else ctx.fillText(s, x, y);
}

/** The studio cards' panel: a dark glass box with an amber head. @param {CanvasRenderingContext2D} ctx */
function panel(ctx, x, y, w, h, head) {
  ctx.fillStyle = 'rgb(21 25 36 / 0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = PALETTE.panelEdge;
  ctx.lineWidth = 3;
  ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  if (head) {
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(x, y, Math.min(w, 34 + head.length * 19), 54);
    text(ctx, head, x + 18, y + 28, 38, PALETTE.panel);
  }
}

/** A crest, its pixels kept square. @param {CanvasRenderingContext2D} ctx */
function crest(ctx, cx, cy, team, scale) {
  ctx.imageSmoothingEnabled = false;
  drawCrestCentred(ctx, Math.round(cx), Math.round(cy), team, { scale });
}

/**
 * A result's row: crest, letters, the score, letters, crest; the crests at the largest whole scale that fits the row.
 * @param {CanvasRenderingContext2D} ctx
 */
function resultRow(ctx, r, teams, x, y, w, size = 40, rowH = 72) {
  const h = teams[r.homeId], a = teams[r.awayId];
  const scale = Math.max(2, Math.min(3, Math.floor((rowH + 6) / crestSize(1).h)));
  const { w: cw } = crestSize(scale);
  crest(ctx, x + cw / 2, y, h, scale);
  text(ctx, h.abbr, x + cw + 14, y, size, PALETTE.panelInk);
  text(ctx, `${r.hg}-${r.ag}`, x + w / 2, y, size + 4, PALETTE.accent, 'center');
  text(ctx, a.abbr, x + w - cw - 14, y, size, PALETTE.panelInk, 'right');
  crest(ctx, x + w - cw / 2, y, a, scale);
  // Under the score: SEMIFINAL or FINAL in the playoffs, how it was won if not in normal time.
  const tag = [r.stage === 'semifinal' ? 'SEMIFINAL' : r.stage === 'final' ? 'FINAL' : '', r.how === 'pens' && r.pens ? `${r.pens[0]}-${r.pens[1]} PENS` : r.how.toUpperCase()].filter(Boolean).join(' · ');
  if (tag) text(ctx, tag, x + w / 2, y + 22, 22, PALETTE.panelMuted, 'center');
}

/** The heading, top left: "SCORCHBALL · SEASON 2, THURSDAY", squeezed to `max`. @param {CanvasRenderingContext2D} ctx @param {DayCard} card */
const heading = (ctx, card, max = CARD.w - 80) => text(ctx, card.heading.toUpperCase(), 40, 44, 46, PALETTE.panelInk, 'left', max);

/**
 * D (Tom, 2026-10-22: B's results beside C's table, the whole table, a player of the day): the table on the left (all
 * eight, W-D-L and points; the final table in the playoffs), the day's results on the right with B's spacing, the
 * player of the day as a strip along the bottom; the address beside the heading.
 * @param {CanvasRenderingContext2D} ctx @param {DayCard} card @param {Teams} teams
 */
export function drawShareCard(ctx, card, teams) {
  backdrop(ctx);
  heading(ctx, card, CARD.w - 340);
  text(ctx, 'SCORCHBALL.TV', CARD.w - 40, 44, 40, PALETTE.accent, 'right');
  const top = 92, h = 480;
  const left = { x: 40, y: top, w: 520, h };
  panel(ctx, left.x, left.y, left.w, left.h, card.playoffs ? 'FINAL TABLE' : 'THE TABLE');
  const rows = card.table;
  const rowH = Math.min(52, (h - 100) / Math.max(1, rows.length));
  text(ctx, 'W-D-L', left.x + left.w - 120, left.y + 28, 26, PALETTE.panelMuted, 'right');
  text(ctx, 'PTS', left.x + left.w - 26, left.y + 28, 26, PALETTE.panelMuted, 'right');
  rows.forEach((row, i) => {
    const t = teams[row.teamId];
    const y = left.y + 88 + i * rowH;
    const scale = Math.max(2, Math.min(3, Math.floor((rowH + 6) / crestSize(1).h)));
    text(ctx, String(i + 1), left.x + 34, y, 36, PALETTE.panelMuted, 'center');
    crest(ctx, left.x + 84, y, t, scale);
    text(ctx, t.shortName.toUpperCase(), left.x + 122, y, 36, PALETTE.panelInk, 'left', 230);
    text(ctx, `${row.won}-${row.drawn}-${row.lost}`, left.x + left.w - 120, y, 32, PALETTE.panelMuted, 'right');
    text(ctx, String(row.points), left.x + left.w - 26, y, 38, i === 0 ? PALETTE.accent : PALETTE.panelInk, 'right');
  });
  const right = { x: 590, y: top, w: CARD.w - 630, h };
  panel(ctx, right.x, right.y, right.w, right.h, 'RESULTS');
  const resH = Math.min(52, (h - 100) / Math.max(1, card.results.length));
  card.results.forEach((r, i) => resultRow(ctx, r, teams, right.x + 22, right.y + 92 + i * resH, right.w - 44, 34, resH));
  // The final's day: the champions at the panel's foot.
  if (card.champions) {
    const t = teams[card.champions];
    const y = right.y + right.h - 60;
    text(ctx, 'CHAMPIONS', right.x + right.w / 2, y - 34, 32, PALETTE.accent, 'center');
    crest(ctx, right.x + right.w / 2 - 120, y + 12, t, 3);
    text(ctx, t.shortName.toUpperCase(), right.x + right.w / 2 - 90, y + 12, 52, PALETTE.panelInk, 'left', right.w / 2 + 60);
  }
  const p = card.playerOfDay;
  if (p) {
    const y = 618;
    ctx.fillStyle = 'rgb(21 25 36 / 0.92)';
    ctx.fillRect(40, y - 34, CARD.w - 80, 68);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(40, y - 34, 10, 68);
    text(ctx, 'PLAYER OF THE DAY', 70, y, 40, PALETTE.accent);
    ctx.font = '40px "VT323"';
    let x = 70 + ctx.measureText('PLAYER OF THE DAY').width + 26;
    const t = teams[p.teamId];
    const { w: cw } = crestSize(3);
    crest(ctx, x + cw / 2, y, t, 3);
    x += cw + 14;
    text(ctx, p.who.toUpperCase(), x, y, 40, PALETTE.panelInk);
    ctx.font = '40px "VT323"';
    x += ctx.measureText(p.who.toUpperCase()).width + 20;
    text(ctx, `${t.abbr} · ${p.line}`, x, y, 32, PALETTE.panelMuted, 'left', CARD.w - 60 - x);
  }
}
