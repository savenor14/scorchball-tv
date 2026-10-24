// Where players stand on screen. Pure and DOM-free. See docs/channel.md §5.
// The sim tracks zones, not coordinates, so positions are illustrative: each player's spot depends on the ball's zone
// and whether their team has it, plus a small seeded offset that stays the same for the whole half (so a change of
// possession doesn't reshuffle everyone). The ball runs in the carrier's own lane, which spreads play across the width.
// Keepers never leave their crease. How players get to their spots (speed, reactions) is motion.js's job.
// During a long spell without events, motion.js asks for numbered "probe" phases: attackers make fresh runs, the
// carrier moves with the ball, and the defender marking the ball closes in harder as the spell goes on.
// Everything is a function of the match moment, so every screen shows the same picture.
//
// Coordinates are fractions of the playing surface: x 0 = left goal line, 1 = right; y 0 = top board, 1 = bottom.
// Spots are written as [a, l]: a = 0 at the team's own goal line, 1 at the goal it attacks; l = 0 top, 1 bottom.
import { createRng } from '../sim/rng.js';

/** @typedef {'defensive' | 'middle' | 'attacking'} Zone */
/** @typedef {[number, number]} Spot */

// Formation spots per slot. With the ball, by its zone; without it, by where the ball is from their own view.
// Slots with two players (the defenders) list a spot for each.
/** @type {Readonly<Record<'attack' | 'defend', Record<Zone, Record<string, Spot[]>>>>} */
// Task 79: wider than before (the defenders out toward the touchlines with the ball, the striker off the middle), so
// the outer quarters get used; without the ball the shape stays more compact.
const SPOTS = Object.freeze({
  attack: {
    defensive: { K: [[0.04, 0.5]], D: [[0.17, 0.2], [0.17, 0.8]], M: [[0.34, 0.38]], S: [[0.55, 0.64]] },
    middle: { K: [[0.07, 0.5]], D: [[0.32, 0.17], [0.32, 0.83]], M: [[0.5, 0.33]], S: [[0.7, 0.66]] },
    attacking: { K: [[0.12, 0.5]], D: [[0.46, 0.2], [0.46, 0.8]], M: [[0.7, 0.32]], S: [[0.86, 0.64]] },
  },
  defend: {
    defensive: { K: [[0.03, 0.5]], D: [[0.14, 0.32], [0.14, 0.68]], M: [[0.27, 0.5]], S: [[0.44, 0.42]] },
    middle: { K: [[0.05, 0.5]], D: [[0.25, 0.24], [0.25, 0.76]], M: [[0.42, 0.5]], S: [[0.57, 0.38]] },
    attacking: { K: [[0.08, 0.5]], D: [[0.38, 0.22], [0.38, 0.78]], M: [[0.6, 0.5]], S: [[0.74, 0.42]] },
  },
});

// The crease: a semicircle on each goal line, radius in pitch lengths (pitch.js draws 28 px on a 358-px pitch).
export const CREASE_RADIUS = 28 / 358;
// A keeper's feet stay within KEEPER_REACH of the goal's centre (inside the crease, sprite and all); outfield
// players' feet stay at least CREASE_CLEAR from it (outside, shadow and all). Pitch lengths.
const KEEPER_REACH = CREASE_RADIUS - 0.008;
const CREASE_CLEAR = CREASE_RADIUS + 0.01;
// Keepers track the ball (Task 35): out from the line (pitch lengths), from KEEPER_NEAR with the ball in their own
// third to KEEPER_FAR with it in the other half, and across by KEEPER_TRACK of the ball's offset from the middle, at
// most KEEPER_ACROSS (pitch fractions; the goal mouth is ±0.11).
const KEEPER_NEAR = 0.025;
const KEEPER_FAR = 0.06;
const KEEPER_TRACK = 0.4;
const KEEPER_ACROSS = 0.1;
// Where along the pitch (from their own goal line) the ball starts drawing them out, and where they're fully out.
const KEEPER_OUT_FROM = 0.3;
const KEEPER_OUT_TO = 0.6;

// In the attacking zone, a carrier working the ball hangs back this far (pitch lengths) from the shooting spot, at the
// edge of range, and steps in only to shoot (Task 37).
const RANGE_BACK = 0.12;

/** Where the ball sits along the attack axis in each zone. */
const BALL_A = Object.freeze({ defensive: 0.2, middle: 0.5, attacking: 0.8 });
const MIRROR = Object.freeze({ defensive: 'attacking', middle: 'middle', attacking: 'defensive' });

// Seeded offsets (fractions of the pitch) and the idle sway.
const JITTER_A = 0.035;
const JITTER_L = 0.08;
const SWAY = 0.006;
const SWAY_PERIOD_MS = 1400;
// Marking: how far a defender moves from their spot toward the attacker they mark (0–1), and how far goal-side they stay.
const MARK_PULL = 0.4;
const MARK_GOAL_SIDE = 0.05;
// Probe phases: how far attackers' runs and the carrier's movement with the ball reach (pitch fractions).
const PROBE_A = 0.06;
const PROBE_L = 0.12;
const DRIBBLE_FORWARD = 0.04;
const DRIBBLE_BACK = 0.015;
const DRIBBLE_L = 0.06;
// Pressing the ball: at full pressure the marker's pull rises to PRESS_PULL and they stand PRESS_CLOSE closer.
// Pressure is scaled by where the ball is (from the attackers' view): hardest near the defenders' own goal.
const PRESS_PULL = 0.95;
const PRESS_CLOSE = 0.7;
const ZONE_PRESS = Object.freeze({ defensive: 0.4, middle: 0.8, attacking: 1 });
// A breakaway (Task 37): the defence has been beaten, so its outfield players trail behind the ball, the nearest
// BEATEN_TRAIL behind it and each next one BEATEN_STEP further (pitch lengths along the attack).
const BEATEN_TRAIL = 0.06;
const BEATEN_STEP = 0.04;
// Teammates keep at least this far apart (pitch lengths, about 12 stage px).
const MIN_SEP = 0.035;
// Wide play (Task 79; docs/channel.md §15.3). On a flank the carrier takes a lane FLANK_LANE ± FLANK_LANE_JITTER from
// the touchline (pitch fractions across), and both teams lean toward that side: the team on the ball by STRONG_SHIFT,
// the other by COVER_SHIFT. About to shoot from a flank, the shooter cuts in to CUT_IN_LANE.
const FLANK_LANE = 0.15;
const FLANK_LANE_JITTER = 0.05;
const STRONG_SHIFT = 0.08;
const COVER_SHIFT = 0.06;
const CUT_IN_LANE = 0.3;
// The corner area run: the player on the ball heads CORNER_A from their own goal line (± CORNER_A_JITTER) and
// CORNER_LANE from the touchline, then crosses it back or cuts in to shoot.
const CORNER_A = 0.91;
const CORNER_A_JITTER = 0.025;
const CORNER_LANE = 0.09;

/**
 * Wide play for a moment (Task 79): which flank the team on the ball is using (`flank`: -1 the top touchline, 1 the
 * bottom, 0 the middle), and whether the player on the ball has gone to the corner area. `holder`: who is on the ball
 * now (the sim's carrier for the next action may be someone else, waiting for the pass).
 * @typedef {{ flank: -1 | 0 | 1, corner: boolean, holder: string | null }} Wide
 */

/**
 * The soft offside (Task 80): `reach`, how far (pitch lengths) an attacker off the ball may stand beyond the last
 * outfield defender or the ball; `drop`, the share of any gap beyond that closed by the defender dropping back.
 * @typedef {{ reach: number, drop: number }} Tether
 */

/**
 * @typedef {object} Placed
 * @property {string} playerId
 * @property {'home' | 'away'} side
 * @property {string} slot
 * @property {number} x
 * @property {number} y
 */

/**
 * Which way the home team attacks: right in the first half, overtime and shootout, left in the second half.
 * @param {import('./timeline.js').Phase} phase
 * @returns {1 | -1}
 */
export function homeAttacksRight(phase) {
  return phase === 'second_half' || phase === 'finished' ? -1 : 1;
}

/**
 * Formation positions for every player on the pitch, and the ball, at one match moment.
 * @param {import('./timeline.js').MatchState} s
 * @param {{ matchId: string, homeId: string, keeperSlot: string, elapsed: number | null, probe?: number, press?: number, holderId?: string | null, edge?: boolean, beaten?: boolean, wide?: Wide | null, tether?: Tether | null, hang?: number }} ctx
 *   `elapsed`: ms since kick-off, for the idle sway only; null leaves the sway out (motion.js adds its own).
 *   `probe`: which phase of a long spell this is (0 = none). `press`: 0–1, how hard the ball is being closed down.
 *   `holderId`: who has the ball right now, if not the sim's carrier (a pass within the spell).
 *   `edge`: in the attacking zone, the carrier is working the ball rather than about to shoot, so hangs back.
 *   `beaten`: a breakaway, so the defenders trail behind the ball instead of marking. `hang` (Task 253): then the
 *   attackers off the ball stay at least this far behind it too (0: where they'd be).
 *   `wide`: the flank in use and whether the player on the ball is in the corner area (Task 79).
 *   `tether`: the soft offside (Task 80); null leaves it out.
 * @returns {{ players: Placed[], ball: { x: number, y: number }, carrierId: string | null }}
 */
export function formation(s, { matchId, homeId, keeperSlot, elapsed, probe = 0, press = 0, holderId = null, edge = false, beaten = false, wide = null, tether = null, hang = 0 }) {
  const homeDir = homeAttacksRight(s.phase);
  const homeHasBall = s.possession === homeId;
  const zone = /** @type {Zone} */ (s.zone);
  // Offsets are fixed per half (ends swap at half-time); only the ball's spot along the pitch varies per spell.
  const jitterKey = `${matchId}|${homeDir}`;
  const spellKey = `${matchId}|${s.spell}|${zone}`;

  const toPitch = (/** @type {number} */ a, /** @type {number} */ l, /** @type {1 | -1} */ dir) => ({ x: dir === 1 ? a : 1 - a, y: l });

  const possDir = homeHasBall ? homeDir : /** @type {1 | -1} */ (-homeDir);
  const ballA = BALL_A[zone] + createRng(`${spellKey}|ball`).float(-JITTER_A, JITTER_A) - (edge && zone === 'attacking' ? RANGE_BACK : 0);
  const atKickoff = s.last?.event.type === 'kickoff';
  const flank = atKickoff || !wide ? 0 : wide.flank;
  // In the corner area: whoever is on the ball now (the holder, if a pass to the sim's carrier is still to come).
  const holder = wide?.holder ?? null;
  const corner = flank !== 0 && Boolean(wide?.corner) && zone === 'attacking';
  // The flank's lane across (0–1, top to bottom), a little different each spell.
  const lane = (/** @type {number} */ fromLine) => (flank < 0 ? fromLine : 1 - fromLine);
  const flankLane = lane(FLANK_LANE + createRng(`${spellKey}|lane`).float(-FLANK_LANE_JITTER, FLANK_LANE_JITTER));

  // Who has the ball: the named carrier, or after a restart the keeper (own third) or the midfielder (kick-off).
  const possSide = homeHasBall ? s.onPitch.home : s.onPitch.away;
  let carrierId = s.carrierId && possSide.some((p) => p.playerId === s.carrierId) ? s.carrierId : null;
  if (!carrierId && s.possession) {
    const want = zone === 'defensive' ? keeperSlot : 'M';
    carrierId = (possSide.find((p) => p.slot === want) ?? possSide[0])?.playerId ?? null;
  }

  /** @type {{ x: number, y: number }} */
  let ball = { x: 0.5, y: 0.5 };
  /** @type {Placed[]} */
  const players = [];
  /** @type {Map<Placed, { x: number, y: number }>} Spots before the sway, so marking assignments don't flicker. */
  const anchors = new Map();
  for (const side of /** @type {const} */ (['home', 'away'])) {
    const isHome = side === 'home';
    const hasBall = s.possession !== null && isHome === homeHasBall;
    const dir = isHome ? homeDir : /** @type {1 | -1} */ (-homeDir);
    const ownZone = hasBall ? zone : /** @type {Zone} */ (MIRROR[zone]);
    const table = SPOTS[hasBall ? 'attack' : 'defend'][ownZone];
    /** @type {Record<string, number>} */
    const used = {};
    for (const p of s.onPitch[side]) {
      const slotSpots = table[p.slot] ?? table.P;
      const spot = slotSpots[(used[p.slot] = (used[p.slot] ?? -1) + 1) % slotSpots.length];
      const rng = createRng(`${jitterKey}|${p.playerId}`);
      const keeper = p.slot === keeperSlot;
      let a = spot[0] + rng.float(-JITTER_A, JITTER_A) * (keeper ? 0.3 : 1);
      let l = spot[1] + rng.float(-JITTER_L, JITTER_L) * (keeper ? 0.5 : 1);
      if (keeper) {
        const inCrease = inReach(a, l);
        [a, l] = [inCrease.a, inCrease.l];
      } else if (p.playerId === carrierId) {
        a = atKickoff ? 0.5 : ballA; // the carrier takes the ball up their own lane
        if (atKickoff) l = 0.5;
        else if (flank !== 0) {
          // Down the flank; about to shoot (or waiting for a cut-back from the corner area), cutting in.
          const inside = zone === 'attacking' && (!edge || (corner && holder !== null && holder !== carrierId));
          l = inside ? lane(CUT_IN_LANE) : flankLane;
          if (corner && edge && (holder === null || holder === carrierId)) [a, l] = cornerSpot(spellKey, lane);
        }
      } else if (hasBall && corner && p.playerId === holder) {
        [a, l] = cornerSpot(spellKey, lane); // the holder crosses it back from the corner area
      } else if (hasBall && flank !== 0 && p.playerId === holder) {
        l = flankLane; // whoever has the ball until the pass to the next carrier keeps it out on the flank
      } else if (flank !== 0) {
        l += flank * (hasBall ? STRONG_SHIFT : COVER_SHIFT); // everyone leans toward the ball's side
      }
      // Marking is decided from the spots before any probe run, so who marks whom stays fixed for the spell.
      const anchor = toPitch(a, l, dir);
      if (probe > 0 && hasBall && !keeper) {
        const run = createRng(`${spellKey}|probe${probe}|${p.playerId}`);
        if (p.playerId === carrierId) {
          a += run.float(-DRIBBLE_BACK, DRIBBLE_FORWARD);
          l += run.float(-DRIBBLE_L, DRIBBLE_L);
        } else {
          a += run.float(-PROBE_A, PROBE_A);
          l += run.float(-PROBE_L, PROBE_L);
        }
      }
      let { x, y } = toPitch(a, l, dir);
      if (p.playerId === carrierId) ball = { x: clamp01(x, 0.02), y: clamp01(y, 0.05) };
      else if (elapsed !== null) {
        const sway = swayOf(matchId, p.playerId, elapsed);
        x += sway.x;
        y += sway.y;
      }
      const placed = { playerId: p.playerId, side, slot: p.slot, x: clamp01(x, 0.02), y: clamp01(y, 0.05) };
      anchors.set(placed, anchor);
      players.push(placed);
    }
  }
  if (s.possession) {
    const holder = players.find((q) => q.playerId === (holderId ?? carrierId)) ?? null;
    mark(players, anchors, homeHasBall ? 'away' : 'home', homeHasBall ? -homeDir : homeDir, keeperSlot, holder, press * ZONE_PRESS[zone]);
    if (beaten) {
      let k = 0;
      for (const p of players) {
        if (p.side === (homeHasBall ? 'home' : 'away') || p.slot === keeperSlot) continue;
        p.x = clamp01(ball.x - possDir * (BEATEN_TRAIL + BEATEN_STEP * k++), 0.02);
      }
      // The runner alone (Task 253): their teammates off the ball hang back, none past the beaten defence.
      if (hang > 0) {
        let j = 0;
        for (const p of players) {
          if (p.side !== (homeHasBall ? 'home' : 'away') || p.slot === keeperSlot || p.playerId === carrierId) continue;
          const limit = ball.x - possDir * (hang + BEATEN_STEP * j);
          if ((p.x - limit) * possDir > 0) { p.x = clamp01(limit, 0.02); j++; }
        }
      }
    } else if (tether && !atKickoff) {
      // With a teammate on the ball (Task 254), the line is theirs: the sim's carrier, up ahead waiting for it, is held
      // back like anyone else (exempt, they stood far offside while the ball was played about behind them).
      const passedTo = holderId !== null && holderId !== carrierId ? players.find((q) => q.playerId === holderId) : null;
      const at = passedTo ? { x: passedTo.x, y: passedTo.y } : ball;
      const exempt = passedTo ? [holderId, wide?.holder ?? null] : [carrierId, holderId, wide?.holder ?? null];
      tetherLine(players, homeHasBall ? 'home' : 'away', possDir, at, keeperSlot, exempt, tether);
    }
  }
  // At a kick-off (as in football, Task 76) everyone is in their own half, and only the side kicking off may be in the
  // centre circle: the others wait just outside it, on their own side.
  if (atKickoff && s.possession) {
    const kicking = homeHasBall ? 'home' : 'away';
    for (const p of players) {
      if (p.playerId === carrierId) continue;
      // Each side's own half: the kicking side's behind the ball (−possDir), the other's ahead of it.
      const own = p.side === kicking ? -possDir : possDir;
      if ((p.x - 0.5) * own < HALF_MARGIN) p.x = 0.5 + own * HALF_MARGIN;
      if (p.side === kicking) continue;
      const dx = (p.x - 0.5) * PITCH_PX.w;
      const dy = (p.y - 0.5) * PITCH_PX.h;
      const d = Math.hypot(dx, dy);
      if (d >= KICKOFF_CLEAR_PX) continue;
      const [ux, uy] = d < 1e-6 ? [own, 0] : [dx / d, dy / d];
      p.x = 0.5 + (ux * KICKOFF_CLEAR_PX) / PITCH_PX.w;
      p.y = 0.5 + (uy * KICKOFF_CLEAR_PX) / PITCH_PX.h;
    }
  }
  separate(players, carrierId, keeperSlot);
  return { players, ball, carrierId };
}

/** The pitch in stage px (pitch.js PITCH), for the centre circle. */
const PITCH_PX = Object.freeze({ w: 358, h: 179 });
/** At a kick-off everyone but the kicker keeps at least this far into their own half (pitch lengths: about 4 px). */
const HALF_MARGIN = 0.012;
/** At a kick-off the side without the ball keeps this far from the centre spot (stage px): the centre circle's 22, and room for a sprite. */
const KICKOFF_CLEAR_PX = 26;

/**
 * The soft offside (Task 80; docs/channel.md §15.4): no attacker off the ball stands more than `reach` beyond the last
 * outfield defender, or beyond the ball if it's further forward. A gap beyond that is closed partly by the last
 * defender dropping back (`drop` of it, never into their crease) and the rest by the attackers checking back.
 * @param {Placed[]} players  Changed in place.
 * @param {'home' | 'away'} attacking @param {1 | -1} dir  The way the team on the ball attacks.
 * @param {{ x: number, y: number }} ball @param {string} keeperSlot
 * @param {(string | null)[]} onBall  Whoever is on the ball now or about to receive it: never held back.
 * @param {Tether} tether
 */
export function tetherLine(players, attacking, dir, ball, keeperSlot, onBall, { reach, drop }) {
  const along = (/** @type {{ x: number }} */ p) => (dir === 1 ? p.x : 1 - p.x);
  const toX = (/** @type {number} */ a) => (dir === 1 ? a : 1 - a);
  const defenders = players.filter((p) => p.side !== attacking && p.slot !== keeperSlot);
  const forwards = players.filter((p) => p.side === attacking && p.slot !== keeperSlot && !onBall.includes(p.playerId));
  if (!defenders.length || !forwards.length) return;
  const last = defenders.reduce((m, p) => (along(p) > along(m) ? p : m));
  const front = Math.max(...forwards.map(along));
  const gap = front - (Math.max(along(last), along(ball)) + reach);
  if (gap <= 0) return;
  // The last defender drops back (only if they set the line), staying out of their crease.
  if (along(last) >= along(ball)) {
    const dropped = outOfCrease({ ...last, x: clamp01(toX(along(last) + gap * drop), 0.02) });
    [last.x, last.y] = [dropped.x, dropped.y];
  }
  const limit = Math.max(along(last), along(ball)) + reach;
  for (const p of forwards) if (along(p) > limit) p.x = toX(limit);
}

/**
 * The corner area spot for a spell: [a, l], the attack's own frame.
 * @param {string} spellKey @param {(fromLine: number) => number} lane
 * @returns {[number, number]}
 */
function cornerSpot(spellKey, lane) {
  const rng = createRng(`${spellKey}|corner`);
  return [CORNER_A + rng.float(-CORNER_A_JITTER, CORNER_A_JITTER), lane(CORNER_LANE + rng.float(-0.02, 0.02))];
}

/**
 * A spot pulled inside the keeper's reach: `a` from their own goal line (pitch lengths), `l` across (0–1).
 * @param {number} a @param {number} l
 */
function inReach(a, l) {
  const out = Math.max(0, a);
  const across = (l - 0.5) / 2; // pitch lengths
  const r = Math.hypot(out, across);
  const k = r > KEEPER_REACH ? KEEPER_REACH / r : 1;
  return { a: out * k, l: 0.5 + across * 2 * k };
}

/**
 * Where a keeper stands to cover a ball at `ball`: across with it, off their line when it's far away, back on it
 * when it's close, always inside the crease.
 * @param {0 | 1} goalX  The x of the goal they defend.
 * @param {{ x: number, y: number }} ball
 * @returns {{ x: number, y: number }}
 */
export function keeperSpot(goalX, ball) {
  const away = goalX === 0 ? ball.x : 1 - ball.x;
  const f = Math.min(1, Math.max(0, (away - KEEPER_OUT_FROM) / (KEEPER_OUT_TO - KEEPER_OUT_FROM)));
  const out = KEEPER_NEAR + (KEEPER_FAR - KEEPER_NEAR) * f * f * (3 - 2 * f);
  const across = Math.max(-KEEPER_ACROSS, Math.min(KEEPER_ACROSS, KEEPER_TRACK * (ball.y - 0.5)));
  const { a, l } = inReach(out, 0.5 + across);
  return { x: goalX === 0 ? a : 1 - a, y: l };
}

/**
 * An outfield player's spot moved just outside either crease, if it's in one (straight out from the goal's centre).
 * @template {{ x: number, y: number }} P
 * @param {P} p
 * @returns {P}
 */
export function outOfCrease(p) {
  for (const gx of [0, 1]) {
    const dx = p.x - gx;
    const dy = (p.y - 0.5) / 2;
    const d = Math.hypot(dx, dy);
    if (d >= CREASE_CLEAR || d < 1e-9) continue;
    const k = CREASE_CLEAR / d;
    return { ...p, x: gx + dx * k, y: 0.5 + dy * 2 * k };
  }
  return p;
}

/** @type {Map<string, number>} Each player's sway phase, seeded once. */
const swayPhases = new Map();

/**
 * A player's gentle idle sway at a moment, as an offset in pitch fractions.
 * @param {string} matchId @param {string} playerId @param {number} elapsed  ms since kick-off.
 */
export function swayOf(matchId, playerId, elapsed) {
  const key = `${matchId}|sway|${playerId}`;
  let phase = swayPhases.get(key);
  if (phase === undefined) swayPhases.set(key, (phase = createRng(key).float(0, 2 * Math.PI)));
  return { x: SWAY * Math.sin(elapsed / SWAY_PERIOD_MS + phase), y: SWAY * Math.cos(elapsed / (SWAY_PERIOD_MS * 1.3) + phase) };
}

/**
 * Defenders lean toward the nearest attacker, staying goal-side: each outfield defender (in slot order) takes the
 * closest attacker not yet marked and moves part of the way to a spot just in front of them. Who marks whom is
 * decided from the spots before the sway, so it stays fixed for the whole possession spell.
 * @param {Placed[]} players  Changed in place.
 * @param {Map<Placed, { x: number, y: number }>} anchors
 * @param {'home' | 'away'} defending
 * @param {number} defendDir  1 if the defending side attacks right (so its own goal is on the left).
 * @param {string} keeperSlot
 * @param {Placed | null} holder  Whoever has the ball: their marker closes in by `pressure`.
 * @param {number} pressure  0–1.
 */
function mark(players, anchors, defending, defendDir, keeperSlot, holder, pressure) {
  const attackers = players.filter((p) => p.side !== defending && p.slot !== keeperSlot);
  const taken = new Set();
  for (const d of players.filter((p) => p.side === defending && p.slot !== keeperSlot)) {
    let best = null;
    let bestDist = Infinity;
    const da = /** @type {{ x: number, y: number }} */ (anchors.get(d));
    for (const a of attackers) {
      if (taken.has(a)) continue;
      const aa = /** @type {{ x: number, y: number }} */ (anchors.get(a));
      const dist = Math.hypot(aa.x - da.x, (aa.y - da.y) * 0.5);
      if (dist < bestDist) [best, bestDist] = [a, dist];
    }
    if (!best) continue;
    taken.add(best);
    const pr = best === holder ? pressure : 0;
    const pull = MARK_PULL + (PRESS_PULL - MARK_PULL) * pr;
    const markX = best.x - defendDir * MARK_GOAL_SIDE * (1 - PRESS_CLOSE * pr);
    d.x = clamp01(d.x + (markX - d.x) * pull, 0.02);
    d.y = clamp01(d.y + (best.y - d.y) * pull, 0.05);
  }
}

/**
 * Nudge teammates apart so nobody stands on top of a teammate. The carrier and keepers stay put.
 * @param {Placed[]} players  Changed in place.
 * @param {string | null} carrierId @param {string} keeperSlot
 */
function separate(players, carrierId, keeperSlot) {
  const fixed = (/** @type {Placed} */ p) => p.playerId === carrierId || p.slot === keeperSlot;
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < players.length; i++) {
      for (let j = i + 1; j < players.length; j++) {
        const [p, q] = [players[i], players[j]];
        if (p.side !== q.side || (fixed(p) && fixed(q))) continue;
        // In pitch lengths: the pitch is twice as long as it is wide.
        const dx = q.x - p.x;
        const dy = (q.y - p.y) / 2;
        const d = Math.hypot(dx, dy);
        if (d >= MIN_SEP) continue;
        const [ux, uy] = d > 1e-6 ? [dx / d, dy / d] : [0, 1];
        const gap = MIN_SEP - d;
        const share = fixed(p) ? [0, 1] : fixed(q) ? [1, 0] : [0.5, 0.5];
        p.x = clamp01(p.x - ux * gap * share[0], 0.02);
        p.y = clamp01(p.y - uy * 2 * gap * share[0], 0.05);
        q.x = clamp01(q.x + ux * gap * share[1], 0.02);
        q.y = clamp01(q.y + uy * 2 * gap * share[1], 0.05);
      }
    }
  }
}

/**
 * Blend two formations: players move from `from` to `to` as `f` goes 0 → 1. Players only in `to`
 * (substitutes) appear at their new spot.
 * @param {Placed[]} from @param {Placed[]} to @param {number} f
 * @param {boolean} [eased]  Smooth start and stop (default), or constant speed for a continuous run.
 * @returns {Placed[]}
 */
export function blend(from, to, f, eased = true) {
  if (f >= 1) return to;
  const e = f <= 0 ? 0 : eased ? f * f * (3 - 2 * f) : f;
  const before = new Map(from.map((p) => [p.playerId, p]));
  return to.map((p) => {
    const b = before.get(p.playerId);
    return b ? { ...p, x: b.x + (p.x - b.x) * e, y: b.y + (p.y - b.y) * e } : p;
  });
}

/** @param {number} v @param {number} margin */
function clamp01(v, margin) {
  return Math.min(1 - margin, Math.max(margin, v));
}
