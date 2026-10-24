// The draft's pictures (the off-season show, Task 193; docs/channel.md §19.5; Tom's pick on offseason.html, C then B):
// the board of a round's eight picks filling in, the one on the clock pulsing, a window where the pick walks up in a
// training tee; then, in round 1, a cut to the close-up, the team's shirt fading on over the tee and a fist-pump; and
// the card: who, from where, what they're projected to be (no ratings, Tom), home-grown or suiting the team's style.
// Round 2 stays on the board. offseasonShow.js has the picks and the beats. Canvas only.
import { drawCrestCentred, drawShirtCrest } from './crests.js';
import { playerLook } from './interview.js';
import { PALETTE } from './palette.js';
import { drawSprite, skinOf } from './pitch.js';
import { drawKitSwatch, ease, rgba, shade } from './sceneArt.js';
import { sharpText } from './sharpText.js';
import { drawFigure } from './studioSet.js';

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

/** A plain training tee and shorts, before the team's shirt goes on. */
const TEE = Object.freeze({ primary: '#8d929c', secondary: '#5d626c' });
const POSITION_NAME = /** @type {Record<string, string>} */ ({ K: 'KEEPER', D: 'DEFENDER', M: 'MIDFIELDER', S: 'STRIKER' });

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
}

/**
 * The pick's card (`f` 0 → 1 as it comes in): the round and pick, the name, position, age and region, what they're
 * projected to be, and the tags.
 * @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number, w: number }} r
 * @param {import('./offseasonShow.js').DraftPick} pk @param {any} team @param {number} f
 */
export function pickCard(ctx, r, pk, team, f) {
  if (f <= 0) return;
  ctx.save();
  ctx.globalAlpha = f;
  ctx.translate(Math.round((1 - ease(f)) * 30), 0);
  // No HOME-GROWN tag (Tom, 2026-10-18: unexplained in the draft, where nothing opens a card).
  const tags = [...(pk.reserve ? [['TO THE KINDLING LEAGUE', PALETTE.aside]] : [])];
  // The tags in rows, wrapping when they don't fit across.
  ctx.font = '9px "VT323"';
  /** @type {{ label: string, c: string, x: number, row: number, w: number }[]} */
  const placed = [];
  let px = r.x + 6;
  let row = 0;
  for (const [label, c] of tags) {
    const w = Math.round(ctx.measureText(label).width) + 8;
    if (px + w > r.x + r.w - 6 && px > r.x + 6) { px = r.x + 6; row++; }
    placed.push({ label, c, x: px, row, w });
    px += w + 4;
  }
  const h = tags.length ? 94 + row * 14 : 78;
  panel(ctx, { x: r.x, y: r.y, w: r.w, h }, team.colours.primary);
  text(ctx, `ROUND ${pk.round} · PICK ${pk.pick} · ${team.shortName.toUpperCase()}`, r.x + 6, r.y + 5, 10, PALETTE.accent, { max: r.w - 12 });
  text(ctx, pk.name.toUpperCase(), r.x + 6, r.y + 17, 16, PALETTE.panelInk, { max: r.w - 12 });
  text(ctx, `${POSITION_NAME[pk.position] ?? pk.position} · AGE ${pk.age} · ${pk.region.toUpperCase()}`, r.x + 6, r.y + 35, 10, PALETTE.panelMuted, { max: r.w - 12 });
  text(ctx, 'PROJECTED', r.x + 6, r.y + 51, 9, PALETTE.panelMuted);
  text(ctx, pk.projection.role, r.x + 52, r.y + 48, 14, PALETTE.accent, { max: r.w - 58 });
  text(ctx, pk.projection.when, r.x + 52, r.y + 63, 10, PALETTE.panelInk, { max: r.w - 58 });
  for (const { label, c, x, row: k, w } of placed) {
    const y = r.y + 78 + k * 14;
    ctx.fillStyle = rgba(c, 0.2);
    ctx.fillRect(x, y, w, 12);
    ctx.fillStyle = c;
    ctx.fillRect(x, y, 1, 12);
    text(ctx, label, x + 4, y + 1, 9, c);
  }
  ctx.restore();
}

/** A sprite at a scale, its feet's centre at (x, y), the team's shirt fading on over the tee as `kit` goes 0 → 1. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} s @param {string} playerId @param {{ primary: string, secondary: string }} colours @param {number} kit @param {number} stride */
function bigSprite(ctx, x, y, s, playerId, colours, kit, stride) {
  const skin = skinOf(playerId);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  drawSprite(ctx, 0, 0, { shirt: TEE.primary, trim: TEE.secondary, skin, stride });
  if (kit > 0) {
    ctx.globalAlpha = kit;
    drawSprite(ctx, 0, 0, { shirt: colours.primary, trim: colours.secondary, skin, stride });
  }
  ctx.restore();
}

/**
 * A round's board: its eight slots (the picks made named, the one on the clock pulsing; each team's colour swatch by
 * its abbreviation, Task 198), and below either the window where the pick walks up (round 1) or their card (round 2).
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {import('./offseasonShow.js').DraftPick[]} round  This round's picks, in order.
 * @param {number} at  Which of them is on the clock. @param {boolean} made  Whether that pick's name is up yet.
 * @param {{ teams: Record<string, any>, season: number, since: number, walk: number, card: number }} o
 */
export function drawDraftBoard(ctx, R, round, at, made, o) {
  const whole = R.h >= 250;
  const pk = round[at];
  const team = o.teams[pk.teamId];
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  const b = { x: R.x + 10, y: R.y + (whole ? 28 : 8), w: R.w - 20, h: Math.round(R.h * (whole ? 0.44 : 0.48)) };
  panel(ctx, b, PALETTE.accent);
  text(ctx, `ROUND ${pk.round} · SEASON ${o.season + 1} DRAFT`, b.x + 6, b.y + 4, 11, PALETTE.accent);
  const cols = 4;
  const sw = Math.floor((b.w - 12 - (cols - 1) * 5) / cols);
  const sh = Math.floor((b.h - 24 - 4) / 2);
  round.forEach((p, i) => {
    const sx = b.x + 6 + (i % cols) * (sw + 5);
    const sy = b.y + 20 + Math.floor(i / cols) * (sh + 4);
    const done = i < at || (i === at && made);
    const onClock = i === at && !made;
    const pt = o.teams[p.teamId];
    ctx.fillStyle = done ? rgba(pt.colours.primary, 0.3) : onClock ? rgba(PALETTE.accent, 0.12 + 0.1 * Math.sin(o.since / 150)) : 'rgba(255,255,255,0.04)';
    ctx.fillRect(sx, sy, sw, sh);
    text(ctx, String(p.pick), sx + 4, sy + 3, 12, PALETTE.accent);
    // The team's swatch (its colours, as the scorebug's) and abbreviation on the pick's row (Task 198: the crest sat
    // over the text in Full).
    drawKitSwatch(ctx, sx + 21, sy + 5, pt);
    text(ctx, pt.abbr, sx + 29, sy + 3, 12, PALETTE.panelMuted);
    if (done) {
      text(ctx, p.name.toUpperCase(), sx + 4, sy + sh - 22, 10, PALETTE.panelInk, { max: sw - 8 });
      text(ctx, POSITION_NAME[p.position] ?? p.position, sx + 4, sy + sh - 11, 8, PALETTE.panelMuted, { max: sw - 8 });
    } else if (onClock) text(ctx, 'ON THE CLOCK', sx + 4, sy + sh - 18, 10, PALETTE.accent, { max: sw - 8 });
  });
  const below = { x: R.x + 10, y: b.y + b.h + 8, h: R.y + R.h - (b.y + b.h + 8) - 6 };
  if (pk.round === 1) {
    // The window: the pick walking up in a training tee, the team's crest behind.
    const win = { x: below.x, y: below.y, w: Math.round(R.w * 0.38), h: below.h };
    ctx.fillStyle = '#121628';
    ctx.fillRect(win.x, win.y, win.w, win.h);
    ctx.fillStyle = team.colours.primary;
    ctx.fillRect(win.x, win.y, win.w, 2);
    drawCrestCentred(ctx, win.x + Math.round(win.w * 0.68), win.y + Math.round(win.h * 0.3), team, { scale: 2, style: 'flat' });
    ctx.fillStyle = '#1b1f2a';
    ctx.fillRect(win.x, win.y + win.h - 14, win.w, 14);
    ctx.save();
    ctx.beginPath();
    ctx.rect(win.x, win.y, win.w, win.h);
    ctx.clip();
    const walking = o.walk > 0 && o.walk < 1;
    const s = whole ? 4 : 3;
    bigSprite(ctx, Math.round(win.x - 10 + o.walk * win.w * 0.62), win.y + win.h - 6, s, pk.playerId, team.colours, 0, walking ? Math.floor(o.since / 220) % 2 : -1);
    ctx.restore();
  } else {
    pickCard(ctx, { x: below.x, y: below.y, w: Math.min(330, R.w - 20) }, pk, team, o.card);
  }
  ctx.restore();
}

/**
 * Round 1's close-up (B's angle): the team's crest printed across the backdrop, the pick from the chest up (framed
 * like the interview), the shirt fading on over the tee, then a fist-pump; the card on the left; a flash as it cuts in.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} t @param {import('./offseasonShow.js').DraftPick} pk
 * @param {ReturnType<import('./offseasonShow.js').pickBeats>} beats
 * @param {{ teams: Record<string, any>, looks: any, keeperSlot: string }} o
 */
export function drawPickCloseUp(ctx, R, t, pk, beats, o) {
  const team = o.teams[pk.teamId];
  const whole = R.h >= 250;
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  ctx.fillStyle = shade(team.colours.primary, 0.35);
  ctx.fillRect(R.x, R.y, R.w, R.h);
  ctx.globalAlpha = 0.18;
  for (let j = 0; j * 44 < R.h + 44; j++) for (let i = 0; i * 44 < R.w + 44; i++) drawCrestCentred(ctx, R.x + i * 44 + (j % 2) * 22, R.y + j * 44 + 10, team, { scale: 2, style: 'flat' });
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(R.x, R.y, Math.round(R.w / 3), R.h);
  const u = whole ? 5 : 4;
  const x = Math.round(R.x + R.w * 0.69);
  const y = R.y + R.h - 41 * u;
  const tee = playerLook(pk.playerId, TEE, { keeper: pk.position === o.keeperSlot, side: 'home' }, o.looks);
  const kit = { ...tee, kit: { primary: team.colours.primary, secondary: team.colours.secondary } };
  const since = beats.sinceCut;
  const pose = beats.cheer ? (Math.floor(since / 500) % 2 ? 'both' : 'open') : beats.kit > 0 ? 'both' : Math.floor(since / 700) % 3 === 1 ? 'nod' : 'rest';
  const beat = Math.floor(t / 300) % 2;
  drawFigure(ctx, x, y, u, tee, pose, beat, -1, { toBottom: R.y + R.h });
  if (beats.kit > 0) {
    ctx.globalAlpha = beats.kit;
    drawFigure(ctx, x, y, u, kit, pose, beat, -1, { toBottom: R.y + R.h, badge: (bx, by) => drawShirtCrest(ctx, bx, by, team) });
    ctx.globalAlpha = 1;
  }
  pickCard(ctx, { x: R.x + 12, y: R.y + R.h - (whole ? 108 : 100), w: Math.min(210, Math.round(R.w * 0.5)) }, pk, team, beats.card);
  if (since < 250) {
    ctx.fillStyle = `rgba(255,255,255,${1 - since / 250})`;
    ctx.fillRect(R.x, R.y, R.w, R.h);
  }
  ctx.restore();
}
