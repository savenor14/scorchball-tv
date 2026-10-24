// The sidelines: who's on each bench, and who's walking between the bench and the pitch. Pure and DOM-free.
// See docs/channel.md §5.
//
// Both benches sit on the top touchline, spread out toward their own halves with the middle left open (Tom, 2026-10-03:
// football style; facing each other top and bottom was tried). Home is on the left. They don't swap at half-time. Each
// substitute has a seat. At a substitution the incoming player runs from their seat onto the pitch (motion.js starts
// them there) and the player coming off walks from where they were to the seat just freed. An injured player walks off
// to the bench the same way. Positions are in pitch fractions, like formation.js; the benches are just above the pitch
// (y < 0). Walking speed is at least animation.jogSpeed (pitch lengths per real second; the pitch counts as twice as long as wide), quicker if needed to be seated before play restarts.

import { createRng } from '../sim/rng.js';

/** Each bench's feet line, in pitch fractions: just above the top boards. */
export const BENCH_Y = Object.freeze({ home: -0.04, away: -0.04 });
/** The first seat's distance from halfway, and the space between seats, in pitch lengths. */
const FIRST_SEAT = 0.16;
const SEAT_GAP = 0.04;

/**
 * The tunnel (Task 46): at halfway on the top touchline, in the open stretch between the dugouts, through a gate in the
 * boards. MOUTH is where walkers step out into view (feet just above the boards); BACK is inside, out of sight. HALF_W
 * is the tunnel's half-width, in pitch fractions across: wide enough for two to walk side by side (Task 63), each in
 * a LANE either side of the middle (home on the left). FADE_FROM: walkers start to fade only once this far in (feet
 * well inside the walls, Task 63), and are gone by the back.
 */
export const TUNNEL = Object.freeze({ mouth: Object.freeze({ x: 0.5, y: -0.03 }), back: Object.freeze({ x: 0.5, y: -0.11 }), halfW: 0.03, lane: 0.011, fadeFrom: -0.065 });

/**
 * How visible someone is (0–1): inside the tunnel they fade into the dark, fully seen until FADE_FROM, gone at the back.
 * @param {Point} p
 */
export function tunnelFade(p) {
  if (p.y >= TUNNEL.fadeFrom || Math.abs(p.x - TUNNEL.mouth.x) > TUNNEL.halfW) return 1;
  return Math.min(1, Math.max(0, (p.y - TUNNEL.back.y) / (TUNNEL.fadeFrom - TUNNEL.back.y)));
}

/** Inside the tunnel (between its walls, above the mouth): drawn clipped to it, so heads go under its roof. @param {Point} p */
export function inTunnel(p) {
  return p.y < TUNNEL.mouth.y && Math.abs(p.x - TUNNEL.mouth.x) <= TUNNEL.halfW;
}

/**
 * How far open the tunnel's gate is (Task 63), 0 shut to 1 open: it opens over `ms` from the start of each window and
 * shuts over `ms` from its end. Closed during play; open for the walk-out, the breaks and the handshakes.
 * @param {readonly { from: number, to: number }[]} windows  When it's open, in the caller's ms. @param {number} t @param {number} ms
 */
export function gateOpen(windows, t, ms) {
  let open = 0;
  for (const { from, to } of windows) {
    const f = Math.min(1, Math.max(0, (t - from) / ms)) * (1 - Math.min(1, Math.max(0, (t - to) / ms)));
    open = Math.max(open, f);
  }
  return open;
}

/** The lane a side walks in through the tunnel (pitch fractions across, from the middle). @param {'home' | 'away'} side */
export const laneOf = (side) => (side === 'home' ? -TUNNEL.lane : TUNNEL.lane);

/**
 * @typedef {import('./formation.js').Placed} Placed
 * @typedef {{ x: number, y: number }} Point
 */

/**
 * Where seat `i` of a team's bench is: home seats run out to the left, away seats to the right, from well short of halfway.
 * @param {'home' | 'away'} side @param {number} i
 * @returns {Point}
 */
export function seat(side, i) {
  const dx = FIRST_SEAT + i * SEAT_GAP;
  return { x: side === 'home' ? 0.5 - dx : 0.5 + dx, y: BENCH_Y[side] };
}

/**
 * @typedef {'ball' | 'bottle' | 'bag' | 'cooler' | 'cone' | 'board'} PropKind
 * @typedef {{ kind: PropKind, at: 'outside' | 'front', slot: number }} Prop
 *   outside: on the turf beyond the dugout's outer end, slot pixels out from it. front: on the dugout floor in front of
 *   the bench, in the gap after seat `slot`.
 */

/** Each prop's width in stage pixels (pitch.js draws them). */
export const PROP_W = Object.freeze({ ball: 2, bottle: 1, bag: 5, cooler: 4, cone: 3, board: 5 });

/**
 * The arrangements a dugout's props come in (Task 69): what stands beyond its outer end, in order out from it (a
 * [kind, min, max] item is a seeded count), and how many bottles go between the seats.
 * @type {readonly { outside: (PropKind | [PropKind, number, number])[], bottles: [number, number] }[]}
 */
const ARRANGEMENTS = Object.freeze([
  { outside: ['cooler', 'bag', ['ball', 2, 4]], bottles: [2, 3] },
  { outside: ['bag', ['cone', 2, 3], ['ball', 1, 2]], bottles: [2, 2] },
  { outside: ['board', 'bag', ['ball', 1, 1]], bottles: [1, 2] },
  { outside: ['cooler', ['cone', 2, 2], ['ball', 2, 3]], bottles: [3, 3] },
  { outside: ['bag', 'bag', ['ball', 3, 4]], bottles: [1, 1] },
  { outside: ['board', ['cone', 1, 2], 'cooler'], bottles: [2, 3] },
]);

/**
 * The props round a team's dugout for a match (Task 49; Task 69: from a set of arrangements, picked per match): kit
 * bags, balls, a cool box, cones or a tactics board beyond its outer end, water bottles on the floor between the
 * seats. Seeded by the match, so the sidelines differ a little from match to match, and the two dugouts never share
 * an arrangement.
 * @param {string} matchId @param {'home' | 'away'} side @param {number} seats  How many seats the dugout has.
 * @returns {Prop[]}
 */
export function dugoutProps(matchId, side, seats) {
  const pick = createRng(`dugout|${matchId}`);
  const homeIdx = pick.int(0, ARRANGEMENTS.length - 1);
  const awayIdx = (homeIdx + pick.int(1, ARRANGEMENTS.length - 1)) % ARRANGEMENTS.length;
  const arrangement = ARRANGEMENTS[side === 'home' ? homeIdx : awayIdx];
  const rng = createRng(`dugout|${matchId}|${side}`);
  /** @type {Prop[]} */
  const props = [];
  let out = 2;
  for (const item of arrangement.outside) {
    const [kind, count] = typeof item === 'string' ? [item, 1] : [item[0], rng.int(item[1], item[2])];
    for (let i = 0; i < count; i++) {
      props.push({ kind, at: 'outside', slot: out });
      out += PROP_W[kind] + (kind === 'ball' ? 1 + (i % 2) : 2);
    }
    out += 2;
  }
  const gaps = Array.from({ length: Math.max(1, seats - 1) }, (_, i) => i);
  const bottles = Math.min(gaps.length, rng.int(...arrangement.bottles));
  for (let i = 0; i < bottles; i++) props.push({ kind: 'bottle', at: 'front', slot: gaps.splice(rng.int(0, gaps.length - 1), 1)[0] });
  return props;
}

/**
 * Where a team's players gather by their bench (at half-time, or after the handshakes): just inside the touchline in
 * front of it, spread along it.
 * @param {'home' | 'away'} side @param {number} i  Which player (0 up).
 * @returns {Point}
 */
export function benchArea(side, i) {
  const s = seat(side, 0);
  const out = side === 'home' ? -1 : 1;
  return { x: s.x + out * (i * 0.035 - 0.03), y: 0.09 };
}

/**
 * Each team's dugout at kick-off, in seat order, from the match's line-up events: the injured first, in the seats
 * nearest the tunnel (Task 185, Tom), then the substitutes. `injured`: who of them is injured.
 * @param {import('./timeline.js').Timeline} timeline
 * @returns {{ home: string[], away: string[], injured: Set<string> }}
 */
export function benchesAtKickoff(timeline) {
  /** @type {{ home: string[], away: string[], injured: Set<string> }} */
  const out = { home: [], away: [], injured: new Set() };
  for (const { event: e } of timeline.events) {
    if (e.type !== 'lineup') continue;
    const { bench, injured = [] } = /** @type {any} */ (e.data);
    out[e.teamId === timeline.homeId ? 'home' : 'away'] = [...injured, ...bench];
    for (const id of injured) out.injured.add(id);
  }
  return out;
}

/**
 * Where a substitute starts their run onto the pitch: their seat on the bench.
 * @param {import('./timeline.js').Timeline} timeline @param {string} playerId
 * @returns {Point | null}  Null if they weren't on the bench.
 */
export function seatOf(timeline, playerId) {
  const benches = benchesAtKickoff(timeline);
  for (const side of /** @type {const} */ (['home', 'away'])) {
    const i = benches[side].indexOf(playerId);
    if (i >= 0) return seat(side, i);
  }
  return null;
}

/**
 * Everyone on the sidelines at a moment: substitutes in their seats, and players walking off to the bench. At a break
 * (with breakLineMs, Task 66) the substitutes step out in front of the dugout to join the team, and are back in their
 * seats by the restart. The injured (Task 185) sit nearest the tunnel through it all, marked `injured` (drawn in team
 * tracksuits); a player injured during the match comes off in their kit.
 * @param {import('./timeline.js').Timeline} timeline
 * @param {number} elapsed  ms since kick-off.
 * @param {{ posAt: (playerId: string, elapsed: number) => Point | null, jogSpeed: number, slotOf?: (playerId: string) => string, breakLineMs?: number }} ctx
 *   posAt: where a player is on the pitch at a moment (motion.js). slotOf: their slot for the kit (a keeper wears the
 *   keeper's shirt on the bench too); none by default. breakLineMs: the restart's lead-in after a break
 *   (ceremonies.breakLineSeconds).
 * @returns {(Placed & { walking: boolean, seat: number, injured: boolean })[]}
 */
export function sidelinesAt(timeline, elapsed, { posAt, jogSpeed, slotOf = () => '', breakLineMs }) {
  const brk = breakLineMs === undefined ? null : timeline.breaks.find((b) => elapsed >= b.from && elapsed < b.to) ?? null;
  // How far out they've stepped (0 seated, 1 out): out after a moment, back as the teams head for the restart.
  const out = !brk ? 0 : stepOut(elapsed, brk, /** @type {number} */ (breakLineMs));
  const start = benchesAtKickoff(timeline);
  /** Seats per side: who sits there (null once they've gone on and nobody has taken it yet). */
  const seats = { home: /** @type {(string | null)[]} */ ([...start.home]), away: /** @type {(string | null)[]} */ ([...start.away]) };
  /** @type {Map<string, { side: 'home' | 'away', from: Point, seat: number, at: number }>} Players who came off. */
  const off = new Map();
  const sideOf = (/** @type {string | null | undefined} */ teamId) => /** @type {'home' | 'away'} */ (teamId === timeline.homeId ? 'home' : 'away');
  /** Send a player to the bench: the seat just freed, or a new one at the end. @param {'home' | 'away'} side @param {string} id @param {number} at @param {number} freed */
  const sendOff = (side, id, at, freed) => {
    const gone = off.get(id);
    if (gone) {
      // Injured, then replaced (Task 140): they take the seat their substitute just left, not one past the dugout's end
      // among the kit bags, where the injury had sent them.
      if (freed >= 0 && seats[side][freed] === null && gone.seat > freed) {
        seats[side][gone.seat] = null;
        seats[side][freed] = id;
        gone.seat = freed;
      }
      return;
    }
    const s = freed >= 0 && seats[side][freed] === null ? freed : seats[side].push(null) - 1;
    seats[side][s] = id;
    off.set(id, { side, from: posAt(id, at - 1) ?? seat(side, s), seat: s, at });
  };

  for (const { event: e, at } of timeline.events) {
    if (at > elapsed) break;
    const side = sideOf(e.teamId);
    if (e.type === 'substitution') {
      const incoming = /** @type {string} */ (e.playerId);
      const freed = seats[side].indexOf(incoming);
      if (freed >= 0) seats[side][freed] = null;
      sendOff(side, /** @type {any} */ (e.data).offId, at, freed);
    } else if (e.type === 'injury' && !(/** @type {any} */ (e.data).playsOn)) {
      sendOff(side, /** @type {string} */ (e.playerId), at, -1);
    }
  }

  /** @type {(Placed & { walking: boolean, seat: number, injured: boolean })[]} */
  const people = [];
  for (const side of /** @type {const} */ (['home', 'away'])) {
    seats[side].forEach((id, i) => {
      if (id === null) return;
      const spot = seat(side, i);
      const walk = off.get(id);
      const injured = start.injured.has(id);
      if (out > 0 && !injured && (!walk || walk.at < /** @type {{ from: number }} */ (brk).from)) {
        const stepping = out > 0 && out < 1;
        people.push({ playerId: id, side, slot: slotOf(id), x: spot.x, y: spot.y + (STEP_OUT_Y - spot.y) * out, walking: stepping, seat: i, injured });
        return;
      }
      // Off the pitch before play restarts (Task 41): at least a walk, quicker if the bench is far, so they reach their
      // seat OFF_MARGIN_MS before the substitution pause ends.
      const pause = walk ? timeline.pauses.find((q) => q.at === walk.at)?.ms ?? 0 : 0;
      const v = walk ? Math.max(jogSpeed / 1000, Math.hypot(spot.x - walk.from.x, (spot.y - walk.from.y) / 2) / Math.max(1000, pause - OFF_MARGIN_MS)) : 0;
      const at = walk ? travel(walk.from, spot, elapsed - walk.at, v) : spot;
      people.push({ playerId: id, side, slot: slotOf(id), x: at.x, y: at.y, walking: at.x !== spot.x || at.y !== spot.y, seat: i, injured });
    });
  }
  return people;
}

/** At a break the substitutes step out to here (pitch fractions down: on the pitch just in front of the dugout), over
 * STEP_MS, STEP_DELAY_MS after the break starts, and are seated again STEP_MS after the teams head for the restart. */
const STEP_OUT_Y = 0.035;
const STEP_MS = 1500;
const STEP_DELAY_MS = 2500;

/**
 * How far the substitutes have stepped out at a break (0 seated, 1 out), eased.
 * @param {number} e @param {{ from: number, to: number }} brk @param {number} breakLineMs
 */
function stepOut(e, brk, breakLineMs) {
  const back = Math.max(brk.from, brk.to - breakLineMs);
  const f = Math.min(1, Math.max(0, (e - brk.from - STEP_DELAY_MS) / STEP_MS)) * (1 - Math.min(1, Math.max(0, (e - back) / STEP_MS)));
  return f * f * (3 - 2 * f);
}

/**
 * The latest goal's celebration, if one is on at `e` (Task 65): who scored (by side), the goal's seq (for seeds) and
 * how long ago, while it's within `celebrateMs` (animation.goalCelebrateMs).
 * @param {import('./timeline.js').Timeline} timeline @param {number} e @param {number} celebrateMs
 * @returns {{ side: 'home' | 'away', seq: number, since: number } | null}
 */
export function celebrationAt(timeline, e, celebrateMs) {
  for (let i = timeline.countAt(e) - 1; i >= 0 && timeline.events[i].at > e - celebrateMs; i--) {
    const { event, at } = timeline.events[i];
    if (event.type === 'goal') return { side: event.teamId === timeline.homeId ? 'home' : 'away', seq: event.seq, since: e - at };
  }
  return null;
}

/** The bench's cheer (Task 65): on their feet, arms up, hopping every HOP_MS; a high five lasts HIGH_FIVE_MS. */
const HOP_MS = 300;
const HIGH_FIVE_MS = 700;
/** Leaning in for a high five, pitch fractions across: enough that the two raised hands meet. */
const HIGH_FIVE_LEAN = 0.009;

/**
 * How someone on the scoring side's bench cheers a goal (Task 65): arms up and a little hop, and one or two seeded
 * pairs of neighbours turning to high-five for a moment.
 * @param {'home' | 'away'} side @param {number} seatIndex @param {number} seats  How many seats the bench has.
 * @param {{ seq: number, since: number }} cheer  From celebrationAt.
 * @returns {{ arms: 'both' | 'left' | 'right', dx: number, dy: number }}
 */
export function benchCheer(side, seatIndex, seats, { seq, since }) {
  const rng = createRng(`bench-cheer|${seq}`);
  const pairs = Array.from({ length: rng.int(1, 2) }, () => ({ first: rng.int(0, Math.max(0, seats - 2)), from: rng.float(300, 2500) }))
    // Two pairs never share a seat.
    .filter((p, i, all) => i === 0 || Math.abs(p.first - all[0].first) >= 2);
  for (const p of pairs) {
    if (since < p.from || since >= p.from + HIGH_FIVE_MS) continue;
    // Seats run outward from halfway (leftward for home), so which of the pair is on the left depends on the side.
    const leftSeat = side === 'home' ? p.first + 1 : p.first;
    const rightSeat = side === 'home' ? p.first : p.first + 1;
    if (seatIndex === leftSeat) return { arms: 'right', dx: HIGH_FIVE_LEAN, dy: 0 };
    if (seatIndex === rightSeat) return { arms: 'left', dx: -HIGH_FIVE_LEAN, dy: 0 };
  }
  const hop = Math.floor(since / HOP_MS + seatIndex) % 2 === 0 ? -0.012 : 0;
  return { arms: 'both', dx: 0, dy: hop };
}

/** A player coming off reaches their seat this long (ms) before the substitution pause ends. */
const OFF_MARGIN_MS = 1000;

/**
 * A walker from `a` to `b` at speed `v` (pitch lengths per ms), `dt` ms after setting off; they stop on arrival.
 * @param {Point} a @param {Point} b @param {number} dt @param {number} v
 * @returns {Point}
 */
function travel(a, b, dt, v) {
  const d = Math.hypot(b.x - a.x, (b.y - a.y) / 2);
  const f = d < 1e-9 ? 1 : Math.min(1, Math.max(0, (dt * v) / d));
  if (f === 1) return { x: b.x, y: b.y };
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}
