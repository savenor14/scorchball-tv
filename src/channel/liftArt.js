// The trophy lift's pictures (the off-season show, Task 190; docs/channel.md §19.1; trophyLift.js has who stands
// where): the podium on the centre circle, and the close-up of the lift (Tom's pick B on offseason.html): the stands a
// blur of the champions' colours, the five who started on a gold podium in their kit with the crest, the captain
// lifting the Scorch Cup, confetti. Canvas only.
import { drawShirtCrest } from './crests.js';
import { playerLook } from './interview.js';
import { PITCH } from './pitch.js';
import { GOLD, TROPHY } from './playoffArt.js';
import { PODIUM_TOP_PX } from './trophyLift.js';
import { blockText, blockWidth, rgba } from './sceneArt.js';
import { createRng } from '../sim/rng.js';
import { drawFigure } from './studioSet.js';

/** @typedef {{ x: number, y: number, w: number, h: number }} Rect */

const CUP_COLOURS = /** @type {Record<string, string>} */ ({ g: GOLD.fill, l: GOLD.light, s: GOLD.shade });

/** The Scorch Cup, its base centred on (cx, bottom), outlined. @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} bottom @param {number} scale */
export function drawCup(ctx, cx, bottom, scale) {
  const x0 = Math.round(cx - (TROPHY[0].length * scale) / 2);
  const y0 = bottom - TROPHY.length * scale;
  ctx.fillStyle = GOLD.edge;
  TROPHY.forEach((row, r) => [...row].forEach((ch, k) => { if (ch !== '.') ctx.fillRect(x0 + (k - 1) * scale, y0 + (r - 1) * scale, 3 * scale, 3 * scale); }));
  TROPHY.forEach((row, r) => [...row].forEach((ch, k) => {
    if (ch === '.') return;
    ctx.fillStyle = CUP_COLOURS[ch];
    ctx.fillRect(x0 + k * scale, y0 + r * scale, scale, scale);
  }));
}

/** The small cup a player holds up in the wide shot (the stage, Tom's pick C), as offseason.html drew it. */
const SMALL_CUP = Object.freeze(['ggggggg', 'g.lgs.g', '.glgsg.', '..ggs..', '...g...', '..ggg..']);

/** The small cup, its base centred on (cx, bottom), outlined. @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} bottom */
export function drawSmallCup(ctx, cx, bottom) {
  const x0 = Math.round(cx) - 3;
  const y0 = Math.round(bottom) - SMALL_CUP.length;
  ctx.fillStyle = GOLD.edge;
  SMALL_CUP.forEach((row, r) => [...row].forEach((ch, k) => { if (ch !== '.') ctx.fillRect(x0 + k - 1, y0 + r - 1, 3, 3); }));
  SMALL_CUP.forEach((row, r) => [...row].forEach((ch, k) => {
    if (ch === '.') return;
    ctx.fillStyle = CUP_COLOURS[ch];
    ctx.fillRect(x0 + k, y0 + r, 1, 1);
  }));
}

/**
 * The podium on the centre circle, rising into place (`f` 0 → 1), its top at the podium row (trophyLift.js). In the
 * pitch's own coordinates (the caller shifts it for Broadcast).
 * @param {CanvasRenderingContext2D} ctx @param {number} f @param {number} rowY  The podium row, as a pitch fraction.
 */
export function drawPodium(ctx, f, rowY) {
  if (f <= 0) return;
  const cx = PITCH.x + PITCH.w / 2;
  const top = Math.round(PITCH.y + rowY * PITCH.h) - PODIUM_TOP_PX;
  const w = 210;
  const h = Math.round(9 * f);
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(cx - w / 2 + 2, top + 2, w, h);
  ctx.fillStyle = GOLD.shade;
  ctx.fillRect(cx - w / 2, top, w, h);
  ctx.fillStyle = GOLD.fill;
  ctx.fillRect(cx - w / 2, top, w, Math.min(h, 3));
  ctx.fillStyle = GOLD.light;
  ctx.fillRect(cx - w / 2, top, w, Math.min(h, 1));
}

/**
 * The stage where the podium stood (Tom, 2026-10-20, his pick C on offseason.html: the second cut), going up (`f`
 * 0 → 1): a dark stage with a gold edge and a stripe in the team's colour, and once up an arch over it, two pillars and
 * a banner with CHAMPIONS on it. Its top at the podium row, so the champions stand on it as on the podium. In the
 * pitch's own coordinates, as drawPodium.
 * @param {CanvasRenderingContext2D} ctx @param {number} f @param {number} rowY @param {{ colours: { primary: string, secondary: string } }} team
 */
export function drawLiftStage(ctx, f, rowY, team) {
  if (f <= 0) return;
  const cx = PITCH.x + PITCH.w / 2;
  const top = Math.round(PITCH.y + rowY * PITCH.h) - PODIUM_TOP_PX;
  const w = 230;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(cx - w / 2 + 2, top + 2, w, Math.round(14 * f));
  ctx.fillStyle = '#1b1f2a';
  ctx.fillRect(cx - w / 2, top, w, Math.round(14 * f));
  ctx.fillStyle = GOLD.fill;
  ctx.fillRect(cx - w / 2, top, w, 2);
  ctx.fillStyle = team.colours.primary;
  ctx.fillRect(cx - w / 2, top + 6, w, Math.round(3 * f));
  if (f < 1) return;
  const archTop = top - 44;
  for (const px of [cx - w / 2 + 4, cx + w / 2 - 10]) {
    ctx.fillStyle = team.colours.primary;
    ctx.fillRect(px, archTop, 6, top - archTop);
    ctx.fillStyle = team.colours.secondary;
    ctx.fillRect(px + 2, archTop, 2, top - archTop);
  }
  ctx.fillStyle = team.colours.primary;
  ctx.fillRect(cx - w / 2 + 4, archTop, w - 8, 14);
  ctx.fillStyle = GOLD.fill;
  ctx.fillRect(cx - w / 2 + 4, archTop, w - 8, 1);
  ctx.fillRect(cx - w / 2 + 4, archTop + 13, w - 8, 1);
  const word = 'CHAMPIONS';
  blockText(ctx, word, Math.round(cx - blockWidth(word, 1) / 2), archTop + 4, 1, team.colours.secondary === '#ffffff' ? '#ffffff' : GOLD.light);
}

/**
 * Fireworks bursting over the stands behind the far touchline (the stage), seeded so every screen shows the same:
 * shells bursting in rings of the champions' colours and gold, falling as they fade. `since` ms since they began.
 * @param {CanvasRenderingContext2D} ctx @param {number} since @param {string[]} colours
 */
export function drawFireworks(ctx, since, colours) {
  const rng = createRng('lift|fireworks');
  const shells = Array.from({ length: 7 }, (_, i) => ({ x: PITCH.x + rng.float(22, PITCH.w + 64), y: PITCH.y + rng.float(-32, 24), at: i * 700 + rng.float(0, 300), c: rng.int(0, 9) }));
  const palette = [...colours, GOLD.fill, GOLD.light];
  for (const s of shells) {
    const age = (since - s.at) % FIREWORK_EVERY_MS;
    if (since < s.at || age > FIREWORK_MS) continue;
    const r = (age / FIREWORK_MS) * 30;
    const fade = 1 - age / FIREWORK_MS;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      ctx.fillStyle = rgba(palette[(s.c + k) % palette.length], fade);
      ctx.fillRect(Math.round(s.x + Math.cos(a) * r), Math.round(s.y + Math.sin(a) * r * 0.8 + (age / FIREWORK_MS) ** 2 * 12), 2, 2);
    }
  }
}
/** A shell's burst lasts this long, and each shell bursts again this often. */
const FIREWORK_MS = 1400;
const FIREWORK_EVERY_MS = 5000;

/** @type {{ key: string, pieces: { x: number, y: number, speed: number, phase: number, colour: number, size: number }[] } | null} */
let confetti = null;
/** Confetti falling over a rect, seeded so every screen shows the same fall. @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {string[]} colours @param {number} elapsed */
function confettiIn(ctx, R, colours, elapsed) {
  const key = `${R.w}x${R.h}`;
  if (confetti?.key !== key) {
    const rng = createRng('lift|confetti');
    confetti = { key, pieces: Array.from({ length: 110 }, () => ({ x: rng.float(0, R.w), y: rng.float(0, R.h), speed: rng.float(18, 40), phase: rng.float(0, 2 * Math.PI), colour: rng.int(0, 3), size: rng.int(1, 2) })) };
  }
  for (const p of confetti.pieces) {
    const y = (p.y + (elapsed * p.speed) / 1000) % R.h;
    const x = (p.x + 6 * Math.sin(elapsed / 600 + p.phase) + R.w) % R.w;
    ctx.fillStyle = colours[p.colour % colours.length];
    const flip = Math.floor(elapsed / 200 + p.phase * 3) % 2;
    ctx.fillRect(Math.round(R.x + x), Math.round(R.y + y), flip ? p.size : 1, flip ? 1 : p.size);
  }
}

/**
 * The lift in close-up, in a rect (the ground in Full, the whole screen in Broadcast): the stands behind out of focus
 * in the champions' colours, spotlights, the five on a gold podium (the captain in the middle lifting the cup, the
 * others cheering), confetti, and a flash as it cuts in.
 * @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} since  ms since the cut.
 * @param {{ team: any, kit: { primary: string, secondary: string }, side: 'home' | 'away', five: { playerId: string, slot: string }[], captainId: string, keeperSlot: string, season: number, looks: any }} o
 */
export function drawLiftCloseUp(ctx, R, since, o) {
  const { team } = o;
  const k = R.h / 270;
  ctx.save();
  ctx.beginPath();
  ctx.rect(R.x, R.y, R.w, R.h);
  ctx.clip();
  // The stands behind, out of focus: rows of the champions' colours, the fans bobbing.
  ctx.fillStyle = '#0e1120';
  ctx.fillRect(R.x, R.y, R.w, R.h);
  const rng = createRng('lift|blur');
  const rows = Math.ceil((R.h * 0.8) / 9);
  for (let row = 0; row < rows; row++) {
    for (let c = 0; c * 8 < R.w + 8; c++) {
      const x = R.x + c * 8 + (row % 2) * 4 + rng.int(-1, 1);
      const bob = Math.floor((since + c * 97 + row * 41) / 250) % 2;
      ctx.fillStyle = rgba(rng.chance(0.65) ? team.colours.primary : team.colours.secondary, 0.35 + row * 0.02);
      ctx.fillRect(x, R.y + Math.round(10 * k) + row * 9 - bob * 2, 5, 6);
    }
  }
  for (const f of [0.17, 0.5, 0.83]) {
    const lx = R.x + R.w * f;
    ctx.fillStyle = 'rgba(255,240,200,0.06)';
    for (let y = 0; y < R.h * 0.85; y++) ctx.fillRect(Math.round(lx - 4 - y * 0.25), R.y + y, Math.round(8 + y * 0.5), 1);
  }
  // The podium, the season on its front, across the whole shot (Task 197, Tom: as if the whole squad were on it).
  const top = R.y + R.h - Math.round(42 * k);
  ctx.fillStyle = GOLD.shade;
  ctx.fillRect(R.x, top, R.w, R.y + R.h - top);
  ctx.fillStyle = GOLD.fill;
  ctx.fillRect(R.x, top, R.w, 5);
  ctx.fillStyle = GOLD.light;
  ctx.fillRect(R.x, top, R.w, 1);
  const word = `SEASON ${o.season} CHAMPIONS`;
  const scale = R.w >= 400 ? 2 : 1;
  blockText(ctx, word, Math.round(R.x + R.w / 2 - blockWidth(word, scale) / 2), top + Math.round(14 * k), scale, GOLD.edge);
  // The five, the captain in the middle lifting the cup once they're set.
  const u = 3;
  const headY = top - 41 * u;
  const up = since > 1800;
  o.five.forEach((p, i) => {
    const x = Math.round(R.x + R.w * (0.17 + i * 0.165));
    const look = playerLook(p.playerId, o.kit, { keeper: p.slot === o.keeperSlot, side: o.side }, o.looks);
    const captain = p.playerId === o.captainId;
    const beat = Math.floor((since + i * 150) / 300) % 2;
    const pose = captain ? (up ? 'both' : 'rest') : up && beat ? 'both' : 'open';
    const badge = (/** @type {number} */ cx, /** @type {number} */ cy) => drawShirtCrest(ctx, cx, cy, team);
    drawFigure(ctx, x, headY - (captain && up ? 2 : 0), u, look, /** @type {import('./studioSet.js').Pose} */ (pose), beat, i < 2 ? 1 : -1, { toBottom: top, badge });
    if (captain && up) drawCup(ctx, x, headY - 1 - 2 * u * beat, 3);
  });
  if (up) confettiIn(ctx, R, [GOLD.fill, GOLD.light, team.colours.primary, team.colours.secondary], since);
  // A flash as it cuts in.
  if (since < 300) {
    ctx.fillStyle = `rgba(255,255,255,${1 - since / 300})`;
    ctx.fillRect(R.x, R.y, R.w, R.h);
  }
  ctx.restore();
}
