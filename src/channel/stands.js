// The stands and their crowd (Broadcast mode, Tasks 54–56): rows of small pixel fans on terraced steps, around the
// ground where Full mode has the side panel and ticker. See docs/channel.md §14.3. The layout is pure and seeded (the
// same fans in the same seats on every screen); drawing is canvas only.
//
// Fans are mostly home supporters in the home colours, with a block of away supporters in theirs, and a few neutrals.
// Each fan has a seeded look (shirt or scarf colour, skin) and a phase for idling. Their activity (0 calm → 1 on
// their feet) comes from the crowd's level (crowd.js); a side's fans jump with arms up when it scores.
import { createRng } from '../sim/rng.js';
import { colourDistance } from './kits.js';
import { PALETTE } from './palette.js';
import { PITCH } from './pitch.js';

/** A fan's sprite: 3 wide, 4 tall: h head (skin), s shirt, . empty. */
const FAN = Object.freeze(['.h.', 'sss', 'sss', 's.s']);
/** Space between fans along a row, and between rows (stage px). */
const SEAT_W = 5;
const ROW_H = 6;
/** Of the seats, the share left empty (a few gaps read as a real crowd). */
const EMPTY = 0.08;
const NEUTRAL = Object.freeze(['#d8d4c8', '#5b6170', '#8a6a4a', '#3d4a5c']);
const SKINS = Object.freeze([PALETTE.skin1, PALETTE.skin2, PALETTE.skin3, PALETTE.skin4]);

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} Area  A stand's rectangle, stage px.
 * @typedef {{ x: number, y: number, side: 'home' | 'away' | 'neutral', shirt: string, skin: string, phase: number, arrive: number, leave: number }} Fan
 *   x, y: the fan's feet, stage px. phase: 0–1, offsets their idle. arrive, leave: 0–1, their place in the order fans
 *   come and go (Task 84): there once their end is fuller than it.
 */

/** The stage, and the ground's width (the pitch with its boards, nets and apron), in stage px. */
const STAGE_W = 480;
const GROUND_W = 394;
/** Where the stands stop above (the dugouts' roofs start below) and start below the ground (its apron ends above). */
const TOP_H = 23;
const BOTTOM_Y = 236;
const STAGE_H = 270;
/**
 * How far a stand's rows are moved down: a stand above the ground (the top one) has its rows against the ground, its
 * front row by the dugouts, with what's left over at its top (Task 113; there was a bare step by the dugouts, like a
 * missing row). The others start at their top edge, which is the ground's side or alongside it.
 * @param {Area} a
 */
const rowDrop = (a) => (a.y + a.h <= TOP_H ? a.h - 6 - (Math.floor((a.h - 2) / ROW_H) - 1) * ROW_H : 0);
/** The ground's rectangle before any shift (stage px): what the stands must never cover. */
export const GROUND = Object.freeze({ top: TOP_H, bottom: BOTTOM_Y, w: GROUND_W });
/** Where the ground's apron ends below the pitch (pitch.js: the pitch's bottom, then the boards and 6 px of apron). */
const APRON_END = PITCH.y + PITCH.h + 6;
/** Under the ground, the turf (Task 72) covers the dark gap below the apron and this many rows of the stand. */
const TURF_ROWS = 2;
/**
 * The turf below the bottom boards in Broadcast (Task 72, Tom): the ground's darker apron carried on over the gap and
 * the stand's top rows, as wide as the ground, with the home team's name on it. Before any shift (stage px).
 */
export const GROUND_TURF = Object.freeze({ x: 0, y: APRON_END, w: GROUND_W, h: BOTTOM_Y + TURF_ROWS * ROW_H - APRON_END });

/**
 * Broadcast's bowl of stands (Task 55), with the ground moved right by `shift` (broadcast.shiftPx centres it): a
 * strip above the dugouts and one below the pitch, the full width (under the ground, only below the turf, Task 72),
 * and one down each side.
 * @param {number} shift
 * @returns {Area[]}
 */
export function bowlAreas(shift) {
  return [
    { x: 0, y: 0, w: STAGE_W, h: TOP_H },
    { x: 0, y: TOP_H, w: shift, h: BOTTOM_Y - TOP_H },
    { x: shift + GROUND_W, y: TOP_H, w: STAGE_W - shift - GROUND_W, h: BOTTOM_Y - TOP_H },
    { x: 0, y: BOTTOM_Y, w: shift, h: STAGE_H - BOTTOM_Y },
    { x: shift, y: BOTTOM_Y + TURF_ROWS * ROW_H, w: GROUND_W, h: STAGE_H - BOTTOM_Y - TURF_ROWS * ROW_H },
    { x: shift + GROUND_W, y: BOTTOM_Y, w: STAGE_W - shift - GROUND_W, h: STAGE_H - BOTTOM_Y },
  ];
}

/** The turf's lettering (Tasks 68, 72): a small block font, each glyph 5×6, drawn at SCALE with GAP between letters. */
export const GLYPHS = /** @type {Record<string, string[]>} */ ({
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#'], B: ['####.', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '.####'], D: ['####.', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#....', '#####'], F: ['#####', '#....', '####.', '#....', '#....', '#....'],
  G: ['.####', '#....', '#.###', '#...#', '#...#', '.###.'], H: ['#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '#####'], J: ['..###', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '###..', '#..#.', '#...#', '#...#'], L: ['#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#'], N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '.###.'], P: ['####.', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'], R: ['####.', '#...#', '####.', '#..#.', '#...#', '#...#'],
  S: ['.####', '#....', '.###.', '....#', '....#', '####.'], T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '.###.'], V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '##.##', '#...#'], X: ['#...#', '.#.#.', '..#..', '..#..', '.#.#.', '#...#'],
  Y: ['#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'], Z: ['#####', '...#.', '..#..', '.#...', '#....', '#####'],
  '-': ['.....', '.....', '.###.', '.....', '.....', '.....'], '.': ['.....', '.....', '.....', '.....', '.....', '..#..'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....'], '&': ['.##..', '#..#.', '.##..', '#.#.#', '#..#.', '.##.#'],
  // Digits and the colon (Task 113: the ad stills' stat and the playoffs' times).
  0: ['.###.', '#..##', '#.#.#', '##..#', '#...#', '.###.'], 1: ['..#..', '.##..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '...#.', '..#..', '.#...', '#####'], 3: ['####.', '....#', '.###.', '....#', '....#', '####.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.'], 5: ['#####', '#....', '####.', '....#', '....#', '####.'],
  6: ['.###.', '#....', '####.', '#...#', '#...#', '.###.'], 7: ['#####', '....#', '...#.', '..#..', '..#..', '..#..'],
  8: ['.###.', '#...#', '.###.', '#...#', '#...#', '.###.'], 9: ['.###.', '#...#', '#...#', '.####', '....#', '.###.'],
  ':': ['.....', '..#..', '.....', '.....', '..#..', '.....'],
  // Task 159: Maison Doré's accent (a short E under it) and Steamvale's CRUNCH!
  'É': ['...#.', '#####', '#....', '###..', '#....', '#####'], '!': ['..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
});
const SCALE = 2;
const GAP = 3;
/** @type {Map<string, HTMLCanvasElement>} The lettering for each name and colour, made once. */
const nameCache = new Map();

/**
 * The turf below the bottom boards in Broadcast (Task 72, Tom): the apron's darker green, as wide as the ground, with
 * the home team's name as one string centred on halfway (Task 109; it was split either side of the line, Task 72). The
 * letters are in the team's first colour with a shadow in its
 * second (Tom's pick B on turf.html); if the first wouldn't show on the grass, the other way round, or white.
 * @param {CanvasRenderingContext2D} ctx @param {number} shift  Where the ground is (broadcast.shiftPx).
 * @param {{ name: string, city: string, colours: { primary: string, secondary: string } }} team
 * @param {number} clashDistance  settings.kits.clashDistance.
 * @param {{ y: number, h: number }} [rows]  Where the turf runs top to bottom, if not Broadcast's (Full carries it on
 *   down to the ticker, Task 113); the name is centred in it.
 */
export function drawGroundTurf(ctx, shift, team, clashDistance, rows = GROUND_TURF) {
  const { w } = GROUND_TURF;
  const { y, h } = rows;
  const x = GROUND_TURF.x + shift;
  ctx.fillStyle = PALETTE.apron;
  ctx.fillRect(x, y, w, h);
  const { primary, secondary } = team.colours;
  const shows = (/** @type {string} */ c) => colourDistance(c, PALETTE.apron) >= clashDistance && colourDistance(c, PALETTE.turf) >= clashDistance;
  const [fill, edge] = shows(primary) ? [primary, secondary] : shows(secondary) ? [secondary, primary] : [PALETTE.line, primary];
  // The whole name as one string, centred on halfway (the pitch's halfway line, PITCH.x + PITCH.w / 2). Tom (Task
  // 109): split either side of the line, names like PORT CALDER GULLS sat well off centre.
  const text = team.name.toUpperCase();
  const key = `${text}|${fill}|${edge}`;
  let letters = nameCache.get(key);
  if (!letters) nameCache.set(key, (letters = lettering(text, fill, edge)));
  const mid = x + PITCH.x + PITCH.w / 2;
  ctx.drawImage(letters, Math.round(mid - letters.width / 2), y + Math.floor((h - letters.height) / 2));
}

/**
 * Text in the block font, with a pixel of shadow in `edge` under each letter so it reads on the turf. Letters it
 * doesn't have are left as spaces.
 * @param {string} text @param {string} fill @param {string} edge
 */
function lettering(text, fill, edge) {
  const glyphW = 5 * SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, text.length * (glyphW + GAP) - GAP);
  canvas.height = 6 * SCALE + 1;
  const c = /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d'));
  /** @type {[number, number][]} */
  const on = [];
  [...text].forEach((ch, i) => {
    const rows = GLYPHS[ch];
    if (!rows) return;
    rows.forEach((row, r) => [...row].forEach((cell, k) => {
      if (cell === '#') for (let dy = 0; dy < SCALE; dy++) for (let dx = 0; dx < SCALE; dx++) on.push([i * (glyphW + GAP) + k * SCALE + dx, r * SCALE + dy]);
    }));
  });
  c.fillStyle = edge;
  for (const [px, py] of on) c.fillRect(px, py + 1, 1, 1);
  c.fillStyle = fill;
  for (const [px, py] of on) c.fillRect(px, py, 1, 1);
  return canvas;
}

/**
 * The away end in the bowl (Tom, 2026-10-04): the corner nearest the away dugout, the right-hand end of the top stand
 * from just past the away dugout, and the top of the right-hand stand.
 * A bigger away following (Tom, 2026-10-16) spreads it out from the corner: further left along the top stand and
 * further down the right-hand stand, a step's worth each (awaySteps).
 * @param {number} shift  As for bowlAreas. @param {number} awayDugoutX  The away dugout's left edge, stage px, before the shift.
 * @param {number} [steps]  How many steps bigger than usual. @param {{ leftPx: number, downPx: number }} [step]  One step's spread.
 * @returns {Area[]}
 */
export function awayCorner(shift, awayDugoutX, steps = 0, step = { leftPx: 0, downPx: 0 }) {
  const from = Math.max(0, shift + awayDugoutX + 30 - steps * step.leftPx);
  return [
    { x: from, y: 0, w: STAGE_W - from, h: TOP_H },
    { x: shift + GROUND_W, y: TOP_H, w: STAGE_W - shift - GROUND_W, h: Math.min(BOTTOM_Y - TOP_H, 60 + steps * step.downPx) },
  ];
}

/**
 * How many steps bigger the away end is for a match (Tom, 2026-10-16): one when the two teams share a region (a short
 * trip), one when the away team tops the table as the viewer knows it, once it has played enough to mean something.
 * @param {{ region: string }} home @param {{ id: string, region: string }} away
 * @param {{ teamId: string, played: number }[]} table  The table before the match (onScreen.js tableAt).
 * @param {{ leaderAfterPlayed: number }} settings  settings.broadcast.awayEnd.
 */
export function awaySteps(home, away, table, settings) {
  const leader = table[0];
  return (home.region === away.region ? 1 : 0) + (leader?.teamId === away.id && leader.played >= settings.leaderAfterPlayed ? 1 : 0);
}

/** Small groups of away supporters elsewhere: how many, and their size (stage px). */
const AWAY_GROUPS = 3;
const GROUP_W = Object.freeze({ min: 14, max: 28 });
const GROUP_H = 12;

/**
 * The fans in some stands: a row every ROW_H, a seat every SEAT_W, a few empty. Away supporters fill the `away`
 * areas, plus AWAY_GROUPS small groups (a row or two, a few seats) placed elsewhere; a few neutrals among the home fans.
 * @param {Area[]} areas
 * @param {{ home: { primary: string, secondary: string }, away: { primary: string, secondary: string } }} colours  Each team's own colours.
 * @param {string} seed  The ground (the home team), so a ground's crowd looks the same every match.
 * @param {{ away?: Area[] }} [o]
 * @returns {Fan[]}
 */
export function crowdLayout(areas, colours, seed, { away = [] } = {}) {
  const rng = createRng(`stands|${seed}`);
  const inside = (/** @type {Area} */ r, /** @type {number} */ x, /** @type {number} */ y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  // The scattered groups: each in a seeded stand (never the away end), at a seeded spot.
  /** @type {Area[]} */
  const groups = [];
  const open = areas.filter((a) => a.w >= GROUP_W.min + 4 && a.h >= GROUP_H + 4);
  for (let g = 0; g < AWAY_GROUPS && open.length; g++) {
    const a = rng.pick(open);
    const w = Math.min(a.w - 4, rng.int(GROUP_W.min, GROUP_W.max));
    const h = Math.min(a.h - 4, GROUP_H);
    const spot = { x: a.x + rng.int(2, a.w - w - 2), y: a.y + rng.int(2, Math.max(2, a.h - h - 2)), w, h };
    if (!away.some((r) => inside(r, spot.x, spot.y) || inside(r, spot.x + w - 1, spot.y + h - 1))) groups.push(spot);
  }
  const awayAt = [...away, ...groups];
  /** @type {Fan[]} */
  const fans = [];
  for (const a of areas) {
    const rows = Math.floor((a.h - 2) / ROW_H);
    const cols = Math.floor((a.w - 2) / SEAT_W);
    const drop = rowDrop(a);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng.chance(EMPTY)) continue;
        const x = a.x + 2 + c * SEAT_W + (r % 2) * 2;
        const y = a.y + 5 + drop + r * ROW_H;
        const isAway = awayAt.some((q) => inside(q, x, y - 2));
        const neutral = !isAway && rng.chance(0.1);
        const team = isAway ? colours.away : colours.home;
        fans.push({
          x, y,
          side: isAway ? 'away' : neutral ? 'neutral' : 'home',
          shirt: neutral ? rng.pick(NEUTRAL) : rng.chance(0.7) ? team.primary : team.secondary,
          skin: rng.pick(SKINS),
          phase: rng.float(0, 1),
          arrive: 0,
          leave: 0,
        });
      }
    }
  }
  // When each fan comes and goes (Task 84), from a stream of its own so the crowd looks as it always has: a block of
  // seats (neighbours, a group) comes and goes together, give or take, and the away end arrives a little later.
  const order = createRng(`stands|${seed}|order`);
  /** @type {Map<string, [number, number]>} */
  const blocks = new Map();
  for (const f of fans) {
    const key = `${Math.floor(f.x / BLOCK.w)}|${Math.floor(f.y / BLOCK.h)}`;
    let block = blocks.get(key);
    if (!block) blocks.set(key, (block = [order.float(0, 1), order.float(0, 1)]));
    f.arrive = (1 - BLOCK.spread) * block[0] + BLOCK.spread * order.float(0, 1);
    f.leave = (1 - BLOCK.spread) * block[1] + BLOCK.spread * order.float(0, 1);
    if (f.side === 'away') f.arrive = AWAY_LATE + (1 - AWAY_LATE) * f.arrive;
  }
  return fans;
}

/** A block of seats that comes and goes together (stage px), and how much each fan strays from it (0–1). */
const BLOCK = Object.freeze({ w: 24, h: 12, spread: 0.3 });
/** The away end starts arriving once the ground is this full. */
const AWAY_LATE = 0.15;
/** Fullness is drawn in steps this fine (each step makes new pictures, a few ms). */
const FULL_STEPS = 40;

/** @type {WeakMap<Fan[], { key: string, fans: Fan[] }>} Who's in, for the last fullness drawn of each crowd. */
const presentCache = new WeakMap();

/**
 * The fans in the ground at a fullness (Task 84): those whose turn has come, in the order they arrive, or while
 * leaving, those yet to go. The same list for the same step, so its pictures are reused.
 * @param {Fan[]} fans @param {import('./crowd.js').Fullness} full
 * @returns {Fan[]}
 */
export function presentFans(fans, full) {
  const home = Math.round(full.home * FULL_STEPS) / FULL_STEPS;
  const away = Math.round(full.away * FULL_STEPS) / FULL_STEPS;
  const key = `${home}|${away}|${full.leaving}`;
  const cached = presentCache.get(fans);
  if (cached?.key === key) return cached.fans;
  const present = home >= 1 && away >= 1 ? fans : fans.filter((f) => (full.leaving ? f.leave : f.arrive) < (f.side === 'away' ? away : home));
  presentCache.set(fans, { key, fans: present });
  return present;
}

/**
 * @typedef {'none' | 'both' | 'left' | 'right'} Arms
 * @typedef {'home' | 'away' | 'both'} Ends
 */

/**
 * Draw the stands: terraced steps, then the fans on them, moving with the crowd's mood (Task 56).
 * @param {CanvasRenderingContext2D} ctx @param {Area[]} areas @param {Fan[]} fans
 * @param {{ elapsed: number, level: number, jump?: Ends | null, gasp?: Ends | null, wave?: Ends | null, fade?: { from: Fan[], f: number } | null }} mood
 *   elapsed: real ms (for the beat). level: the crowd's level (0–1): calm fans sit, keener ones bob now and then.
 *   jump: those fans on their feet jumping, arms up (a goal). gasp: arms up, still (a miss or a save). wave: arms
 *   waving side to side (anthems, handshakes). fade: the crowd a moment ago, fading into this one (`f` 0 → 1), as fans
 *   arrive or leave (Task 89).
 */
export function drawStands(ctx, areas, fans, { elapsed, level, jump = null, gasp = null, wave = null, fade = null }) {
  // Pictures are drawn once per crowd and reused: everyone seated, and the whole of one set of supporters in each pose
  // (a thousand fans drawn one by one cost about 5 ms a frame; a picture costs a fraction of one).
  const pics = picturesOf(ctx, areas, fans);
  const ends = jump ?? gasp ?? wave;
  const seated = (/** @type {ReturnType<typeof picturesOf>} */ p) => (ends ? p.seatedWithout(ends) : p.seated);
  if (fade && fade.f < 1) {
    // Fans coming and going dissolve in and out: the crowd before, with this one fading in over it.
    ctx.drawImage(seated(picturesOf(ctx, areas, fade.from)), 0, 0);
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * fade.f;
    ctx.drawImage(seated(pics), 0, 0);
    ctx.globalAlpha = alpha;
  } else ctx.drawImage(seated(pics), 0, 0);
  if (jump) {
    // Two halves of the end bouncing out of step.
    const beat = Math.floor(elapsed / JUMP_MS);
    ctx.drawImage(pics.pose(jump, 0, beat % 2 ? 2 : 0, 'both'), 0, 0);
    ctx.drawImage(pics.pose(jump, 1, beat % 2 ? 0 : 2, 'both'), 0, 0);
  } else if (gasp) {
    ctx.drawImage(pics.pose(gasp, 0, 0, 'both'), 0, 0);
    ctx.drawImage(pics.pose(gasp, 1, 0, 'both'), 0, 0);
  } else if (wave) {
    const beat = Math.floor(elapsed / WAVE_MS);
    ctx.drawImage(pics.pose(wave, 0, 0, beat % 2 ? 'left' : 'right'), 0, 0);
    ctx.drawImage(pics.pose(wave, 1, 0, beat % 2 ? 'right' : 'left'), 0, 0);
  }
  // Everyone else: now and then a fan shifts a pixel, more often as the crowd gets going.
  for (const fan of fans) {
    if (ends && takesPart(fan, ends)) continue;
    const beat = Math.floor(elapsed / (700 - 400 * level) + fan.phase * 7);
    if (!(fan.phase < level * 0.6 && beat % 3 === 0)) continue;
    ctx.fillStyle = PALETTE.stand;
    ctx.fillRect(fan.x - 1, fan.y - FAN.length, FAN[0].length, FAN.length);
    drawFan(ctx, fan, 1, 'none');
  }
}

/** How fast a jumping end bounces, and a waving one swaps arms (ms per beat). */
const JUMP_MS = 180;
const WAVE_MS = 260;

/** Whether a fan joins in when `ends` react: their own supporters, and (for the home end) half the neutrals. @param {Fan} f @param {Ends} ends */
const takesPart = (f, ends) => ends === 'both' || f.side === ends || (ends === 'home' && f.side === 'neutral' && f.phase < 0.5);

/** @type {WeakMap<Fan[], ReturnType<typeof makePictures>>} The pictures for each crowd. */
const pictureCache = new WeakMap();

/** @param {CanvasRenderingContext2D} ctx @param {Area[]} areas @param {Fan[]} fans */
function picturesOf(ctx, areas, fans) {
  let p = pictureCache.get(fans);
  if (!p) pictureCache.set(fans, (p = makePictures(ctx.canvas.width, ctx.canvas.height, areas, fans)));
  return p;
}

/**
 * A crowd's pictures, each made the first time it's needed: everyone seated; everyone seated but one set of
 * supporters; and one set of supporters (half of them: `group` 0 or 1, by phase) lifted and with their arms in a pose.
 * @param {number} w @param {number} h @param {Area[]} areas @param {Fan[]} fans
 */
function makePictures(w, h, areas, fans) {
  /** @type {Map<string, HTMLCanvasElement>} */
  const made = new Map();
  /** @param {string} key @param {(c: CanvasRenderingContext2D) => void} paint */
  const picture = (key, paint) => {
    let canvas = made.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      paint(/** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')));
      made.set(key, canvas);
    }
    return canvas;
  };
  /** @param {CanvasRenderingContext2D} c @param {(f: Fan) => boolean} who */
  const seatedPaint = (c, who) => {
    for (const area of areas) {
      c.fillStyle = PALETTE.stand;
      c.fillRect(area.x, area.y, area.w, area.h);
      c.fillStyle = PALETTE.standStep;
      for (let y = area.y + ROW_H + rowDrop(area); y < area.y + area.h; y += ROW_H) c.fillRect(area.x, y, area.w, 1);
    }
    for (const fan of fans) if (who(fan)) drawFan(c, fan, 0, 'none');
  };
  return {
    get seated() { return picture('seated', (c) => seatedPaint(c, () => true)); },
    /** @param {Ends} ends */
    seatedWithout: (ends) => picture(`without|${ends}`, (c) => seatedPaint(c, (f) => !takesPart(f, ends))),
    /** @param {Ends} ends @param {0 | 1} group @param {number} lift @param {Arms} arms */
    pose: (ends, group, lift, arms) => picture(`pose|${ends}|${group}|${lift}|${arms}`, (c) => {
      for (const fan of fans) if (takesPart(fan, ends) && (fan.phase < 0.5 ? 0 : 1) === group) drawFan(c, fan, lift, arms);
    }),
  };
}

/**
 * One fan, `lift` px off their seat, with their arms in a pose: a head, a body, legs (four rectangles), arms.
 * @param {CanvasRenderingContext2D} ctx @param {Fan} f @param {number} lift @param {Arms} arms
 */
function drawFan(ctx, f, lift, arms) {
  const x = f.x - 1;
  const y = f.y - FAN.length - lift;
  ctx.fillStyle = f.skin;
  ctx.fillRect(x + 1, y, 1, 1);
  if (arms === 'both' || arms === 'left') ctx.fillRect(x - 1, y - 1, 1, 2);
  if (arms === 'both' || arms === 'right') ctx.fillRect(x + 3, y - 1, 1, 2);
  ctx.fillStyle = f.shirt;
  ctx.fillRect(x, y + 1, 3, 2);
  ctx.fillRect(x, y + 3, 1, 1);
  ctx.fillRect(x + 2, y + 3, 1, 1);
}

/** The floodlights (Tom's note 14): where each stands in a corner of the bowl, from the ground's edge and the stage's. */
const LAMP = Object.freeze({ out: 16, top: 9, bottom: 11 });
/** Each floodlight's concrete mount (stage px), the seats under it cleared. */
const MOUNT = Object.freeze({ w: 19, h: 19 });

/**
 * The four floodlights' centres (stage px) with the ground moved right by `shift`, as for bowlAreas: one in each corner
 * of the bowl, beside the ground's corners.
 * @param {number} shift
 * @returns {{ x: number, y: number }[]}
 */
export function floodlights(shift) {
  const left = shift - LAMP.out;
  const right = shift + GROUND_W + LAMP.out;
  return [{ x: left, y: LAMP.top }, { x: right, y: LAMP.top }, { x: left, y: STAGE_H - LAMP.bottom }, { x: right, y: STAGE_H - LAMP.bottom }];
}

/**
 * The floodlights' mounts (Tom's note 14, groundstour.html): a block of concrete in each corner of the bowl with a
 * ribbed roof and a stair on its outer side, drawn over the seats it stands on. Drawn with the stands; the lamps on top
 * are lighting.js's, lit by the time of day.
 * @param {CanvasRenderingContext2D} ctx @param {number} shift  As for bowlAreas.
 */
export function drawFloodlightMounts(ctx, shift) {
  for (const p of floodlights(shift)) {
    const x = Math.round(p.x - MOUNT.w / 2);
    const y = Math.max(0, Math.min(STAGE_H - MOUNT.h, Math.round(p.y - MOUNT.h / 2)));
    ctx.fillStyle = PALETTE.mountFrame;
    ctx.fillRect(x - 1, y - 1, MOUNT.w + 2, MOUNT.h + 2);
    ctx.fillStyle = PALETTE.mount;
    ctx.fillRect(x, y, MOUNT.w, MOUNT.h);
    ctx.fillStyle = PALETTE.mountRib;
    for (let i = 2; i < MOUNT.w; i += 3) ctx.fillRect(x + i, y + 1, 1, MOUNT.h - 2);
    ctx.fillStyle = PALETTE.mountEdge;
    ctx.fillRect(x, y, MOUNT.w, 1);
    ctx.fillStyle = PALETTE.mountStair;
    const stairX = p.x < STAGE_W / 2 ? x : x + MOUNT.w - 3;
    for (let j = 0; j < 4; j++) ctx.fillRect(stairX, y + MOUNT.h - 2 - j * 2, 3, 1);
  }
}
