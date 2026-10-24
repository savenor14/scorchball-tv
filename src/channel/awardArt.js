// The awards' pictures (the off-season show, Task 191; docs/channel.md §19.2; Tom's pick B on offseason.html): each
// award's prize in pixel art (the Quell's a breakwater, Tom's pick C), and the plinth set over the scene: the prize on a
// lit plinth, the winner stepping in beside it in their kit (framed like the interview) and lifting it, and a card naming
// the award, the two runners-up and then the winner. awardShow.js says what and when. Canvas only.
import { drawCrestCentred, drawShirtCrest } from './crests.js';
import { playerLook } from './interview.js';
import { PALETTE } from './palette.js';
import { GOLD } from './playoffArt.js';
import { rgba } from './sceneArt.js';
import { sharpText } from './sharpText.js';
import { drawFigure } from './studioSet.js';

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

/**
 * Each award's prize: g gold, l light, s shade, f orange, r red, y yellow, b blue, w deep blue, k navy, i iron,
 * d dark, c pale. Keyed by the sim's award ids; an award without one gets the cup's plain gold star.
 */
export const PRIZES = Object.freeze(/** @type {Record<string, string[]>} */ ({
  ember_boot: ['....f.r....', '...frfr....', '...fyrf....', '...gggg....', '...glgg....', '...glgg....', '...glggg...', '..gglgggggs', '..ggggggggs', '..sssssssss', '..d.d.d.d..'],
  blaze: ['.....y.....', '....yy.....', '....yfy..y.', '...yffy.yy.', '..yffrfyfy.', '..yfrrrffy.', '.yfrryrrfy.', '.yfryyyrfy.', '..yfryyrfy.', '...gggggs..', '..gggggggs.'],
  compass: ['....ggg....', '..gglllgg..', '.gl..r..sg.', '.g...r...g.', 'gl...r...sg', 'g...lgl...s', 'gs...k...sg', '.g...k...g.', '.gs..k..sg.', '..gssssgg..', '....sss....'],
  // The Quell: a gold breakwater with a wave breaking on it (Tom's pick C).
  quell: ['b.b..........', '.bcb..ggggggg', 'bccbb.glsglsg', 'bcbbbbggggggg', '.bbbbbgsglsgl', '..bbbbggggggg', '...bbbglsglsg', '....bbggggggg', '.....bgsglsgl', '......ggggggg', '..ggggggggggs', '.gggggggggggs'],
  // The Spark (Task 252): a sparkle, a four-pointed burst of sparks on a small gold stand (Tom's pick C).
  spark: ['.....y.....', '.....y.....', '..y..f..y..', '....fyf....', 'yyffylyffyy', '....fyf....', '..y..f..y..', '.....g.....', '....ggs....', '...gggss...', '..gggggss..'],
  ironclad: ['ggggggggggg', 'giiiiiiiiis', 'giciiiiicis', 'giiiiiiiiis', 'gdddddddddg', 'giiiiiiiiis', '.giciiicis.', '.giiiiiiis.', '..giiiiis..', '...giiis...', '....gss....'],
  star: ['.....g.....', '....glg....', 'gggglggggs.', '.gglggggs..', '..gggggs...', '..ggs.gs...', '.gs....gs..', '.....g.....', '....ggg....', '...gggggs..', '..gggggggs.'],
}));
const PRIZE_COLOURS = /** @type {Record<string, string>} */ ({ g: GOLD.fill, l: GOLD.light, s: GOLD.shade, f: '#ff8a1f', r: '#ff3b1f', y: '#ffd23f', b: '#3a7bd5', w: '#1d3f7a', c: '#cfe6ff', k: '#2a3f8f', i: '#8a93a6', d: '#4a5160' });

/** A prize, its base centred on (cx, bottom), outlined so it reads on anything. @param {CanvasRenderingContext2D} ctx @param {string} id @param {number} cx @param {number} bottom @param {number} scale */
export function drawPrize(ctx, id, cx, bottom, scale) {
  const rows = PRIZES[id] ?? PRIZES.star;
  const x0 = Math.round(cx - (rows[0].length * scale) / 2);
  const y0 = bottom - rows.length * scale;
  ctx.fillStyle = '#1a1206';
  rows.forEach((row, r) => [...row].forEach((ch, k) => { if (ch !== '.') ctx.fillRect(x0 + (k - 1) * scale, y0 + (r - 1) * scale, 3 * scale, 3 * scale); }));
  rows.forEach((row, r) => [...row].forEach((ch, k) => {
    if (ch === '.') return;
    ctx.fillStyle = PRIZE_COLOURS[ch] ?? GOLD.fill;
    ctx.fillRect(x0 + k * scale, y0 + r * scale, scale, scale);
  }));
}

/** Text in the channel's font, sharp (Task 200; sharpText.js). @param {CanvasRenderingContext2D} ctx @param {string} s @param {number} x @param {number} y @param {number} size @param {string} colour @param {number} [max] */
function text(ctx, s, x, y, size, colour, max) {
  sharpText(ctx, s, x, y, { size, colour, max });
}

/**
 * One award on the plinth set, over the scene (the ground in Full, the whole screen in Broadcast).
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} since  ms into the award. @param {number} t  ms, for the beat.
 * @param {import('./awardShow.js').AwardView} view @param {ReturnType<import('./awardShow.js').awardBeats>} beats
 * @param {{ teams: Record<string, any>, looks: any, isKeeper: (playerId: string) => boolean }} o
 */
export function drawAwardPlinth(ctx, R, since, t, view, beats, o) {
  const whole = R.h >= 250;
  const u = whole ? 4 : 3;
  const prizeScale = whole ? 5 : 4;
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  // The plinth and the light on it.
  const cx = Math.round(R.x + R.w * 0.375);
  const top = Math.round(R.y + R.h * 0.6);
  const pw = whole ? 80 : 64;
  ctx.fillStyle = 'rgba(255,240,200,0.07)';
  for (let y = R.y; y < top + 10; y++) {
    const spread = 6 + (y - R.y) * 0.3;
    ctx.fillRect(Math.round(cx - spread), y, Math.round(2 * spread), 1);
  }
  ctx.fillStyle = '#2a3045';
  ctx.fillRect(cx - pw / 2, top + 8, pw, R.y + R.h - top - 8);
  ctx.fillStyle = '#3a4258';
  ctx.fillRect(cx - pw / 2 - 6, top, pw + 12, 10);
  ctx.fillStyle = GOLD.fill;
  ctx.fillRect(cx - pw / 2 - 6, top, pw + 12, 1);
  ctx.fillRect(cx - pw / 2, top + 30, pw, 1);
  // The winner, stepping in from the right, in their kit with the crest.
  const team = o.teams[view.winner.teamId];
  const beat = Math.floor(t / 320) % 2;
  if (beats.stepIn > 0) {
    const look = playerLook(view.winner.playerId, team.colours, { keeper: o.isKeeper(view.winner.playerId), side: 'home' }, o.looks);
    const x = Math.round(R.x + R.w * 0.69 + (1 - beats.stepIn) * R.w * 0.45);
    const y = R.y + R.h - 41 * u;
    const pose = beats.lifted ? 'both' : 'rest';
    drawFigure(ctx, x, y, u, look, pose, beat, -1, { toBottom: R.y + R.h, badge: (bx, by) => drawShirtCrest(ctx, bx, by, team) });
    // Held up once it's theirs, bobbing with the beat.
    if (beats.lifted) drawPrize(ctx, view.id, x, y - beat * u, u);
  }
  // On the plinth until it's lifted (Task 198, Tom: no glint crossing it).
  if (!beats.lifted) drawPrize(ctx, view.id, cx, top, prizeScale);
  // The card: the award and what it's for, the runners-up named in turn, then the winner.
  // Clear of the scorebug in Broadcast's top-left corner.
  const card = { x: R.x + 12, y: R.y + (whole ? 30 : 12), w: Math.min(214, Math.round(R.w * 0.52)) };
  const h = 32 + beats.named * 12 + (beats.lifted ? 32 : 0);
  ctx.fillStyle = rgba(PALETTE.panel, 0.94);
  ctx.fillRect(card.x, card.y, card.w, h);
  ctx.fillStyle = PALETTE.accent;
  ctx.fillRect(card.x, card.y, card.w, 2);
  text(ctx, view.name.toUpperCase(), card.x + 6, card.y + 5, 13, PALETTE.accent, card.w - 12);
  text(ctx, `${view.forWhat} · REGULAR SEASON`, card.x + 6, card.y + 18, 9, PALETTE.panelMuted, card.w - 12);
  let y = card.y + 30;
  if (beats.lifted) {
    drawCrestCentred(ctx, card.x + 14, y + 11, team, { scale: 1 });
    text(ctx, view.winner.name.toUpperCase(), card.x + 28, y, 13, PALETTE.panelInk, card.w - 34);
    text(ctx, `${team.shortName.toUpperCase()} · ${view.winner.stat}`, card.x + 28, y + 13, 10, PALETTE.panelMuted, card.w - 34);
    y += 32;
  }
  // The runners-up: third named first, then second; listed second then third.
  const named = view.shortlist.slice(0, 2).map((s, i) => ({ ...s, rank: i + 2 })).filter((s) => s.rank > 3 - beats.named);
  for (const s of named) {
    const abbr = o.teams[s.teamId]?.abbr ?? '';
    // The name in white, the rank and the rest grey (docs/colours.md), measured as the draft's tags are.
    ctx.font = '9px "VT323"';
    const rank = `${s.rank}. `;
    const x1 = card.x + 6 + Math.round(ctx.measureText(rank).width);
    const x2 = x1 + Math.round(ctx.measureText(`${s.name} `).width);
    text(ctx, rank, card.x + 6, y, 9, PALETTE.panelMuted);
    text(ctx, s.name, x1, y, 9, PALETTE.panelInk, card.x + card.w - 6 - x1);
    if (x2 < card.x + card.w - 6) text(ctx, `(${abbr}) ${s.stat}`, x2, y, 9, PALETTE.panelMuted, card.x + card.w - 6 - x2);
    y += 12;
  }
  ctx.restore();
}
