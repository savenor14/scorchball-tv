// AROUND THE GROUNDS' scenes (Tom's note 14; picked on groundstour.html, where they were first drawn; docs/channel.md
// §32): what's going on at a ground on the tour, drawn on the pitch canvas in stage px with the ground's shift applied.
// Five with the squad (shooting, the keepers' drills, a chat, drills round the cones, cardio in training wear) and five
// with the groundstaff (mowing, the lines, the emblem, the nets, the dugouts). Each is a function of the moment alone
// (`t`, the channel's clock), seeded by the ground, so every screen draws the same. Which scene airs where is
// groundsTour.js's.
import { createRng } from '../sim/rng.js';
import { SPRINKLER_TICK, SPRINKLER_TICKS } from './musicRecipes.js';
import { PALETTE } from './palette.js';
import { drawPlayers, PITCH, toStage } from './pitch.js';
import { seat } from './sidelines.js';

/** A ground's time on screen (epoch ms): the work that's done once in it is timed from it. @typedef {{ from: number, until: number }} Span */
/** How far through one pass of the work at `t`: done by PASS_END of the ground's time on screen, then finished. @param {number} t @param {Span} span */
const passAt = (t, { from, until }) => Math.min(1, Math.max(0, (t - from) / Math.max(1, (until - from) * PASS_END)));
/** The share of a ground's time on screen a one-pass job takes (the rest it stands finished). */
const PASS_END = 0.9;

/** The scenes with sounds of their own enough not to want the crickets at night (Tom): the mower, the sprinklers, the broom. */
const LOUD = new Set(['mowing', 'emblem', 'dugouts']);
/** How often the crickets' few chirps come at night (ms): about three times in a ground's 40 s, a long pause between. */
const CRICKETS_EVERY = 13_000;

/** The mower (Tom's note 14): a band's time, mowing it and driving across to the next (ms), and the drive's share of it. */
const MOW_BAND = 10_000;
const MOW_TURN = 1500;

/**
 * A ground on the tour: its team, kits (the match kit, and training wear), squad.
 * @typedef {{ team: { id: string, colours: { primary: string, secondary: string } }, kits: { home: import('./kits.js').Kit, away: import('./kits.js').Kit }, wear: { home: import('./kits.js').Kit, away: import('./kits.js').Kit }, keepers: string[], outfield: string[], roster: string[], keeperSlot: string }} Ground
 * @typedef {import('./formation.js').Placed & { arms?: import('./pitch.js').Arms }} Placed
 * @typedef {import('./pitch.js').Person} Person
 */

/** @param {string} id @param {string} slot @param {number} x @param {number} y @returns {Placed} */
const placed = (id, slot, x, y) => ({ playerId: id, slot, side: 'home', x, y });
/** @param {{ x: number, y: number }} a @param {{ x: number, y: number }} b @param {number} f */
const lerp = (a, b, f) => ({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f });
const ease = (/** @type {number} */ f) => { const c = Math.min(1, Math.max(0, f)); return c * c * (3 - 2 * c); };
/** A seeded number for a key. @param {string} key */
const seeded = (key) => createRng(`grounds|${key}`).float(0, 1);
/**
 * Where someone is along timed keyframes ([seconds, point], looping every `loop` seconds), and whether they're moving.
 * @param {[number, { x: number, y: number }][]} keys @param {number} t ms @param {number} loop s
 */
function along(keys, t, loop) {
  const s = (t / 1000) % loop;
  for (let i = 0; i + 1 < keys.length; i++) {
    const [a, pa] = keys[i];
    const [b, pb] = keys[i + 1];
    if (s >= a && s < b) {
      const moving = pa.x !== pb.x || pa.y !== pb.y;
      return { ...lerp(pa, pb, moving ? ease((s - a) / (b - a)) : 0), moving };
    }
  }
  return { ...keys[keys.length - 1][1], moving: false };
}

/** The coach in a tracksuit; the manager in their suit; the groundstaff in hi-vis. */
const coachLook = (/** @type {any} */ team) => ({ shirt: PALETTE.tracksuit, trim: team.colours.primary, trousers: PALETTE.tracksuit, skinKey: `coach|${team.id}` });
const managerLook = (/** @type {any} */ team) => ({ shirt: PALETTE.suit, trim: PALETTE.suit, trousers: PALETTE.suit, tie: team.colours.primary, knot: team.colours.secondary, skinKey: `manager|${team.id}` });
const staffLook = (/** @type {string} */ who) => ({ shirt: PALETTE.staffVest, trim: PALETTE.staffVest, trousers: '#3a3f4a', skinKey: `staff|${who}` });

/** A ball on the turf (or `lift` px up), in stage px inside the ground. @param {CanvasRenderingContext2D} c */
function ball(c, /** @type {{ x: number, y: number }} */ p, lift = 0) {
  const s = toStage(p);
  c.fillStyle = 'rgb(0 0 0 / 0.3)';
  c.fillRect(s.x - 1, s.y, 3, 1);
  c.fillStyle = PALETTE.ballEdge;
  c.fillRect(s.x - 1, s.y - 3 - lift, 3, 3);
  c.fillStyle = PALETTE.heatCool;
  c.fillRect(s.x, s.y - 2 - lift, 1, 1);
}

/** A cone on the turf. @param {CanvasRenderingContext2D} c @param {{ x: number, y: number }} p */
function cone(c, p) {
  const s = toStage(p);
  c.fillStyle = PALETTE.cone;
  c.fillRect(s.x, s.y - 2, 1, 1);
  c.fillRect(s.x - 1, s.y - 1, 3, 1);
}

/** A whistle's blast beside someone's head: a few white strokes. @param {CanvasRenderingContext2D} c @param {{ x: number, y: number }} p */
function whistle(c, p) {
  const s = toStage(p);
  c.fillStyle = PALETTE.line;
  c.fillRect(s.x + 4, s.y - 9, 2, 1);
  c.fillRect(s.x + 5, s.y - 11, 2, 1);
  c.fillRect(s.x + 5, s.y - 7, 2, 1);
}

/** A little speech bubble over someone's head. @param {CanvasRenderingContext2D} c @param {{ x: number, y: number }} p */
function talking(c, p, /** @type {number} */ t) {
  const s = toStage(p);
  const x = s.x - 3;
  const y = s.y - 17;
  c.fillStyle = PALETTE.line;
  c.fillRect(x, y, 8, 5);
  c.fillRect(x + 2, y + 5, 1, 1);
  c.fillStyle = '#2b2f3a';
  const dots = 1 + (Math.floor(t / 300) % 3);
  for (let i = 0; i < dots; i++) c.fillRect(x + 1 + i * 2 + i, y + 2, 1, 1);
}

// ——— Training ———

/** Shooting: the keeper facing a queue of shooters and playing each ball back; pairs passing; one on a lap; the coach. */
function shooting(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t) {
  const moving = /** @type {Placed[]} */ ([]);
  const still = /** @type {Placed[]} */ ([]);
  const balls = /** @type {{ p: { x: number, y: number }, lift: number }[]} */ ([]);
  const [k0, k1] = g.keepers;
  const shooters = g.outfield.slice(0, 3);
  const passers = g.outfield.slice(3, 7);
  const lapper = g.outfield[7];
  // One shot every SHOT ms: the shooter runs in with the ball (to 0.45), shoots (to 0.62), the keeper holds it (to 0.7)
  // and rolls it out to the next in the queue (to 0.92), who has it at their feet for their own run.
  const SHOT = 4000;
  const n = Math.floor(t / SHOT);
  const f = (t % SHOT) / SHOT;
  const aim = 0.5 + (seeded(`${g.team.id}|aim|${n}`) - 0.5) * 0.16;
  const from = { x: 0.2, y: 0.5 + (seeded(`${g.team.id}|run|${n}`) - 0.5) * 0.3 };
  const queue = (/** @type {number} */ k) => ({ x: 0.34 + 0.035 * k, y: 0.5 });
  const ky = f < 0.4 ? 0.5 : 0.5 + (aim - 0.5) * ease((f - 0.4) / 0.2) * (f < 0.8 ? 1 : 1 - ease((f - 0.8) / 0.2));
  const keeperAt = { x: 0.035, y: ky };
  shooters.forEach((id, i) => {
    const turn = (i - (n % shooters.length) + shooters.length) % shooters.length;
    if (turn === 0) {
      const p = f < 0.45 ? lerp(queue(0), from, ease(f / 0.45)) : f < 0.6 ? from : lerp(from, queue(shooters.length - 1), ease((f - 0.6) / 0.4));
      (f >= 0.45 && f < 0.6 ? still : moving).push(placed(id, 'S', p.x, p.y));
      if (f < 0.45) balls.push({ p: { x: p.x - 0.012, y: p.y }, lift: 0 });
    } else {
      const at = queue(turn - 1 + (f < 0.45 ? 1 - ease(f / 0.45) : 0));
      still.push(placed(id, 'S', at.x, at.y));
    }
  });
  // The ball after the shot: in flight, in the keeper's hands, rolled out to the next shooter.
  if (f >= 0.45 && f < 0.62) {
    const q = (f - 0.45) / 0.17;
    balls.push({ p: lerp(from, { x: 0.03, y: aim }, q), lift: Math.round(Math.sin(q * Math.PI) * 4) });
  } else if (f >= 0.62 && f < 0.7) balls.push({ p: { x: keeperAt.x + 0.01, y: keeperAt.y }, lift: 4 });
  else if (f >= 0.7) balls.push({ p: lerp({ x: keeperAt.x + 0.01, y: keeperAt.y }, { x: queue(0).x - 0.012, y: queue(0).y }, ease((f - 0.7) / 0.22)), lift: 0 });
  if (k0) {
    const k = placed(k0, g.keeperSlot, keeperAt.x, keeperAt.y);
    if (f > 0.55 && f < 0.72) k.arms = 'both';
    still.push(k);
  }
  if (k1) still.push(placed(k1, g.keeperSlot, 0.965, 0.5));
  // Passing in pairs in the other half, each pair on its own beat.
  for (let i = 0; i + 1 < passers.length; i += 2) {
    const y = 0.3 + 0.4 * (i / 2);
    const a = { x: 0.6, y };
    const b = { x: 0.82, y: y + 0.04 };
    still.push(placed(passers[i], 'M', a.x, a.y), placed(passers[i + 1], 'M', b.x, b.y));
    const PASS = 1800;
    const k = Math.floor((t + i * 600) / PASS);
    const q = ((t + i * 600) % PASS) / PASS;
    const [p0, p1] = k % 2 ? [b, a] : [a, b];
    balls.push({ p: lerp({ x: p0.x + (k % 2 ? -0.012 : 0.012), y: p0.y }, { x: p1.x + (k % 2 ? 0.012 : -0.012), y: p1.y }, ease(Math.min(1, q / 0.5))), lift: 0 });
  }
  // One on a lap round the pitch's edge (40 s, ten shots): up the left side they stop short of the shooting, wait for
  // the shot to go in and cross while the keeper has the ball.
  if (lapper) {
    const p = along([
      [0, { x: 0.06, y: 0.06 }], [13, { x: 0.94, y: 0.06 }], [19, { x: 0.94, y: 0.94 }], [31, { x: 0.06, y: 0.94 }],
      [33.4, { x: 0.06, y: 0.74 }], [34.6, { x: 0.06, y: 0.74 }], [36.2, { x: 0.06, y: 0.26 }], [37.6, { x: 0.06, y: 0.06 }], [40, { x: 0.06, y: 0.06 }],
    ], t, 40);
    (p.moving ? moving : still).push(placed(lapper, 'D', p.x, p.y));
  }
  for (let i = 0; i < 6; i++) cone(c, { x: 0.24 + 0.035 * i, y: 0.8 });
  drawPlayers(c, still, g.kits, g.keeperSlot, t, { idle: true, people: [{ x: 0.3, y: 0.88, walking: false, look: coachLook(g.team) }] });
  drawPlayers(c, moving, g.kits, g.keeperSlot, t);
  for (const b of balls) ball(c, b.p, b.lift);
}

/** The keepers' drills: a coach playing balls in at each goal, the keeper diving; the rest stretching in the circle. */
function keepers(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t) {
  const still = /** @type {Placed[]} */ ([]);
  const people = /** @type {Person[]} */ ([]);
  const DRILL = 2600;
  g.keepers.slice(0, 2).forEach((id, side) => {
    const left = side === 0;
    const off = side * 1300;
    const n = Math.floor((t + off) / DRILL);
    const f = ((t + off) % DRILL) / DRILL;
    const aim = 0.5 + (seeded(`${g.team.id}|keep|${side}|${n}`) - 0.5) * 0.22;
    const gx = left ? 0.035 : 0.965;
    const coach = { x: left ? 0.17 : 0.83, y: 0.5 };
    people.push({ ...coach, walking: false, look: coachLook(g.team) });
    const ky = f < 0.25 ? 0.5 : f < 0.7 ? 0.5 + (aim - 0.5) * ease((f - 0.25) / 0.2) : 0.5 + (aim - 0.5) * (1 - ease((f - 0.7) / 0.3));
    const k = placed(id, g.keeperSlot, gx, ky);
    if (f > 0.4 && f < 0.7) k.arms = 'both';
    still.push(k);
    if (f < 0.45) {
      const q = Math.max(0, (f - 0.2) / 0.25);
      ball(c, lerp({ x: coach.x + (left ? -0.012 : 0.012), y: coach.y }, { x: gx + (left ? 0.012 : -0.012), y: aim }, q), Math.round(Math.sin(q * Math.PI) * 3));
    } else if (f > 0.75) ball(c, lerp({ x: gx, y: ky }, { x: coach.x, y: coach.y }, (f - 0.75) / 0.25), 0);
  });
  g.outfield.forEach((id, i) => {
    const a = (i / g.outfield.length) * 2 * Math.PI;
    still.push(placed(id, 'M', 0.5 + Math.cos(a) * 0.07, 0.5 + Math.sin(a) * 0.15));
  });
  drawPlayers(c, still, g.kits, g.keeperSlot, t, { idle: true, people });
}

/** A chat: two outfielders talking by the centre circle, a ball at their feet, one flicking it up now and then. */
function chat(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t) {
  const [a, b] = g.outfield;
  const pa = { x: 0.6, y: 0.36 };
  const pb = { x: 0.635, y: 0.4 };
  // The ball at the second one's right foot: at rest, then kept up for a few touches every so often, a kick for each.
  const JUGGLE = 7000;
  const q = (t % JUGGLE) / JUGGLE;
  const keepUp = q > 0.5 && q < 0.86;
  const touches = 5;
  const r = keepUp ? ((q - 0.5) / 0.36) * touches : 0;
  const lift = keepUp ? Math.round(Math.sin((r % 1) * Math.PI) * 9) : 0;
  const kicking = keepUp && (r % 1 < 0.12 || r % 1 > 0.92);
  drawPlayers(c, [placed(a, 'M', pa.x, pa.y)], g.kits, g.keeperSlot, t, { idle: true });
  /** @type {import('./poses.js').PlayerPose} */
  const pose = kicking ? { kind: 'kick', dir: 1, shot: false } : { kind: 'run', step: 'stand' };
  drawPlayers(c, [placed(b, 'M', pb.x, pb.y)], g.kits, g.keeperSlot, t, { poseOf: () => pose });
  ball(c, { x: pb.x + 0.009, y: pb.y + 0.004 }, lift);
  // Whoever's talking: turn and turn about.
  talking(c, Math.floor(t / 1800) % 2 ? pb : pa, t);
  // A bag of balls by the dugout.
  const s = toStage({ x: 0.4, y: 0.04 });
  c.fillStyle = '#2b2f3a';
  c.fillRect(s.x - 3, s.y - 4, 7, 5);
  c.fillStyle = PALETTE.line;
  for (const [dx, dy] of [[-2, -3], [0, -4], [2, -3]]) c.fillRect(s.x + dx, s.y + dy, 1, 1);
}

/** Drills round the cones: a slalom and sprints between two lines, both on the manager's whistle. */
function cones(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t) {
  const moving = /** @type {Placed[]} */ ([]);
  const still = /** @type {Placed[]} */ ([]);
  const BLAST = 3200;
  const n = Math.floor(t / BLAST);
  const f = (t % BLAST) / BLAST;
  const slalom = g.outfield.slice(0, 4);
  const sprint = g.outfield.slice(4, 8);
  for (let i = 0; i < 6; i++) cone(c, { x: 0.22 + 0.05 * i, y: 0.42 });
  for (const x of [0.62, 0.86]) for (let i = 0; i < 4; i++) cone(c, { x, y: 0.3 + 0.1 * i + 0.02 });
  // The slalom: one sets off on each whistle, weaving through the cones, and jogs back down the side.
  slalom.forEach((id, i) => {
    const k = (n - i + slalom.length * 100) % slalom.length;
    const q = (k + f) / slalom.length;
    if (q < 0.5) {
      const r = q / 0.5;
      const x = 0.17 + r * 0.33;
      moving.push(placed(id, 'M', x, 0.42 + Math.sin(((x - 0.22) / 0.05) * Math.PI) * 0.035));
    } else if (q < 0.8) {
      const p = lerp({ x: 0.52, y: 0.55 }, { x: 0.17, y: 0.55 }, ease((q - 0.5) / 0.3));
      moving.push(placed(id, 'M', p.x, p.y));
    } else {
      // Waiting their turn at the start.
      still.push(placed(id, 'M', 0.17 - (1 - (q - 0.8) / 0.2) * 0.04, 0.42));
    }
  });
  // The sprints: all four from one line to the other on each whistle, then wait.
  sprint.forEach((id, i) => {
    const y = 0.3 + 0.1 * i + 0.02;
    const [x0, x1] = n % 2 ? [0.86, 0.62] : [0.62, 0.86];
    const x = f < 0.35 ? x0 + (x1 - x0) * ease(f / 0.35) : x1;
    (f < 0.35 ? moving : still).push(placed(id, 'M', x, y));
  });
  // The manager on the touchline, whistle up for each start.
  const m = { x: 0.5, y: 0.88 };
  const blowing = f < 0.12;
  drawPlayers(c, still, g.kits, g.keeperSlot, t, { idle: true, people: [{ ...m, walking: false, look: { ...managerLook(g.team), arms: blowing ? 'right' : 'none' } }] });
  drawPlayers(c, moving, g.kits, g.keeperSlot, t);
  if (blowing) whistle(c, m);
  // The keepers rest by the goals.
  drawPlayers(c, g.keepers.slice(0, 2).map((id, i) => placed(id, g.keeperSlot, i ? 0.95 : 0.05, 0.5)), g.kits, g.keeperSlot, t, { idle: true });
}

/** Cardio as a team, in training wear: rows of them jumping jacks, high knees and side steps with the coach in front. */
function cardio(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t) {
  const EXERCISE = 6000;
  const which = Math.floor(t / EXERCISE) % 3;
  const beat = Math.floor(t / 320) % 2;
  const rows = g.roster.slice(0, 10).map((id, i) => ({ id, x: 0.38 + 0.06 * (i % 5), y: 0.36 + 0.18 * Math.floor(i / 5) }));
  const coach = { x: 0.5, y: 0.82 };
  const at = (/** @type {{ x: number, y: number }} */ p, /** @type {number} */ i) => {
    if (which === 2) return { x: p.x + Math.sin(t / 380 + i * 0.2) * 0.018, y: p.y };
    if (which === 1) return { x: p.x, y: p.y - (beat ^ (i % 2)) * 0.012 };
    return p;
  };
  const people = /** @type {Person[]} */ ([{ ...at(coach, 0), walking: which !== 0, look: { ...coachLook(g.team), arms: which === 0 && beat ? 'both' : 'none' } }]);
  const team = rows.map((r, i) => {
    const p = at(r, i);
    const q = placed(r.id, 'M', p.x, p.y);
    if (which === 0 && beat) q.arms = 'both';
    return q;
  });
  // Jumping jacks: arms up and down on the beat, standing; high knees and side steps: on the move.
  drawPlayers(c, team, g.wear, g.keeperSlot, which === 0 ? 0 : t * 1.6, { idle: which === 0, people });
}

// ——— The groundstaff ———

/** The sprinklers: two arms turning, a spray of drops along each. @param {CanvasRenderingContext2D} c */
function sprinklers(c, /** @type {number} */ t) {
  for (const [sx, sy, dir] of [[0.25, 0.5, 1], [0.75, 0.5, -1]]) {
    const s = toStage({ x: sx, y: sy });
    const a = (dir * t) / 700;
    c.fillStyle = '#2b3240';
    c.fillRect(s.x - 1, s.y - 1, 2, 2);
    for (const arm of [0, Math.PI]) {
      for (let r = 4; r < 26; r += 2) {
        const jit = Math.sin(r * 1.7 + t / 90) * 0.08;
        c.fillStyle = `rgb(207 232 255 / ${(0.85 - r / 32).toFixed(2)})`;
        c.fillRect(Math.round(s.x + Math.cos(a + arm + jit) * r), Math.round(s.y + Math.sin(a + arm + jit) * r * 0.55), 1, 1);
      }
    }
  }
}

/**
 * Mowing: a mower striping the turf band by band, the sprinklers turning. Down one band and up the next, back and forth
 * across the pitch (0 to 9, then 8 to 0, …), MOW_BAND ms a band (Tom: a bit slower), the last MOW_TURN of them spent
 * driving across at the end to the next band's middle (Tom: not jumping there). The fresh cut is this pass's bands.
 */
function mowing(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t) {
  const stripes = 10;
  const cycle = 2 * (stripes - 1);
  const tt = t + Math.floor(seeded(`${g.team.id}|mow`) * cycle) * MOW_BAND;
  const step = Math.floor(tt / MOW_BAND) % cycle;
  /** The band at a step of the back-and-forth. @param {number} k */
  const bandAt = (k) => { const m = ((k % cycle) + cycle) % cycle; return m < stripes ? m : cycle - m; };
  const band = bandAt(step);
  const next = bandAt(step + 1);
  const into = tt % MOW_BAND;
  const mowMs = MOW_BAND - MOW_TURN;
  const f = Math.min(1, into / mowMs);
  const turning = into >= mowMs;
  const down = step % 2 === 0;
  const sw = PITCH.w / stripes;
  // The fresh cut: the bands done since the mower last turned round at an end of the pitch, and this one so far.
  const outward = step < stripes;
  c.fillStyle = 'rgb(140 230 120 / 0.28)';
  for (let i = 0; i < stripes; i++) {
    if (outward ? i >= band : i <= band) continue;
    c.fillRect(PITCH.x + Math.round(i * sw), PITCH.y, Math.round((i + 1) * sw) - Math.round(i * sw), PITCH.h);
  }
  const done = Math.round(f * PITCH.h);
  c.fillRect(PITCH.x + Math.round(band * sw), down ? PITCH.y : PITCH.y + PITCH.h - done, Math.round((band + 1) * sw) - Math.round(band * sw), done);
  sprinklers(c, t);
  // Along the band, then across at its end to the next one's middle.
  const across = turning ? ease((into - mowMs) / MOW_TURN) : 0;
  const mower = { x: (band + 0.5 + (next - band) * across) / stripes, y: down ? f : 1 - f };
  const ms = toStage(mower);
  c.fillStyle = '#c23b2a';
  if (turning) {
    // Side on while it drives across, the driver behind it.
    const dir = Math.sign(next - band) || 1;
    c.fillRect(ms.x - 2, ms.y - 4, 5, 6);
    c.fillStyle = '#8a8f99';
    c.fillRect(ms.x - 2 - dir * 2, ms.y - 3, 1, 4);
    drawPlayers(c, [], g.kits, g.keeperSlot, t, { people: [{ x: mower.x - dir * 0.022, y: mower.y + (down ? 0.01 : 0.02), walking: true, look: staffLook(`${g.team.id}|mow`) }] });
    return;
  }
  const my = ms.y + (down ? 2 : -6);
  c.fillRect(ms.x - 3, my, 7, 4);
  c.fillStyle = '#8a8f99';
  c.fillRect(ms.x - 2, my + (down ? 4 : -1), 5, 1);
  drawPlayers(c, [], g.kits, g.keeperSlot, t, { people: [{ x: mower.x, y: mower.y + (down ? -0.02 : 0.05), walking: true, look: staffLook(`${g.team.id}|mow`) }] });
}

/**
 * The lines: a painter redoing halfway (faded ahead of them), another the bottom touchline, each in one pass over the
 * ground's time on screen (Tom: not over and over), done just before it ends.
 */
function lines(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t, /** @type {Span} */ span) {
  const p = passAt(t, span);
  const hx = PITCH.x + Math.round(PITCH.w / 2) - 1;
  const at = PITCH.y + Math.round(p * PITCH.h);
  // Faded ahead: turf laid thinly over the old line.
  c.fillStyle = 'rgb(63 174 74 / 0.75)';
  c.fillRect(hx - 1, at + 3, 4, PITCH.y + PITCH.h - at - 3);
  const tx = PITCH.x + Math.round(p * PITCH.w);
  c.fillStyle = 'rgb(63 174 74 / 0.7)';
  c.fillRect(tx + 3, PITCH.y + PITCH.h - 2, PITCH.x + PITCH.w - tx - 3, 3);
  const painters = [{ x: 0.512, y: p }, { x: p, y: 0.985 }];
  c.fillStyle = PALETTE.line;
  for (const q of painters) {
    const s = toStage(q);
    c.fillRect(s.x - 2, s.y + 1, 3, 2);
  }
  drawPlayers(c, [], g.kits, g.keeperSlot, t, { people: [
    { x: painters[0].x + 0.01, y: painters[0].y - 0.02, walking: p < 1, look: staffLook(`${g.team.id}|paint`) },
    { x: painters[1].x - 0.012, y: painters[1].y + 0.01, walking: p < 1, look: staffLook(`${g.team.id}|paint2`) },
  ] });
}

/** The emblem: the centre circle's emblem repainted, faded where the painter hasn't been yet, once round over the ground's time on screen. */
function emblem(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t, /** @type {Span} */ span) {
  const q = passAt(t, span);
  const cx = PITCH.x + PITCH.w / 2;
  const cy = PITCH.y + PITCH.h / 2;
  const start = -Math.PI / 2;
  const angle = start + q * 2 * Math.PI;
  c.save();
  c.beginPath();
  c.moveTo(cx, cy);
  if (q < 1) {
    c.arc(cx, cy, 23, angle, start + 2 * Math.PI);
    c.closePath();
    c.fillStyle = 'rgb(63 174 74 / 0.6)';
    c.fill();
  }
  c.restore();
  // The painter kneels at the edge of what's done, a pot of paint in the club's colour beside them.
  const kx = (cx + Math.cos(angle) * 26 - PITCH.x) / PITCH.w;
  const ky = (cy + Math.sin(angle) * 26 - PITCH.y) / PITCH.h;
  const pot = toStage({ x: kx + 0.015, y: ky + 0.01 });
  c.fillStyle = g.team.colours.primary;
  c.fillRect(pot.x - 1, pot.y - 2, 3, 3);
  drawPlayers(c, [], g.kits, g.keeperSlot, t, { people: [{ x: kx, y: ky, walking: false, look: { ...staffLook(`${g.team.id}|emblem`), arms: q < 1 && Math.floor(t / 400) % 2 ? 'right' : 'none' } }] });
  sprinklers(c, t + 400);
}

/** The nets: one of the staff mending a hole in a net, arms up, a toolbox by the post; another checking the far goal. */
function nets(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t) {
  const MEND = 9000;
  const q = (t % MEND) / MEND;
  // The hole: a dark gap in the left net, smaller as it's mended, a new one found elsewhere after.
  const n = Math.floor(t / MEND);
  const hy = PITCH.y + PITCH.h / 2 - 12 + Math.round(seeded(`${g.team.id}|net|${n}`) * 20);
  const size = Math.max(0, Math.round(5 * (1 - q / 0.8)));
  const nx = PITCH.x - 4 - 10;
  if (size > 0) {
    c.fillStyle = PALETTE.netBack;
    c.fillRect(nx + 2, hy, Math.min(6, size + 1), size);
  }
  const hole = { x: (nx + 5 - PITCH.x) / PITCH.w, y: (hy + 8 - PITCH.y) / PITCH.h };
  const box = toStage({ x: 0.012, y: 0.36 });
  c.fillStyle = '#b8402e';
  c.fillRect(box.x - 2, box.y - 2, 5, 3);
  const far = along([[0, { x: 1.025, y: 0.4 }], [4, { x: 1.025, y: 0.6 }], [6, { x: 1.025, y: 0.6 }], [10, { x: 1.025, y: 0.4 }], [12, { x: 1.025, y: 0.4 }]], t, 12);
  drawPlayers(c, [], g.kits, g.keeperSlot, t, { people: [
    { x: hole.x, y: hole.y, walking: false, look: { ...staffLook(`${g.team.id}|nets`), arms: q < 0.8 ? (Math.floor(t / 350) % 2 ? 'both' : 'right') : 'none' } },
    { x: far.x, y: far.y, walking: far.moving, look: staffLook(`${g.team.id}|nets2`) },
  ] });
}

/** The dugouts: one of the staff sweeping each dugout out, a puff of dust now and then. */
function dugouts(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t) {
  const people = /** @type {Person[]} */ ([]);
  for (const side of /** @type {const} */ (['home', 'away'])) {
    const a = seat(side, 0);
    const b = seat(side, 4);
    const p = along([[0, a], [5, b], [6, b], [11, a], [12, a]], t + (side === 'away' ? 3000 : 0), 12);
    people.push({ x: p.x, y: p.y + 0.02, walking: p.moving, look: staffLook(`${g.team.id}|dug|${side}`) });
    const s = toStage({ x: p.x, y: p.y + 0.02 });
    // The broom, and the dust it raises.
    c.fillStyle = '#8a6a4a';
    c.fillRect(s.x + 3, s.y - 4, 1, 4);
    if (p.moving && Math.floor(t / 250) % 3 === 0) {
      c.fillStyle = 'rgb(216 212 200 / 0.6)';
      c.fillRect(s.x + 4, s.y - 1, 2, 1);
      c.fillRect(s.x + 6, s.y - 2, 1, 1);
    }
  }
  // A pile of what's been swept up, by the tunnel.
  const pile = toStage({ x: 0.45, y: -0.01 });
  c.fillStyle = '#5b6170';
  c.fillRect(pile.x - 2, pile.y - 1, 4, 2);
  drawPlayers(c, [], g.kits, g.keeperSlot, t, { people });
}


// ——— More scenes (Tom, 2026-10-19: enough that a night tour of eight shows eight; groundstour.html round 4) ———

/** The manager alone by the tunnel with a clipboard: pacing a few steps, stopping to write, looking out at the pitch. */
function manager(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t) {
  const p = along([[0, { x: 0.45, y: 0.07 }], [3, { x: 0.45, y: 0.07 }], [7, { x: 0.56, y: 0.08 }], [12, { x: 0.56, y: 0.08 }], [16, { x: 0.45, y: 0.07 }], [20, { x: 0.45, y: 0.07 }]], t + Math.floor(seeded(`${g.team.id}|mgr`) * 20) * 1000, 20);
  const writing = !p.moving && Math.floor(t / 700) % 3 !== 0;
  drawPlayers(c, [], g.kits, g.keeperSlot, t, { people: [{ x: p.x, y: p.y, walking: p.moving, look: { ...managerLook(g.team), arms: writing ? 'right' : 'none' } }] });
  // The clipboard at their side, held up while they write.
  const s = toStage(p);
  c.fillStyle = '#8a6a4a';
  c.fillRect(s.x + 3, s.y - (writing ? 9 : 6), 3, 4);
  c.fillStyle = PALETTE.line;
  c.fillRect(s.x + 3, s.y - (writing ? 8 : 5), 3, 2);
}

/**
 * The name on the turf: the club's name under the pitch repainted, one pass along it over the ground's time on screen,
 * faded ahead of the painter (drawn over the lettering once it's drawn: AFTER_TURF). On the pitch, a pot of paint.
 */
function turfName(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g) {
  const s = toStage({ x: 0.02, y: 1.02 });
  c.fillStyle = g.team.colours.primary;
  c.fillRect(s.x, s.y, 3, 3);
}
/**
 * The turf's lettering faded ahead of the painter, and the painter kneeling at work (stage px, no transform).
 * @param {CanvasRenderingContext2D} c @param {Ground} g @param {number} t @param {Span} span
 * @param {{ shift: number, rows: { y: number, h: number } }} at  Where the ground is, and the turf's rows (Broadcast's or Full's).
 */
function turfNameAfter(c, g, t, span, { shift, rows }) {
  const name = /** @type {any} */ (g.team).name.toUpperCase();
  const width = name.length * 13 - 3;
  const mid = shift + PITCH.x + PITCH.w / 2;
  const left = Math.round(mid - width / 2);
  const q = passAt(t, span);
  const x = Math.round(left + q * width);
  if (q < 1) {
    c.fillStyle = 'rgb(44 125 55 / 0.78)';
    c.fillRect(x, rows.y, left + width - x + 1, rows.h);
  }
  c.save();
  c.translate(shift, 0);
  const y = (rows.y + rows.h / 2 + 4 - PITCH.y) / PITCH.h;
  drawPlayers(c, [], g.kits, g.keeperSlot, t, { people: [{ x: (x - shift - PITCH.x) / PITCH.w, y, walking: false, look: { ...staffLook(`${g.team.id}|turf`), arms: q < 1 && Math.floor(t / 350) % 2 ? 'right' : 'none' } }] });
  c.restore();
}

/** Litter: two of the crew by the tunnel with a wheelie bin, one bringing bags down from the stands; more in the stands (IN_STANDS). */
function litter(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t) {
  const bin = toStage({ x: 0.43, y: 0.05 });
  c.fillStyle = '#2f5b3a';
  c.fillRect(bin.x - 3, bin.y - 7, 6, 7);
  c.fillStyle = '#244a2e';
  c.fillRect(bin.x - 3, bin.y - 8, 6, 1);
  const carrier = along([[0, { x: 0.6, y: 0.02 }], [4, { x: 0.45, y: 0.06 }], [5, { x: 0.45, y: 0.06 }], [9, { x: 0.6, y: 0.02 }], [11, { x: 0.6, y: 0.02 }]], t, 11);
  drawPlayers(c, [], g.kits, g.keeperSlot, t, { people: [
    { x: 0.41, y: 0.07, walking: false, look: { ...staffLook(`${g.team.id}|bin`), arms: Math.floor(t / 900) % 4 === 0 ? 'right' : 'none' } },
    { x: carrier.x, y: carrier.y, walking: carrier.moving, look: staffLook(`${g.team.id}|bag`) },
  ] });
  // The bag they carry down to the bin.
  if (carrier.x > 0.46) {
    const b = toStage(carrier);
    c.fillStyle = '#14161c';
    c.fillRect(b.x + 3, b.y - 5, 3, 4);
  }
}
/**
 * Litter in the stands (Broadcast): a few of the crew along the rows with their bags, stooping now and then.
 * @param {CanvasRenderingContext2D} c @param {Ground} g @param {number} t @param {number} standsShift
 */
function litterStands(c, g, t, standsShift) {
  const spots = [{ x: 60, y: 14 }, { x: 190, y: 8 }, { x: 330, y: 14 }, { x: standsShift + 394 + 20, y: 120 }, { x: standsShift - 22, y: 170 }, { x: 250, y: 258 }];
  spots.forEach((sp, i) => {
    const x = Math.round(sp.x + Math.sin(t / 2600 + i * 1.7) * 14);
    const stoop = Math.floor((t + i * 500) / 1200) % 3 === 0 ? 1 : 0;
    c.fillStyle = '#3a3f4a';
    c.fillRect(x - 1, sp.y + 1, 3, 2);
    c.fillStyle = PALETTE.staffVest;
    c.fillRect(x - 1, sp.y - 2 + stoop, 3, 3);
    c.fillStyle = PALETTE.skin2;
    c.fillRect(x, sp.y - 3 + stoop, 1, 1);
    c.fillStyle = '#14161c';
    c.fillRect(x + 2, sp.y, 2, 2);
  });
}

/** A lone lap: one outfielder in training wear jogging round inside the boards (at night too, under the lights). */
function lap(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t) {
  const LAP = 36;
  const id = g.outfield[Math.floor(seeded(`${g.team.id}|lap`) * g.outfield.length)] ?? g.roster[0];
  const p = along([[0, { x: 0.04, y: 0.05 }], [12, { x: 0.96, y: 0.05 }], [18, { x: 0.96, y: 0.95 }], [30, { x: 0.04, y: 0.95 }], [36, { x: 0.04, y: 0.05 }]], t + Math.floor(seeded(`${g.team.id}|lapat`) * LAP) * 1000, LAP);
  drawPlayers(c, [placed(id, 'M', p.x, p.y)], g.wear, g.keeperSlot, t);
}

/** The goalmouth re-turfed: two of the crew in front of a goal laying new squares one by one, a wheelbarrow of turf. */
function goalmouth(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t, /** @type {Span} */ span) {
  const left = seeded(`${g.team.id}|mouth`) < 0.5;
  const q = passAt(t, span);
  const cols = 4;
  const rows = 6;
  const size = 5;
  const x0 = left ? PITCH.x + 3 : PITCH.x + PITCH.w - 3 - cols * size;
  const y0 = Math.round(PITCH.y + PITCH.h / 2 - (rows * size) / 2);
  // The bare patch, then the squares laid so far (new turf a shade darker, its edges showing).
  c.fillStyle = '#8a6a4a';
  c.fillRect(x0, y0, cols * size, rows * size);
  const laid = Math.floor(q * cols * rows);
  for (let k = 0; k < laid; k++) {
    const col = left ? Math.floor(k / rows) : cols - 1 - Math.floor(k / rows);
    c.fillStyle = '#2f9a3c';
    c.fillRect(x0 + col * size, y0 + (k % rows) * size, size - 1, size - 1);
  }
  const k = Math.min(laid, cols * rows - 1);
  const col = left ? Math.floor(k / rows) : cols - 1 - Math.floor(k / rows);
  const at = { x: (x0 + col * size + 2 + (left ? size + 3 : -3) - PITCH.x) / PITCH.w, y: (y0 + (k % rows) * size + 6 - PITCH.y) / PITCH.h };
  const home = { x: left ? 0.12 : 0.88, y: 0.6 };
  const barrow = toStage({ x: left ? 0.14 : 0.86, y: 0.62 });
  c.fillStyle = '#5b6170';
  c.fillRect(barrow.x - 4, barrow.y - 3, 8, 4);
  c.fillStyle = '#2f9a3c';
  c.fillRect(barrow.x - 3, barrow.y - 4, 6, 2);
  const fetch = along([[0, home], [3, at], [5, at], [8, home], [9, home]], t, 9);
  drawPlayers(c, [], g.kits, g.keeperSlot, t, { people: [
    { x: at.x, y: at.y, walking: false, look: { ...staffLook(`${g.team.id}|turf1`), arms: q < 1 && Math.floor(t / 450) % 2 ? 'both' : 'none' } },
    { x: q < 1 ? fetch.x : home.x, y: q < 1 ? fetch.y : home.y, walking: q < 1 && fetch.moving, look: staffLook(`${g.team.id}|turf2`) },
  ] });
}

/** The night watch: a security guard walking the bottom touchline with a torch, its beam sweeping the turf ahead (nights only). */
function guard(/** @type {CanvasRenderingContext2D} */ c, /** @type {Ground} */ g, /** @type {number} */ t, /** @type {Span} */ span) {
  // Very slowly (Tom): along the touchline from a seeded end, stopping at the end of the walk (the walkie-talkie, Tom),
  // then turning back.
  const out = seeded(`${g.team.id}|guard`) < 0.5 ? 1 : -1;
  const x0 = out > 0 ? 0.12 : 0.88;
  const f = Math.min(1, Math.max(0, (t - span.from) / Math.max(1, span.until - span.from)));
  const walkBack = f >= GUARD.turn;
  const dir = walkBack ? -out : out;
  const far = x0 + out * GUARD.reach;
  const x = f < GUARD.stop ? x0 + out * GUARD.reach * (f / GUARD.stop) : walkBack ? far - out * GUARD.reach * ((f - GUARD.turn) / GUARD.stop) : far;
  const p = { x, y: 0.99 };
  const walking = f < GUARD.stop || walkBack;
  const s = toStage(p);
  // The beam leads, sweeping up the pitch and back.
  const a = -0.55 + Math.sin(t / 900) * 0.35;
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = 'rgb(255 244 200 / 0.18)';
  c.beginPath();
  c.moveTo(s.x + dir * 3, s.y - 6);
  const reach = 46;
  c.lineTo(s.x + dir * (3 + Math.cos(a - 0.22) * reach), s.y - 6 + Math.sin(a - 0.22) * reach);
  c.lineTo(s.x + dir * (3 + Math.cos(a + 0.22) * reach), s.y - 6 + Math.sin(a + 0.22) * reach);
  c.closePath();
  c.fill();
  c.restore();
  // Slow steps too: the stride on half time.
  drawPlayers(c, [], g.kits, g.keeperSlot, t / 2.5, { people: [{ x: p.x, y: p.y, walking, look: { shirt: '#232a3a', trim: '#232a3a', trousers: '#1a1f2c', skinKey: `guard|${g.team.id}`, arms: walking ? (dir > 0 ? 'right' : 'left') : 'both' } }] });
}
/** The night watch's walk, as shares of the ground's time on screen: walking out until `stop`, standing (on the radio) until `turn`, then back; `reach`, how far along the touchline (pitch lengths). */
const GUARD = Object.freeze({ stop: 0.7, turn: 0.8, reach: 0.4 });

/** Each scene's drawing, by its name in groundsTour.js's SCENES. */
export const DRAW_SCENE = Object.freeze({ shooting, keepers, chat, cones, cardio, mowing, lines, emblem, nets, dugouts, manager, turfName, litter, lap, goalmouth, guard });
/** What some scenes draw over the turf's lettering once it's drawn (the name repainted). */
export const AFTER_TURF = Object.freeze({ turfName: turfNameAfter });
/** What some scenes draw in Broadcast's stands, after the crowd (litter picked up). */
export const IN_STANDS = Object.freeze({ litter: litterStands });

/**
 * A scene's sounds between `from` and `until` (Tom's note 14, task 3), timed from the same beats that draw it: each shot,
 * pass and save in training, the manager's whistle, the mower's engine, the sprinklers, the hammer, the broom. `at` is
 * ms from `from`; seeds are the moment's, so every screen plays the same take.
 * At night (Tom), the crickets now and then under all but the scenes with sounds of their own (LOUD).
 * @param {string} scene @param {Ground} g @param {number} from @param {number} until @param {{ night?: boolean }} [o]
 * @returns {import('./sounds.js').Cue[]}
 */
export function sceneCues(scene, g, from, until, { night = false } = {}) {
  /** @type {import('./sounds.js').Cue[]} */
  const cues = [];
  /** @param {number} at @param {import('./soundRecipes.js').SoundKind} kind @param {object} [o] */
  const cue = (at, kind, o = {}) => cues.push({ kind, at: at - from, seed: `grounds|${g.team.id}|${kind}|${at}`, ...o });
  /** Every moment `phase` ms into each `period` (as the scene's \`t % period\`) from `from` to `until`. @param {number} period @param {number} phase @param {(at: number) => void} f */
  const every = (period, phase, f) => {
    const p = ((phase % period) + period) % period;
    for (let k = Math.ceil((from - p) / period); k * period + p < until; k++) f(k * period + p);
  };
  const effect = (/** @type {string} */ name, /** @type {number} */ gain) => (/** @type {number} */ at) => cue(at, 'effect', { effect: name, gain });
  // The two sprinklers' ticks, take after take with no break (Tom), the second half a tick behind the first and quieter.
  const take = Math.round(SPRINKLER_TICKS * SPRINKLER_TICK * 1000);
  const sprinklers = (/** @type {number} */ phase) => {
    every(take, phase, effect('sprinkler', 0.45));
    every(take, phase + Math.round(SPRINKLER_TICK * 500), effect('sprinkler', 0.3));
  };
  if (night && !LOUD.has(scene)) every(CRICKETS_EVERY, 2000, effect('crickets', 1));
  switch (scene) {
    case 'shooting': {
      // The shot (at 0.45 of each), the keeper gathering it (0.62), rolling it out (0.7); the pairs' passes.
      every(4000, 1800, (at) => cue(at, 'shot', { power: 0.4, gain: 0.6 }));
      every(4000, 2480, (at) => cue(at, 'save', { held: true, gain: 0.6 }));
      every(4000, 2800, (at) => cue(at, 'kick', { power: 0.15, gain: 0.5 }));
      for (const i of [0, 2]) if (g.outfield.length >= 5 + i) every(1800, -i * 600, (at) => cue(at, 'kick', { power: 0.3, gain: 0.45 }));
      break;
    }
    case 'keepers':
      // Each coach's ball in (at 0.2 of each drill), the keeper's hands on it (0.45); the second goal half a drill on.
      g.keepers.slice(0, 2).forEach((_, side) => {
        every(2600, 520 - side * 1300, (at) => cue(at, 'kick', { power: 0.45, gain: 0.5 }));
        every(2600, 1170 - side * 1300, (at) => cue(at, 'save', { held: true, gain: 0.55 }));
      });
      break;
    case 'chat':
      // The five touches as the ball's kept up (from half-way through each 7 s).
      for (let j = 0; j < 5; j++) every(7000, 3500 + j * 504, (at) => cue(at, 'kick', { power: 0.05, gain: 0.35 }));
      break;
    case 'cones':
      every(3200, 0, (at) => cue(at, 'whistle', { blast: 'short', gain: 0.35 }));
      break;
    case 'cardio':
      // The coach's whistle as each exercise begins.
      every(6000, 0, (at) => cue(at, 'whistle', { blast: 'short', gain: 0.3 }));
      break;
    case 'mowing':
      every(2600, 0, effect('mower', 0.4));
      sprinklers(0);
      break;
    case 'emblem':
      sprinklers(400);
      break;
    case 'nets':
      // The hammer while the hole's mended (the first 0.8 of each 9 s), a take every 2.4 s.
      for (let k = 0; k < 3; k++) every(9000, k * 2400, effect('tap', 0.5));
      break;
    case 'dugouts':
      // The broom every second while each sweeper is on the move (0–5 s and 6–11 s of their 12; the away side 3 s on).
      for (const off of [0, 3000]) {
        every(1000, 0, (at) => {
          const s = (((at + off) / 1000) % 12 + 12) % 12;
          if (s < 5 || (s >= 6 && s < 11)) effect('broom', 0.2)(at);
        });
      }
      break;
    // Round 4's (Tom): the ads' sounds where they fit, and two of their own.
    case 'litter':
      // The bin's lid each time a bag goes in (the carrier at the bin 4 s into each 11).
      every(11_000, 4000, effect('clunk', 0.3));
      break;
    case 'lap':
      // The runner's footsteps now and then, not every stride.
      every(12_000, 3000, effect('steps', 0.25));
      break;
    case 'manager': {
      // A page turned while they stand writing (1 s and 8 s into their 20, from their own seeded start).
      const offset = Math.floor(seeded(`${g.team.id}|mgr`) * 20) * 1000;
      for (const at of [1000, 8000]) every(20_000, at - offset, effect('page', 0.6));
      break;
    }
    case 'guard': {
      // The walkie-talkie at the end of the walk, before turning back (Tom).
      const at = from + (until - from) * GUARD.stop + 400;
      if (at < until) effect('radio', 0.7)(at);
      break;
    }
    default:
      // The lines and the name on the turf: the painters work quietly.
      break;
  }
  return cues.sort((a, b) => a.at - b.at);
}
