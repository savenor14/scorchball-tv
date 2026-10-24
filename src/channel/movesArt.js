// The moves board (the off-season show, Task 194; docs/channel.md §19.6; Tom's pick B on offseason.html): a
// departures board over the scene, every move a line (PLAYER, P, FROM, TO), the letters flapping in a line at a time;
// signings come from free agency (or the team that let them go) in green, releases go to free agency in red, call-ups
// come up from the Kindling League in blue; the lit line's player has a card below. offseasonShow.js has the moves and
// the beats. Canvas only.
import { drawCrestCentred } from './crests.js';
import { PALETTE } from './palette.js';
import { guilders } from './money.js';
import { sharpText } from './sharpText.js';
import { rgba } from './sceneArt.js';

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

const POSITION_NAME = /** @type {Record<string, string>} */ ({ K: 'KEEPER', D: 'DEFENDER', M: 'MIDFIELDER', S: 'STRIKER' });
const KIND = Object.freeze({
  signed: { colour: PALETTE.up, title: 'SIGNED' },
  released: { colour: PALETTE.down, title: 'RELEASED' },
  called_up: { colour: PALETTE.aside, title: 'CALLED UP' },
  // Task 234: back with the team that let him go; a deal that ran out, nobody signing him.
  re_signed: { colour: PALETTE.panelInk, title: 'RE-SIGNED' },
  deal_ended: { colour: '#ff9e5e', title: 'DEAL ENDED' },
});
/** The board's columns, in letters: the player, the position, from, to. */
const COLS = [20, 1, 15, 15];
const FLAP = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ ';
/** A line's letters flap for this long, the last settling `perLetterMs` after the one before. */
const FLAP_MS = 200;
const PER_LETTER_MS = 40;

/** Text in the channel's font, sharp (Task 200; sharpText.js). @param {CanvasRenderingContext2D} ctx @param {string} s @param {number} x @param {number} y @param {number} size @param {string} colour @param {{ align?: CanvasTextAlign, max?: number }} [o] */
function text(ctx, s, x, y, size, colour, { align = 'left', max } = {}) {
  sharpText(ctx, s, x, y, { size, colour, align, max });
}

/** A dark panel with a coloured edge along the top. @param {CanvasRenderingContext2D} ctx @param {Rect} r @param {string} edge */
function panel(ctx, r, edge) {
  ctx.fillStyle = rgba(PALETTE.panel, 0.94);
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = edge;
  ctx.fillRect(r.x, r.y, r.w, 2);
  ctx.fillStyle = PALETTE.panelEdge;
  ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
}

/** A move's FROM and TO. @param {import('./offseasonShow.js').Move} m @param {Record<string, any>} teams */
function fromTo(m, teams) {
  const team = teams[m.teamId].shortName;
  if (m.kind === 'signed') return [m.fromId ? teams[m.fromId].shortName : 'FREE AGENCY', team];
  if (m.kind === 'released' || m.kind === 'deal_ended') return [team, 'FREE AGENCY'];
  if (m.kind === 're_signed') return [team, team];
  return ['KINDLING LEAGUE', team];
}

/** A deal as words: "ƒ4.2M × 3". @param {{ wage: number, seasons: number }} d */
const dealWords = (d) => `${guilders(d.wage)} × ${d.seasons}`;

/** What marks a move, as tags: the deal first (Task 234, Tom's pick A). @param {import('./offseasonShow.js').Move} m @returns {[string, string][]} */
function tagsOf(m) {
  return [
    ...(m.deal ? [/** @type {[string, string]} */ ([`${dealWords(m.deal)} SEASON${m.deal.seasons === 1 ? '' : 'S'}`, PALETTE.accent])] : []),
    ...(m.deal?.overMarket ? [/** @type {[string, string]} */ (['OVER THE MARKET', PALETTE.accent])] : []),
    ...m.awards.map((a) => /** @type {[string, string]} */ ([a, PALETTE.accent])),
    ...(m.pick ? [/** @type {[string, string]} */ ([`FORMER NO. ${m.pick} PICK`, '#8fd3ff'])] : []),
    ...(m.drafted ? [/** @type {[string, string]} */ ([`ROUND ${m.drafted.round} PICK ${m.drafted.pick} · SEASON ${m.drafted.season + 1} DRAFT`, '#8fd3ff'])] : []),
    // No HOME-GROWN tag (Tom, 2026-10-18), as in the draft.
  ];
}

/** Tags in a row, stopping when there's no room. @param {CanvasRenderingContext2D} ctx @param {[string, string][]} tags @param {number} x @param {number} y @param {number} max */
function tagRow(ctx, tags, x, y, max) {
  ctx.font = '9px "VT323"';
  const end = x + max;
  for (const [label, c] of tags) {
    const w = Math.round(ctx.measureText(label).width) + 8;
    if (x + w > end) break;
    ctx.fillStyle = rgba(c, 0.2);
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 12);
    text(ctx, label, x + 4, y + 1, 9, c);
    x += w + 4;
  }
}

/**
 * The moves board at a moment: the page of lines up so far, the lit one's letters flapping in, its player's card below.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R
 * @param {import('./offseasonShow.js').Move[]} moves @param {ReturnType<import('./offseasonShow.js').movesBeats>} beats
 * @param {{ teams: Record<string, any>, season: number, perPage: number, cardAt: number }} o  cardAt: seconds into a line's turn its card comes in.
 */
export function drawMoves(ctx, R, moves, beats, o) {
  const whole = R.h >= 250;
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  const lineH = whole ? 18 : 15;
  const pageLines = moves.slice(beats.page * o.perPage, (beats.page + 1) * o.perPage);
  // Below the scorebug in Broadcast (Task 198), as the draft's board.
  const b = { x: R.x + 10, y: R.y + (whole ? 28 : 6), w: R.w - 20, h: 30 + Math.max(1, pageLines.length) * lineH + 6 };
  panel(ctx, b, PALETTE.accent);
  const pages = Math.ceil(moves.length / o.perPage);
  text(ctx, `MOVES · OFF-SEASON ${o.season}${pages > 1 ? ` · ${beats.page + 1}/${pages}` : ''}`, b.x + 8, b.y + 4, 12, PALETTE.accent);
  // The tiles fill the board's width.
  const gap = 8;
  const cols = COLS;
  const tile = Math.max(5, Math.floor((b.w - 16 - gap * (cols.length - 1)) / cols.reduce((a, n) => a + n, 0)));
  /** @type {number[]} */
  const xs = [];
  cols.forEach((n, k) => xs.push(k ? xs[k - 1] + cols[k - 1] * tile + gap : b.x + 8));
  ['PLAYER', 'P', 'FROM', 'TO'].forEach((h, k) => text(ctx, h, xs[k], b.y + 17, 8, PALETTE.panelMuted));
  const size = whole ? 11 : 10;
  pageLines.forEach((m, j) => {
    const i = beats.page * o.perPage + j;
    if (i > beats.line) return;
    const since = i === beats.line ? beats.into : Infinity;
    const y = b.y + 27 + j * lineH;
    const [from, to] = fromTo(m, o.teams);
    const cells = [m.name, m.position, from, to].map((c, k) => c.toUpperCase().padEnd(cols[k]).slice(0, cols[k]));
    let at = 0;
    cells.forEach((cell, k) => {
      [...cell].forEach((ch, n) => {
        const settle = FLAP_MS + (at + n) * PER_LETTER_MS;
        const shown = since >= settle ? ch : FLAP[(Math.floor(since / 50) + (at + n) * 7) % FLAP.length];
        const x = xs[k] + n * tile;
        ctx.fillStyle = '#2a3042';
        ctx.fillRect(x, y, tile - 1, lineH - 4);
        ctx.fillStyle = '#0d1018';
        ctx.fillRect(x, y + Math.floor((lineH - 4) / 2), tile - 1, 1);
        text(ctx, shown, x + (tile - 1) / 2, y + (whole ? 1 : 0), size, since >= settle ? (k >= 2 ? KIND[m.kind].colour : PALETTE.panelInk) : '#cfd3dc', { align: 'center' });
      });
      at += cell.length;
    });
    if (i === beats.line) {
      ctx.fillStyle = PALETTE.accent;
      ctx.fillRect(b.x + 2, y, 2, lineH - 4);
    }
  });
  // The lit line's player.
  const m = moves[beats.line];
  const f = m ? Math.min(1, Math.max(0, (beats.into - o.cardAt * 1000) / 400)) : 0;
  if (m && f > 0) {
    const team = o.teams[m.teamId];
    const c = { x: b.x, y: b.y + b.h + 8, w: b.w, h: 40 };
    ctx.globalAlpha = f;
    panel(ctx, c, KIND[m.kind].colour);
    drawCrestCentred(ctx, c.x + 16, c.y + 21, team, { scale: 1, style: 'flat' });
    text(ctx, `${KIND[m.kind].title} · ${team.shortName.toUpperCase()}`, c.x + 32, c.y + 4, 9, KIND[m.kind].colour);
    text(ctx, m.name.toUpperCase(), c.x + 32, c.y + 13, 13, PALETTE.panelInk, { max: c.w * 0.45 });
    const seasons = m.kind === 'called_up' ? `${m.seasons} SEASON${m.seasons === 1 ? '' : 'S'} IN THE KINDLING LEAGUE` : `${m.seasons} SEASON${m.seasons === 1 ? '' : 'S'}`;
    text(ctx, `${POSITION_NAME[m.position] ?? m.position} · AGE ${m.age} · ${seasons}`, c.x + 32, c.y + 27, 9, PALETTE.panelMuted, { max: c.w * 0.55 });
    tagRow(ctx, tagsOf(m), c.x + Math.round(c.w * 0.5), c.y + 14, Math.round(c.w * 0.5) - 8);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
