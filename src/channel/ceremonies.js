// Ceremonies around a match: the walk-out before kick-off and the handshakes after the whistle. Pure and DOM-free.
// See docs/channel.md §7a. Timings are settings.ceremonies; speeds are settings.animation.jogSpeed (pitch lengths per
// real second; distances count the pitch as twice as long as it is wide, as in motion.js).
//
//   Walk-out (segments.walkOutMinutes): players walk on out of the tunnel (Task 46: top touchline at halfway, between the dugouts;
//     walkOnGapMs apart) side by side in pairs, one from each team (Task 63), to a line across halfway, and the
//     substitutes follow them out, in pairs too, to their seats in the dugouts; the home anthem, then the away anthem (anthemSeconds each, a caption
//     while everyone stands); a warm-up (warmUpSeconds: each player jogs between seeded spots in their own half every
//     warmUpMoveSeconds, keepers in their goals); then breakLineSeconds before kick-off everyone jogs to their exact
//     kick-off spot, the same spot motion.js starts the match from, so play begins without a jump.
//   Handshakes (segments.handshakeMinutes, or reairs.handshakeSeconds): parts by handshakeParts, as fractions of the
//     whole. The whole squads take part, substitutes too: each team huddles just off its end of the lines, then the
//     players peel off into their line and walk along it past every opponent, the two lines just touching, with a
//     short beat as each opposing pair meets (Task 74); after a home win the home team lines up along the bottom
//     touchline to salute the fans while the away team goes to its bench, then everyone walks off into the tunnel and
//     out of sight, pairing up just below the gate and going in side by side. Otherwise (Task 74) there's no salute:
//     both teams head straight off after the procession, and the handshakes are that much shorter (handshakeLength).
// Every leg starts from wherever the player is when it begins, so nothing ever jumps.
import { createRng } from '../sim/rng.js';
import { formation, swayOf } from './formation.js';
import { managerRest, MANAGER_Y, REF_KICKOFF } from './pitchside.js';
import { benchArea, laneOf, seat, TUNNEL } from './sidelines.js';
import { winnerCheer } from './cheers.js';

/** Space between players in a line, in pitch lengths. */
const LINE_GAP = 0.035;
/** The handshake lines' feet, either side of halfway: close enough that the two lines just touch (Task 74). */
const SHAKE = Object.freeze({ homeY: 0.48, awayY: 0.52 });
/** Without a home win there's no salute: the teams' walk off takes this share of the full handshakes after the procession. */
const STRAIGHT_OFF = 0.15;
/**
 * The huddles before the handshakes (Task 43): ring radius (pitch lengths), how far off the end of the line (pitch
 * lengths) and back from halfway (pitch fractions across), and how much more than the usual idle sway they show.
 */
const HUDDLE_R = 0.03;
const HUDDLE_OFF = 0.07;
const HUDDLE_LIFT = 0.06;
const HUDDLE_SWAY = 1.5;
/**
 * The losers' walk to their bench after a home win (Tom, 2026-10-16: not one line): each a little apart, seeded by the
 * player, so it's the same at every viewing: how far their spot strays from the bench's row (across, pitch lengths; down,
 * pitch fractions), how far their path bows off the straight (pitch lengths), and their pace (± a share of a jog).
 */
const LOOSE = Object.freeze({ across: 0.018, down: 0.035, bow: 0.06, pace: 0.25 });
/** A loser's own spot, path and pace by the bench. @param {string} playerId */
const looseOf = (playerId) => {
  const r = createRng(`handshakes|loose|${playerId}`);
  return { across: r.float(-1, 1) * LOOSE.across, down: r.float(-1, 1) * LOOSE.down, bow: r.float(-1, 1) * LOOSE.bow, pace: 1 + r.float(-1, 1) * LOOSE.pace };
};
/** Where the home team salutes the fans: along the bottom touchline. */
const SALUTE_Y = 0.92;

/**
 * @typedef {import('./formation.js').Placed} Placed
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{ playerId: string, slot: string }} Starter
 * @typedef {object} CeremonySettings  settings.ceremonies
 * @property {number} walkOnGapMs @property {number} gateMs @property {number} walkOnSeconds @property {number} anthemSeconds
 * @property {number} warmUpSeconds @property {number} warmUpMoveSeconds @property {number} breakLineSeconds
 * @property {{ huddle: number, pass: number, salute: number }} handshakeParts @property {number} handshakeLineSpeed  The
 *   handshake procession's pace, pitch lengths per real second. @property {number} handshakePauseMs  The beat as each
 *   opposing pair meets in it. @property {{ power: number }} saluteCheer
 *   The home end cheering the salute (Tom, 2026-10-16).
 * @typedef {{ to: Point, at: number, v?: number, by?: number }} Leg  Head for `to` from `at` (ms), at speed v (pitch
 *   lengths per ms), or quicker if needed to arrive by `by`.
 */

/**
 * The line across halfway: home on the left, away on the right, keepers at the outer ends.
 * @param {Starter[]} home @param {Starter[]} away
 * @param {string} keeperSlot
 * @returns {Placed[]}
 */
export function lineUp(home, away, keeperSlot) {
  return [
    ...keepersLast(home, keeperSlot).map((p, i) => ({ ...p, side: /** @type {const} */ ('home'), x: 0.5 - (i + 1) * LINE_GAP, y: 0.5 })),
    ...keepersLast(away, keeperSlot).map((p, i) => ({ ...p, side: /** @type {const} */ ('away'), x: 0.5 + (i + 1) * LINE_GAP, y: 0.5 })),
  ];
}

/**
 * Where everyone stands at the first kick-off: exactly the first frame motion.js draws for the match (the home team
 * kicks off; the formation's offsets and the idle sway at 0 are both keyed by the match id).
 * @param {{ matchId: string, homeId: string, home: Starter[], away: Starter[], keeperSlot: string }} m
 * @returns {Placed[]}
 */
export function kickoffSpots({ matchId, homeId, home, away, keeperSlot }) {
  /** @type {import('./timeline.js').MatchState} */
  const state = {
    phase: 'first_half', clock: 0, paused: null, score: [0, 0], shootout: null, possession: homeId, zone: 'middle', carrierId: null,
    heat: 0, heatStage: 'cool', onPitch: { home: home.map(starter), away: away.map(starter) }, spell: 1, revealed: 0,
    last: { event: /** @type {any} */ ({ type: 'kickoff', teamId: homeId }), at: 0 },
  };
  return formation(state, { matchId, homeId, keeperSlot, elapsed: null }).players.map((p) => {
    const sway = swayOf(matchId, p.playerId, 0);
    return { ...p, x: clamp(p.x + sway.x, 0.02), y: clamp(p.y + sway.y, 0.05) };
  });
}

/**
 * The walk-out's parts, as ms from its start, for a walk-out `total` ms long.
 * @param {number} total @param {CeremonySettings} c
 */
export function walkOutParts(total, c) {
  const anthemsFrom = c.walkOnSeconds * 1000;
  const awayAnthemFrom = anthemsFrom + c.anthemSeconds * 1000;
  const breakFrom = total - c.breakLineSeconds * 1000;
  const warmFrom = breakFrom - c.warmUpSeconds * 1000;
  return { anthemsFrom, awayAnthemFrom, anthemsUntil: awayAnthemFrom + c.anthemSeconds * 1000, warmFrom, breakFrom };
}

/**
 * Players during the walk-out.
 * @param {Placed[]} line  From lineUp.
 * @param {Placed[]} spots  From kickoffSpots.
 * @param {number} since  ms since the walk-out began.
 * @param {number} left   ms until kick-off.
 * @param {{ ceremonies: CeremonySettings, jogSpeed: number, matchId: string, keeperSlot: string, trimmed?: boolean }} s
 *   trimmed: a re-air's short line-up: from the line straight to the kick-off spots.
 * @returns {Placed[]}
 */
export function walkOutPose(line, spots, since, left, { ceremonies: c, jogSpeed, matchId, keeperSlot, trimmed = false }) {
  const v = jogSpeed / 1000;
  const total = since + left;
  const parts = walkOutParts(total, c);
  const spotOf = new Map(spots.map((p) => [p.playerId, p]));
  const breakMs = c.breakLineSeconds * 1000;
  const homeCount = line.filter((p) => p.side === 'home').length;
  return line.map((p, i) => {
    const target = spotOf.get(p.playerId) ?? p;
    const toSpot = { to: target, at: trimmed ? 0 : parts.breakFrom, v, by: total - breakMs * 0.2 };
    if (trimmed) return { ...p, ...route(p, [toSpot], since) };
    /** @type {Leg[]} */
    // The managers and the referee lead them out (OUT_ORDER), so the first pair sets off after them: each home player
    // beside the away player at the same place in their line.
    const pair = p.side === 'home' ? i : i - homeCount;
    const dx = laneOf(p.side);
    const legs = [...outOfTunnel((pair + OUT_ORDER.players) * c.walkOnGapMs, v, dx), { to: p, at: (pair + OUT_ORDER.players) * c.walkOnGapMs + IN_TUNNEL / v, v }];
    const moves = Math.max(1, Math.floor(c.warmUpSeconds / c.warmUpMoveSeconds));
    for (let k = 0; k < moves; k++) legs.push({ to: warmUpSpot(matchId, p, k, keeperSlot), at: parts.warmFrom + k * c.warmUpMoveSeconds * 1000, v });
    legs.push(toSpot);
    return { ...p, ...route(tunnelBack(dx), legs, since) };
  });
}

/**
 * The substitutes during the walk-out: they follow the starters out of the tunnel (`after` pairs in), in pairs too,
 * and walk to their seats in the dugouts.
 * @param {{ home: string[], away: string[] }} bench  Each team's dugout, in seat order: the injured first (Task 185),
 *   then the substitutes.
 * @param {number} since  ms since the walk-out began.
 * @param {{ ceremonies: CeremonySettings, jogSpeed: number, slotOf: (playerId: string) => string, after: number, injured?: Set<string> }} s
 *   injured: who of them is injured (marked, for their tracksuits).
 * @returns {(Placed & { walking: boolean, injured: boolean })[]}
 */
export function benchWalkOn(bench, since, { ceremonies: c, jogSpeed, slotOf, after, injured = new Set() }) {
  const v = jogSpeed / 1000;
  /** @type {(Placed & { walking: boolean, injured: boolean })[]} */
  const out = [];
  for (const side of /** @type {const} */ (['home', 'away'])) {
    const dx = laneOf(side);
    bench[side].forEach((playerId, i) => {
      const to = seat(side, i);
      const at = (OUT_ORDER.players + after + i) * c.walkOnGapMs;
      const pos = route(tunnelBack(dx), [...outOfTunnel(at, v, dx), { to, at: at + IN_TUNNEL / v, v }], since);
      out.push({ playerId, side, slot: slotOf(playerId), x: pos.x, y: pos.y, walking: pos.x !== to.x || pos.y !== to.y, injured: injured.has(playerId) });
    });
  }
  return out;
}

/**
 * Who comes out of the tunnel when in the walk-out, in walkOnGapMs steps: the home manager, the away manager, the
 * referee, then the players and the substitutes (Tasks 47–48).
 */
const OUT_ORDER = Object.freeze({ home: 0, away: 1, referee: 2, players: 3 });

/**
 * A manager during the walk-out (Task 48): out of the tunnel ahead of everyone, then to the middle of their stretch
 * of touchline (managerRest, where pitchside.js starts the match). In a re-air's line-up they're already there.
 * @param {'home' | 'away'} side
 * @param {number} since  ms since the walk-out began.
 * @param {{ ceremonies: CeremonySettings, jogSpeed: number, trimmed?: boolean }} s
 * @returns {Point}
 */
export function managerWalkOut(side, since, { ceremonies: c, jogSpeed, trimmed = false }) {
  const rest = managerRest(side);
  if (trimmed) return rest;
  const v = jogSpeed / 1000;
  const at = OUT_ORDER[side] * c.walkOnGapMs;
  return route(TUNNEL.back, [...outOfTunnel(at, v), { to: rest, at: at + IN_TUNNEL / v, v }], since);
}

/**
 * A manager during the handshakes: from their stretch of touchline to the tunnel mouth to shake hands with the other
 * manager while the teams huddle, then off into the tunnel early (home first). Null once out of sight.
 * @param {'home' | 'away'} side @param {Point} end  Where they were at the whistle.
 * @param {number} since  ms since the whistle. @param {number} total  The handshakes' length, ms.
 * @param {{ ceremonies: CeremonySettings, jogSpeed: number, homeWon?: boolean }} s
 * @returns {Point | null}
 */
export function managerHandshakes(side, end, since, total, { ceremonies: c, jogSpeed, homeWon = true }) {
  const jog = jogSpeed / 1000;
  const p = handshakeParts(total, c, homeWon);
  const meet = { x: TUNNEL.mouth.x + (side === 'home' ? -1 : 1) * MEET_GAP, y: MANAGER_Y };
  const legs = intoTunnel(end, [{ to: meet, at: 0, v: jog, by: p.huddleAt * 0.6 }], p.huddleAt + (side === 'home' ? 0 : c.walkOnGapMs), total, jog);
  const pos = route(end, legs, since);
  return gone(legs, pos, since) ? null : pos;
}

/** How far either side of halfway the managers stand to shake hands (pitch fractions across): an arm's length. */
const MEET_GAP = 0.012;

/** Where the referee stands in the line-up: between the two teams, on the centre spot. */
const REF_LINE = Object.freeze({ x: 0.5, y: 0.5 });
/** Where the referee waits while the teams warm up (by the tunnel), and during the handshakes (above the lines). */
const REF_WARM = Object.freeze({ x: 0.5, y: 0.1 });
const REF_WATCH = Object.freeze({ x: 0.5, y: 0.3 });

/**
 * The referee during the walk-out (Task 47): out of the tunnel after the managers, leading the teams to the line and standing
 * between them through the anthems, by the tunnel during the warm-up, then to REF_KICKOFF for the kick-off (where
 * pitchside.js starts the match). A re-air's trimmed line-up goes straight from the line to REF_KICKOFF.
 * @param {number} since  ms since the walk-out began. @param {number} left  ms until kick-off.
 * @param {{ ceremonies: CeremonySettings, jogSpeed: number, trimmed?: boolean }} s
 * @returns {Point}
 */
export function refereeWalkOut(since, left, { ceremonies: c, jogSpeed, trimmed = false }) {
  const v = jogSpeed / 1000;
  const total = since + left;
  const toSpot = { to: REF_KICKOFF, at: trimmed ? 0 : walkOutParts(total, c).breakFrom, v, by: total - c.breakLineSeconds * 1000 * 0.2 };
  if (trimmed) return route(REF_LINE, [toSpot], since);
  const parts = walkOutParts(total, c);
  return route(TUNNEL.back, [...outOfTunnel(OUT_ORDER.referee * c.walkOnGapMs, v), { to: REF_LINE, at: OUT_ORDER.referee * c.walkOnGapMs + IN_TUNNEL / v, v }, { to: REF_WARM, at: parts.warmFrom, v }, toSpot], since);
}

/**
 * The referee during the handshakes: from where they were at the whistle to a spot above the lines to watch, then
 * off into the tunnel first as the teams head off. Null once out of sight.
 * @param {Point} end  Where they were at the whistle.
 * @param {number} since  ms since the whistle. @param {number} total  The handshakes' length, ms.
 * @param {{ ceremonies: CeremonySettings, jogSpeed: number, homeWon?: boolean }} s
 * @returns {Point | null}
 */
export function refereeHandshakes(end, since, total, { ceremonies: c, jogSpeed, homeWon = true }) {
  const jog = jogSpeed / 1000;
  const p = handshakeParts(total, c, homeWon);
  const legs = intoTunnel(end, [{ to: REF_WATCH, at: 0, v: jog, by: p.huddleAt * 0.8 }], p.leaveAt, total, jog);
  const pos = route(end, legs, since);
  return gone(legs, pos, since) ? null : pos;
}

/**
 * Players during the handshakes: the whole squads, from where they were at the final whistle (on the pitch or on the
 * bench). Anyone who has gone down the tunnel is left out.
 *   - Each team gathers in a huddle just off its end of the lines (home left of halfway, away right), idling gently.
 *   - Then they peel off one at a time into their line and walk straight along it past every opponent, a procession at
 *     handshakeLineSpeed (quicker only if a short re-air needs it), with no setting up (Task 43). Both lines reach the
 *     line in step, a player every LINE_GAP, so opposing pairs meet at the same moments: everyone holds for
 *     handshakePauseMs as each meets (Task 74), a handshake's beat.
 *   - After a home win, as each player comes off the end of the line they head for the salute or their bench, then
 *     everyone walks off down the tunnel; otherwise both teams head straight off in pairs (Task 74).
 * @param {Placed[]} end  Where everyone was at the final whistle, substitutes included.
 * @param {number} since  ms since the whistle. @param {number} total  The handshakes' length, ms.
 * @param {{ ceremonies: CeremonySettings, jogSpeed: number, keeperSlot: string, homeWon: boolean, winner?: 'home' | 'away' | null, cheer?: boolean }} s
 *   winner and cheer (Task 278l): the winners cheer in their huddle and through the salute.
 * @returns {(Placed & { arms?: 'both' | 'right' | 'none' })[]}
 */
export function handshakePose(end, since, total, { ceremonies: c, jogSpeed, keeperSlot, homeWon, winner = null, cheer = false }) {
  const jog = jogSpeed / 1000;
  const p = handshakeParts(total, c, homeWon);
  const home = keepersLast(end.filter((q) => q.side === 'home'), keeperSlot);
  const away = keepersLast(end.filter((q) => q.side === 'away'), keeperSlot);
  const n = Math.max(home.length, away.length, 1);
  // Half the lines' length: long enough that every pair meets on it, however the huddles empty out.
  const half = ((n - 1) * LINE_GAP + 2 * HUDDLE_R) / 2 + LINE_GAP;
  /** Each team's line: in at one end, out at the other; its huddle just off the in end. @param {'home' | 'away'} side */
  const lineOf = (side) => {
    const dir = side === 'home' ? 1 : -1;
    const y = side === 'home' ? SHAKE.homeY : SHAKE.awayY;
    const into = { x: 0.5 - dir * half, y };
    return { into, out: { x: 0.5 + dir * half, y }, huddle: { x: into.x - dir * HUDDLE_OFF, y: y - dir * HUDDLE_LIFT } };
  };
  /**
   * A player's spot in the huddle ring; the first to leave stands nearest the line.
   * @param {'home' | 'away'} side @param {number} i @param {number} count
   */
  const huddleSpot = (side, i, count) => {
    const { huddle } = lineOf(side);
    const a = (side === 'home' ? 0 : Math.PI) + (2 * Math.PI * i) / count;
    return { x: huddle.x + HUDDLE_R * Math.cos(a), y: huddle.y + 2 * HUDDLE_R * Math.sin(a) };
  };
  // The procession's pace: handshakeLineSpeed, or quicker if it wouldn't fit in its part with its beats (a short re-air).
  /** @type {[team: Placed[], side: 'home' | 'away'][]} */
  const teams = [[home, 'home'], [away, 'away']];
  const furthest = Math.max(0, ...teams.flatMap(([team, side]) => team.map((_, i) => dist(huddleSpot(side, i, team.length), lineOf(side).into))));
  const beats = 2 * n - 1;
  const v = Math.max(c.handshakeLineSpeed / 1000, ((n - 1) * LINE_GAP + furthest + 2 * half) / Math.max(1, p.passAt - p.huddleAt - beats * c.handshakePauseMs));
  const gapMs = LINE_GAP / v;
  // Procession time: player i of either team reaches the line at A0 + i·gapMs; home i and away j meet at
  // first + (i + j)·gapMs/2, where everyone holds for the beat. Real time runs on through the beats.
  const A0 = p.huddleAt + furthest / v;
  const first = A0 + half / v;
  const clock = beatClock(first, gapMs / 2, beats, c.handshakePauseMs);
  /** Going straight off (no home win): each pair goes in once the slower of them could reach the gate from the line's end. */
  const offLead = Math.max(...teams.map(([, side]) => dist(lineOf(side).out, pairMeet(laneOf(side))) / jog));
  /**
   * Where a player salutes the fans (after a home win) or waits by their bench, standing about rather than in a row.
   * @param {'home' | 'away'} side @param {number} i @param {number} count @param {string} playerId
   */
  const saluteOf = (side, i, count, playerId) => {
    if (side === 'home' && homeWon) return { x: 0.2 + (count > 1 ? (i * 0.6) / (count - 1) : 0.3), y: SALUTE_Y };
    const b = benchArea(side, i);
    const l = looseOf(playerId);
    return { x: b.x + l.across, y: b.y + l.down };
  };
  // Going off in pairs (Task 63): from leaveAt everyone heads for their lane just below the gate, timed to arrive as
  // their pair goes in, the first pair once the furthest walker could get there, then walkOnGapMs apart (closer, and
  // sooner, if a short re-air needs it), the last pair in by 90% of the ceremony.
  const room = Math.max(0, 0.9 * total - p.leaveAt);
  const lead = Math.min(room * 0.8, Math.max(0, ...teams.flatMap(([team, side]) => team.map((q, i) => dist(saluteOf(side, i, team.length, q.playerId), pairMeet(laneOf(side))) / jog))));
  const pairGap = Math.min(c.walkOnGapMs, (room - lead) / (n + 1));

  /** @type {(Placed & { arms?: 'both' | 'right' | 'none' })[]} */
  const out = [];
  for (const [team, side] of teams) {
    const line = lineOf(side);
    team.forEach((q, i) => {
      const spot = huddleSpot(side, i, team.length);
      const toLine = dist(spot, line.into);
      // In procession time: setting off from the huddle, and off the end of the line.
      const leavesP = A0 + i * gapMs - toLine / v;
      const doneP = A0 + i * gapMs + (2 * half) / v;
      const leaves = clock.real(leavesP);
      const done = clock.real(doneP);
      const salute = saluteOf(side, i, team.length, q.playerId);
      // Leaving: in pairs, the i-th of each team side by side.
      const dx = laneOf(side);
      /** @type {Point} */
      let pos;
      /** The winners' cheer, 0–1 (Task 278l): through the huddle's idle, and the salute. */
      let cheering = 0;
      if (since < leaves) {
        // To the huddle, then a gentle idle there (faded in and out, so nothing jumps).
        pos = route(q, [{ to: spot, at: 0, v: jog, by: p.huddleAt * 0.8 }], since);
        const idle = Math.max(0, Math.min(1, (since - p.huddleAt * 0.8) / 500, (leaves - since) / 500));
        if (cheer && side === winner) cheering = idle;
        const sway = swayOf('handshake', q.playerId, since);
        pos = { x: pos.x + sway.x * idle * HUDDLE_SWAY, y: pos.y + sway.y * idle * HUDDLE_SWAY };
      } else if (since < done) {
        // In the procession: from the huddle into the line and along it, at an even pace but for the beats.
        const s = (clock.procession(since) - leavesP) * v;
        pos = s < toLine ? lerp(spot, line.into, s / toLine) : lerp(line.into, line.out, (s - toLine) / (2 * half));
      } else if (!homeWon) {
        // No salute: straight off in pairs, from the end of the line.
        const legs = inAsPair(line.out, [], done, clock.real(A0 + i * gapMs + (2 * half) / v) + offLead, dx, total, jog);
        pos = route(line.out, legs, since);
        if (gone(legs, pos, since)) return;
      } else {
        const by = Math.max(done + 1, p.passAt + 0.6 * (p.leaveAt - p.passAt));
        /** @type {Leg[]} */
        let toSalute = [{ to: salute, at: done, v: jog, by }];
        const losing = side === 'away';
        if (losing) {
          // The losers (Tom): each their own way to the bench, bowing off the straight, at their own pace.
          const l = looseOf(q.playerId);
          const ax = salute.x - line.out.x;
          const ay = (salute.y - line.out.y) / 2;
          const len = Math.hypot(ax, ay) || 1;
          const mid = { x: (line.out.x + salute.x) / 2 - (ay / len) * l.bow, y: (line.out.y + salute.y) / 2 + ((ax / len) * l.bow) * 2 };
          const v = jog * l.pace;
          // The deadline shared between the two legs by their length, so a short re-air never makes them sprint the second.
          const d1 = dist(line.out, mid);
          const midBy = done + (by - done) * (d1 / Math.max(1e-9, d1 + dist(mid, salute)));
          toSalute = [{ to: mid, at: done, v, by: midBy }, { to: salute, at: Math.min(done + d1 / v, midBy), v, by }];
        }
        // After the referee (who leaves at leaveAt): each pair meets just below the gate and goes in together.
        const legs = inAsPair(line.out, toSalute, p.leaveAt, p.leaveAt + lead + (i + 1) * pairGap, dx, total, jog);
        pos = route(line.out, legs, since);
        if (gone(legs, pos, since)) return;
        if (losing) {
          // Standing about by the bench: a gentle sway once there, faded in and out.
          const idle = Math.max(0, Math.min(1, (since - by) / 500, (p.leaveAt - since) / 500));
          const sway = swayOf('handshake', q.playerId, since);
          pos = { x: pos.x + sway.x * idle * HUDDLE_SWAY, y: pos.y + sway.y * idle * HUDDLE_SWAY };
        }
      }
      // Saluting: a little hop on the spot once they're there.
      const saluting = side === 'home' && homeWon && since > p.passAt + 0.6 * (p.leaveAt - p.passAt) && since < p.leaveAt;
      if (cheer && saluting) cheering = 1;
      if (cheering > 0) {
        const w = winnerCheer(since, i, cheering);
        out.push({ ...q, x: pos.x, y: pos.y + w.dy, arms: w.arms });
        return;
      }
      const hop = saluting && Math.floor(since / 300 + i) % 2 === 0 ? -0.012 : 0;
      out.push({ ...q, x: pos.x, y: pos.y + hop });
    });
  }
  return out;
}

/**
 * The handshakes' parts, as ms from the whistle: the huddles until huddleAt, the procession until passAt, the salute
 * (or the benches) until leaveAt, then off down the tunnel. Without a home win there's no salute (leaveAt is passAt),
 * and `total` is the shorter handshakeLength: the huddle and the procession last as long as after a home win.
 * @param {number} total @param {CeremonySettings} c @param {boolean} [homeWon]
 */
export function handshakeParts(total, c, homeWon = true) {
  const { huddle, pass, salute } = c.handshakeParts;
  const full = homeWon ? total : total / (huddle + pass + STRAIGHT_OFF);
  const huddleAt = huddle * full;
  const passAt = huddleAt + pass * full;
  return { huddleAt, passAt, leaveAt: homeWon ? passAt + salute * full : passAt };
}

/**
 * How long the handshakes last (Task 74): the full length after a home win (the home side salutes the fans), shorter
 * otherwise, as both teams head straight off after the procession.
 * @param {number} full  ms (segments.handshakeMinutes, or reairs.handshakeSeconds). @param {CeremonySettings} c
 * @param {boolean} homeWon
 */
export function handshakeLength(full, c, homeWon) {
  return homeWon ? full : Math.round(full * (c.handshakeParts.huddle + c.handshakeParts.pass + STRAIGHT_OFF));
}

/**
 * A clock that holds for a beat at regular moments (the handshakes, Task 74): procession time runs with real time but
 * stops for `pause` ms at first, first + step, … (`count` of them).
 * @param {number} first @param {number} step @param {number} count @param {number} pause
 */
function beatClock(first, step, count, pause) {
  return {
    /** Procession time to real time. @param {number} p */
    real: (p) => p + pause * Math.min(count, Math.max(0, Math.ceil((p - first) / step))),
    /** Real time to procession time (held during each beat). @param {number} t */
    procession: (t) => {
      if (t <= first) return t;
      const k = Math.floor((t - first) / (step + pause));
      if (k >= count) return t - count * pause;
      const r = t - first - k * (step + pause);
      return first + k * step + Math.max(0, r - pause);
    },
  };
}

/** The walk from the back of the tunnel to its mouth, in pitch lengths. */
const IN_TUNNEL = Math.abs(TUNNEL.mouth.y - TUNNEL.back.y) / 2;

/** The back of the tunnel, in a lane (dx across from the middle). @param {number} [dx] */
const tunnelBack = (dx = 0) => ({ x: TUNNEL.back.x + dx, y: TUNNEL.back.y });

/**
 * Out of the tunnel: from its back to the mouth (in a lane, dx across from the middle), setting off at `at` (ms) at
 * speed v (pitch lengths per ms). The next leg should start IN_TUNNEL / v later, as they reach the mouth.
 * @param {number} at @param {number} v @param {number} [dx]
 * @returns {Leg[]}
 */
const outOfTunnel = (at, v, dx = 0) => [{ to: { x: TUNNEL.mouth.x + dx, y: TUNNEL.mouth.y }, at, v }];

/** Where each pair meets before going in: on the pitch just below the gate, in their lane (dx). @param {number} dx */
const pairMeet = (dx) => ({ x: TUNNEL.mouth.x + dx, y: 0.04 });

/**
 * Add the walk off into the tunnel as one of a pair (Task 63): to the meeting point below the gate in their lane,
 * arriving as the pair goes in at `at` (ms; setting off as late as they can, but not before `earliest`), then
 * straight up through the gate and in, out of sight by 98% of the ceremony. Someone by the bench meets them at the mouth.
 * @param {Point} start @param {Leg[]} legs  Their legs before this. @param {number} earliest @param {number} at
 * @param {number} dx  Their lane.
 * @param {number} total @param {number} jog  Pitch lengths per ms.
 * @returns {Leg[]}
 */
function inAsPair(start, legs, earliest, at, dx, total, jog) {
  const meet = pairMeet(dx);
  const mouth = { x: TUNNEL.mouth.x + dx, y: TUNNEL.mouth.y };
  const from = route(start, legs, earliest);
  const up = dist(meet, mouth) / jog;
  const inside = { to: tunnelBack(dx), at: at + up, v: jog, by: total * 0.98 };
  // Someone already above the boards (by the bench) meets their partner at the mouth instead, not stepping over the
  // boards and back.
  if (from.y < 0) return [...legs, { to: mouth, at: Math.max(earliest, at + up - dist(from, mouth) / jog), v: jog, by: at + up }, inside];
  const go = Math.max(earliest, at - dist(from, meet) / jog);
  return [...legs, { to: meet, at: go, v: jog, by: at }, { to: mouth, at, v: jog }, inside];
}

/**
 * Add the walk off into the tunnel to someone's legs: to the mouth from `at` (ms), quicker if needed to reach it by
 * 95% of the ceremony, then straight in as they arrive (no queue at the mouth), out of sight by 98%.
 * @param {Point} start @param {Leg[]} legs  Their legs before this. @param {number} at @param {number} total
 * @param {number} jog  Pitch lengths per ms.
 * @returns {Leg[]}
 */
function intoTunnel(start, legs, at, total, jog) {
  const toMouth = { to: TUNNEL.mouth, at, v: jog, by: total * 0.95 };
  const d = dist(route(start, legs, at), TUNNEL.mouth);
  const v = toMouth.by > at ? Math.max(jog, d / (toMouth.by - at)) : jog;
  return [...legs, toMouth, { to: TUNNEL.back, at: at + d / v, v: jog, by: total * 0.98 }];
}

/** Gone: into the tunnel and out of sight. @param {Leg[]} legs  From intoTunnel. @param {Point} pos @param {number} since */
const gone = (legs, pos, since) => since >= /** @type {Leg} */ (legs.at(-1)).at && pos.y <= TUNNEL.back.y + 1e-6;

/** @param {Point} a @param {Point} b @param {number} f */
function lerp(a, b, f) {
  const t = Math.min(1, Math.max(0, f));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * The caption during the walk-out: the teams coming out, each anthem, the warm-up, then taking positions.
 * @param {number} since @param {number} left
 * @param {{ homeId: string, awayId: string }} match @param {(teamId: string) => string} teamName
 * @param {CeremonySettings} c
 * @param {{ ground: string, city: string }} [home]  Where (Tom's note 14): the first half of the walk-on welcomes the
 *   viewer to the home side's ground, "WELCOME TO THE ROOKERY · Wrenhollow".
 * @returns {import('./captions.js').Caption}
 */
export function walkOutCaption(since, left, match, teamName, c, home) {
  const p = walkOutParts(since + left, c);
  const teams = `${teamName(match.homeId)} v ${teamName(match.awayId)}`;
  const welcomeUntil = home?.ground ? p.anthemsFrom / 2 : 0;
  /** @type {[number, number, string, string, string | null][]} from, until, title, detail, team for the stripe */
  const parts = [
    ...(/** @type {[number, number, string, string, string | null][]} */ (home?.ground ? [[0, welcomeUntil, `WELCOME TO ${home.ground.toUpperCase()}`, home.city, match.homeId]] : [])),
    [welcomeUntil, p.anthemsFrom, 'THE TEAMS WALK OUT', teams, null],
    [p.anthemsFrom, p.awayAnthemFrom, 'HOME ANTHEM', teamName(match.homeId), match.homeId],
    [p.awayAnthemFrom, p.anthemsUntil, 'AWAY ANTHEM', teamName(match.awayId), match.awayId],
    [p.anthemsUntil, p.breakFrom, 'WARMING UP', teams, null],
    [p.breakFrom, since + left, 'TAKING POSITIONS', teams, null],
  ];
  const [from, until, title, detail, teamId] = parts.find(([, u]) => since < u) ?? parts[parts.length - 1];
  return { key: `walk_out|${title}|${match.homeId}`, kind: 'period', title, detail, teamId, f: frac(since, from, until) };
}

/**
 * The caption during the handshakes: the result, then the salute (after a home win), then the teams heading off.
 * @param {number} since @param {number} total
 * @param {{ homeId: string, awayId: string, score: [number, number] }} match @param {(teamId: string) => string} teamName
 * @param {boolean} homeWon @param {CeremonySettings} c
 * @returns {import('./captions.js').Caption}
 */
export function handshakeCaption(since, total, match, teamName, homeWon, c) {
  const { passAt, leaveAt } = handshakeParts(total, c, homeWon);
  const score = `${teamName(match.homeId)} ${match.score[0]}-${match.score[1]} ${teamName(match.awayId)}`;
  /** @type {[number, number, string, string, string | null][]} */
  const parts = [
    [0, passAt, 'FULL TIME · HANDSHAKES', score, null],
    [passAt, leaveAt, homeWon ? `${teamName(match.homeId).toUpperCase()} SALUTE THE FANS` : 'FULL TIME', score, homeWon ? match.homeId : null],
    [leaveAt, total, 'THE TEAMS HEAD OFF', score, null],
  ];
  const [from, until, title, detail, teamId] = parts.find(([, u]) => since < u) ?? parts[parts.length - 1];
  return { key: `handshakes|${title}|${match.homeId}`, kind: 'period', title, detail, teamId, f: frac(since, from, until) };
}

/**
 * The caption over a re-air's line-up: it's a replay, and when the match was played.
 * @param {{ from: number, until: number }} seg @param {{ homeId: string, awayId: string, kickoff: number }} match
 * @param {(teamId: string) => string} teamName @param {string} played  e.g. "TUE 14:10". @param {number} t
 * @returns {import('./captions.js').Caption}
 */
export function replayCaption(seg, match, teamName, played, t) {
  return { key: `replay|${match.kickoff}|${seg.from}`, kind: 'period', title: 'FULL MATCH REPLAY', detail: `${teamName(match.homeId)} v ${teamName(match.awayId)} · played ${played}`, teamId: null, f: frac(t, seg.from, seg.until) };
}

/**
 * A warm-up spot: seeded, in the player's own half (home defends the left goal in the first half); keepers in goal.
 * @param {string} matchId @param {Placed} p @param {number} k  Which move of the warm-up. @param {string} keeperSlot
 * @returns {Point}
 */
function warmUpSpot(matchId, p, k, keeperSlot) {
  const rng = createRng(`${matchId}|warmup|${p.playerId}|${k}`);
  const home = p.side === 'home';
  if (p.slot === keeperSlot) return { x: home ? 0.05 : 0.95, y: 0.5 + rng.float(-0.06, 0.06) };
  return { x: home ? rng.float(0.1, 0.42) : rng.float(0.58, 0.9), y: rng.float(0.15, 0.85) };
}

/**
 * Where someone is at `t` who starts at `start` and follows `legs` in order. Each leg starts from wherever they are
 * when it begins (even mid-way through the last), so the path never jumps.
 * @param {Point} start @param {Leg[]} legs @param {number} t
 * @returns {Point}
 */
function route(start, legs, t) {
  let from = start;
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    if (t < leg.at) return i === 0 ? start : from;
    const next = legs[i + 1];
    const until = next && next.at <= t ? next.at : t;
    const d = dist(from, leg.to);
    const v = leg.by !== undefined && leg.by > leg.at ? Math.max(leg.v ?? 0, d / (leg.by - leg.at)) : leg.v ?? 0;
    from = travel(from, leg.to, until - leg.at, v);
    if (!(next && next.at <= t)) return from;
  }
  return from;
}

/**
 * A walker from `a` to `b` at speed `v` (pitch lengths per ms), easing in and out, `dt` ms after setting off.
 * @param {Point} a @param {Point} b @param {number} dt @param {number} v
 * @returns {Point}
 */
function travel(a, b, dt, v) {
  const d = dist(a, b);
  const f = d < 1e-9 ? 1 : Math.min(1, Math.max(0, (dt * v) / d));
  if (f === 1) return { x: b.x, y: b.y };
  const e = f * f * (3 - 2 * f);
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
}

/** @param {Starter[]} starters @param {string} keeperSlot */
const keepersLast = (starters, keeperSlot) => [...starters.filter((p) => p.slot !== keeperSlot), ...starters.filter((p) => p.slot === keeperSlot)];

/** @param {Point} a @param {Point} b */
const dist = (a, b) => Math.hypot(b.x - a.x, (b.y - a.y) / 2);

/** @param {number} t @param {number} from @param {number} until */
const frac = (t, from, until) => Math.min(1, Math.max(0, (t - from) / Math.max(1, until - from)));

/** @param {Starter} p */
const starter = (p) => ({ playerId: p.playerId, slot: p.slot });

/** @param {number} v @param {number} margin */
const clamp = (v, margin) => Math.min(1 - margin, Math.max(margin, v));
