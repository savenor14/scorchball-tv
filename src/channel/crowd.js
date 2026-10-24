// The crowd (Task 52): how the crowd reacts, and how worked up it is at any moment. Pure and DOM-free. See
// docs/channel.md §14.2. The crowd is mostly home fans.
//
//   Level (0–1), for the stands' fans to follow (Task 56); no longer heard (a continuous murmur sounded like violins,
//   Tom 2026-10-04, so the reactions carry the crowd): settings.crowd.base, rising as the ball nears the goal being attacked (fully for a home attack, less
//   for an away one), with the heat, and on a breakaway; higher in the final round and the playoffs, lower in re-airs
//   and at the breaks.
//   Reactions (cues): a roar at a goal (big for a home goal, bigger for a scorcher, a late equaliser or winner, or in
//   the playoffs; an away goal's cheer lingers the same way but smaller, from the away end, with the home crowd's boos
//   under it, Task 61), a groan at a miss (fuller for a home shot), an ooh at a
//   save (fuller on a breakaway), a soft ooh at a tackle or a block and a bigger one at a steal (Tom, 2026-10-04),
//   boos at the away side's fouls, and at the final whistle a roar after a home win or
//   a small cheer otherwise. A small cheer at the walk-out (as the teams come out and after each anthem) and the
//   handshakes (applause until Tom, 2026-10-20).
import { homeAttacksRight } from './formation.js';
import { handshakeParts, walkOutParts } from './ceremonies.js';
import { recipe } from './soundRecipes.js';

const PLAYING = new Set(['first_half', 'second_half', 'overtime']);
/** The crowd starts to rise once the ball is this far toward the goal being attacked, and is fully up this close to it. */
const PUSH_FROM = 0.35;
const PUSH_FULL = 0.1;
/** How loud the crowd's ooh is (on top of its level) at a tackle, a block and a steal; a save gets 0.65, or 1 on a breakaway. */
const TACKLE_OOH = 0.3;
const BLOCK_OOH = 0.4;
const STEAL_OOH = 0.5;
/** A home goal's cheer: roars starting this long (ms) after the goal, each this big (power and loudness, 0–1). */
const GOAL_CHEER = Object.freeze([[0, 1], [2400, 0.85], [4600, 0.7], [6600, 0.5]]);
/** A golden goal's cheer (Task 147): bigger and longer, each roar only a little smaller (the match is over). */
const GOLDEN_CHEER = Object.freeze([[0, 1], [1800, 1], [3600, 0.9], [5400, 0.8], [7000, 0.7]]);
/**
 * A small cheer (Tom, 2026-10-20: cheers in place of the applause everywhere it played): a roar this big (the small
 * roar's takes, plain or with whoops, whistles or clapping), at the walk-out, after each anthem, the handshakes, full
 * time after a draw or an away win, and the trophy lift's guard of honour and anthem.
 */
export const SMALL_CHEER = 0.3;
/** An away goal's cheer is this loud beside a home one's (the away end is small). */
const AWAY_CHEER = 0.6;
/** The home crowd's boos under an away goal's cheer: starting this long (ms) after the goal, each this loud. */
const AWAY_BOOS = Object.freeze([[500, 0.6], [2200, 0.4]]);
/** About how long a cheering roar takes to die away (ms): none starts so late that it would ring into the restart. */
const CHEER_TAIL_MS = 3800;
/** A goal this late in normal time (share of it), or any in overtime, counts as late. */
const LATE = 0.85;

/**
 * @typedef {object} CrowdSettings  settings.crowd
 * @property {number} base  The murmur while play is in midfield.
 * @property {number} attack  Added as the ball reaches the goal a home attack is going for.
 * @property {number} awayAttack  How much of that an away attack gets (0–1).
 * @property {number} heat  Added at full heat.
 * @property {number} breakaway  Added during a breakaway.
 * @property {number} bigStage  Added in the final round and the playoffs.
 * @property {number} reair  Re-airs are this much as loud (0–1).
 * @property {number} breaks  The level at half-time, before overtime and in pauses for substitutions.
 * @property {number} ceremony  The level during the walk-out and the handshakes.
 * @property {number} dipLevel  At a stoppage the murmur drops to this share of itself (0–1)...
 * @property {number} dipHoldSeconds  ...stays there until this long after play restarts...
 * @property {number} dipReturnSeconds  ...and comes back over this long.
 * @property {number} quietAfterSeconds  A quiet spell: this long after the last crowd reaction...
 * @property {number} quietFadeSeconds  ...the murmur eases down over this long...
 * @property {number} quietLevel  ...to this share of itself (0–1)...
 * @property {number} quietReturnSeconds  ...and comes back over this long from the next reaction.
 * @typedef {import('./sounds.js').Cue} Cue
 */

/**
 * The murmur's level at a moment of a match.
 * @param {import('./timeline.js').Timeline} timeline
 * @param {import('./motion.js').Pose | null} pose  Where the ball is (motion.at(e)).
 * @param {number} e  ms since kick-off.
 * @param {{ homeId: string, bigStage: boolean, reair: boolean, settings: CrowdSettings }} o
 */
export function crowdLevel(timeline, pose, e, { homeId, bigStage, reair, settings: c }) {
  const s = timeline.stateAt(e);
  let level;
  if (!PLAYING.has(s.phase) || s.paused === 'substitution') level = c.breaks;
  else {
    level = c.base;
    const ball = pose?.ball;
    if (ball && s.possession && !s.paused) {
      // How far the ball has gone toward the goal its team attacks (0 at its own goal, 1 at the other).
      const homeRight = homeAttacksRight(s.phase) === 1;
      const right = (s.possession === homeId) === homeRight;
      const toward = right ? ball.x : 1 - ball.x;
      const push = Math.min(1, Math.max(0, (toward - PUSH_FROM) / (1 - PUSH_FROM - PUSH_FULL)));
      level += c.attack * push * (s.possession === homeId ? 1 : c.awayAttack);
      level += c.heat * (s.heat / 100);
    }
    if (breakawayAt(timeline, e)) level += c.breakaway;
  }
  if (bigStage) level += c.bigStage;
  if (reair) level *= c.reair;
  return Math.min(1, Math.max(0, level));
}

/** The moments that stop play for a while: the clock pausing (a goal, a substitution) or the ball going dead (a miss, a held save, a foul, a burn). */
const STOPPAGES = new Set(['goal', 'substitution', 'miss', 'save', 'foul', 'burn']);
/** How far back (ms) a stoppage can still be holding the murmur down. */
const DIP_LOOKBACK_MS = 40_000;

/**
 * How much of the murmur plays at a moment (Tom, 2026-10-04: always on, it grates): at each stoppage it drops to
 * dipLevel, stays down through any pause and dipHoldSeconds into the next play, then comes back over
 * dipReturnSeconds. A parried save doesn't stop play, so it doesn't count.
 * @param {import('./timeline.js').Timeline} timeline @param {number} e  ms since kick-off.
 * @param {CrowdSettings} c
 */
export function murmurShare(timeline, e, c) {
  let share = 1;
  for (let i = timeline.countAt(e) - 1; i >= 0; i--) {
    const { event, at } = timeline.events[i];
    if (at < e - DIP_LOOKBACK_MS) break;
    if (!STOPPAGES.has(event.type) || (event.type === 'save' && /** @type {any} */ (event.data)?.parried)) continue;
    const restart = at + (timeline.pauses.find((p) => p.at === at)?.ms ?? 0);
    const back = restart + c.dipHoldSeconds * 1000;
    const f = e <= back ? 0 : Math.min(1, (e - back) / (c.dipReturnSeconds * 1000));
    share = Math.min(share, c.dipLevel + (1 - c.dipLevel) * f);
  }
  return share;
}

/**
 * How much of the murmur plays in a quiet spell (Task 60): once no crowd reaction has come for quietAfterSeconds, it
 * eases down to quietLevel over quietFadeSeconds, and comes back over quietReturnSeconds from the next reaction.
 * Kick-off counts as a reaction.
 * @param {number[]} reactions  When the crowd reacts (crowdCues' times), ms since kick-off, in order. @param {number} e
 * @param {CrowdSettings} c
 */
export function quietShare(reactions, e, c) {
  // The last reaction at or before e (index lo - 1).
  let lo = 0;
  let hi = reactions.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (reactions[mid] <= e) lo = mid + 1;
    else hi = mid;
  }
  const last = lo > 0 ? reactions[lo - 1] : 0;
  const before = lo > 1 ? reactions[lo - 2] : 0;
  /** How far down the murmur has eased at t, counting from a reaction at r (0 up, 1 fully down). */
  const down = (/** @type {number} */ r, /** @type {number} */ t) => Math.min(1, Math.max(0, (t - r - c.quietAfterSeconds * 1000) / (c.quietFadeSeconds * 1000)));
  // Coming back from wherever the spell had reached when this reaction came.
  const from = lo > 0 ? down(before, last) : 0;
  const back = Math.min(1, (e - last) / (c.quietReturnSeconds * 1000));
  return 1 - (1 - c.quietLevel) * Math.max(down(last, e), from * (1 - back));
}

/**
 * How lively the crowd is at a moment, 0–1 (Task 60): the one share the murmur and the stands both follow, so the fans
 * bob less while it's quiet and more as it comes back. The lower of the stoppage dip (murmurShare) and the quiet spell
 * (quietShare).
 * @param {import('./timeline.js').Timeline} timeline @param {number[]} reactions  As for quietShare. @param {number} e
 * @param {CrowdSettings} c
 */
export function liveliness(timeline, reactions, e, c) {
  return Math.min(murmurShare(timeline, e, c), quietShare(reactions, e, c));
}

/**
 * @typedef {'home' | 'away' | 'both'} Ends  Which supporters.
 * @typedef {{ level: number, jump: Ends | null, gasp: Ends | null, wave: Ends | null }} StandsMood
 *   level: how worked up the crowd is (crowdLevel). jump: those fans on their feet, jumping, arms up (a goal). gasp:
 *   arms up for a moment (a miss or a save). wave: waving (the anthems, the handshakes).
 */

/** After a miss or a save the shooting side's fans have their arms up this long (ms). */
const GASP_MS = 1500;

/**
 * The stands' mood at a moment of a match (Task 56): the scoring side's fans jump through the goal's cheer (until the
 * restart); the shooting side's fans gasp, arms up, after a miss or a save; otherwise they follow the crowd's level.
 * @param {import('./timeline.js').Timeline} timeline @param {number} e  ms since kick-off. @param {number} level  crowdLevel at e.
 * @param {{ homeId: string, goalPauseMs: number }} o
 * @returns {StandsMood}
 */
export function standsMood(timeline, e, level, { homeId, goalPauseMs }) {
  /** @type {StandsMood} */
  const mood = { level, jump: null, gasp: null, wave: null };
  for (let i = timeline.countAt(e) - 1; i >= 0; i--) {
    const { event, at } = timeline.events[i];
    if (at < e - Math.max(goalPauseMs, GASP_MS)) break;
    const ends = event.teamId === homeId ? 'home' : 'away';
    if (event.type === 'goal' && e < at + goalPauseMs) return { ...mood, jump: ends, level: 1 };
    // A miss or save: the shooters' fans (the event names the keeper's team for a save).
    if (event.type === 'miss' && e < at + GASP_MS) mood.gasp ??= ends;
    if (event.type === 'save' && e < at + GASP_MS) mood.gasp ??= ends === 'home' ? 'away' : 'home';
  }
  return mood;
}

/**
 * The stands' mood in the ceremonies (Task 56): in the walk-out each side's fans wave through their anthem; at the
 * handshakes everyone waves.
 * @param {'walk_out' | 'handshakes'} kind @param {number} since  ms since the segment began. @param {number} total
 * @param {import('./ceremonies.js').CeremonySettings} c @param {number} level  The ceremony's crowd level.
 * @returns {StandsMood}
 */
export function ceremonyMood(kind, since, total, c, level) {
  if (kind === 'handshakes') return { level, jump: null, gasp: null, wave: 'both' };
  const p = walkOutParts(total, c);
  const wave = since >= p.anthemsFrom && since < p.awayAnthemFrom ? 'home' : since >= p.awayAnthemFrom && since < p.anthemsUntil ? 'away' : null;
  return { level, jump: null, gasp: null, wave };
}

/** Whether a breakaway is on at e: from the advance that set it up to its shot. @param {import('./timeline.js').Timeline} tl @param {number} e */
function breakawayAt(tl, e) {
  const n = tl.countAt(e);
  for (let i = n - 1; i >= 0 && i >= n - 3; i--) {
    const { event } = tl.events[i];
    if (event.type === 'advance' && /** @type {any} */ (event.data)?.breakaway) return true;
    if (event.type === 'shot' || event.type === 'possession_change') return false;
  }
  return false;
}

/**
 * The crowd's reactions through a match, in time order.
 * @param {import('./timeline.js').Timeline} timeline
 * @param {{ matchId: string, homeId: string, bigStage: boolean, halfMinutes: number, goalPauseMs: number }} o
 *   halfMinutes: rules.match.halfMinutes. goalPauseMs: the clock stops this long after a goal (settings.match).
 * @returns {Cue[]}
 */
export function crowdCues(timeline, { matchId, homeId, bigStage, halfMinutes, goalPauseMs }) {
  /** @type {Cue[]} */
  const cues = [];
  const add = (/** @type {Cue['kind']} */ kind, /** @type {number} */ at, /** @type {Omit<Cue, 'kind' | 'at' | 'seed'>} */ extra = {}) =>
    cues.push({ kind, at, seed: `${matchId}|crowd|${kind}|${at}`, ...extra });
  const normalTime = 2 * halfMinutes * 60;
  let breakaway = false;
  for (const { event: e, at } of timeline.events) {
    const data = /** @type {any} */ (e.data) ?? {};
    const home = e.teamId === homeId;
    switch (e.type) {
      case 'advance': breakaway = Boolean(data.breakaway); break;
      case 'possession_change':
        breakaway = false;
        // A ball won: a soft ooh for a tackle, a bigger one for a steal (a pass cut out is more of a moment).
        if (data.reason === 'tackle') add('ooh', at, { gain: data.steal ? STEAL_OOH : TACKLE_OOH });
        break;
      case 'block': add('ooh', at, { gain: BLOCK_OOH }); break;
      case 'goal': {
        const late = (e.clock ?? 0) >= LATE * normalTime;
        const [h, a] = data.score ?? [0, 0];
        const mine = home ? h - a : a - h;
        const decisive = late && (mine === 0 || mine === 1);
        // A golden goal (Task 147): the biggest roar there is, through its whole celebration.
        const golden = at === timeline.goldenAt;
        // The crowd keeps cheering through the celebration (Tom, 2026-10-04): a run of overlapping roars, each a
        // little smaller, dying down just before the keeper restarts. (One long roar buzzed and rang.) An away goal's
        // the same but smaller, from the away end, with boos from the home crowd under it (Task 61).
        const power = golden ? (home ? 1 : 0.4) : home
          ? Math.min(1, 0.55 + (data.scorcher ? 0.15 : 0) + (decisive ? 0.25 : 0) + (bigStage ? 0.15 : 0))
          : 0.15 + (decisive ? 0.15 : 0);
        for (const [after, size] of golden ? GOLDEN_CHEER : GOAL_CHEER) {
          if (after + CHEER_TAIL_MS > goalPauseMs) break;
          add('roar', at + after, { power: power * size, gain: size * (home ? 1 : AWAY_CHEER) });
        }
        if (!home) for (const [after, gain] of AWAY_BOOS) add('jeer', at + after, { gain });
        break;
      }
      case 'miss': add('groan', at, { gain: home ? 1 : 0.5 }); break;
      // A save: the shooting side's fans groan less than the keeper's cheer; an ooh either way, fuller on a breakaway.
      case 'save': add('ooh', at, { gain: breakaway ? 1 : 0.65 }); break;
      case 'foul': if (!home) add('jeer', at); break;
      case 'match_result': {
        const [hg, ag] = [data.homeGoals ?? 0, data.awayGoals ?? 0];
        const homeWon = hg !== ag ? hg > ag : Boolean(data.shootout && data.shootout.home > data.shootout.away);
        if (homeWon) add('roar', at + 300, { power: bigStage ? 1 : 0.75 });
        else add('roar', at + 300, { power: SMALL_CHEER });
        break;
      }
      default: break;
    }
  }
  return cues.sort((a, b) => a.at - b.at);
}

/**
 * The ceremonies' sounds, in ms since the segment began: in the walk-out, applause as the teams come out, each team's
 * anthem (Task 53) through its anthem caption, and applause as each anthem ends; in the handshakes, applause at the
 * start, and after a home win the home end cheering the salute as it cheers a home goal (Tom, 2026-10-16). A re-air's
 * trimmed line-up gets none of these.
 * @param {'walk_out' | 'handshakes'} kind @param {number} total  The segment's length, ms.
 * @param {import('./ceremonies.js').CeremonySettings} c @param {string} key  Seeds the claps (the match id).
 * @param {{ homeId: string, awayId: string }} teams
 * @param {(teamId: string) => string} [anthemOf]  The tune a team plays (data/teams.json "anthem"); the team's id by default.
 * @param {boolean} [homeWon]  The handshakes after a home win, with the salute.
 * @returns {Cue[]}
 */
export function ceremonyCues(kind, total, c, key, { homeId, awayId }, anthemOf = (id) => id, homeWon = false) {
  const clap = (/** @type {number} */ at, /** @type {number} */ gain) => ({ kind: /** @type {const} */ ('roar'), at, gain, power: SMALL_CHEER, seed: `${key}|${kind}|${at}` });
  if (kind === 'handshakes') {
    if (!homeWon) return [clap(500, 0.7)];
    // The salute (handshakePose): from 60% of the way between the procession's end and leaving.
    const p = handshakeParts(total, c, true);
    const from = Math.round(p.passAt + 0.6 * (p.leaveAt - p.passAt));
    /** @type {Cue[]} */
    const cues = [clap(500, 0.7)];
    // The home goal's cheer (Tom: only that, no chant): its run of roars, each a little smaller, while there's room.
    for (const [after, size] of GOAL_CHEER) {
      if (from + after + CHEER_TAIL_MS > total) break;
      cues.push({ kind: 'roar', at: from + after, power: c.saluteCheer.power * size, gain: size, seed: `${key}|salute|${after}` });
    }
    return cues;
  }
  const p = walkOutParts(total, c);
  // Each anthem fills its caption but for a breath at the end, then the crowd cheers.
  const fit = c.anthemSeconds - ANTHEM_BREATH;
  /** @type {Cue[]} */
  const cues = [clap(c.walkOnGapMs * 3, 1)];
  for (const [teamId, from] of /** @type {const} */ ([[homeId, p.anthemsFrom], [awayId, p.awayAnthemFrom]])) {
    const team = anthemOf(teamId);
    cues.push({ kind: 'anthem', at: from + 500, team, fit, seed: `${key}|anthem|${team}` });
    cues.push(clap(from + 500 + Math.round(recipe('anthem', '', { team, fit }).duration * 1000), 0.8));
  }
  return cues.sort((x, y) => x.at - y.at);
}

/** Seconds of quiet left at the end of each anthem's caption before the cheer. */
const ANTHEM_BREATH = 2;

/**
 * @typedef {{ preMatchFrom: number, preMatchTo: number, walkOutFull: number, handshakeLosers: number, handshakeOthers: number, losersGoneAt: number, reairIntro: number, fadeMs: number }} Fill
 *   settings.crowd.fill
 * @typedef {{ home: number, away: number, leaving: boolean }} Fullness  How full each end is (0–1; neutrals count with
 *   the home fans), and whether they're leaving (fans go in another order than they came).
 */

/**
 * How full the stands are at moment `t` of a programme segment (Task 84; docs/channel.md §15.7): filling through the
 * pre-match and walk-out, full for the match; from the final whistle the fans leave, the losing side's first, through
 * the handshakes and the full-time card, all gone by its end (Task 89); empty from player of the match on and on studio
 * cards and the like; highlights show their match's full crowd, and a re-air fills and empties round its own match.
 * Pure.
 * @param {{ kind: string, part?: string, until?: number, from?: number, lift?: boolean, celebrate?: boolean }} seg  A programme segment.
 * @param {number} t  League ms.
 * @param {{ fill: Fill, segments: { preMatchMinutes: number, walkOutMinutes: number, handshakeMinutes: number, fullTimeMinutes: number } }} o
 * @param {'home' | 'away' | null} loser  The side that lost the match on show (null for a draw or before it's played).
 * @returns {Fullness}
 */
export function standsFullness(seg, t, { fill: c, segments }, loser) {
  const lerp = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ f) => a + (b - a) * Math.min(1, Math.max(0, f));
  /** How far through the segment, if it's `ms` long and ends at `until` (or runs from `from`). @param {number} [ms] */
  const through = (ms) => (seg.from !== undefined && seg.until !== undefined && ms === undefined
    ? (t - seg.from) / Math.max(1, seg.until - seg.from)
    : 1 - ((seg.until ?? t) - t) / Math.max(1, ms ?? 1));
  const both = (/** @type {number} */ v, leaving = false) => ({ home: v, away: v, leaving });
  /**
   * Each end leaving toward its own level, the losers' fans faster (`fL`, `fO`: how far through for each).
   * @param {number} fL @param {number} fO @param {[number, number]} from @param {[number, number]} to
   */
  const leave = (fL, fO, [fromL, fromO], [toL, toO]) => {
    const losers = lerp(fromL, toL, fL);
    const others = lerp(fromO, toO, fO);
    const even = (losers + others) / 2;
    if (!loser) return both(even, true);
    return loser === 'home' ? { home: losers, away: others, leaving: true } : { home: others, away: losers, leaving: true };
  };
  switch (seg.kind) {
    case 'pre_match': return both(lerp(c.preMatchFrom, c.preMatchTo, through(segments.preMatchMinutes * 60_000)));
    case 'walk_out': return both(lerp(c.preMatchTo, 1, through(segments.walkOutMinutes * 60_000) / c.walkOutFull));
    case 'live': case 'highlights': return both(1);
    // AROUND THE GROUNDS (Tom's note 14): a few early fans for training, nobody for the groundstaff.
    case 'grounds': return both(seg.fans);
    case 'handshakes': {
      // From the final whistle (`from`, when known: they're shorter without a home win).
      const f = seg.from !== undefined ? through() : through(segments.handshakeMinutes * 60_000);
      // After the final, the trophy lift (Task 190): the crowd stays for it, the champions' fans until the last tenth,
      // the runners-up's thinning as the handshakes do; the full-time card then empties the ground as usual.
      if (seg.lift) return leave(f, (f - 0.9) / 0.1, [1, 1], [c.handshakeLosers, c.handshakeOthers]);
      return leave(f, f, [1, 1], [c.handshakeLosers, c.handshakeOthers]);
    }
    case 'full_time': {
      const f = through(segments.fullTimeMinutes * 60_000);
      return leave(f / c.losersGoneAt, f, [c.handshakeLosers, c.handshakeOthers], [0, 0]);
    }
    case 'reair':
      if (seg.part === 'intro') return both(lerp(0, c.reairIntro, through()));
      if (seg.part === 'lineup') return both(lerp(c.reairIntro, 1, through()));
      // Like a live match (§16.13): the handshakes take the ends to handshakeLosers and handshakeOthers, the full-time
      // card to nobody (the losers' end first), and the interview is in its own set.
      // The final's trophy lift re-aired (Task 195): the crowd stays for it, as live.
      if (seg.part === 'handshakes' && seg.lift) return leave(through(), (through() - 0.9) / 0.1, [1, 1], [c.handshakeLosers, c.handshakeOthers]);
      // A final re-aired in a gap (Task 278f): the champions' fans stay for the celebration, the runners-up's thin, then
      // leave behind the full-time card while the champions' stay on, thinning a little.
      if (seg.part === 'handshakes' && seg.celebrate) return leave(through(), 0, [1, 1], [c.handshakeLosers, 1]);
      if (seg.part === 'full_time' && seg.celebrate) return leave(through() / c.losersGoneAt, through(), [c.handshakeLosers, 1], [0, c.handshakeOthers]);
      if (seg.part === 'handshakes') return leave(through(), through(), [1, 1], [c.handshakeLosers, c.handshakeOthers]);
      if (seg.part === 'full_time') return leave(through() / c.losersGoneAt, through(), [c.handshakeLosers, c.handshakeOthers], [0, 0]);
      if (seg.part === 'interview') return both(0, true);
      return both(1);
    default: return both(0, true);
  }
}
