// The farewells' picture (the off-season show, Task 192; docs/channel.md §19.3; Tom's pick C on offseason.html): the
// season's notable retirements as framed portraits over the scene, in their last teams' kits; each lit up in turn (a
// gold frame, waving), the others dimmed, their card beneath: how long they played, where they finished, their
// awards. offseasonShow.js says who. Canvas only.
import { drawCrestCentred, drawShirtCrest } from './crests.js';
import { playerLook } from './interview.js';
import { PALETTE } from './palette.js';
import { GOLD } from './playoffArt.js';
import { rgba, shade } from './sceneArt.js';
import { sharpText } from './sharpText.js';
import { drawFigure } from './studioSet.js';

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

const POSITION_NAME = /** @type {Record<string, string>} */ ({ K: 'KEEPER', D: 'DEFENDER', M: 'MIDFIELDER', S: 'STRIKER' });

/** Text in the channel's font, sharp (Task 200; sharpText.js). @param {CanvasRenderingContext2D} ctx @param {string} s @param {number} x @param {number} y @param {number} size @param {string} colour @param {{ align?: CanvasTextAlign, max?: number }} [o] */
function text(ctx, s, x, y, size, colour, { align = 'left', max } = {}) {
  sharpText(ctx, s, x, y, { size, colour, align, max });
}

/**
 * The gallery over the scene, the `lit` one waving, `since` ms into their turn.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} t  ms, for the beat.
 * @param {import('./offseasonShow.js').Farewell[]} list @param {number} lit @param {number} since @param {number} season
 * @param {{ teams: Record<string, any>, looks: any, keeperSlot: string }} o
 */
export function drawFarewells(ctx, R, t, list, lit, since, season, o) {
  const whole = R.h >= 250;
  const u = whole ? 3 : 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  const top = R.y + (whole ? 28 : 8);
  text(ctx, `FAREWELLS · SEASON ${season}`, R.x + R.w / 2, top, 14, PALETTE.accent, { align: 'center' });
  const n = list.length;
  const gap = whole ? 14 : 10;
  const fw = Math.min(92, Math.floor((R.w - 24 - (n - 1) * gap) / Math.max(1, n)));
  const fh = Math.round(R.h * (whole ? 0.4 : 0.42));
  const x0 = Math.round(R.x + R.w / 2 - (n * fw + (n - 1) * gap) / 2);
  const fy = top + 20;
  const beat = Math.floor(t / 300) % 2;
  list.forEach((g, i) => {
    const team = o.teams[g.teamId];
    const fr = { x: x0 + i * (fw + gap), y: fy, w: fw, h: fh };
    ctx.fillStyle = i === lit ? GOLD.fill : '#3a4258';
    ctx.fillRect(fr.x - 3, fr.y - 3, fr.w + 6, fr.h + 6);
    ctx.fillStyle = shade(team.colours.primary, 0.35);
    ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(fr.x, fr.y, fr.w, fr.h);
    ctx.clip();
    const look = playerLook(g.playerId, team.colours, { keeper: g.position === o.keeperSlot, side: 'home' }, o.looks);
    // The one lit waves: a hand up and moving, now and then both.
    const pose = i === lit ? (Math.floor(since / 900) % 4 === 3 ? 'both' : 'open') : 'rest';
    drawFigure(ctx, fr.x + fr.w / 2, fr.y + Math.round(fh * 0.12), u, look, pose, beat, -1, { toBottom: fr.y + fr.h, badge: (bx, by) => drawShirtCrest(ctx, bx, by, team) });
    ctx.restore();
    if (i !== lit) {
      ctx.fillStyle = 'rgba(8,10,20,0.55)';
      ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
    }
    text(ctx, g.name.split(' ').at(-1)?.toUpperCase() ?? '', fr.x + fr.w / 2, fr.y + fr.h + 5, 10, i === lit ? PALETTE.panelInk : PALETTE.panelMuted, { align: 'center', max: fw + gap });
  });
  const f = list[lit];
  if (f) farewellCard(ctx, { x: Math.round(R.x + R.w / 2 - 140), y: fy + fh + 20, w: 280 }, f, o.teams[f.teamId], season, Math.min(1, Math.max(0, (since - 300) / 400)));
  ctx.restore();
}

/**
 * The farewell card: who, how long, where they finished, their awards ("AWARDS: 2× THE QUELL", Tom).
 * @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number, w: number }} r
 * @param {import('./offseasonShow.js').Farewell} f @param {any} team @param {number} season @param {number} a  0 → 1, fading in.
 */
function farewellCard(ctx, r, f, team, season, a) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  const h = f.awards.length ? 76 : 62;
  ctx.fillStyle = rgba(PALETTE.panel, 0.94);
  ctx.fillRect(r.x, r.y, r.w, h);
  ctx.fillStyle = team.colours.primary;
  ctx.fillRect(r.x, r.y, r.w, 2);
  text(ctx, `FAREWELL · RETIRES AFTER SEASON ${season}`, r.x + 6, r.y + 5, 9, PALETTE.accent);
  text(ctx, f.name.toUpperCase(), r.x + 6, r.y + 16, 15, PALETTE.panelInk, { max: r.w - 12 });
  text(ctx, `${POSITION_NAME[f.position] ?? f.position} · AGE ${f.age}`, r.x + 6, r.y + 33, 10, PALETTE.panelMuted);
  drawCrestCentred(ctx, r.x + 12, r.y + 51, team, { scale: 1, style: 'flat' });
  text(ctx, `${f.seasons} SEASON${f.seasons === 1 ? '' : 'S'} · LAST WITH ${team.shortName.toUpperCase()}`, r.x + 24, r.y + 46, 10, PALETTE.panelMuted, { max: r.w - 30 });
  if (f.awards.length) text(ctx, `AWARDS: ${f.awards.join(' · ')}`, r.x + 6, r.y + 61, 10, PALETTE.panelMuted, { max: r.w - 12 });
  ctx.restore();
}
