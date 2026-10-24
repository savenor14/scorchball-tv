// Fan Coins' pictures (docs/channel.md §29; Tom's picks on fancoins.html and fanboard.html): a flag held up by the fans
// in an end of the stands, and FAN BOARD beside the scorebug. Canvas only, in stage pixels.
import { crestCanvas } from './crests.js';
import { PALETTE } from './palette.js';
import { sharpText } from './sharpText.js';

/** A flag's size (stage px), and where it's held in each end of Broadcast's bowl (its top left). */
const FLAG = { w: 33, h: 22 };
const FLAG_AT = { home: { x: 5, y: 150 }, away: { x: 442, y: 46 } };
/** How far the cloth ripples (px), how fast (ms a radian), and how often it's lifted higher for a moment. */
const RIPPLE = { px: 1.2, ms: 160, liftEveryMs: 5000, liftMs: 1250, liftPx: 4 };

/** @type {Map<string, HTMLCanvasElement>} A team's flag, flat. */
const flags = new Map();
/** @param {any} team */
function flatFlag(team) {
  let c = flags.get(team.id);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = FLAG.w;
  c.height = FLAG.h;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.fillStyle = team.colours.primary;
  g.fillRect(0, 0, FLAG.w, FLAG.h);
  g.fillStyle = team.colours.secondary;
  g.fillRect(0, 0, FLAG.w, 2);
  g.fillRect(0, FLAG.h - 2, FLAG.w, 2);
  const crest = crestCanvas(document, team, { scale: 1 });
  g.drawImage(crest, Math.round((FLAG.w - crest.width) / 2), Math.round((FLAG.h - crest.height) / 2));
  flags.set(team.id, c);
  return c;
}

/**
 * A flag held up by the fans in an end (Tom: no pole), rippling column by column, arms under its lower edge; every
 * few seconds lifted a little higher, then lowered. Into the stands' picture, after the fans.
 * @param {CanvasRenderingContext2D} ctx @param {any} team @param {'home' | 'away'} end @param {number} shift  Broadcast's
 *   ground shift (the right-hand end is beyond it). @param {number} ms  Real time, for the ripple.
 */
export function drawHeldFlag(ctx, team, end, shift, ms) {
  const flat = flatFlag(team);
  const at = FLAG_AT[end];
  const x0 = end === 'away' ? at.x + (shift - 43) : at.x;
  const cycle = (ms % RIPPLE.liftEveryMs) / RIPPLE.liftMs;
  const lift = cycle < 1 ? Math.round(Math.sin(cycle * Math.PI) * RIPPLE.liftPx) : 0;
  const top = at.y - lift;
  const wave = (/** @type {number} */ x) => Math.round(Math.sin(x / 4 - ms / RIPPLE.ms) * RIPPLE.px);
  for (let x = 0; x < FLAG.w; x++) {
    const dy = wave(x);
    ctx.drawImage(flat, x, 0, 1, FLAG.h, x0 + x, top + dy, 1, FLAG.h);
    // A darker crease where the cloth dips.
    if (dy > 0) {
      ctx.fillStyle = 'rgb(0 0 0 / 0.18)';
      ctx.fillRect(x0 + x, top + dy, 1, FLAG.h);
    }
  }
  // The arms holding it up, from the fans below.
  const skins = [PALETTE.skin1, PALETTE.skin3, PALETTE.skin2, PALETTE.skin4];
  [2, 10, 20, 28].forEach((x, i) => {
    const y = top + FLAG.h + wave(x);
    ctx.fillStyle = skins[i];
    ctx.fillRect(x0 + x, y, 1, at.y + FLAG.h + 6 - y);
  });
}

/**
 * FAN BOARD (Tom's pick A on fanboard.html, 2026-10-21): the band laid flat in Full's strip beside the scorebug, the
 * team's colours with its crest at each end and the words in the middle; a general one dark with gold edges.
 * @param {CanvasRenderingContext2D} ctx @param {{ x: number, y: number, w: number, h: number }} R
 * @param {{ words: string, teamId: string | null }} pic @param {any | null} team
 */
export function drawFanBoard(ctx, R, pic, team) {
  ctx.fillStyle = team ? team.colours.primary : '#101624';
  ctx.fillRect(R.x, R.y, R.w, R.h);
  ctx.fillStyle = team ? team.colours.secondary : PALETTE.gold;
  ctx.fillRect(R.x, R.y, R.w, 1);
  ctx.fillRect(R.x, R.y + R.h - 1, R.w, 1);
  let room = R.w - 12;
  if (team) {
    const crest = crestCanvas(document, team, { scale: 1 });
    const m = Math.max(1, Math.floor((R.h - 4) / crest.height));
    const cw = crest.width * m, ch = crest.height * m;
    const y = R.y + Math.round((R.h - ch) / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(crest, R.x + 4, y, cw, ch);
    ctx.drawImage(crest, R.x + R.w - 4 - cw, y, cw, ch);
    room = R.w - 2 * (cw + 10);
  }
  let size = R.h - 4;
  ctx.font = `${size}px "VT323"`;
  while (ctx.measureText(pic.words).width > room && size > 6) ctx.font = `${--size}px "VT323"`;
  sharpText(ctx, pic.words, R.x + R.w / 2, R.y + R.h / 2 + 0.5, { size, colour: team ? team.colours.secondary : '#ffffff', align: 'center', baseline: 'middle' });
}
