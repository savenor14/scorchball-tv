// The draft lottery's picture (the off-season show, Task 192; docs/channel.md §19.4; Tom's pick A on offseason.html):
// a glass drum turning with a crest ball for each team in the draw, speeding up for each draw, the drawn ball dropping
// down the chute into the tray; and the board beside it, the odds above and the picks below filling in, the last pick
// first. offseasonShow.js has the draw and when. Canvas only.
import { drawCrestCentred } from './crests.js';
import { PALETTE } from './palette.js';
import { GOLD } from './playoffArt.js';
import { sharpText } from './sharpText.js';
import { drawKitSwatch, mix, rgba, shade } from './sceneArt.js';

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

/** Text in the channel's font, sharp (Task 200; sharpText.js). @param {CanvasRenderingContext2D} ctx @param {string} s @param {number} x @param {number} y @param {number} size @param {string} colour @param {{ align?: CanvasTextAlign, max?: number }} [o] */
function text(ctx, s, x, y, size, colour, { align = 'left', max } = {}) {
  sharpText(ctx, s, x, y, { size, colour, align, max });
}

/** A lottery ball: the team's colour, shaded, a white ring, the crest on it. @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {any} team @param {number} r */
function ball(ctx, cx, cy, team, r) {
  for (let y = -r; y <= r; y++) {
    const half = Math.round(Math.sqrt(r * r - y * y));
    ctx.fillStyle = y < -r / 2 ? mix(team.colours.primary, '#ffffff', 0.25) : y > r / 2 ? shade(team.colours.primary, 0.7) : team.colours.primary;
    ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
  }
  drawCrestCentred(ctx, cx, cy, team, { scale: 1, style: 'flat' });
}

/**
 * The lottery at a moment.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} t  ms, for the drum's turning.
 * @param {ReturnType<import('./offseasonShow.js').lotteryView>} view @param {ReturnType<import('./offseasonShow.js').lotteryBeats>} beats
 * @param {{ teams: Record<string, any>, season: number, dropAt: number }} o
 */
export function drawLottery(ctx, R, t, view, beats, o) {
  const whole = R.h >= 250;
  const k = R.h / 270;
  const n = view.picks.length;
  // Last pick first: draw k is pick n - k.
  const drawnTeam = (/** @type {number} */ d) => view.picks[n - 1 - d];
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  // The drum.
  const cx = Math.round(R.x + R.w * 0.29);
  const cy = Math.round(R.y + R.h * 0.42);
  const D = Math.round(62 * k);
  const br = whole ? 14 : 11;
  const spinning = beats.reveal >= 0 && beats.into < o.dropAt * 1000;
  const fast = spinning ? 1 + 3 * Math.sin(Math.min(1, beats.into / (o.dropAt * 1000)) * Math.PI) : 1;
  const spin = t * 0.0012 * fast;
  ctx.fillStyle = '#2b2f3a';
  ctx.fillRect(cx - 4, cy + D, 8, Math.round(40 * k));
  ctx.fillRect(cx - 50, cy + D + Math.round(36 * k), 100, 8);
  ctx.fillStyle = '#4a5060';
  ctx.fillRect(cx - 22, cy + D + Math.round(22 * k), 44, Math.round(14 * k));
  ctx.fillStyle = PALETTE.panel;
  ctx.fillRect(cx - 18, cy + D + Math.round(24 * k), 36, Math.round(10 * k));
  ctx.fillStyle = 'rgba(160,200,255,0.10)';
  for (let y = -D; y <= D; y++) { const h = Math.round(Math.sqrt(D * D - y * y)); ctx.fillRect(cx - h, cy + y, 2 * h + 1, 1); }
  ctx.fillStyle = 'rgba(200,225,255,0.5)';
  for (let a = 0; a < 6; a++) {
    const ang = spin + (a * Math.PI) / 3;
    for (let s = 0; s < D; s += 2) ctx.fillRect(Math.round(cx + Math.cos(ang) * s), Math.round(cy + Math.sin(ang) * s), 1, 1);
  }
  // The balls still in the drum: everyone not yet drawn (the one dropping has left it).
  const gone = beats.reveal < 0 ? 0 : beats.reveal + (beats.dropping > 0 ? 1 : 0);
  view.picks.slice(0, n - gone).forEach((teamId, i) => {
    const ang = spin * 1.6 + i * 1.7 + Math.sin(t / 300 + i) * 0.3;
    const rr = D - br - 4 - 8 * k * Math.abs(Math.sin(t / 400 + i * 2));
    ball(ctx, cx + Math.cos(ang) * rr * 0.8, cy + Math.abs(Math.sin(ang)) * rr * 0.9 - 6, o.teams[teamId], br);
  });
  for (let a = 0; a < 360; a++) {
    const ang = (a * Math.PI) / 180;
    ctx.fillStyle = a % 30 < 3 ? GOLD.fill : '#cfe6ff';
    ctx.fillRect(Math.round(cx + Math.cos(ang) * D), Math.round(cy + Math.sin(ang) * D), 1, 1);
  }
  if (beats.dropping > 0) ball(ctx, cx, cy + D - br + beats.dropping * Math.round(43 * k), o.teams[drawnTeam(beats.reveal)], br - 1);
  // The board: the odds, then the picks filling in.
  const b = { x: Math.round(R.x + R.w * 0.56), y: R.y + (whole ? 30 : 10), w: Math.round(R.w * 0.41) };
  const rowH = Math.round(26 * k);
  const h = 100 * k + n * rowH + 8;
  ctx.fillStyle = rgba(PALETTE.panel, 0.94);
  ctx.fillRect(b.x, b.y, b.w, h);
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(b.x, b.y, b.w, 2);
  // The coming season's draft, as the draft's own card says (Tom, 2026-10-27).
  text(ctx, `DRAFT LOTTERY · SEASON ${o.season + 1}`, b.x + 6, b.y + 5, 11, PALETTE.accent, { max: b.w - 12 });
  text(ctx, 'ODDS FOR NO. 1', b.x + 6, b.y + 18, 9, PALETTE.panelMuted);
  const oddsH = Math.round(14 * k);
  view.odds.forEach((od, i) => {
    const y = b.y + 30 + i * oddsH;
    const team = o.teams[od.teamId];
    // The team's kit swatch (as on the draft board and the scorebug; Task 205+, Tom: the four crests sat bunched).
    drawKitSwatch(ctx, b.x + 11, y + 2, team);
    text(ctx, team.shortName.toUpperCase(), b.x + 22, y + 1, 10, PALETTE.panelInk, { max: b.w * 0.4 });
    const bar = { x: b.x + Math.round(b.w * 0.5), w: Math.round(b.w * 0.3) };
    ctx.fillStyle = PALETTE.panelEdge;
    ctx.fillRect(bar.x, y + 4, bar.w, 4);
    ctx.fillStyle = PALETTE.accent;
    ctx.fillRect(bar.x, y + 4, Math.round((bar.w * od.pct) / Math.max(1, view.odds[0].pct)), 4);
    text(ctx, `${od.pct}%`, b.x + b.w - 6, y + 1, 10, PALETTE.panelMuted, { align: 'right' });
  });
  for (let pick = 1; pick <= n; pick++) {
    const y = Math.round(b.y + 100 * k + (pick - 1) * rowH);
    const d = n - pick;
    const shown = d < beats.shown;
    const teamId = view.picks[pick - 1];
    const team = o.teams[teamId];
    ctx.fillStyle = shown ? rgba(team.colours.primary, 0.3) : 'rgba(255,255,255,0.04)';
    ctx.fillRect(b.x + 4, y, b.w - 8, rowH - 4);
    text(ctx, `PICK ${pick}`, b.x + 8, y + Math.round(rowH / 2) - 7, 11, PALETTE.accent);
    if (shown) {
      const od = view.odds.find((x) => x.teamId === teamId);
      drawCrestCentred(ctx, b.x + 62, y + Math.round(rowH / 2) - 2, team, { scale: 1 });
      text(ctx, team.name.toUpperCase(), b.x + 74, y + 2, 10, PALETTE.panelInk, { max: b.w - 80 });
      if (rowH >= 22) text(ctx, `FINISHED ${od?.finished}TH · ${od?.pct}% ODDS`, b.x + 74, y + 12, 8, PALETTE.panelMuted, { max: b.w - 80 });
    } else text(ctx, '?', b.x + 70, y + Math.round(rowH / 2) - 8, 13, PALETTE.panelMuted);
  }
  ctx.restore();
}
