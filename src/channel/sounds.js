// Which sounds a match makes, and when (Task 51): a pure function of the match and a span of its time, so live
// matches, highlights and re-airs all sound the same. audio.js plays them. See docs/channel.md §14.2.
//
// Cues come from two places:
//   - the event log: whistles (kick-offs, half-time, full time, goals, fouls), shots as they're struck, the net, saves,
//     blocks, a ring off the post when a miss shaves a post (where the motion sends it), burns, a short whistle for a
//     substitution and another as play restarts after it (Tom, 2026-10-20: the SUB ON pause ending);
//   - the motion: a kick whenever the ball leaves a player's feet (passes, which aren't events), found on a fixed grid
//     so the answer doesn't depend on the frame rate.
// The crowd's reactions come in Task 52.
import { missNearPost } from './motion.js';

/** The grid the motion is checked on for kicks, ms of match time. */
const KICK_GRID_MS = 50;
/** The whistle after a goal comes this long after the ball hits the net (ms of match time). */
const GOAL_WHISTLE_MS = 700;

/**
 * @typedef {{ kind: import('./soundRecipes.js').SoundKind, at: number, seed: string, gain?: number } & import('./soundRecipes.js').SoundOptions} Cue
 *   at: ms since kick-off. gain: on top of the kind's level (default 1).
 */

/**
 * Every cue from a match's events (not the kicks), in time order.
 * @param {import('./timeline.js').Timeline} timeline
 * @param {{ matchId: string, shotMs: number }} o  shotMs: shots are struck this long before their moment (settings.animation).
 * @returns {Cue[]}
 */
export function eventCues(timeline, { matchId, shotMs }) {
  /** @type {Cue[]} */
  const cues = [];
  const evs = timeline.events;
  const ends = new Set(evs.filter((t) => t.event.type === 'match_result').map((t) => t.at));
  const overtime = evs.some((t) => t.event.type === 'overtime_start');
  const add = (/** @type {Cue['kind']} */ kind, /** @type {number} */ at, /** @type {Omit<Cue, 'kind' | 'at' | 'seed'>} */ extra = {}) =>
    cues.push({ kind, at, seed: `${matchId}|${kind}|${at}`, ...extra });
  let shotSeq = -1;
  for (const { event: e, at } of evs) {
    const data = /** @type {any} */ (e.data) ?? {};
    switch (e.type) {
      case 'kickoff': add('whistle', at, { blast: 'short' }); break;
      case 'half_time': add('whistle', at, { blast: 'long' }); break;
      // The end of normal time: three blasts if the match is over then, a long one before overtime.
      case 'full_time': if (!ends.has(at)) add('whistle', at, { blast: overtime ? 'long' : 'full_time' }); break;
      case 'match_result': add('whistle', at, { blast: 'full_time' }); break;
      case 'shot': shotSeq = e.seq; add('shot', Math.max(0, at - shotMs), { power: data.scorcher || data.breakaway ? 1 : 0.7 }); break;
      case 'goal':
        add('net', at);
        add('whistle', at + GOAL_WHISTLE_MS, { blast: 'short' });
        break;
      case 'save': add('save', at, { held: !data.parried }); break;
      case 'block': add('block', at); break;
      case 'miss': if (missNearPost(matchId, shotSeq)) add('post', at); break;
      case 'foul': add('whistle', at, { blast: 'short' }); break;
      case 'burn': add('burn', at); break;
      case 'substitution': add('whistle', at, { blast: 'short' }); break;
      case 'shootout_kick':
        add('shot', Math.max(0, at - shotMs), { power: 0.8 });
        add(data.scored ? 'net' : 'save', at, data.scored ? {} : { held: true });
        break;
      default: break;
    }
  }
  // Play restarting after a substitution (Tom, 2026-10-20): a short whistle as its pause ends and the clock runs again,
  // unless a whistle is already blowing then.
  for (const q of timeline.pauses) {
    const end = q.at + q.ms;
    if (q.kind === 'substitution' && !cues.some((c) => c.kind === 'whistle' && c.at === end)) add('whistle', end, { blast: 'short' });
  }
  return cues.sort((a, b) => a.at - b.at);
}

/**
 * The kicks in (from, to]: grid moments where the ball has just left a player's feet (a pass, or a ball played on), or
 * the spot it was placed on (Tom: a foul's restart, rolled from where the foul was, was silent). Shots are left out (they
 * have their own cue). Louder for a longer, quicker pass.
 * @param {{ at: (e: number) => import('./motion.js').Pose | null }} motion
 * @param {number} from @param {number} to  ms since kick-off.
 * @param {string} matchId
 * @returns {Cue[]}
 */
export function kickCues(motion, from, to, matchId) {
  /** @type {Cue[]} */
  const cues = [];
  for (let g = (Math.floor(from / KICK_GRID_MS) + 1) * KICK_GRID_MS; g <= to; g += KICK_GRID_MS) {
    const before = motion.at(g - KICK_GRID_MS);
    const now = motion.at(g);
    if (!(before?.ball?.held || before?.ball?.placed) || !now?.ball || now.ball.held || now.ball.placed || now.effects.flight) continue;
    const next = motion.at(g + KICK_GRID_MS)?.ball;
    const speed = next ? Math.hypot(next.x - now.ball.x, (next.y - now.ball.y) / 2) * (1000 / KICK_GRID_MS) : 0;
    cues.push({ kind: 'kick', at: g, seed: `${matchId}|kick|${g}`, power: Math.min(1, Math.max(0, (speed - 0.2) / 1.2)) + (now.ball.lift ? 0.2 : 0) });
  }
  return cues;
}

/**
 * The window of cues to start this frame, (from, to], ahead of the picture by `ahead` ms (audio.lead). A hand-over (a
 * span from -1: something new has just begun) starts at -1 itself, so the cues at its very start are kept (Tom: the
 * kick-off whistle went missing once the lead moved the whole window past 0).
 * @param {[number, number]} span  The picture's (from, to], ms on the cues' clock. @param {number} ahead
 * @returns {[number, number]}
 */
export function leadWindow([from, to], ahead) {
  return [from < 0 ? from : from + ahead, to + ahead];
}

/**
 * Every cue in (from, to], events and kicks together, in time order.
 * @param {Cue[]} events  From eventCues (worked out once per match).
 * @param {{ at: (e: number) => import('./motion.js').Pose | null }} motion
 * @param {number} from @param {number} to @param {string} matchId
 * @returns {Cue[]}
 */
export function cuesBetween(events, motion, from, to, matchId) {
  return [...events.filter((c) => c.at > from && c.at <= to), ...kickCues(motion, from, to, matchId)].sort((a, b) => a.at - b.at);
}

/** A cue's identity, so the same sound isn't started twice (Task 154). @param {Cue} c */
export const cueKey = (c) => `${c.kind}|${c.seed}|${c.at}`;

/**
 * After a jump (coming back to the tab, loading mid-match, turning sound on; Task 62): the sounds to start part-way at
 * `at`, those already under way that still have `minMs` to run. Not one that's still ringing from before (Task 154,
 * Tom: coming back to the tab doubled a cheer or an anthem for a moment), and only the latest of each kind (a goal's
 * cheer is several staggered roars: started together they'd be louder than it ever is).
 * @param {Cue[]} cues @param {number} at  ms, on the cues' clock. @param {(c: Cue) => number} durationMs
 * @param {(c: Cue) => boolean} ringing  Whether this very cue is still playing. @param {{ lookbackMs: number, minMs: number }} o
 * @returns {Cue[]}
 */
export function resumeCues(cues, at, durationMs, ringing, { lookbackMs, minMs }) {
  /** @type {Map<string, Cue>} The latest under way of each kind. */
  const latest = new Map();
  for (const c of cues) {
    if (c.at > at || c.at < at - lookbackMs) continue;
    if (durationMs(c) - (at - c.at) < minMs) continue;
    const prev = latest.get(c.kind);
    if (!prev || c.at >= prev.at) latest.set(c.kind, c);
  }
  // A kind whose sound is still ringing from before the jump: leave it be.
  return [...latest.values()].filter((c) => !cues.some((d) => d.kind === c.kind && ringing(d)));
}
