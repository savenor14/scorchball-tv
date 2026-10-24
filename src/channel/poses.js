// Livelier players (Tasks 119–120; docs/channel.md §17.4): poses beyond the old two-frame stride, as pixel rows like
// pitch.js's sprite: a four-step run whose pace follows the player's speed (arms pumping when sprinting), a kick for
// passes and shots, a keeper's leaping dive and getting up, which foot the ball is at, and turf kicked up. Visual only:
// the sim and the positions are untouched. Canvas only, in stage px; each pose is drawn standing at (x, y), its feet's
// centre.

/**
 * Rows: h skin (head, hands), s shirt, t trim (sleeves, shorts), l / r legs, . empty. The body (rows 0–6) is pitch.js's
 * sprite; the poses change the hands and the legs.
 */
const BODY = Object.freeze(['..hhh..', '..hhh..', '.tssst.', 'tssssst', 'hsssssh', '.sssss.', '.ttttt.']);

/** The legs (rows 7–9) for each step of the run: both down, left foot up and forward, both down, right foot up. */
const LEGS = Object.freeze({
  stand: ['.l...r.', '.l...r.', '.l...r.'],
  left: ['.l...r.', '..l..r.', '.....r.'],
  right: ['.l...r.', '.l..r..', '.l.....'],
  // Sprinting: the free foot kicks further back.
  sprintLeft: ['.l...r.', 'l....r.', '.....r.'],
  sprintRight: ['.l...r.', '.l....r', '.l.....'],
});

/** A kick, toward +x (mirrored for -x): the standing leg planted, the kicking leg swung through, out past the body. */
const KICK_LEGS = Object.freeze(['.l...r..', '.l....r.', '.l.....r']);
/** A shot's kick: the leg swung right through, a pixel further and higher. */
const SHOT_LEGS = Object.freeze(['.l...r...', '.l.....r.', '.l......r']);

/**
 * @typedef {{ shirt: string, trim: string, skin: string }} Look
 * @typedef {'stand' | 'left' | 'right' | 'sprintLeft' | 'sprintRight'} Step
 */

/**
 * The step of the run at a moment: the cycle's pace follows the speed (a slow walk, a jog, a sprint), and a player
 * standing still has both feet down.
 * @param {number} speed  Pitch lengths per real second. @param {number} elapsed  Real ms. @param {number} seed  Per player.
 * @param {{ walk: number, sprint: number, stepMs: number[] }} o  Below `walk` stands still; from `sprint` on,
 *   sprints. stepMs: how long a step takes at a walk and at a sprint (the pace in between eases from one to the other).
 * @returns {Step}
 */
export function stepAt(speed, elapsed, seed, o) {
  return stepPhase(speed, elapsed, seed, o).step;
}

/**
 * The step of the run at a moment, with how long it's been under way and which step it is (for the turf behind a
 * sprint). As stepAt.
 * @param {number} speed @param {number} elapsed @param {number} seed
 * @param {{ walk: number, sprint: number, stepMs: number[] }} o
 * @returns {{ step: Step, since: number, index: number, sprinting: boolean }}
 */
export function stepPhase(speed, elapsed, seed, { walk, sprint, stepMs }) {
  if (speed < walk) return { step: 'stand', since: 0, index: 0, sprinting: false };
  const f = Math.min(1, (speed - walk) / (sprint - walk));
  const ms = stepMs[0] + (stepMs[1] - stepMs[0]) * f;
  const index = Math.floor((elapsed + seed) / ms);
  const phase = index % 4;
  const sprinting = speed >= sprint;
  /** @type {Step} */
  const step = phase === 1 ? (sprinting ? 'sprintLeft' : 'left') : phase === 3 ? (sprinting ? 'sprintRight' : 'right') : 'stand';
  return { step, since: elapsed + seed - index * ms, index, sprinting };
}

/**
 * Draw rows of a sprite: `rows` from the top at (left, top), each character a pixel in its colour.
 * @param {CanvasRenderingContext2D} ctx @param {string[]} rows @param {number} left @param {number} top @param {Look} look
 * @param {boolean} [flip]  Mirrored left to right.
 */
function paint(ctx, rows, left, top, look, flip = false) {
  rows.forEach((row, r) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[flip ? row.length - 1 - i : i];
      if (ch === '.') continue;
      ctx.fillStyle = ch === 's' ? look.shirt : ch === 't' ? look.trim : look.skin;
      ctx.fillRect(left + i, top + r, 1, 1);
    }
  });
}

/** The shadow under a sprite. @param {CanvasRenderingContext2D} ctx @param {number} left @param {number} y @param {number} w */
function shadow(ctx, left, y, w) {
  ctx.fillStyle = 'rgb(0 0 0 / 0.25)';
  ctx.fillRect(left, y, w, 1);
}

/**
 * A running (or standing) player: the step's legs, and while sprinting the arms pumping (the hand on the side of the
 * lifted foot down, the other up).
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {Look} look @param {Step} step
 */
export function drawRunner(ctx, x, y, look, step) {
  const left = x - 3;
  const top = y - 10;
  shadow(ctx, left, y, 7);
  const body = [...BODY];
  if (step === 'sprintLeft' || step === 'sprintRight') {
    // Arms pumping: one hand up by the chest, the other back at the hip.
    const up = step === 'sprintLeft' ? 6 : 0;
    body[3] = replaceAt(body[3], up, 'h');
    body[4] = replaceAt(body[4], up, '.');
  }
  paint(ctx, [...body, ...LEGS[step]], left, top, look);
}

/** @param {string} s @param {number} i @param {string} ch */
const replaceAt = (s, i, ch) => s.slice(0, i) + ch + s.slice(i + 1);

/**
 * A kick toward `dir`: the kicking leg swung through and out past the body; for a shot the arms out for balance too.
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {Look} look @param {1 | -1} dir
 * @param {boolean} shot
 */
export function drawKicker(ctx, x, y, look, dir, shot) {
  const left = x - 3 - (dir < 0 ? 1 : 0);
  const top = y - 10;
  shadow(ctx, left, y, 8);
  const body = BODY.map((r) => `${r}.`);
  if (shot) {
    // Arms out wide: the hands a pixel out from the shoulders.
    body[3] = `h${body[3].slice(1, 6)}h.`;
    body[4] = `.${body[4].slice(1, 6)}..`;
  }
  // The body faces the camera as ever; only the legs (and the arms) are mirrored for a kick to the left. For a shot the
  // head and shoulders lean a pixel into it.
  if (shot) {
    paint(ctx, body.slice(0, 3), x - 3 + dir, top, look, false);
    paint(ctx, body.slice(3), x - 3, top + 3, look, false);
  } else paint(ctx, body, x - 3, top, look, false);
  const legs = shot ? SHOT_LEGS : KICK_LEGS;
  paint(ctx, legs, dir < 0 ? x - 3 - (legs[0].length - 7) : left, top + 7, look, dir < 0);
}

/** Getting up after a dive: down on one knee. */
const CROUCH = Object.freeze(['..hhh..', '..hhh..', '.tssst.', 'tssssst', 'hsssssh', '.ttttt.', 'll..r..', '....r..']);

/**
 * A keeper getting up after a dive.
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {Look} look @param {1 | -1} dir
 */
export function drawCrouch(ctx, x, y, look, dir) {
  shadow(ctx, x - 3, y, 7);
  paint(ctx, CROUCH, x - 3, y - CROUCH.length, look, dir < 0);
}

/**
 * Which side of a carrier the ball is at (+1 right, -1 left): the side they're heading once they've moved that way
 * faster than `speed` over the short look back (or, for a slow drift, the long one); otherwise toward the goal they
 * attack. Worked out from where they were at fixed marks of the match clock, so it's the same on every screen and a
 * wiggle never flicks it across.
 * @param {number} short  Their horizontal speed over the short look back (pitch lengths a second).
 * @param {number} long  The same over the long look back. @param {1 | -1} attack  The way their team attacks.
 * @param {number} speed  footSpeed.
 * @returns {1 | -1}
 */
export function footSide(short, long, attack, speed) {
  if (Math.abs(short) > speed) return short > 0 ? 1 : -1;
  if (Math.abs(long) > speed) return long > 0 ? 1 : -1;
  return attack;
}

/** A keeper flung diagonally up and toward the pitch, arms first (the dive seen from the side); mirrored for down. */
const LEAP = Object.freeze([
  '.......hh',
  '......hh.',
  '....hhh..',
  '...thhh..',
  '..tssst..',
  '.tsssst..',
  '.tssst...',
  '.ttt.....',
  'll.......',
  'l........',
]);

/**
 * A keeper's leaping dive along the goal line: toward the top of the screen (`dir` -1) or the bottom (+1), facing the
 * pitch on the `facing` side (+1: the keeper on the left, the pitch to the right).
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {Look} look @param {1 | -1} dir @param {1 | -1} facing
 */
export function drawLeap(ctx, x, y, look, dir, facing) {
  const rows = dir < 0 ? LEAP : [...LEAP].reverse();
  const w = LEAP[0].length;
  const left = facing > 0 ? x - 3 : x - w + 4;
  shadow(ctx, left + 1, y, w - 3);
  paint(ctx, rows, left, y - rows.length, look, facing < 0);
}

/**
 * A standing catch (Tom, 2026-10-20: not the dive every time): crouched, knees out, both hands together at the chest
 * gathering the ball in.
 */
const CATCH = Object.freeze(['..hhh..', '..hhh..', '.tssst.', 'tshhhst', '.sssss.', '.ttttt.', '.l...r.', 'l.....r']);
/** A standing parry: stepped across, one arm stretched up and out to push it away (toward the top of the screen). */
const PARRY_HIGH = Object.freeze(['h.......', '.h.hhh..', '..thhh..', '..tssst.', '..sssssh', '..sssss.', '..ttttt.', '..l...r.', '.l....r.', 'l.....r.']);
/** A low parry: bent at the waist, one arm down and out to the side (toward the bottom of the screen). */
const PARRY_LOW = Object.freeze(['........', '..hhh...', '..hhh...', '.tssst..', 'tsssssh.', '.ssssss.', '.ttttt.h', '.l...r..', 'l.....r.']);

/**
 * A keeper's standing save: the catch, or the parry to the top of the screen (`dir` -1, high) or the bottom (+1, low),
 * the reaching arm on the pitch side (`facing` +1: the keeper on the left).
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {Look} look
 * @param {'catch' | 'parry'} kind @param {1 | -1} dir @param {1 | -1} facing
 */
export function drawStandingSave(ctx, x, y, look, kind, dir, facing) {
  const rows = kind === 'catch' ? CATCH : dir < 0 ? PARRY_HIGH : PARRY_LOW;
  const w = rows[0].length;
  const left = facing > 0 ? x - 3 : x - w + 4;
  shadow(ctx, left + 1, y, 7);
  paint(ctx, rows, kind === 'catch' ? x - 3 : left, y - rows.length, look, kind !== 'catch' && facing > 0);
}

// ---------------------------------------------------------------- turf kicked up (Tom, after the first mock-ups)

/** The flecks' colours: the turf's two greens, a lighter blade and a speck of earth. */
const FLECKS = Object.freeze(['#2c7d37', '#3fae4a', '#8fdc7a', '#6b4a2a']);
/** How long a fleck flies (ms), and the pull bringing it down (px per ms²). */
const FLECK_MS = 320;
const GRAVITY = 0.00018;

/** A repeatable number in [0, 1) for an integer. @param {number} n */
const hash = (n) => { const v = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return v - Math.floor(v); };

/**
 * Turf kicked up from the ground at (x, y), `since` ms ago: a few flecks thrown up and toward `dir` (+1 right, -1 left),
 * arcing and falling back within FLECK_MS. Seeded, so the same moment draws the same flecks.
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {1 | -1} dir @param {number} since
 * @param {{ count: number, seed: number, reach?: number }} o  reach: how far they fly (1 = a sprint's step).
 */
export function drawTurfKick(ctx, x, y, dir, since, { count, seed, reach = 1 }) {
  if (since < 0 || since > FLECK_MS) return;
  for (let k = 0; k < count; k++) {
    const h = hash(seed * 31 + k);
    const vx = dir * (0.012 + 0.03 * hash(seed * 17 + k * 7)) * reach;
    const vy = -(0.03 + 0.03 * h) * reach;
    const t = since * (0.8 + 0.4 * hash(k + seed));
    const fy = vy * t + GRAVITY * t * t;
    if (fy > 0) continue;
    ctx.fillStyle = FLECKS[Math.floor(h * FLECKS.length)];
    ctx.fillRect(Math.round(x + (k % 3) - 1 + vx * t), Math.round(y - 1 + fy), 1, 1);
  }
}

/**
 * @typedef {{ kind: 'run', step: Step } | { kind: 'kick', dir: 1 | -1, shot: boolean } | { kind: 'leap', dirY: 1 | -1, facing: 1 | -1 } | { kind: 'knee', facing: 1 | -1 } | { kind: 'catch' | 'parry', dirY: 1 | -1, facing: 1 | -1 }} PlayerPose
 */

/**
 * Draw a player in a pose (pitch.js drawPlayers, for players whose pose is known).
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {Look} look @param {PlayerPose} pose
 */
export function drawPose(ctx, x, y, look, pose) {
  if (pose.kind === 'run') drawRunner(ctx, x, y, look, pose.step);
  else if (pose.kind === 'kick') drawKicker(ctx, x, y, look, pose.dir, pose.shot);
  else if (pose.kind === 'leap') drawLeap(ctx, x, y, look, pose.dirY, pose.facing);
  else if (pose.kind === 'catch' || pose.kind === 'parry') drawStandingSave(ctx, x, y, look, pose.kind, pose.dirY, pose.facing);
  else drawCrouch(ctx, x, y, look, pose.facing);
}
