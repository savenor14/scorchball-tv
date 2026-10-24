// Team crests (Tasks 165–166; docs/channel.md §17.5): drawn in pixels from data/teams.json's crest (a shape and an
// icon) in the team's colours. A crest is a 15 × 17 grid (17 × 19 with the dark outline the shaded styles add),
// drawn at a whole-number scale: 1 for the interview, 2 for the cards. Styles: flat (a rim in the second colour),
// shaded (a dark outline, a bevel, the icon's shadow) and banded (shaded, with the team's three letters on a band;
// scale 2 and up, where the letters fit). Tom's picks: banded on the pre-match card and the team spotlight, shaded in
// the interview's lower third, flat on the interview shirt, and the icon alone in the centre circle (centreIcon).

/** The grid a crest is drawn on, and the margin the outline needs round it. */
export const CREST_W = 15;
export const CREST_H = 17;
const PAD = 1;
const OUTLINE = '#0b0c10';

/** @typedef {'shield' | 'circle' | 'diamond' | 'banner'} CrestShape */
/** @typedef {'flat' | 'shaded' | 'banded'} CrestStyle */

/** Whether a grid cell is inside each shape. @type {Record<CrestShape, (x: number, y: number) => boolean>} */
const SHAPES = {
  // Square shoulders, straight sides, then a curve to a point.
  shield: (x, y) => y < 10 || Math.abs(x - 7) <= 7 - Math.ceil(((y - 9) ** 2) / 7),
  circle: (x, y) => (x - 7) ** 2 + (y - 8) ** 2 <= 56.25,
  diamond: (x, y) => Math.abs(x - 7) / 7.5 + Math.abs(y - 8) / 8.5 <= 1,
  // A pennant hanging from a rod, square at the bottom with a small notch (Tom: a deep swallowtail cut the band's
  // letters off).
  banner: (x, y) => (y === 0 ? true : x >= 1 && x <= 13 && !(y >= 15 && Math.abs(x - 7) <= y - 15)),
};

/** Where the 9 × 9 icon sits in each shape (its top row). */
const ICON_TOP = /** @type {Record<CrestShape, number>} */ ({ shield: 3, circle: 4, diamond: 4, banner: 2 });

/** The icons as 9 × 9 rows: # filled. @type {Record<string, string[]>} */
export const CREST_ICONS = {
  gull: [
    '.........',
    '.........',
    '.........',
    '.###.###.',
    '##.###.##',
    '#...#...#',
    '.........',
    '.........',
    '.........',
  ],
  // Tom: the head a bigger rounded top, the body and legs in the middle.
  crow: [
    '.........',
    '.###.....',
    '#####....',
    '.######..',
    '.######..',
    '..#####..',
    '...###...',
    '...#.#...',
    '..##.##..',
  ],
  crown: [
    '.........',
    '#...#...#',
    '##.###.##',
    '#########',
    '#########',
    '#.#.#.#.#',
    '#########',
    '.........',
    '.........',
  ],
  grapes: [
    '.....#...',
    '....#.##.',
    '.##.##.##',
    '.##.##.##',
    '..##.##..',
    '..##.##..',
    '....##...',
    '....##...',
    '.........',
  ],
  anvil: [
    '.........',
    '#########',
    '.########',
    '..######.',
    '....##...',
    '....##...',
    '..######.',
    '.########',
    '.........',
  ],
  mountain: [
    '.........',
    '..#......',
    '.###..#..',
    '.####.##.',
    '#########',
    '#########',
    '.........',
    '.........',
    '.........',
  ],
  hawk: [
    '....#....',
    '...###...',
    '#..###..#',
    '##.###.##',
    '#########',
    '.#######.',
    '...###...',
    '..#.#.#..',
    '.........',
  ],
  palm: [
    '.###.###.',
    '#..###..#',
    '#...#...#',
    '....#....',
    '...#.....',
    '...#.....',
    '...#.....',
    '..#......',
    '#######..',
  ],
};

/** The band's letters, 3 × 5. @type {Record<string, string[]>} */
const LETTERS = {
  A: ['###', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['###', '#..', '#..', '#..', '###'],
  E: ['###', '#..', '##.', '#..', '###'], G: ['###', '#..', '#.#', '#.#', '###'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'], K: ['#.#', '#.#', '##.', '#.#', '#.#'], L: ['#..', '#..', '#..', '#..', '###'],
  P: ['###', '#.#', '###', '#..', '#..'], Q: ['###', '#.#', '#.#', '###', '..#'], R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['###', '#..', '###', '..#', '###'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'], W: ['#.#', '#.#', '###', '###', '#.#'],
};

/** Mix two colours, `t` of the way from a to b. @param {string} a @param {string} b @param {number} t */
function mix(a, b, t) {
  const p = (/** @type {string} */ h, /** @type {number} */ i) => parseInt(h.slice(1 + 2 * i, 3 + 2 * i), 16);
  return `rgb(${[0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t)).join(',')})`;
}

/** The crest's size in stage pixels at a scale, outline included. @param {number} scale */
export const crestSize = (scale) => ({ w: (CREST_W + 2 * PAD) * scale, h: (CREST_H + 2 * PAD) * scale });

/**
 * Draw a team's crest with its top-left (outline included) at x, y.
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y
 * @param {{ abbr: string, colours: { primary: string, secondary: string }, crest: { shape: CrestShape, icon: string } }} team
 * @param {{ style?: CrestStyle, scale?: number }} [o]
 */
export function drawCrest(ctx, x, y, team, { style = 'shaded', scale = 1 } = {}) {
  const inside = SHAPES[team.crest.shape];
  const icon = CREST_ICONS[team.crest.icon] ?? [];
  const { primary, secondary } = team.colours;
  const banded = style === 'banded' && scale >= 2;
  const shaded = style !== 'flat';
  const at = (/** @type {number} */ gx, /** @type {number} */ gy) => gx >= 0 && gy >= 0 && gx < CREST_W && gy < CREST_H && inside(gx, gy);
  const edge = (/** @type {number} */ gx, /** @type {number} */ gy) => !at(gx - 1, gy) || !at(gx + 1, gy) || !at(gx, gy - 1) || !at(gx, gy + 1);
  // The icon moves up on a banded crest as far as it must to clear the band.
  const bandTop = 11;
  const top = ICON_TOP[team.crest.shape] - (banded ? Math.max(0, ICON_TOP[team.crest.shape] + 9 - bandTop) : 0);
  const isIcon = (/** @type {number} */ gx, /** @type {number} */ gy) => icon[gy - top]?.[gx - 3] === '#';
  const inBand = (/** @type {number} */ gy) => banded && gy >= bandTop && gy < bandTop + 4;
  /** @param {number} gx @param {number} gy @param {string} c */
  const cell = (gx, gy, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(x + (gx + PAD) * scale, y + (gy + PAD) * scale, scale, scale);
  };
  for (let gy = -PAD; gy < CREST_H + PAD; gy++) {
    for (let gx = -PAD; gx < CREST_W + PAD; gx++) {
      if (!at(gx, gy)) {
        if (shaded && (at(gx - 1, gy) || at(gx + 1, gy) || at(gx, gy - 1) || at(gx, gy + 1))) cell(gx, gy, OUTLINE);
        continue;
      }
      if (edge(gx, gy)) { cell(gx, gy, secondary); continue; }
      if (inBand(gy)) { cell(gx, gy, secondary); continue; }
      if (isIcon(gx, gy) && !inBand(gy)) { cell(gx, gy, secondary); continue; }
      let c = primary;
      if (shaded) {
        // A bevel: lit along the top and left of the rim, shaded along the bottom and right; the icon's shadow.
        if (edge(gx - 1, gy) || edge(gx, gy - 1)) c = mix(primary, '#ffffff', 0.22);
        else if (edge(gx + 1, gy) || edge(gx, gy + 1)) c = mix(primary, '#000000', 0.25);
        if (isIcon(gx - 1, gy - 1)) c = mix(primary, '#000000', 0.4);
      }
      cell(gx, gy, c);
    }
  }
  // The team's letters on the band, in its first colour, one stage pixel each (the band is scale pixels a row).
  if (banded) {
    const letters = team.abbr.split('').map((ch) => LETTERS[ch] ?? LETTERS.I);
    const w = letters.length * 4 - 1;
    const bandY = y + (bandTop + PAD) * scale;
    const lx = Math.round(x + ((CREST_W + 2 * PAD) * scale - w) / 2);
    const ly = Math.round(bandY + (4 * scale - 5) / 2);
    ctx.fillStyle = primary;
    letters.forEach((g, i) => g.forEach((row, ry) => [...row].forEach((c, rx) => { if (c === '#') ctx.fillRect(lx + i * 4 + rx, ly + ry, 1, 1); })));
  }
}

/**
 * A crest centred on a point (the interview shirt's chest, Task 165), its outline and margin left out of the centring.
 * @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {Parameters<typeof drawCrest>[3]} team
 * @param {{ style?: CrestStyle, scale?: number }} [o]
 */
export function drawCrestCentred(ctx, cx, cy, team, o = {}) {
  const { w, h } = crestSize(o.scale ?? 1);
  drawCrest(ctx, Math.round(cx - w / 2), Math.round(cy - h / 2), team, o);
}

/**
 * The crest on a shirt (Task 198, Tom: no border round it, just the mark): the team's icon alone in its second colour,
 * centred on the chest.
 * @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy
 * @param {{ colours: { secondary: string }, crest: { icon: string } }} team
 */
export function drawShirtCrest(ctx, cx, cy, team) {
  drawIconCentred(ctx, cx, cy, team.crest.icon, team.colours.secondary, 1);
}

/**
 * A crest's icon alone, in one colour, centred on a point by its filled pixels (the icons don't all sit in the middle
 * of their grid): the centre circle's mark (Task 165, Tom's version C).
 * @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {string} icon @param {string} colour
 * @param {number} scale
 */
export function drawIconCentred(ctx, cx, cy, icon, colour, scale) {
  const rows = CREST_ICONS[icon] ?? [];
  const cells = rows.flatMap((r, y) => [...r].flatMap((c, x) => (c === '#' ? [[x, y]] : [])));
  if (!cells.length) return;
  const xs = cells.map(([x]) => x);
  const ys = cells.map(([, y]) => y);
  const left = Math.round(cx - ((Math.min(...xs) + Math.max(...xs) + 1) * scale) / 2);
  const top = Math.round(cy - ((Math.min(...ys) + Math.max(...ys) + 1) * scale) / 2);
  ctx.fillStyle = colour;
  for (const [x, y] of cells) ctx.fillRect(left + x * scale, top + y * scale, scale, scale);
}

/** How big the centre circle's icon is drawn (three stage pixels a cell: 27 px in the 45 px circle). */
const CENTRE_ICON_SCALE = 3;

/**
 * The centre circle's mark (Task 166, Tom's version D): the team's icon in its emblem colour (the second colour) on the
 * home colour, for pitch.js drawHomeMark to draw under the halfway line and the spot.
 * @param {{ colours: { secondary: string }, crest: { icon: string } }} team
 * @returns {(ctx: CanvasRenderingContext2D, cx: number, cy: number) => void}
 */
export function centreIcon(team) {
  return (ctx, cx, cy) => drawIconCentred(ctx, cx + 0.5, cy + 0.5, team.crest.icon, team.colours.secondary, CENTRE_ICON_SCALE);
}

/**
 * A crest on its own canvas, for the HTML cards: drawn at one canvas pixel per stage pixel and sized in stage pixels.
 * @param {Document} doc @param {Parameters<typeof drawCrest>[3]} team @param {{ style?: CrestStyle, scale?: number }} [o]
 */
export function crestCanvas(doc, team, o = {}) {
  const { w, h } = crestSize(o.scale ?? 1);
  const c = doc.createElement('canvas');
  c.width = w;
  c.height = h;
  c.className = 'crest';
  c.style.width = `calc(var(--px) * ${w})`;
  c.style.height = `calc(var(--px) * ${h})`;
  c.style.imageRendering = 'pixelated';
  drawCrest(/** @type {CanvasRenderingContext2D} */ (c.getContext('2d')), 0, 0, team, o);
  return c;
}
