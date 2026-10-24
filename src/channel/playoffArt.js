// Playoff and final grounds (Tasks 116–117; docs/channel.md §17.3): what marks a semifinal or the final on the home
// pitch (Tom's picks): the words SEMIFINALS or FINALS in white pitch paint either side of the centre circle, running
// along the stripes and facing the ends; for the final, the white side boards in gold too (the trophy in the centre
// circle was tried and dropped, Tom, Task 118). The turf keeps the home name. Canvas only, in stage px, drawn over the channel's own pitch.
import { PALETTE } from './palette.js';
import { PITCH, STRIPES, tunnelGap } from './pitch.js';
import { blockText, blockWidth } from './sceneArt.js';

/** The playoffs' gold: fill, the trophy's outline, a highlight and a shade. */
export const GOLD = Object.freeze({ fill: '#f2c230', edge: '#5a3e06', light: '#fff1a8', shade: '#b88a10' });

/**
 * @typedef {{ words: string, trophy: boolean, boards: boolean }} PlayoffMarks
 */

/**
 * What marks a match's ground, by its stage: nothing in the regular season.
 * @param {string | undefined} stage
 * @returns {PlayoffMarks | null}
 */
export function playoffMarks(stage) {
  if (stage === 'semifinal') return { words: 'SEMIFINALS', trophy: false, boards: false };
  if (stage === 'final') return { words: 'FINALS', trophy: false, boards: true };
  return null;
}

/**
 * Mark the ground for a playoff match: the gold boards, the words, the trophy. Call after the home mark (the centre
 * circle's colour) and before the gate, the benches and the players.
 * @param {CanvasRenderingContext2D} ctx @param {string | undefined} stage
 */
export function drawPlayoffMarks(ctx, stage) {
  const marks = playoffMarks(stage);
  if (!marks) return;
  if (marks.boards) drawGoldBoards(ctx);
  drawPitchWords(ctx, marks.words);
  if (marks.trophy) drawCentreTrophy(ctx);
}

/** The trophy's pixel rows, centred in the circle: g gold, l light, s shade. Also the Scorch Cup in offseason.html's mock-ups (Task 189). */
export const TROPHY = Object.freeze([
  'gggggggggggggg',
  '.gllgggggggsg.',
  'g.lggggggggs.g',
  'g.lggggggggs.g',
  '.g.gggggggs.g.',
  '..g.ggggggs.g.',
  '....ggggss....',
  '.....gggs.....',
  '......gs......',
  '......gs......',
  '......gs......',
  '.....gggs.....',
  '...ggggggss...',
  '...gllggggss..',
  '...ggggggggs..',
]);

/**
 * A trophy in the centre circle, over the home colour, outlined so it reads on any colour.
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawCentreTrophy(ctx) {
  const x0 = Math.round(PITCH.x + PITCH.w / 2 - TROPHY[0].length / 2);
  const y0 = Math.round(PITCH.y + PITCH.h / 2 - TROPHY.length / 2);
  const colour = /** @type {Record<string, string>} */ ({ g: GOLD.fill, l: GOLD.light, s: GOLD.shade });
  ctx.fillStyle = GOLD.edge;
  TROPHY.forEach((row, r) => [...row].forEach((ch, k) => { if (ch !== '.') ctx.fillRect(x0 + k - 1, y0 + r - 1, 3, 3); }));
  TROPHY.forEach((row, r) => [...row].forEach((ch, k) => {
    if (ch === '.') return;
    ctx.fillStyle = colour[ch];
    ctx.fillRect(x0 + k, y0 + r, 1, 1);
  }));
}

/**
 * The white side boards in gold, top and bottom (the yellow kick plates stay).
 * @param {CanvasRenderingContext2D} ctx
 */
export function drawGoldBoards(ctx) {
  const { x, y, w, h } = PITCH;
  // The top boards stop either side of the tunnel's gap (Tom: they were painted across it, so the gate looked shut
  // as the runners-up went off after the final); the gate draws its own leaves there when it's shut.
  const gap = tunnelGap();
  /** @type {[number, number, number][]} [from, to, row] */
  const runs = [[x, gap.left, y - 4], [gap.left + gap.width, x + w, y - 4], [x, x + w, y + h + 1]];
  for (const [from, to, by] of runs) {
    ctx.fillStyle = GOLD.fill;
    ctx.fillRect(from, by, to - from, 3);
    ctx.fillStyle = GOLD.light;
    ctx.fillRect(from, by, to - from, 1);
    ctx.fillStyle = GOLD.shade;
    for (let k = x + 6; k < x + w; k += 12) if (k >= from && k < to) ctx.fillRect(k, by + 1, 1, 2);
  }
}

/** How opaque the pitch paint is (like the markings, a touch see-through). */
const PAINT_ALPHA = 0.8;
/** @type {Map<string, HTMLCanvasElement>} Each word's lettering, made once. */
const wordCache = new Map();

/**
 * Words painted on the pitch, either side of the centre circle, running along the stripes and facing the ends: on the
 * left in the dark cut, tops toward halfway (read from the left-hand end); on the right in the light cut, tops toward
 * halfway (read from the right-hand end).
 * @param {CanvasRenderingContext2D} ctx @param {string} word
 */
export function drawPitchWords(ctx, word) {
  let c = wordCache.get(word);
  if (!c) {
    c = document.createElement('canvas');
    c.width = blockWidth(word, 1);
    c.height = 6;
    blockText(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), word, 0, 0, 1, PALETTE.line);
    wordCache.set(word, c);
  }
  const stripe = PITCH.w / STRIPES;
  const cy = Math.round(PITCH.y + PITCH.h / 2);
  const alpha = ctx.globalAlpha;
  ctx.globalAlpha = alpha * PAINT_ALPHA;
  // The stripes either side of the centre circle's: 3 (dark) on the left, 6 (light) on the right.
  for (const [i, turn] of /** @type {[number, number][]} */ ([[3, Math.PI / 2], [6, -Math.PI / 2]])) {
    ctx.save();
    ctx.translate(Math.round(PITCH.x + (i + 0.5) * stripe), cy);
    ctx.rotate(turn);
    ctx.drawImage(c, -Math.round(c.width / 2), -Math.round(c.height / 2));
    ctx.restore();
  }
  ctx.globalAlpha = alpha;
}
