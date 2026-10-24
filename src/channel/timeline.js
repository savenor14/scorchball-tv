// Match timeline: places one match's events in real time and gives the match state at any moment.
// Pure and DOM-free. See docs/channel.md §5.
//
// Times here are milliseconds since kick-off ("elapsed"), not wall-clock time, so the same timeline drives a
// live match (elapsed = now − kickoff) and a replay (elapsed = time since the replay began × replay speed).
//
// Game clock to real time is linear within each period (settings.match.realMinutes for the 2 halves). The clock
// stops for half-time, the break before overtime and the break before a shootout. It also pauses for
// match.goalPauseSeconds after a goal and match.subPauseSeconds after a substitution (one pause per moment, the longest;
// none at the very end of a period, except after a golden goal: Task 147, so it's celebrated like any goal and the final
// whistle comes after its pause), and for match.freeShotPauseSeconds between
// a foul and the free shot it gives (Task 67: the sim has them at the same moment; the referee places the ball), and
// for match.foulPauseSeconds after any other foul (Task 144: the referee sets the ball, a restart pass):
// events after them move later, and a match's duration grows by its pauses. The sim's game time is unchanged. Shootout kicks are spaced
// settings.match.shootoutKickRealSeconds apart, the final whistle a goal's pause after the last (Task 277b). Event clocks are whole game-seconds and several events can share
// one (the half-time whistle and the second-half kick-off are both at 20:00), so each event's period comes
// from the kick-offs before it, not from its clock.

/**
 * @typedef {import('../chronicle/eventLog.js').LeagueEvent} LeagueEvent
 * @typedef {'goal' | 'substitution' | 'free_shot' | 'foul'} PauseKind
 * @typedef {{ at: number, ms: number, clock: number, period: number, kind: PauseKind }} Pause  The clock stopped for
 *   `ms` from elapsed `at` (the moment of the goal or substitution), at game clock `clock`, in period 1–3.
 * @typedef {'pre' | 'first_half' | 'half_time' | 'second_half' | 'overtime_break' | 'overtime' | 'shootout_break' | 'shootout' | 'finished'} Phase
 * @typedef {{ playerId: string, slot: string }} PitchPlayer
 *
 * @typedef {object} TimedEvent
 * @property {Readonly<LeagueEvent>} event
 * @property {number} at  Elapsed ms when it happens on screen.
 *
 * @typedef {object} MatchState
 * @property {Phase} phase
 * @property {number} clock        Game clock in seconds (fractional while play runs; stopped during breaks and pauses).
 * @property {PauseKind | null} paused  The clock is paused for a goal or substitution (the phase stays the period's).
 * @property {[number, number]} score  Home, away.
 * @property {[number, number] | null} shootout  Kicks scored, once a shootout has begun.
 * @property {string | null} possession  Team id with the ball.
 * @property {'defensive' | 'middle' | 'attacking'} zone  From the point of view of the team with the ball.
 * @property {string | null} carrierId   Last known player on the ball (null right after a restart).
 * @property {number} heat         0–100, rising with possession time.
 * @property {'cool' | 'warm' | 'hot'} heatStage
 * @property {{ home: PitchPlayer[], away: PitchPlayer[] }} onPitch
 * @property {number} spell        Counts possession spells (kick-offs and changes of possession) so far.
 * @property {number} revealed     How many of the timeline's events have happened.
 * @property {TimedEvent | null} last  The most recent event (excluding lineups).
 */

/**
 * @param {{ events: readonly Readonly<LeagueEvent>[], homeId: string, awayId: string }} match
 * @param {import('../config.js').Config} config
 */
export function createTimeline(match, { settings, rules }) {
  const { events, homeId, awayId } = match;
  const half = rules.match.halfMinutes * 60;
  const msPerGameSecond = (settings.match.realMinutes * 60_000) / (2 * half);
  const halfTimeMs = settings.match.halfTimeRealMinutes * 60_000;
  const breakMs = settings.match.overtimeBreakRealMinutes * 60_000;
  const kickMs = settings.match.shootoutKickRealSeconds * 1000;
  const pauseMs = { goal: settings.match.goalPauseSeconds * 1000, substitution: settings.match.subPauseSeconds * 1000, free_shot: settings.match.freeShotPauseSeconds * 1000, foul: settings.match.foulPauseSeconds * 1000 };

  const result = /** @type {any} */ (events.at(-1)?.data);
  if (events.at(-1)?.type !== 'match_result') throw new Error(`Match ${events[0]?.matchId} has no match_result: is it finished?`);
  const goldenGoal = result.decidedBy === 'overtime';
  const shootout = result.decidedBy === 'shootout';
  const overtime = goldenGoal || shootout;

  // Real-time offset (ms) added to clock × msPerGameSecond in each period, before pauses.
  const offset = [0, 0, halfTimeMs, halfTimeMs + breakMs];
  const overtimeEndClock = goldenGoal
    ? /** @type {number} */ (events.findLast((e) => e.type === 'goal')?.clock)
    : 2 * half + rules.match.overtimeMinutes * 60;
  // Each period's game-clock span (periods 1–3), to tell which pauses fall inside play.
  const periodFrom = [0, 0, half, 2 * half];
  const periodTo = [0, half, 2 * half, overtimeEndClock];

  /** @type {TimedEvent[]} */
  const timed = [];
  /** @type {Pause[]} */
  const pauses = [];
  let shift = 0; // pauses so far
  let period = 0;
  let kick = 0;
  let shootoutStart = 0;
  for (const event of events) {
    if (event.type === 'kickoff') period++;
    const p = Math.max(1, period);
    let at;
    if (event.type === 'shootout_kick') {
      if (kick === 0) shootoutStart = overtimeEndClock * msPerGameSecond + offset[3] + shift + breakMs;
      at = shootoutStart + ++kick * kickMs;
    } else if (event.type === 'match_result' || event.type === 'player_of_the_match') {
      // The final whistle: after the last moment, and after its pause if it has one (a golden goal, Task 147). The player
      // of the match (Task 214), logged just before the result, is named then too (after a shootout's kicks).
      const lastAt = timed.at(-1)?.at ?? 0;
      const lastPause = pauses.at(-1);
      // After a shootout the last kick, which settles it, is held like a goal (Task 277b: it was cut off at its moment).
      const lastKickAt = kick > 0 ? shootoutStart + kick * kickMs : -1;
      at = lastPause && lastPause.at === lastAt ? lastAt + lastPause.ms : lastAt === lastKickAt ? lastAt + pauseMs.goal : lastAt;
    }
    else if (event.type === 'substitution' && timed.at(-1)?.event.type === 'substitution' && timed.at(-1)?.event.clock === event.clock) {
      // Both teams changing at the same moment share it (and its one pause).
      at = /** @type {TimedEvent} */ (timed.at(-1)).at;
    } else at = /** @type {number} */ (event.clock) * msPerGameSecond + offset[p] + shift;
    // A free shot waits a beat after its foul: the pause starts at the foul's moment, and the free shot (and the rest of
    // that game second) comes after it.
    const clockNow = /** @type {number} */ (event.clock);
    if (event.type === 'free_shot' && period > 0 && clockNow > periodFrom[p] && clockNow < periodTo[p] && pauseMs.free_shot > 0) {
      pauses.push({ at, ms: pauseMs.free_shot, clock: clockNow, period: p, kind: 'free_shot' });
      shift += pauseMs.free_shot;
      at += pauseMs.free_shot;
    }
    timed.push({ event, at });

    // A foul that doesn't give a free shot (Task 144): the play stops briefly where it was, for a restart.
    const ordinaryFoul = event.type === 'foul' && /** @type {any} */ (event.data)?.zone !== 'attacking';
    /** @type {PauseKind | null} */
    const kind = event.type === 'goal' || event.type === 'substitution' ? event.type : ordinaryFoul ? 'foul' : null;
    const clock = /** @type {number} */ (event.clock);
    // The golden goal itself ends overtime at its clock, but is paused for all the same (Task 147).
    const golden = goldenGoal && event.type === 'goal' && p === 3 && clock === overtimeEndClock;
    if (kind && pauseMs[kind] > 0 && period > 0 && clock > periodFrom[p] && (clock < periodTo[p] || golden)) {
      const last = pauses.at(-1);
      if (last && last.at === at) {
        // One pause per moment: the longest of its events.
        const extra = Math.max(0, pauseMs[kind] - last.ms);
        last.ms += extra;
        shift += extra;
        if (kind === 'goal' || (last.kind === 'foul' && extra > 0)) last.kind = kind;
      } else {
        pauses.push({ at, ms: pauseMs[kind], clock, period: p, kind });
        shift += pauseMs[kind];
      }
    }
  }
  const duration = timed.at(-1)?.at ?? 0;

  // Play, pause and break segments, for the phase and game clock at any moment.
  /** @type {Segment[]} */
  const segments = [];
  const sumMs = (/** @type {Pause[]} */ list) => list.reduce((t, q) => t + q.ms, 0);
  /** Period p's play, split by its pauses. Returns when it ends. @param {Phase} phase @param {number} p */
  const play = (phase, p) => {
    const base = offset[p] + sumMs(pauses.filter((q) => q.period < p));
    let clock = periodFrom[p];
    let at = clock * msPerGameSecond + base;
    for (const q of pauses.filter((q) => q.period === p)) {
      segments.push({ phase, from: at, to: q.at, clockFrom: clock, clockTo: q.clock, paused: null });
      segments.push({ phase, from: q.at, to: q.at + q.ms, clockFrom: q.clock, clockTo: q.clock, paused: q.kind });
      at = q.at + q.ms;
      clock = q.clock;
    }
    const end = periodTo[p] * msPerGameSecond + base + sumMs(pauses.filter((q) => q.period === p));
    segments.push({ phase, from: at, to: end, clockFrom: clock, clockTo: periodTo[p], paused: null });
    return end;
  };
  /** A break with the clock stopped. @param {Phase} phase @param {number} from @param {number} to @param {number} clock */
  const stopped = (phase, from, to, clock) => segments.push({ phase, from, to, clockFrom: clock, clockTo: clock, paused: null });

  const firstEnd = play('first_half', 1);
  stopped('half_time', firstEnd, firstEnd + halfTimeMs, half);
  const secondEnd = play('second_half', 2);
  if (overtime) {
    stopped('overtime_break', secondEnd, secondEnd + breakMs, 2 * half);
    const overtimeEnd = play('overtime', 3);
    if (shootout) {
      stopped('shootout_break', overtimeEnd, shootoutStart, overtimeEndClock);
      stopped('shootout', shootoutStart, duration, overtimeEndClock);
    }
  }

  const heatRules = rules.heat;
  const lineups = new Map(events.filter((e) => e.type === 'lineup').map((e) => [e.teamId, /** @type {any} */ (e.data).starters]));

  /** How many events have happened by `elapsed` (binary search). @param {number} elapsed */
  const countAt = (elapsed) => {
    let lo = 0;
    let hi = timed.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (timed[mid].at <= elapsed) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };

  /** @type {Map<number, MatchState>} */
  const throughCache = new Map();

  return {
    homeId,
    awayId,
    /** Every event with its on-screen time, in order. */
    events: /** @type {readonly TimedEvent[]} */ (timed),
    /** Every clock pause (goals and substitutions), in order. */
    pauses: /** @type {readonly Readonly<Pause>[]} */ (pauses),
    /** The breaks between periods (half-time, before overtime), elapsed ms from and to, in order (Task 63: the tunnel gate). */
    breaks: /** @type {readonly { from: number, to: number }[]} */ (segments.filter((g) => g.phase === 'half_time' || g.phase === 'overtime_break').map((g) => ({ from: g.from, to: g.to }))),
    /** Elapsed ms from kick-off to the final whistle (after a shootout, a goal's pause after the last kick: Task 277b). */
    duration,
    decidedBy: /** @type {'regulation' | 'overtime' | 'shootout'} */ (result.decidedBy),
    /** The golden goal's moment, if the match was won by one (Task 147), or -1. */
    goldenAt: goldenGoal ? timed.findLast((t) => t.event.type === 'goal')?.at ?? -1 : -1,
    countAt,

    /**
     * The match as it stands `elapsed` ms after kick-off. Cheap enough to call every frame.
     * @param {number} elapsed
     * @returns {MatchState}
     */
    stateAt(elapsed) {
      return build(countAt(elapsed), elapsed);
    },

    /**
     * The match right after its first `count` events, at the moment the last of them happened. Cached; treat as read-only.
     * @param {number} count
     * @returns {MatchState}
     */
    stateThrough(count) {
      let s = throughCache.get(count);
      if (!s) throughCache.set(count, (s = build(count, count > 0 ? timed[count - 1].at : -1)));
      return s;
    },
  };

  /**
   * @param {number} count  Events to apply.
   * @param {number} elapsed  For the phase, clock and heat.
   * @returns {MatchState}
   */
  function build(count, elapsed) {
    /** @type {{ home: PitchPlayer[], away: PitchPlayer[] }} */
    const onPitch = {
      home: (lineups.get(homeId) ?? []).map((/** @type {PitchPlayer} */ p) => ({ ...p })),
      away: (lineups.get(awayId) ?? []).map((/** @type {PitchPlayer} */ p) => ({ ...p })),
    };
    const sideOf = (/** @type {string | null} */ teamId) => (teamId === homeId ? onPitch.home : onPitch.away);

    /** @type {[number, number]} */
    let score = [0, 0];
    /** @type {[number, number] | null} */
    let kicks = null;
    /** @type {string | null} */
    let possession = null;
    /** @type {MatchState['zone']} */
    let zone = 'middle';
    /** @type {string | null} */
    let carrierId = null;
    let heatFrom = 0; // game clock when heat last reset
    let spell = 0;
    let revealed = 0;
    /** @type {TimedEvent | null} */
    let last = null;

    for (let i = 0; i < count; i++) {
      const te = timed[i];
      const e = te.event;
      const data = /** @type {any} */ (e.data);
      revealed++;
      if (e.type !== 'lineup') last = te;
      switch (e.type) {
        case 'kickoff':
          possession = e.teamId; zone = 'middle'; carrierId = null; heatFrom = /** @type {number} */ (e.clock); spell++;
          break;
        case 'possession_change':
          possession = e.teamId; zone = data.zone; carrierId = e.playerId; heatFrom = /** @type {number} */ (e.clock); spell++;
          break;
        case 'advance':
          zone = data.to; carrierId = e.playerId;
          break;
        case 'free_shot':
          carrierId = e.playerId; heatFrom = /** @type {number} */ (e.clock);
          break;
        case 'shot':
          carrierId = e.playerId;
          break;
        case 'goal':
          score = data.score;
          break;
        case 'shootout_kick':
          kicks = data.shootout;
          break;
        case 'injury': {
          if (data.playsOn) break; // the last player on plays on hurt (Task 271)
          const side = sideOf(e.teamId);
          const i = side.findIndex((p) => p.playerId === e.playerId);
          if (i >= 0) side.splice(i, 1);
          break;
        }
        case 'substitution': {
          const side = sideOf(e.teamId);
          const i = side.findIndex((p) => p.playerId === data.offId);
          if (i >= 0) side[i] = { playerId: /** @type {string} */ (e.playerId), slot: data.slot };
          else side.push({ playerId: /** @type {string} */ (e.playerId), slot: data.slot }); // replacing an injured player
          break;
        }
      }
    }

    const { phase, clock, paused } = phaseAt(segments, elapsed, duration);
    const playing = phase === 'first_half' || phase === 'second_half' || phase === 'overtime';
    // After a goal the ball is dead until the restart, so it's cool.
    const heat = playing && possession && paused !== 'goal' ? Math.min(100, Math.max(0, ((clock - heatFrom) * 100) / heatRules.burnSeconds)) : 0;
    const heatStage = heat >= heatRules.hotAt ? 'hot' : heat >= heatRules.warmAt ? 'warm' : 'cool';
    return { phase, clock, paused, score, shootout: kicks, possession, zone, carrierId, heat, heatStage, onPitch, spell, revealed, last };
  }
}

/** @typedef {ReturnType<typeof createTimeline>} Timeline */

/**
 * @typedef {{ phase: Phase, from: number, to: number, clockFrom: number, clockTo: number, paused: PauseKind | null }} Segment
 */

/**
 * @param {Segment[]} segments
 * @param {number} elapsed @param {number} duration
 * @returns {{ phase: Phase, clock: number, paused: PauseKind | null }}
 */
function phaseAt(segments, elapsed, duration) {
  if (elapsed < 0) return { phase: 'pre', clock: 0, paused: null };
  if (elapsed >= duration) return { phase: 'finished', clock: segments.findLast((s) => s.from < duration)?.clockTo ?? 0, paused: null };
  for (const s of segments) {
    if (elapsed < s.to) {
      const f = s.to > s.from ? (elapsed - s.from) / (s.to - s.from) : 0;
      return { phase: s.phase, clock: s.clockFrom + f * (s.clockTo - s.clockFrom), paused: s.paused };
    }
  }
  const lastSeg = /** @type {(typeof segments)[number]} */ (segments.at(-1));
  return { phase: lastSeg.phase, clock: lastSeg.clockTo, paused: null };
}
