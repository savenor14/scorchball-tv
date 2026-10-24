// Match motion: where every player and the ball are at any moment, with continuous movement between events.
// Pure and DOM-free. Builds on formation.js (where players stand for a given match state). See docs/channel.md §5.
//
// Because each match is simulated before it's shown, the animation can look ahead, but only within one possession:
//   - Between events, players move steadily toward their spots for the next action (an advance or a shot),
//     and the ball is passed to whoever makes it, arriving exactly as it happens.
//   - Players have legs: each always heads for their current spot at a top speed (runSpeed near the ball, easing to
//     jogSpeed far from it) and settles in over settleMs as they arrive. When the spot changes they turn and carry on,
//     so nobody dashes or teleports. Only the first kick-off places players directly, in kick-off shape (the walk-out
//     brings them there; ceremonies.js). At every kick-off everyone holds for kickoffHoldMs before play starts.
//   - During half-time and the break before overtime, outfield players walk to their bench and keepers change ends;
//     breakLineMs before the restart everyone jogs to their spot for the next kick-off (ends swap).
//   - Long spells without events are split into phases of about probeMs: in each, attackers make fresh runs, the
//     carrier moves with the ball, the ball's marker closes in harder, and the ball may be passed to a teammate
//     (holdPassChance). The last pass still goes to whoever makes the next action.
//   - Nobody anticipates a turnover. After one (or a restart), players near the ball react first (reactNearMs) and
//     those far away later (up to reactFarMs), carrying on with their old run until then, so the reaction ripples out.
//   - While the clock is paused (timeline.pauses) nothing is anticipated and nobody passes. After a goal the scorer peels
//     away to celebrate above the centre circle, in line with the dugout on the side they scored (Task 65), the two
//     teammates nearest them run over to join in, opponents keep out of the way, the others drift back toward the
//     restart, and the conceding keeper collects the ball. After a substitution the sub runs on from their seat on the
//     bench (sidelines.js). Play picks up again when the pause ends.
//   - Passes never travel through players (Task 34). The passer picks a teammate in an open lane, the receiver of the
//     pass before the next action steps sideways to open theirs, and each pass is checked against where everyone will
//     be during it: straight if that's clear, else bent round whoever is in the way, else chipped over them.
//   - Shots, burns and turnovers play a short ball script at the moment they happen: the flight to the net, keeper,
//     blocker or board, a rest in the net after a goal, the burn flash, then the ball to its new holder.
// Everything is a function of the moment, so every screen shows the same picture.
import { createRng } from '../sim/rng.js';
import { formation, homeAttacksRight, keeperSpot, outOfCrease, swayOf, tetherLine } from './formation.js';
import { benchArea, seatOf } from './sidelines.js';

/** Events that end a look-ahead: nothing after them is anticipated. */
const STOP = new Set(['possession_change', 'kickoff', 'half_time', 'full_time', 'overtime_start', 'substitution', 'injury', 'shootout_kick', 'match_result']);
/** Events worth moving toward. */
const ACTION = new Set(['advance', 'shot']);
const PLAYING = new Set(['first_half', 'second_half', 'overtime']);
/** Events after which the sim's carrier is shown on the ball, whatever happened before (and any run ends). */
const NEW_CARRIER = new Set(['kickoff', 'possession_change', 'free_shot', 'shot']);
/** Events at which a run may start. */
const RUN_FROM = new Set(['kickoff', 'possession_change', 'advance']);
/** Events that don't move anyone (a foul outside the box leaves the ball where it was). */
const PASSIVE = new Set(['heat_stage', 'foul', 'lineup', 'momentum']);

// Goal geometry in pitch fractions (pitch.js draws a 36-px mouth on a 168-px-high pitch, nets 8 px deep on 336 px).
const NET_DEPTH = 0.022;
const MOUTH_HALF = 0.1;
// A miss goes wide by MISS_Y off the middle; one inside POST_BAND has just shaved a post (and rings off it, Task 61).
const MISS_Y = Object.freeze({ min: 0.118, max: 0.24 });
const POST_BAND = 0.13;

/** How far off the middle of the goal a miss goes (pitch heights, signed): the first draws from the shot's rng. @param {ReturnType<typeof createRng>} rng */
const missOffset = (rng) => (rng.chance(0.5) ? 1 : -1) * rng.float(MISS_Y.min, MISS_Y.max);

/**
 * Whether a miss shaves a post (Task 61): where the motion sends it (shotPlan) lands in a narrow band just outside a
 * post. The sim only says it missed; this is the picture's choice, so the sound rings only when it's seen to.
 * @param {string} matchId @param {number} shotSeq  The shot event's seq.
 */
export function missNearPost(matchId, shotSeq) {
  return Math.abs(missOffset(createRng(`${matchId}|shot|${shotSeq}`))) < POST_BAND;
}
const SHOOTOUT_MARK = 0.82;
const SHOOTOUT_HEAT = 90;
// The free shot (Task 143, Tom's pick from freeshots.html): taken from the shootout's mark. The foul that gives one is
// drawn inside an invisible box in front of the goal (Tom): its carrier between BOX.near and BOX.depth (pitch lengths)
// from the goal line, and between BOX.top and 1 - BOX.top across. In the pause the others stand on an arc ARC_R
// (pitch lengths) behind the mark, the taker TAKER_BACK behind the ball and the keeper on the line.
export const FREE_SHOT_BOX = Object.freeze({ near: 0.1, depth: 0.2, top: 0.2 });
const ARC_R = 0.1;
const TAKER_BACK = 0.035;
/** How long the taker's run-up to the ball takes (ms before the kick). */
const RUN_UP_MS = 350;
// Any other foul (Task 144): opponents stand at least FOUL_ROOM (pitch lengths) from the ball in its pause, and everyone
// carries on FOUL_HOLD_MS after the whistle before reshaping.
const FOUL_ROOM = 0.05;
/** A sub running on has reached their spot within this (pitch lengths), and takes the ball waiting there (Task 153). */
const ARRIVED = 0.012;
const FOUL_HOLD_MS = 400;

/**
 * The free shot's mark, attacking the goal at `goalX` (0 or 1).
 * @param {0 | 1} goalX
 */
export const freeShotMark = (goalX) => ({ x: goalX === 1 ? SHOOTOUT_MARK : 1 - SHOOTOUT_MARK, y: 0.5 });

/**
 * The free shot's staging in its pause (Task 143), in ms from the foul, for a pause of `pauseMs` (6 s as Tom picked;
 * other lengths scale it): the whistle; the referee walks to the ball (toBall → pickUp) and carries it to the mark
 * (→ placed), then steps aside (→ aside); the players clear (clearFrom → cleared); a beat; the taker's run-up (run) and
 * the kick (kick, the shot leaving the foot as the pause ends).
 * @param {number} pauseMs @param {number} shotMs  animation.shotMs.
 */
export function freeShotStaging(pauseMs, shotMs) {
  const kick = pauseMs - shotMs;
  return {
    toBall: 0.075 * pauseMs, pickUp: 0.24 * pauseMs, placed: 0.46 * pauseMs, aside: 0.59 * pauseMs,
    clearFrom: 0.3 * pauseMs, cleared: 0.66 * pauseMs, run: Math.max(0.66 * pauseMs, kick - RUN_UP_MS), kick,
  };
}
// Where a scorer celebrates (Task 65, Tom): above the centre circle, in line with the dugout on the side they scored
// (pitch fractions: x from the far end of the pitch they defend, toward the goal they scored in). Opponents keep
// CELEBRATE_CLEAR (pitch lengths) away from it while it lasts.
const CELEBRATE = Object.freeze({ x: 0.73, y: 0.2 });
const CELEBRATE_CLEAR = 0.1;
// Passes never travel through players (Task 34). In pitch lengths: a pass keeps PASS_CLEAR (about 9 stage px) from
// everyone but the passer and receiver, except while it's within PASS_ENDS of either of them (a marker at their side).
export const PASS_CLEAR = 0.025;
export const PASS_ENDS = 2 * PASS_CLEAR;
const PASS_MARGIN = 0.004; // extra room when choosing a path, for the frames between the checked moments
// A blocked pass bends round: sideways bulges tried (pitch lengths), at most BEND_MAX of the pass's length.
const BENDS = [0.02, 0.04, 0.06, 0.09, 0.12];
const BEND_MAX = 0.35;
// If no bend clears, the pass is chipped: its peak height (pitch lengths), at most CHIP_SHARE of its length.
const CHIP_PEAK = 0.03;
const CHIP_SHARE = 0.25;
// The big kick (Task 240): a keeper's pass of BIG_KICK_MIN or more (pitch lengths) goes up high, like a goalkeeper's
// long kick: its peak BIG_KICK_SHARE of its length, at most BIG_KICK_PEAK.
const BIG_KICK_MIN = 0.35;
const BIG_KICK_SHARE = 0.15;
const BIG_KICK_PEAK = 0.08;
// A travelling ball spins (quarter turns per real second): rolling along the turf, curling on a bent pass (faster for
// a bigger bend, turning the way it curls), tumbling in a chip, fastest in a shot.
const SPIN = Object.freeze({ roll: 10, curl: 14, curlPerBend: 80, chip: 18, shot: 24 });
// A breakaway runner may sprint up to this many times the usual top speed to arrive as they shoot (Task 40).
const BREAKAWAY_SPRINT = 1.6;
// ...and aims this far (pitch lengths) past the shooting spot, so they're still running as they shoot.
const BREAKAWAY_THROUGH = 0.06;
// A keeper changing ends in a break takes this share of the gather to cross (Task 278m): an even jog, not a sprint.
const KEEPER_CROSS_SHARE = 0.85;
// Keepers' tracking is worked out on a grid this fine (real ms) and averaged between its points.
const TRACK_GRID_MS = 50;
// A keeper's restart that the sim turns over before the team gets it out (Task 88) is first played out to a defender:
// OUTLET_AFTER_MS after the moment (so a miss's ball has come back to the keeper), with OUTLET_HOLD_MS on the
// defender's feet before the tackle at the least.
const OUTLET_AFTER_MS = 1000;
const OUTLET_HOLD_MS = 300;
/** Changes of possession after which the keeper restarts play. */
const RESTARTS = new Set(['goal', 'miss', 'save']);
// Loose balls (Task 82): the roll takes at most LOOSE_SHARE of the time before the next moment, and none shorter than
// LOOSE_MIN_MS happens. The winner may sprint at up to LOOSE_SPRINT times runSpeed to get there; the player chasing
// pulls up LOOSE_STEP (pitch lengths) short of the ball.
const LOOSE_SHARE = 0.6;
const LOOSE_MIN_MS = 400;
const LOOSE_SPRINT = 1.5;
const LOOSE_STEP = 0.03;
// The bubble check (Task 83): in the last CLOSE_LEAD_MS before the sim's tackle, steal or block, that player heads for
// the action (at up to LOOSE_SPRINT times runSpeed): a tackler to CLOSE_GAP from the player on the ball, goal-side; a
// player stealing into the passing lane, STEAL_GAP from the passer at most; a blocker into the shot's path, BLOCK_GAP
// in front of the shooter at most.
const CLOSE_LEAD_MS = 5000;
const CLOSE_GAP = 0.02;
// Clear chances (Task 239): an attacker on the ball within GOAL_SIDE_NEAR of the goal line and GOAL_SIDE_WIDE of the
// middle (pitch lengths, widths) with no defender within GOAL_SIDE_LANE of the line to goal, and no shot of theirs
// coming next: the nearest outfield defender steps in GOAL_SIDE_GAP goal-side of them.
const GOAL_SIDE_NEAR = 0.2;
const GOAL_SIDE_WIDE = 0.2;
const GOAL_SIDE_LANE = 0.06;
const GOAL_SIDE_GAP = 0.05;
const STEAL_GAP = 0.08;
const BLOCK_GAP = 0.08;
// Defenders dropping back further than this (pitch lengths) toward their own goal sprint (Task 80).
const RETREAT_MIN = 0.02;
// A switch of play goes to a teammate at least this far (pitch fractions across) past the middle on the far side.
const SWITCH_FAR = 0.08;
// Before a pass, its receiver steps sideways this far (pitch lengths) at most to open the lane.
const OPEN_SHIFTS = [0.02, 0.04, 0.06];
// How finely a pass is checked: player positions at PASS_SAMPLES moments, the ball at PASS_STEPS.
const PASS_SAMPLES = 12;
const PASS_STEPS = 48;

/**
 * @typedef {import('./formation.js').Placed} Placed
 * @typedef {{ x: number, y: number }} Point
 *
 * @typedef {object} Pose
 * @property {Placed[]} players
 * @property {(Point & { held: boolean, dir: 1 | -1, lift?: number, spin?: number, curling?: boolean, loose?: boolean, placed?: boolean, nudge?: number }) | null} ball
 *   nudge: stage px across, added by the picture (Task 120: a ball just kicked carried on from the kicking foot).
 *   `held`: at a player's feet (drawn just in front, toward `dir`, the way the holder attacks); otherwise exactly at
 *   x, y. `lift`: a chipped pass's height above the turf, in pitch lengths (x, y is its shadow). `spin`: while it
 *   travels, quarter turns per second, clockwise on screen if positive. `curling`: on a bent pass (draw a trail).
 *   `loose`: running loose while players race for it (Task 82). `placed`: a dead ball in a free shot's pause (Task 143),
 *   carried by the referee or on the mark.
 * @property {number} heat  0–100, for the ball's colour.
 * @property {{ burn: (Point & { f: number }) | null, goal: (Point & { f: number, scorcher: boolean }) | null, flight: boolean, scorcher: boolean }} effects
 *   `f`: 0 → 1 through the effect. `flight`: the ball is in the air (draw a trail). `scorcher`: a Hot shot.
 */

/**
 * @param {import('./timeline.js').Timeline} timeline
 * @param {{ matchId: string, homeId: string, keeperSlot: string, animation: Animation, play: Play, breakLineMs?: number, breakaway?: Breakaway }} options
 *   breakLineMs: how long before a restart after a break everyone heads for their spot (ceremonies.breakLineSeconds).
 *   breakaway (Task 253): how a breakaway starts and who's left alone (settings.play.breakaway by default; all 0 is
 *   the picture before it).
 *
 * @typedef {object} Breakaway
 * @property {number} leadMs  The player about to break away sets off with the ball this long before the sim's
 *   breakaway moment (no passing it about first), so the break is one burst, not a stand and then a sprint.
 * @property {number} hang  On a breakaway the runner's teammates hang back at least this far (pitch lengths) behind
 *   the ball, so nobody but the runner is past the beaten defence (it looked like 2 on 0).
 *
 * @typedef {object} Play  settings.play (Task 79; docs/channel.md §15.3)
 * @property {Breakaway} breakaway  Task 253.
 * @property {number} flankChance  The chance a possession goes down a flank.
 * @property {number} wideOutletChance  The same for a possession that starts with the keeper (playing it out wide).
 * @property {number} cornerChance  On a flank in the attacking zone, the chance the player on the ball goes to the
 *   corner area before the next action (then crossing it back or cutting in to shoot).
 * @property {number} switchChance  On a flank, the chance a pass in a long spell switches play to the other flank.
 * @property {number} tether  The soft offside (Task 80): how far (pitch lengths) an attacker off the ball may stand
 *   beyond the last outfield defender, or the ball if it's further forward. Never on a breakaway.
 * @property {number} lineDrop  The share of a gap beyond the tether closed by the last defender dropping back; the
 *   attackers check back for the rest.
 * @property {number} looseTackleChance  Loose balls (Task 82): the chance a tackle that isn't a steal knocks the ball
 *   loose (every block and parried save does).
 * @property {number} looseReachMin @property {number} looseReachMax  How far a block or parry sends it (pitch lengths).
 * @property {number} tackleReachMin @property {number} tackleReachMax  How far a tackle knocks it.
 * @property {number} looseMinMs @property {number} looseMaxMs  How long it rolls (real ms) before the winner has it.
 *
 * @typedef {object} Animation  settings.animation
 * @property {number} reactNearMs  How long a player next to the ball takes to react to a turnover.
 * @property {number} reactFarMs   The same for a player nearBall or more away.
 * @property {number} runSpeed     Top speed near the ball, in pitch lengths per real second.
 * @property {number} jogSpeed     Top speed nearBall or more from the ball.
 * @property {number} settleMs     How gently players slow into their spot (a time constant).
 * @property {number} nearBall     Distance from the ball, in pitch lengths, beyond which players jog and react late.
 * @property {number} probeMs      Long spells of play are split into phases about this long.
 * @property {number} holdPassChance  The chance of a pass to a teammate at the start of each later phase.
 * @property {number} passMs @property {number} passSpeed @property {number} passMaxMs @property {number} touchChance
 * @property {number} touchMinMs @property {number} touchMaxMs @property {number} shotMs @property {number} goalHoldMs @property {number} burnFlashMs
 * @property {number} kickoffHoldMs  Everyone stands still this long at each kick-off.
 * @property {number} keeperTrackMs  In play, keepers follow where the ball has been over this long.
 * @property {number} runChance  The chance a carrier sets off on a run at a kick-off, change of possession or advance.
 * @property {number} goalCelebrateMs  After a goal the scorers celebrate this long, then everyone heads for the restart.
 * @property {number} bigKickSpeed  A keeper's big kick's speed in the air (Task 240), pitch lengths per real second.
 * @property {import('./ballSpin.js').SpinSettings} [ballSpin]  The ball's spin by its speed (Tom, 2026-10-16; pitch.js draws it).
 * @property {{ share: number, min: number, max: number, maxShare: number }} [shotBend]  Bending shots (Tom, 2026-10-16).
 * @property {{ walkSpeed: number, standMs: number, runUpMs: number, returnMs: number, celebrateMs: number, bounceMs: number, bounce: number, mill: number }} shootout
 *   The shootout staged (Task 277b): see settings.animation._shootout.
 */
export function createMotion(timeline, { matchId, homeId, keeperSlot, animation, play, breakLineMs = 20_000, breakaway = play.breakaway ?? { leadMs: 0, hang: 0 }, goalSide = true, bigKick = true, bigKickMin = BIG_KICK_MIN }) {
  const ev = timeline.events;
  const { reactNearMs, reactFarMs, runSpeed, jogSpeed, settleMs, nearBall, probeMs, holdPassChance, passMs, passSpeed, passMaxMs, touchChance, touchMinMs, touchMaxMs, shotMs, goalHoldMs, burnFlashMs, kickoffHoldMs, keeperTrackMs, runChance, goalCelebrateMs, bigKickSpeed } = animation;
  /** The shootout staged (Task 277b). */
  const SO = animation.shootout;

  const tether = { reach: play.tether, drop: play.lineDrop };

  // Beats: events sharing one on-screen moment. beatOf[i] is event i's beat.
  /** @type {{ first: number, end: number, at: number }[]} */
  const beats = [];
  /** @type {number[]} */
  const beatOf = [];
  ev.forEach((t, i) => {
    if (i === 0 || t.at !== ev[i - 1].at) beats.push({ first: i, end: i + 1, at: t.at });
    else beats[beats.length - 1].end = i + 1;
    beatOf.push(beats.length - 1);
  });
  /** beatStart[i]: the first event sharing event i's moment. */
  const beatStart = ev.map((_, i) => beats[beatOf[i]].first);

  /** Clock pauses by the moment they start. */
  const pauseAt = new Map(timeline.pauses.map((q) => [q.at, q]));
  /** The golden goal's moment, if the match was won by one (Task 147): its pause is all celebration, no restart. */
  const goldenAt = timeline.decidedBy === 'overtime' ? ev.findLast((t) => t.event.type === 'goal')?.at ?? -1 : -1;

  // Beats made only of passive events (heat stages, fouls that leave the ball where it was) don't interrupt anything:
  // lead[j] is the last beat at or before j that moved someone. A foul that gives a free shot does (Task 143), and so
  // does any other foul with a pause (Task 144): the play heads for it, and its pause is staged.
  /** @type {number[]} */
  const lead = [];
  beats.forEach((b, j) => {
    const staged = pauseAt.get(b.at)?.kind === 'free_shot' || pauseAt.get(b.at)?.kind === 'foul';
    const passive = j > 0 && !staged && ev.slice(b.first, b.end).every((t) => PASSIVE.has(t.event.type));
    lead.push(passive ? lead[j - 1] : j);
  });

  // Phases: the gap after each leading beat (up to the next one), split into phases of about probeMs during a long
  // spell of play. A paused clock gets its own still phase first. phaseStart[j] is leading beat j's first phase.
  /** @type {{ beat: number, k: number, n: number, at: number, still: import('./timeline.js').PauseKind | null, brk?: 'gather' | 'return', back?: boolean, runUp?: boolean, loose?: number }[]} */
  const phases = [];
  /** @type {number[]} */
  const phaseStart = [];
  beats.forEach((b, j) => {
    if (lead[j] !== j) return;
    let nextLead = j + 1;
    while (nextLead < beats.length && lead[nextLead] !== nextLead) nextLead++;
    const next = beats[nextLead]?.at ?? b.at;
    const s = timeline.stateThrough(b.end);
    phaseStart[j] = phases.length;
    // A break (half-time, before overtime): gather by the benches, then head for the restart.
    if ((s.phase === 'half_time' || s.phase === 'overtime_break') && next > b.at) {
      const back = Math.max(b.at, next - breakLineMs);
      phases.push({ beat: j, k: 0, n: 2, at: b.at, still: null, brk: 'gather' }, { beat: j, k: 1, n: 2, at: back, still: null, brk: 'return' });
      return;
    }
    const pause = pauseAt.get(b.at);
    const from = pause ? Math.min(next, b.at + pause.ms) : b.at;
    // After a goal, the scorers celebrate, then everyone heads back for the restart (Task 42): two still phases.
    const back = pause?.kind === 'goal' && b.at !== goldenAt && pause.ms > goalCelebrateMs && from > b.at + goalCelebrateMs;
    // A free shot's pause (Task 143): the staging, then the taker's run-up.
    const freeShot = pause?.kind === 'free_shot' && from > b.at;
    const still = pause ? (back || freeShot ? 2 : 1) : 0;
    // A loose ball (Task 82) gets a phase of its own first: the ball runs loose and players race for it.
    const loose = !pause && PLAYING.has(s.phase) && s.possession ? looseLength(b, next) : 0;
    const start = loose ? b.at + loose : from;
    const pre = still + (loose ? 1 : 0);
    const n = pause && next <= from ? 0 : PLAYING.has(s.phase) && s.possession ? Math.max(1, Math.floor((next - start) / probeMs)) : 1;
    if (pause) phases.push({ beat: j, k: 0, n: pre + n, at: b.at, still: pause.kind });
    if (back && pause) phases.push({ beat: j, k: 1, n: pre + n, at: b.at + goalCelebrateMs, still: pause.kind, back: true });
    if (freeShot && pause) phases.push({ beat: j, k: 1, n: pre + n, at: b.at + freeShotStaging(pause.ms, shotMs).run, still: pause.kind, runUp: true });
    if (loose) phases.push({ beat: j, k: 0, n: pre + n, at: b.at, still: null, loose });
    for (let k = 0; k < n; k++) phases.push({ beat: j, k: pre + k, n: pre + n, at: start + ((next - start) * k) / n, still: null });
  });
  /** The phase at elapsed `e`, with `count` events happened. @param {number} count @param {number} e */
  const phaseAt = (count, e) => {
    let i = phaseStart[lead[beatOf[count - 1]]];
    const last = i + phases[i].n - 1;
    while (i < last && phases[i + 1].at <= e) i++;
    return i;
  };

  // Who's shown on the ball after each event (Task 36): the sim's carrier, except at advances, which nothing else on
  // screen shows. A keeper credited with an advance doesn't get the ball back from a teammate: whoever had it keeps it
  // (a keeper who had it plays it out to the midfielder). And during a run the runner keeps it through every advance.
  // A run starts at a kick-off, change of possession or advance with chance runChance, if an outfield player has the
  // ball, and lasts until the possession ends or the next shot (passed to the shooter if it isn't the runner).
  /** @type {(string | null)[]} shownAfter[i]: who's on the ball after events 0..i (null: formation's default). */
  const shownAfter = [];
  /** @type {(string | null)[]} runAfter[i]: who's on a run after events 0..i. */
  const runAfter = [];
  {
    /** @type {string | null} */
    let shown = null;
    /** @type {string | null} */
    let run = null;
    /** @type {string | null} */
    let possession = null;
    ev.forEach((t, i) => {
      const s = timeline.stateThrough(i + 1);
      const side = s.possession === homeId ? s.onPitch.home : s.possession ? s.onPitch.away : [];
      const outfield = (/** @type {string | null} */ id) => side.some((p) => p.playerId === id && p.slot !== keeperSlot);
      const type = t.event.type;
      if (s.possession !== possession || NEW_CARRIER.has(type)) {
        shown = s.carrierId;
        run = null;
      } else if (type === 'advance' && /** @type {any} */ (t.event.data)?.breakaway) {
        // A breakaway: whoever broke through has the ball (and a run by anyone else ends).
        shown = s.carrierId;
        if (run !== shown) run = null;
      } else if (type === 'advance') {
        if (run && outfield(run)) shown = run;
        else if (outfield(s.carrierId)) shown = s.carrierId;
        else if (!outfield(shown)) shown = (side.find((p) => p.slot === 'M') ?? side.find((p) => p.slot !== keeperSlot))?.playerId ?? s.carrierId;
      } else if (shown && !side.some((p) => p.playerId === shown)) {
        // Whoever had it was just substituted: an outfield teammate on the pitch takes it (not the incoming sub,
        // who is still on the bench).
        const incoming = type === 'substitution' ? t.event.playerId : null;
        const onPitch = side.filter((p) => p.slot !== keeperSlot && p.playerId !== incoming);
        shown = (onPitch.find((p) => p.slot === 'M') ?? onPitch[0])?.playerId ?? s.carrierId;
      }
      if (run && !outfield(run)) run = null;
      possession = s.possession;
      if (!run && PLAYING.has(s.phase) && RUN_FROM.has(type)) {
        // After a kick-off the midfielder has the ball (the formation's default).
        const who = shown ?? (s.zone === 'defensive' ? null : side.find((p) => p.slot === 'M')?.playerId ?? null);
        if (outfield(who) && createRng(`${matchId}|run|${i}`).chance(runChance)) [run, shown] = [who, who];
      }
      shownAfter.push(shown);
      runAfter.push(run);
    });
  }
  /** Who's shown on the ball after the first `count` events. @param {number} count */
  const shownCarrier = (count) => (count > 0 ? shownAfter[count - 1] : null);

  /** @type {Map<string, ReturnType<typeof formation>>} Formation spots (without sway) after the first `count` events. */
  const formations = new Map();
  /**
   * @param {number} count @param {number} [probe] @param {number} [press] @param {string | null} [holderId]
   * @param {boolean} [edge] @param {boolean} [beaten] @param {import('./formation.js').Wide | null} [wide]
   */
  const formationAt = (count, probe = 0, press = 0, holderId = null, edge = false, beaten = false, wide = null) => {
    const key = `${count}|${probe}|${press}|${holderId}|${edge}|${beaten}|${wide ? `${wide.flank}|${wide.corner}|${wide.holder}` : ''}`;
    let f = formations.get(key);
    if (!f) {
      const s = { ...timeline.stateThrough(count), carrierId: shownCarrier(count) };
      formations.set(key, (f = formation(s, { matchId, homeId, keeperSlot, elapsed: null, probe, press, holderId, edge, beaten, wide, tether, hang: breakaway.hang })));
    }
    return f;
  };

  /** The direction a team attacks in a phase. @param {string | null} teamId @param {import('./timeline.js').Phase} phase */
  const dirOf = (teamId, phase) => /** @type {1 | -1} */ ((teamId === homeId ? 1 : -1) * homeAttacksRight(phase));

  /**
   * The next action within this possession: scan forward from event `count` to the first advance or shot (taking the
   * rest of its moment, up to any stop event), giving up at the first stop event. A foul that gives a free shot is an
   * action too (Task 143: `box`, the player on the ball is fouled in the box), and so is any other foul with a pause
   * (Task 144: `foul`, fouled outside it).
   * @param {number} count
   * @returns {{ cut: number, at: number, shot: boolean, breakaway: boolean, box?: boolean, foul?: boolean } | null}
   */
  function lookahead(count) {
    for (let i = count; i < ev.length; i++) {
      const type = ev[i].event.type;
      if (STOP.has(type)) return null;
      if (type === 'foul' && pauseAt.get(ev[i].at)?.kind === 'free_shot') return { cut: beats[beatOf[i]].end, at: ev[i].at, shot: false, breakaway: false, box: true };
      if (type === 'foul' && pauseAt.get(ev[i].at)?.kind === 'foul') return { cut: beats[beatOf[i]].end, at: ev[i].at, shot: false, breakaway: false, foul: true };
      if (ACTION.has(type)) {
        let j = i;
        while (j < ev.length && ev[j].at === ev[i].at && !STOP.has(ev[j].event.type)) j++;
        return { cut: j, at: ev[i].at, shot: type === 'shot', breakaway: Boolean(/** @type {any} */ (ev[i].event.data)?.breakaway) };
      }
    }
    return null;
  }

  /**
   * @typedef {object} Plan  How everyone moves during one phase (from a beat, or a later phase of a long spell).
   * @property {number} at  The phase's start.
   * @property {Plan | null} prev  The plan before (null after a kick-off, when players are placed directly).
   * @property {Placed[]} targets  Where each player is heading: their spot for the next action in this possession,
   *   or for the current state if there isn't one.
   * @property {Map<string, Placed>} byId
   * @property {Map<string, Point>} start  Where each player starts heading for their target.
   * @property {Map<string, number>} delay  How long after `at` they start (their reaction; 0 except after turnovers).
   * @property {Map<string, number>} speed  Top speed, in pitch lengths per ms.
   * @property {string | null} carrierId  Who has the ball in this phase.
   * @property {{ from: string | Point, start: number, end: number } | null} passIn  A pass to them during the phase (from a
   *   teammate, or from where the ball is if whoever had it was just substituted): as it starts, or for a keeper's
   *   outlet a moment later, the passer keeping the ball until then.
   * @property {ReturnType<typeof lookahead>} la  The next action in this possession, if any.
   * @property {string | null} nextCarrierId  Who makes it.
   * @property {string | null} teamId  The team on the ball (after a goal, the conceding team, whose keeper has it).
   * @property {number} spell  The possession spell (timeline state), so wide play carries on through it.
   * @property {-1 | 0 | 1} flank  The flank the team on the ball is using (Task 79): -1 top, 1 bottom, 0 none.
   * @property {boolean} corner  The player on the ball has gone to the corner area.
   * @property {{ from: Point, to: Point, ms: number } | null} [loose]  A loose ball (Task 82): it runs from `from` to
   *   `to` (where the winner meets it) over the phase's first `ms`.
   */

  /** @type {Plan[]} */
  const plans = [];

  /**
   * Where a player is at elapsed `e` under a plan (before the sway). Before their reaction they carry on with the
   * previous plan's run.
   * @param {Plan} plan @param {string} id @param {number} e
   * @returns {Point | null}  Null if the player isn't in this plan.
   */
  function posIn(plan, id, e) {
    const target = plan.byId.get(id);
    if (!target) return null;
    const delay = /** @type {number} */ (plan.delay.get(id));
    if (plan.prev && e < plan.at + delay) return posIn(plan.prev, id, e) ?? target;
    return approach(/** @type {Point} */ (plan.start.get(id)), target, e - plan.at - delay, /** @type {number} */ (plan.speed.get(id)), settleMs);
  }

  /**
   * How long a pass takes (Task 169): longer the further it goes, at passSpeed, between passMs and passMaxMs.
   * @param {Point | null | undefined} a @param {Point | null | undefined} b
   */
  const passTime = (a, b) => {
    if (!a || !b) return passMs;
    const d = dist(a, b);
    // A keeper's big kick (Task 240) hangs in the air: bigKickSpeed, slower than a pass along the turf.
    if (bigKick && /** @type {Partial<Placed>} */ (a).slot === keeperSlot && d >= bigKickMin) return Math.round((d / bigKickSpeed) * 1000);
    return passDuration(d, { passMs, passSpeed, passMaxMs });
  };

  /** Build phase i's plan from the one before. @param {number} i @param {Plan | null} prev @returns {Plan} */
  function makePlan(i, prev) {
    const ph = phases[i];
    /**
     * A pass within this phase, from `start`: it ends by the next phase, whose plan takes over the ball.
     * @param {number} start @param {number} ms
     */
    const passFrom = (start, ms) => Math.max(start + 1, Math.min(start + ms, i + 1 < phases.length ? phases[i + 1].at : Infinity));
    const b = beats[ph.beat];
    if (ph.still === 'goal' && prev) return goalPlan(ph, b, prev, !ph.back);
    if (ph.still === 'free_shot' && prev) return freeShotPlan(ph, b, prev);
    if (ph.still === 'foul' && prev) return foulPlan(ph, b, prev);
    const s = timeline.stateThrough(b.end);
    const la = PLAYING.has(s.phase) && !ph.still ? lookahead(b.end) : null;
    const base = formationAt(b.end);
    // Who has the ball: the sim's carrier, unless an earlier phase of this spell passed it on (and maybe again now).
    // A moment that doesn't change the carrier (a substitution, injury or foul) leaves it with whoever has it.
    const moves = ev.slice(b.first, b.end).some((t) => NEW_CARRIER.has(t.event.type) || t.event.type === 'advance');
    const side = s.possession === homeId ? s.onPitch.home : s.onPitch.away;
    let holder = (ph.k > 0 || !moves) && prev ? prev.carrierId : base.carrierId;
    if (holder && !side.some((p) => p.playerId === holder)) holder = base.carrierId;
    /** @type {Plan['passIn']} */
    let passIn = null;
    // The player who had the ball was just substituted: it's passed from where it is to whoever has it now.
    if (ph.k === 0 && prev && holder && beatHas(b.first, 'substitution') && !beatHas(b.first, 'possession_change')) {
      // Who had it as this moment came: the receiver of a pass that just arrived, or the holder.
      const had = prev.la && prev.la.at <= b.at && prev.nextCarrierId ? prev.nextCarrierId : prev.carrierId;
      const from = had && had !== holder && !side.some((p) => p.playerId === had) ? posIn(prev, had, ph.at) : null;
      if (from) passIn = { from, start: ph.at, end: passFrom(ph.at, passTime(from, posIn(prev, holder, ph.at))) };
    }
    // A runner keeps the ball: no passes to teammates during a run.
    // A breakaway just happened: the player who broke through runs at goal with it, the defence trailing.
    const broke = ev.slice(b.first, b.end).some((t) => t.event.type === 'advance' && /** @type {any} */ (t.event.data)?.breakaway);
    // Wide play (Task 79): each possession may go down a flank (a keeper's restart, out to a wide player), kept through
    // the spell until a switch of play.
    const inPlay = PLAYING.has(s.phase) && !ph.still && s.possession !== null;
    const sameSpell = Boolean(prev && prev.spell === s.spell && prev.teamId === s.possession);
    /** @type {-1 | 0 | 1} */
    let flank = 0;
    if (inPlay && sameSpell && prev) flank = prev.flank;
    else if (inPlay) {
      const roll = createRng(`${matchId}|flank|${s.spell}`);
      const restart = s.zone === 'defensive' && side.some((p) => p.playerId === base.carrierId && p.slot === keeperSlot);
      if (roll.chance(restart ? play.wideOutletChance : play.flankChance)) flank = roll.chance(0.5) ? -1 : 1;
    }
    // The restart after a foul (Task 144): as its pause ends, the fouled player rolls it to the nearest teammate with an
    // open lane (or the most open one).
    const afterFoul = !ph.still && i > 0 && phases[i - 1].beat === ph.beat && phases[i - 1].still === 'foul';
    if (afterFoul && holder && prev) {
      const now = prev.targets.map((q) => ({ ...q, ...(posIn(prev, q.playerId, ph.at) ?? q) }));
      const from = now.find((q) => q.playerId === holder);
      const mates = now.filter((q) => side.some((p) => p.playerId === q.playerId && p.slot !== keeperSlot) && q.playerId !== holder);
      if (from && mates.length) {
        const lanes = mates.map((q) => ({ q, clear: laneClear(from, q, now.filter((n) => n !== from && n !== q)) }));
        const open = lanes.filter((l) => l.clear >= PASS_CLEAR + PASS_MARGIN).sort((x, y) => dist(from, x.q) - dist(from, y.q));
        const toQ = (open[0] ?? lanes.toSorted((x, y) => y.clear - x.clear)[0]).q;
        const to = toQ.playerId;
        passIn = { from: holder, start: ph.at, end: passFrom(ph.at, passTime(from, toQ)) };
        holder = to;
      }
    }
    // No passing it about just before a tackle (Task 83): the ball stays where the tackler is closing in.
    // Nor just before a breakaway (Task 253): the player about to break keeps it and sets off.
    const breaker = breakaway.leadMs > 0 && la?.breakaway && !broke
      ? ev.find((t) => t.at === la.at && t.event.type === 'advance' && /** @type {any} */ (t.event.data)?.breakaway)?.event.playerId ?? null
      : null;
    const breaksNext = Boolean(breaker);
    if (!afterFoul && ph.k > 0 && !ph.still && holder && prev && !runAfter[b.end - 1] && !broke && !breaksNext && !tackleSoon(ph) && createRng(`${matchId}|hold|${b.first}|${ph.k}`).chance(holdPassChance)) {
      // A teammate in an open lane, or failing that the most open one.
      const now = prev.targets.map((q) => ({ ...q, ...(posIn(prev, q.playerId, ph.at) ?? q) }));
      const from = now.find((q) => q.playerId === holder);
      const lanes = side
        .filter((p) => p.slot !== keeperSlot && p.playerId !== holder)
        .map((p) => {
          const q = now.find((n) => n.playerId === p.playerId);
          return { id: p.playerId, clear: from && q ? laneClear(from, q, now.filter((n) => n !== from && n !== q)) : 0 };
        });
      const open = lanes.filter((l) => l.clear >= PASS_CLEAR + PASS_MARGIN);
      let options = open.length ? open : lanes.toSorted((x, y) => y.clear - x.clear).slice(0, 1);
      // A switch of play: across to the most open teammate on the far side, and the play goes down that flank.
      if (flank !== 0 && createRng(`${matchId}|switch|${b.first}|${ph.k}`).chance(play.switchChance)) {
        const far = lanes.filter((l) => ((now.find((n) => n.playerId === l.id)?.y ?? 0.5) - 0.5) * flank < -SWITCH_FAR);
        if (far.length) {
          options = far.toSorted((x, y) => y.clear - x.clear).slice(0, 1);
          flank = /** @type {-1 | 1} */ (-flank);
        }
      }
      // A keeper's long ball hangs in the air (the big kick, Task 240): only if it lands with time for an ordinary pass
      // to whoever the sim has on the ball next (Tom: it landed so late that the pass on went back at a blur).
      const nextAt = i + 1 < phases.length ? phases[i + 1].at : Infinity;
      const kickFits = (/** @type {string} */ id) => {
        const q = now.find((n) => n.playerId === id);
        if (!from || !q || !(bigKick && from.slot === keeperSlot && dist(from, q) >= bigKickMin)) return true;
        return ph.at + passTime(from, q) + passMaxMs <= nextAt;
      };
      options = options.filter((o) => kickFits(o.id));
      if (options.length) {
        const to = options[createRng(`${matchId}|holdTo|${b.first}|${ph.k}`).int(0, options.length - 1)].id;
        passIn = { from: holder, start: ph.at, end: passFrom(ph.at, passTime(from, now.find((n) => n.playerId === to))) };
        holder = to;
      }
    }
    // The keeper's outlet (Task 88): straight after a restart, if the sim has the team lose the ball before it gets out
    // (a tackle is next), the keeper first plays it out to a defender (on the flank side if there is one), so the keeper
    // is never seen passing straight to an opponent. The sim doesn't say who lost it; the keeper rarely does (15%).
    const firstPlay = !ph.still && !(i > 0 && phases[i - 1].beat === ph.beat && !phases[i - 1].still);
    if (!passIn && inPlay && firstPlay && !la && holder && prev && side.some((p) => p.playerId === holder && p.slot === keeperSlot)
      && ev.slice(b.first, b.end).some((t) => t.event.type === 'possession_change' && RESTARTS.has(/** @type {any} */ (t.event.data)?.reason))) {
      let j = b.end;
      while (j < ev.length && PASSIVE.has(ev[j].event.type)) j++;
      const next = ev[j];
      const start = Math.max(ph.at, b.at + OUTLET_AFTER_MS);
      const phaseEnd = i + 1 < phases.length && phases[i + 1].beat === ph.beat ? phases[i + 1].at : next?.at ?? 0;
      if (next && next.event.type === 'possession_change' && /** @type {any} */ (next.event.data)?.reason === 'tackle'
        && start + passMs <= phaseEnd) {
        const now = prev.targets.map((q) => ({ ...q, ...(posIn(prev, q.playerId, start) ?? q) }));
        const ds = now.filter((q) => side.some((p) => p.playerId === q.playerId && p.slot === 'D'));
        const outfield = now.filter((q) => side.some((p) => p.playerId === q.playerId && p.slot !== keeperSlot));
        const pool = ds.length ? ds : outfield;
        const to = (flank !== 0 ? pool.find((q) => (q.y - 0.5) * flank > 0) : null)
          ?? pool.toSorted((x, y) => Math.abs(y.y - 0.5) - Math.abs(x.y - 0.5))[0];
        // Along the turf, never a big kick (Task 241 found a big kick's slower flight leaving the keeper on the ball as it was lost).
        const keeperAt = now.find((q) => q.playerId === holder);
        const ms = to && keeperAt ? passDuration(dist(keeperAt, to), { passMs, passSpeed, passMaxMs }) : passMs;
        if (to && start + ms <= phaseEnd && start + ms + OUTLET_HOLD_MS <= next.at) {
          passIn = { from: holder, start, end: start + ms };
          if (holder) noKick.add(`${holder}|${start}`);
          holder = to.playerId;
        }
      }
    }
    const press = ph.n > 1 && !ph.still ? ph.k / (ph.n - 1) : 0;
    // In a break (half-time, before overtime), everyone heads for their spot at the next kick-off.
    const breakTo = PLAYING.has(s.phase) ? -1 : kickoffAfter(b.end);
    // In the attacking zone the carrier works the ball at the edge of range, stepping in only in the phase before a shot.
    // On a breakaway the carrier goes straight at goal, and the defence is beaten from the through ball on.
    const edge = !broke && !(la?.shot && ph.k === ph.n - 1);
    // Only in the last phase before it (Task 254): over a long spell the defence trailed, untethered, for many seconds
    // before the break (a third of the time attackers stood offside).
    const lastPhase = !(i + 1 < phases.length && phases[i + 1].beat === ph.beat);
    const beaten = broke || Boolean(la?.breakaway && lastPhase);
    // The corner area: on a flank in the attacking zone, kept until the next shot (not on a breakaway: straight at goal).
    let corner = false;
    if (flank !== 0 && breakTo < 0 && !beaten) {
      const shotHere = ev.slice(b.first, b.end).some((t) => t.event.type === 'shot');
      if (sameSpell && prev?.corner && !shotHere) corner = true;
      else corner = timeline.stateThrough(la ? la.cut : b.end).zone === 'attacking' && createRng(`${matchId}|corner|${b.first}`).chance(play.cornerChance);
    }
    let wide = flank !== 0 ? { flank, corner, holder } : null;
    let target = breakTo >= 0 ? formationAt(breakTo) : formationAt(la ? la.cut : b.end, ph.k, press, holder === base.carrierId ? null : holder, edge, beaten, wide);
    // Not every shot first time (Task 170): in the last phase before a shot, now and then the shooter is passed the
    // ball early, in time for a touch (touchMinMs to touchMaxMs) before the strike, and on the ball steps in to shoot
    // like any carrier, if the phase has room for it. A pass the phase opens with goes to the shooter instead.
    const passer = passIn ? (typeof passIn.from === 'string' && passIn.start === ph.at ? passIn.from : null) : holder;
    if (la?.shot && lastPhase && !broke && !ph.still && breakTo < 0 && prev && passer && target.carrierId
      && target.carrierId !== passer && createRng(`${matchId}|touch|${la.at}`).chance(touchChance)) {
      const shooter = target.carrierId;
      const strike = la.at - shotMs;
      const flight = passTime(posIn(prev, passer, ph.at), target.players.find((q) => q.playerId === shooter));
      const touch = Math.min(createRng(`${matchId}|touchMs|${la.at}`).float(touchMinMs, touchMaxMs), strike - flight - ph.at);
      if (touch >= touchMinMs) {
        const start = strike - touch - flight;
        passIn = { from: passer, start, end: start + flight };
        holder = shooter;
        wide = wide ? { ...wide, holder } : null;
        target = formationAt(la.cut, ph.k, press, holder === base.carrierId ? null : holder, edge, beaten, wide);
      }
    }
    if (ph.brk === 'gather') {
      // Outfield players walk to their bench; keepers go straight to their end for the next period.
      const count = { home: 0, away: 0 };
      target = { ...target, players: target.players.map((q) => (q.slot === keeperSlot ? q : { ...q, ...benchArea(q.side, count[q.side]++) })) };
    }
    // Fouled in the box (Task 143): whoever is on the ball for a foul that gives a free shot is in the box by then.
    if (la?.box && breakTo < 0 && target.carrierId && s.possession) {
      const dir = dirOf(s.possession, s.phase);
      // Somewhere in it, seeded by the foul (not all on its back edge).
      const depth = createRng(`${matchId}|box|${la.at}`).float(FREE_SHOT_BOX.near + 0.02, FREE_SHOT_BOX.depth - 0.01);
      target = { ...target, players: target.players.map((p) => (p.playerId === target.carrierId ? { ...p, ...intoBox(p, dir, depth) } : p)) };
    }
    // Fouled outside it (Task 144): any other foul is never drawn where a free shot would be.
    if (la?.foul && breakTo < 0 && target.carrierId && s.possession) {
      const dir = dirOf(s.possession, s.phase);
      target = { ...target, players: target.players.map((p) => (p.playerId === target.carrierId ? { ...p, ...outOfBox(p, dir) } : p)) };
    }
    // Whoever receives the pass before the next action moves into an open lane for it.
    if (la && breakTo < 0 && holder && target.carrierId && target.carrierId !== holder) {
      target = { ...target, players: getOpen(target.players, holder, target.carrierId, keeperSlot) };
    }
    const placed = !prev;
    const kickoff = ph.k === 0 && beatHas(b.first, 'kickoff');
    // After a turnover, and when the defence is caught out by a breakaway, players react late (the far ones latest).
    const react = !placed && ph.k === 0 && (beatHas(b.first, 'possession_change') || broke);
    /** @type {Plan} */
    const plan = {
      at: ph.at, prev: placed ? null : prev, targets: target.players, byId: new Map(target.players.map((p) => [p.playerId, p])),
      start: new Map(), delay: new Map(), speed: new Map(), carrierId: holder, passIn, la, nextCarrierId: target.carrierId,
      teamId: s.possession, spell: s.spell, flank, corner,
    };
    // The play is where the ball is at this moment; players far from it jog and react later.
    const ref = (plan.prev && holder && posIn(plan.prev, holder, ph.at)) || base.ball;
    // The first kick-off starts from the kick-off shape itself; every kick-off holds still for a moment.
    const startAt = placed ? new Map(base.players.map((q) => [q.playerId, /** @type {Point} */ ({ x: q.x, y: q.y })])) : null;
    // Defenders sprint back to hold the line (Task 80), but not on a breakaway: the beaten defence trails as before.
    setOff(plan, react, ref, kickoff ? kickoffHoldMs : 0, startAt, PLAYING.has(s.phase) && s.possession && !beaten ? dirOf(s.possession, s.phase) : 0);
    // On a breakaway the runner times their run to reach the shooting spot as they strike the ball (Task 40), at
    // up to BREAKAWAY_SPRINT times their usual top speed, so nobody waits for the shot.
    // They aim a little past the shooting spot, so they're still running as they shoot.
    if (broke && la?.shot && holder && plan.byId.has(holder)) {
      if (breakaway.leadMs > 0 && plan.prev) {
        plan.delay.set(holder, 0);
        plan.start.set(holder, posIn(plan.prev, holder, ph.at) ?? /** @type {Point} */ (plan.start.get(holder)));
      }
      const from = /** @type {Point} */ (plan.start.get(holder));
      const spot = /** @type {Placed} */ (plan.byId.get(holder));
      const to = { ...spot, x: clamp(spot.x + dirOf(s.possession, s.phase) * BREAKAWAY_THROUGH, 0.02) };
      plan.targets = plan.targets.map((p) => (p === spot ? to : p));
      plan.byId.set(holder, to);
      const time = la.at - shotMs - ph.at - /** @type {number} */ (plan.delay.get(holder));
      const want = (dist(from, spot) / Math.max(1, time)) * 1000;
      plan.speed.set(holder, Math.min(BREAKAWAY_SPRINT * runSpeed, Math.max(runSpeed, want)) / 1000);
    }
    // About to break away (Task 253): in the phase before the breakaway, the player who breaks sets off goal-ward
    // `leadMs` before it, at a run: on the ball, carrying it; or running onto the through ball played to them. So
    // it's under way as the breakaway comes; then (below) they go on without a pause.
    const mover = breaker && ((breaker === holder && !passIn) || breaker === plan.nextCarrierId) ? breaker : null;
    if (mover && la && lastPhase && plan.byId.has(mover) && s.possession && breakTo < 0) {
      const lead = Math.min(breakaway.leadMs, la.at - ph.at);
      // They carry on as before until they set off, and set off from wherever that leaves them.
      const delay = Math.max(/** @type {number} */ (plan.delay.get(mover) ?? 0), la.at - ph.at - lead);
      if (plan.prev) plan.start.set(mover, posIn(plan.prev, mover, ph.at + delay) ?? /** @type {Point} */ (plan.start.get(mover)));
      const from = /** @type {Point} */ (plan.start.get(mover));
      const spot = /** @type {Placed} */ (plan.byId.get(mover));
      const to = { ...spot, x: clamp(from.x + dirOf(s.possession, s.phase) * (runSpeed * lead) / 1000, 0.02), y: from.y };
      plan.targets = plan.targets.map((p) => (p === spot ? to : p));
      plan.byId.set(mover, to);
      plan.delay.set(mover, delay);
      plan.speed.set(mover, runSpeed / 1000);
    }
    // In a break the keepers change ends at an even jog across the whole gather (Task 278m, Tom: they sprinted the
    // length of the pitch in a few seconds, starkest before overtime, faster still in a re-air's quicker half-time),
    // never faster than a run.
    if (ph.brk === 'gather' && plan.prev) {
      const span = (phases[i + 1]?.at ?? ph.at) - ph.at;
      for (const q of plan.targets) {
        const from = plan.start.get(q.playerId);
        if (q.slot !== keeperSlot || !from || span <= 0) continue;
        plan.delay.set(q.playerId, 0);
        plan.speed.set(q.playerId, Math.min(runSpeed, (dist(from, q) / (span * KEEPER_CROSS_SHARE)) * 1000) / 1000);
      }
    }
    if (ph.loose && prev) runLoose(plan, ph, b, prev);
    if (inPlay && breakTo < 0 && holder && prev) toTheAction(plan, ph, s);
    if (goalSide && inPlay && breakTo < 0 && !broke && holder && prev && !la?.shot) stepGoalSide(plan, ph, s);
    return plan;
  }

  /**
   * Clear chances (Task 239): the picture never leaves an attacker on the ball alone in front of goal when the sim has
   * no shot of theirs coming. If the player on the ball at the end of this phase stands close in front of the goal they
   * attack with no outfield defender in the lane to it, and the next moment isn't their shot, the nearest outfield
   * defender steps in goal-side, closing them down. A real chance (a shot next) is left as it is. Changes the plan in place.
   * @param {Plan} plan @param {(typeof phases)[number]} ph @param {import('./timeline.js').MatchState} s
   */
  function stepGoalSide(plan, ph, s) {
    const next = nextMoment(ph);
    if (next?.events.some((e) => e.type === 'shot' && e.teamId === s.possession)) return;
    // Nor just before a breakaway (Task 241 found one): the defence is about to be beaten, none of it goal-side.
    if (next?.events.some((e) => e.type === 'advance' && e.data?.breakaway)) return;
    if (!s.possession) return;
    const dir = dirOf(s.possession, s.phase);
    const goal = { x: dir === 1 ? 1 : 0, y: 0.5 };
    const near = (/** @type {Point} */ q) => Math.abs(goal.x - q.x) <= GOAL_SIDE_NEAR && Math.abs(q.y - 0.5) <= GOAL_SIDE_WIDE;
    // The player on the ball where they stand as the phase starts and where they're headed, and anyone it's passed to.
    const holder = plan.carrierId ? plan.byId.get(plan.carrierId) : undefined;
    const receiver = plan.nextCarrierId && plan.nextCarrierId !== plan.carrierId ? plan.byId.get(plan.nextCarrierId) : undefined;
    const startOf = (/** @type {Placed} */ q) => ({ ...q, .../** @type {Point} */ (plan.start.get(q.playerId) ?? q) });
    const onBall = [holder && startOf(holder), holder, receiver].find((q) => q && q.slot !== keeperSlot && near(q));
    if (!onBall) return;
    const defenders = plan.targets.filter((q) => q.side !== onBall.side && q.slot !== keeperSlot);
    const inLane = (/** @type {Point} */ q) => laneDistance(q, onBall, goal) <= GOAL_SIDE_LANE && Math.abs(goal.x - q.x) < Math.abs(goal.x - onBall.x) + 0.02;
    if (!defenders.length || defenders.some(inLane)) return;
    const me = defenders.reduce((a, q) => (dist(q, onBall) < dist(a, onBall) ? q : a));
    const len = dist(onBall, goal);
    const to = outOfCrease(lerp(onBall, goal, Math.min(GOAL_SIDE_GAP, len / 2) / Math.max(1e-9, len)));
    const moved = { ...me, x: to.x, y: to.y };
    plan.targets = plan.targets.map((q) => (q === me ? moved : q));
    plan.byId.set(me.playerId, moved);
    const from = /** @type {Point} */ (plan.start.get(me.playerId));
    const time = (next ? next.at : ph.at + CLOSE_LEAD_MS) - ph.at - /** @type {number} */ (plan.delay.get(me.playerId) ?? 0) - settleMs;
    const want = (dist(from, to) / Math.max(1, time)) * 1000;
    plan.speed.set(me.playerId, Math.min(LOOSE_SPRINT * runSpeed, Math.max(runSpeed, want)) / 1000);
  }

  /**
   * The next leading moment after phase `ph`'s, and its events.
   * @param {(typeof phases)[number]} ph
   */
  function nextMoment(ph) {
    let nb = ph.beat + 1;
    while (nb < beats.length && lead[nb] !== nb) nb++;
    const beat = beats[nb];
    return beat ? { at: beat.at, events: ev.slice(beat.first, beat.end).map((t) => /** @type {any} */ (t.event)) } : null;
  }

  /** Whether the sim's next moment, within CLOSE_LEAD_MS of phase `ph`, is a tackle (Task 83). @param {(typeof phases)[number]} ph */
  function tackleSoon(ph) {
    const next = nextMoment(ph);
    return Boolean(next && next.at - ph.at <= CLOSE_LEAD_MS && next.events.some((e) => e.type === 'possession_change' && e.data?.reason === 'tackle'));
  }

  /**
   * The bubble check (Task 83): the next moment's tackle, steal or block names a player; in the last CLOSE_LEAD_MS
   * before it, the picture brings that player to the action, so the bubble is over the player it showed doing it. A
   * tackler closes down the player on the ball (goal-side); a player stealing a pass steps into the lane to the passer's
   * nearest teammate; a blocker steps into the shot's path. Changes the plan in place.
   * @param {Plan} plan @param {(typeof phases)[number]} ph @param {import('./timeline.js').MatchState} s
   */
  function toTheAction(plan, ph, s) {
    const nextBeat = nextMoment(ph);
    if (!nextBeat || nextBeat.at - ph.at > CLOSE_LEAD_MS) return;
    const events = nextBeat.events;
    const tackle = events.find((e) => e.type === 'possession_change' && e.data?.reason === 'tackle' && e.teamId !== s.possession);
    const block = events.find((e) => e.type === 'block');
    // A foul that gives a free shot (Task 143): the defender who fouls closes down the player on the ball, like a tackler.
    const foul = events.find((e) => e.type === 'foul' && e.teamId !== s.possession);
    const who = tackle?.playerId ?? foul?.playerId ?? block?.playerId;
    const me = who ? plan.byId.get(who) : undefined;
    const holder = plan.carrierId ? plan.byId.get(plan.carrierId) : undefined;
    if (!me || !holder || me.slot === keeperSlot) return;
    const attackDir = dirOf(s.possession, s.phase);
    // Where a player of the team on the ball will be at the moment (they may still be on their way to their spot).
    const atMoment = (/** @type {Placed} */ p, /** @type {number} */ t) => ({ ...p, ...(posIn(plan, p.playerId, t) ?? p) });
    /** @type {Point} */
    let to;
    if (block) {
      // Into the path of the shot, from where it'll be struck toward the goal.
      const striker = plan.nextCarrierId ? plan.byId.get(plan.nextCarrierId) : holder;
      if (!striker) return;
      const shooter = atMoment(striker, nextBeat.at - shotMs);
      const goal = { x: attackDir === 1 ? 1 : 0, y: 0.5 };
      const len = dist(shooter, goal);
      to = lerp(shooter, goal, Math.min(BLOCK_GAP, len / 2) / Math.max(1e-9, len));
    } else if (tackle?.data?.steal) {
      // Into the lane from the passer to their nearest teammate, as they'll be when it's cut out.
      const passer = atMoment(holder, nextBeat.at);
      const mates = plan.targets.filter((p) => p.side === holder.side && p.playerId !== holder.playerId && p.slot !== keeperSlot).map((p) => atMoment(p, nextBeat.at));
      if (!mates.length) return;
      const mate = mates.reduce((m, p) => (dist(p, passer) < dist(m, passer) ? p : m));
      const len = dist(passer, mate);
      to = lerp(passer, mate, Math.min(STEAL_GAP, len / 2) / Math.max(1e-9, len));
    } else {
      // Right at the player on the ball, goal-side of them, as the tackle comes.
      const there = atMoment(holder, nextBeat.at);
      to = { x: there.x - attackDir * CLOSE_GAP, y: there.y };
    }
    to = outOfCrease({ x: clamp(to.x, 0.02), y: clamp(to.y, 0.05) });
    const moved = { ...me, x: to.x, y: to.y };
    plan.targets = plan.targets.map((p) => (p === me ? moved : p));
    plan.byId.set(me.playerId, moved);
    // If that took the last defender up to the ball, the attackers check back to the new line (Task 80's tether), so
    // nobody is left standing beyond it; a blocker stepping out too (Task 254: it left strikers far offside for the
    // seconds before a blocked shot). (Copies: the formation's own spots are cached.)
    if (tackle || foul || block) {
      plan.targets = plan.targets.map((p) => (p.side === holder.side && p.slot !== keeperSlot ? { ...p } : p));
      const onBall = plan.teamId === homeId ? 'home' : 'away';
      tetherLine(plan.targets, onBall, attackDir, atMoment(holder, nextBeat.at), keeperSlot, [holder.playerId, plan.nextCarrierId], { reach: tether.reach, drop: 0 });
      for (const p of plan.targets) plan.byId.set(p.playerId, p);
    }
    const from = /** @type {Point} */ (plan.start.get(me.playerId));
    const time = nextBeat.at - ph.at - /** @type {number} */ (plan.delay.get(me.playerId)) - settleMs;
    const want = (dist(from, to) / Math.max(1, time)) * 1000;
    plan.speed.set(me.playerId, Math.min(LOOSE_SPRINT * runSpeed, Math.max(runSpeed, want)) / 1000);
  }

  /**
   * How long the ball runs loose after a moment (Task 82), or 0: every block and parried save (loose balls in the sim
   * too), and a tackle that isn't a steal with chance looseTackleChance; never longer than LOOSE_SHARE of the time before
   * the next moment, and not at all if that leaves less than LOOSE_MIN_MS.
   * @param {{ first: number, end: number, at: number }} b @param {number} next  When the next moment comes.
   */
  function looseLength(b, next) {
    const beat = ev.slice(b.first, b.end).map((t) => /** @type {any} */ (t.event));
    if (beat.some((e) => e.type === 'goal')) return 0;
    const shot = beat.some((e) => e.type === 'block' || (e.type === 'save' && e.data?.parried));
    const tackle = beat.some((e) => e.type === 'possession_change' && e.data?.reason === 'tackle' && !e.data?.steal);
    if (!shot && !tackle) return 0;
    const rng = createRng(`${matchId}|loose|${b.first}`);
    if (!shot && !rng.chance(play.looseTackleChance)) return 0;
    const ms = Math.min(rng.float(play.looseMinMs, play.looseMaxMs), (next - b.at) * LOOSE_SHARE);
    return ms >= LOOSE_MIN_MS ? ms : 0;
  }

  /**
   * The race for a loose ball (Task 82), in its phase's plan: the ball runs from where it broke loose to a spot in open
   * space; the player the sim gave it to (or, if the attackers kept it, their nearest outfield player) sprints there to
   * meet it as it stops, and the nearest opponent chases, pulling up just short. Changes the plan in place.
   * @param {Plan} plan @param {(typeof phases)[number]} ph @param {(typeof beats)[number]} b @param {Plan} prev
   */
  function runLoose(plan, ph, b, prev) {
    const beat = ev.slice(b.first, b.end).map((t) => /** @type {any} */ (t.event));
    const ms = /** @type {number} */ (ph.loose);
    const rng = createRng(`${matchId}|looseAt|${b.first}`);
    const shot = beat.some((e) => e.type === 'shot');
    /** @type {Point} */
    let from;
    let angle;
    let reach;
    if (shot) {
      // Off the blocker or the keeper, back out toward where the shot came from, give or take.
      const sp = shotPlan(b.first);
      from = sp.impact;
      angle = Math.atan2((sp.origin.y - from.y) / 2, sp.origin.x - from.x) + rng.float(-0.7, 0.7);
      reach = rng.float(play.looseReachMin, play.looseReachMax);
    } else {
      // At the feet of whoever had it (from the plan, not the pose, which looks ahead into this one).
      const had = prev.la && prev.la.at <= b.at && prev.nextCarrierId ? prev.nextCarrierId : prev.carrierId;
      from = (had && posIn(prev, had, b.at)) || plan.start.get(/** @type {string} */ (plan.carrierId)) || { x: 0.5, y: 0.5 };
      angle = rng.float(-Math.PI, Math.PI);
      reach = rng.float(play.tackleReachMin, play.tackleReachMax);
    }
    const keepIn = (/** @type {Point} */ p) => outOfCrease({ x: clamp(p.x, 0.04), y: clamp(p.y, 0.08) });
    let spot = keepIn({ x: from.x + Math.cos(angle) * reach, y: from.y + Math.sin(angle) * reach * 2 });
    const startOf = (/** @type {string} */ id) => /** @type {Point} */ (plan.start.get(id));
    const nearest = (/** @type {Placed[]} */ ps) => ps.reduce((m, p) => (dist(startOf(p.playerId), spot) < dist(startOf(m.playerId), spot) ? p : m));
    const won = beat.find((e) => e.type === 'possession_change');
    const onBall = plan.teamId === homeId ? 'home' : 'away';
    const outfield = plan.targets.filter((t) => t.slot !== keeperSlot && plan.start.has(t.playerId));
    const ours = outfield.filter((t) => t.side === onBall);
    const winner = won ? plan.byId.get(won.playerId) : ours.length ? nearest(ours) : undefined;
    if (!winner) return;
    // The winner gets there as it stops: if it's too far for them, it doesn't run so far.
    const w0 = startOf(winner.playerId);
    const time = ms - /** @type {number} */ (plan.delay.get(winner.playerId));
    const maxD = (LOOSE_SPRINT * runSpeed * Math.max(0, time - settleMs)) / 1000;
    if (dist(w0, spot) > maxD) spot = keepIn(lerp(w0, spot, maxD / Math.max(1e-9, dist(w0, spot))));
    const speed = Math.min(LOOSE_SPRINT * runSpeed, Math.max(runSpeed, (dist(w0, spot) / Math.max(1, time - settleMs)) * 1000)) / 1000;
    const set = (/** @type {Placed} */ p, /** @type {Point} */ to, /** @type {number} */ v) => {
      const moved = { ...p, x: to.x, y: to.y };
      plan.targets = plan.targets.map((q) => (q.playerId === p.playerId ? moved : q));
      plan.byId.set(p.playerId, moved);
      plan.speed.set(p.playerId, v);
    };
    set(winner, spot, speed);
    // The nearest opponent chases, a little slower, and pulls up just short.
    const theirs = outfield.filter((t) => t.side !== winner.side);
    if (theirs.length) {
      const chaser = nearest(theirs);
      const c0 = startOf(chaser.playerId);
      const d = dist(c0, spot);
      const short = d > LOOSE_STEP ? lerp(spot, c0, LOOSE_STEP / d) : c0;
      set(chaser, short, speed * 0.9);
    }
    plan.carrierId = winner.playerId;
    plan.loose = { from, to: /** @type {Point} */ (posIn(plan, winner.playerId, ph.at + ms)), ms };
  }

  /** The end of the next kick-off's moment after event `count`, or -1. @param {number} count */
  function kickoffAfter(count) {
    for (let i = count; i < ev.length; i++) if (ev[i].event.type === 'kickoff') return beats[beatOf[i]].end;
    return -1;
  }

  /**
   * Start, delay and speed for each player in a plan. Players far from `ref` (the ball) jog, and react later after a
   * turnover. Anyone new to the pitch (a substitute) runs on from their seat on the bench.
   * @param {Plan} plan @param {boolean} react @param {Point} ref
   * @param {number} [hold]  Everyone waits this long first (a kick-off).
   * @param {Map<string, Point> | null} [startAt]  Where players start when there's no plan before.
   * @param {1 | -1 | 0} [attackDir]  In play, the way the team on the ball attacks: the other team's outfield players
   *   sprint when they're dropping back toward their own goal (Task 80), so a striker can't outrun the line.
   */
  function setOff(plan, react, ref, hold = 0, startAt = null, attackDir = 0) {
    const defending = plan.teamId === homeId ? 'away' : 'home';
    for (const t of plan.targets) {
      const now = plan.prev ? posIn(plan.prev, t.playerId, plan.at) : null;
      const far = now ? Math.min(1, Math.hypot(now.x - ref.x, (now.y - ref.y) / 2) / nearBall) : 0;
      const delay = react && now ? reactNearMs + (reactFarMs - reactNearMs) * far : hold;
      const retreat = attackDir !== 0 && now !== null && t.side === defending && t.slot !== keeperSlot && (t.x - now.x) * attackDir > RETREAT_MIN;
      plan.delay.set(t.playerId, delay);
      plan.speed.set(t.playerId, (retreat ? runSpeed : runSpeed + (jogSpeed - runSpeed) * far) / 1000);
      const bench = seatOf(timeline, t.playerId) ?? { x: 0.5, y: 0 };
      plan.start.set(t.playerId, now
        ? (delay > 0 ? posIn(/** @type {Plan} */ (plan.prev), t.playerId, plan.at + delay) ?? now : now)
        : plan.prev ? bench : startAt?.get(t.playerId) ?? { x: t.x, y: t.y });
    }
  }

  /**
   * The paused clock after a goal: everyone heads for their spot at the restart, except the scorer, who peels away to
   * celebrate near the corner they attacked. The conceding keeper collects the ball. Once the celebration is over
   * (`celebrate` false), the scorer and their teammates jog back too.
   * @param {(typeof phases)[number]} ph @param {(typeof beats)[number]} b @param {Plan} prev @param {boolean} celebrate
   * @returns {Plan}
   */
  function goalPlan(ph, b, prev, celebrate = true) {
    const goal = /** @type {Readonly<import('../chronicle/eventLog.js').LeagueEvent>} */ (ev.slice(b.first, b.end).find((t) => t.event.type === 'goal')?.event);
    // Where everyone restarts: the next moment, but without any substitution in it (that gets its own pause after this
    // one, so the incoming player mustn't run on yet).
    const next = beats[ph.beat + 1];
    let cut = next?.end ?? b.end;
    if (next) for (let i = next.first; i < next.end; i++) if (ev[i].event.type === 'substitution' || ev[i].event.type === 'injury') { cut = Math.max(b.end, i); break; }
    const restart = formationAt(cut);
    const s = timeline.stateThrough(b.end);
    const dir = dirOf(goal.teamId, s.phase);
    const spot = { x: dir === 1 ? CELEBRATE.x : 1 - CELEBRATE.x, y: CELEBRATE.y };
    // The two teammates nearest the scorer run over to join the celebration.
    const scorerAt = posIn(prev, goal.playerId, ph.at) ?? spot;
    const scorerSide = restart.players.find((q) => q.playerId === goal.playerId)?.side;
    const mates = restart.players
      .filter((q) => q.side === scorerSide && q.playerId !== goal.playerId && q.slot !== keeperSlot)
      .map((q) => ({ id: q.playerId, at: posIn(prev, q.playerId, ph.at) }))
      .filter((q) => q.at)
      .sort((a, c) => Math.hypot(/** @type {Point} */ (a.at).x - scorerAt.x, /** @type {Point} */ (a.at).y - scorerAt.y) - Math.hypot(/** @type {Point} */ (c.at).x - scorerAt.x, /** @type {Point} */ (c.at).y - scorerAt.y))
      .slice(0, 2)
      .map((q) => q.id);
    // The two mates either side of the scorer, a little below; anyone else from the scoring side stays out of it.
    const huddle = (/** @type {number} */ i) => ({ x: spot.x + (i === 0 ? -0.03 : 0.03), y: spot.y + 0.05 });
    // A golden goal (Task 147, Tom): the whole team, keeper too, mobs the scorer in a ring round them; the other side
    // stays where they were. There's no restart.
    const golden = b.at === goldenAt;
    const team = restart.players.filter((q) => q.side === scorerSide && q.playerId !== goal.playerId);
    const ring = (/** @type {number} */ i) => {
      const a = Math.PI * (0.15 + (0.7 * i) / Math.max(1, team.length - 1)) + Math.PI;
      return { x: spot.x + Math.cos(a) * 0.035, y: Math.min(0.95, Math.max(0.05, spot.y - Math.sin(a) * 0.07)) };
    };
    const targets = golden
      ? restart.players.map((t) => (t.playerId === goal.playerId ? { ...t, ...spot } : t.side === scorerSide ? { ...t, ...ring(team.indexOf(t)) } : { ...t, ...(posIn(prev, t.playerId, ph.at) ?? t) }))
      : !celebrate ? restart.players : restart.players.map((t) => {
      if (t.playerId === goal.playerId) return { ...t, ...spot };
      const i = mates.indexOf(t.playerId);
      if (i >= 0) return { ...t, ...huddle(i) };
      // Only the scoring side celebrates: anyone else whose spot is in the way waits just outside it.
      const dx = t.x - spot.x;
      const dy = (t.y - spot.y) / 2;
      const d = Math.hypot(dx, dy);
      if (d >= CELEBRATE_CLEAR) return t;
      const [ux, uy] = d < 1e-9 ? [0, 1] : [dx / d, dy / d];
      return { ...t, x: spot.x + ux * CELEBRATE_CLEAR, y: Math.min(0.95, Math.max(0.05, spot.y + uy * CELEBRATE_CLEAR * 2)) };
    });
    const restartState = timeline.stateThrough(cut);
    /** @type {Plan} */
    const plan = {
      at: ph.at, prev, targets, byId: new Map(targets.map((p) => [p.playerId, p])),
      start: new Map(), delay: new Map(), speed: new Map(), carrierId: restart.carrierId, passIn: null, la: null, nextCarrierId: restart.carrierId,
      teamId: restartState.possession, spell: restartState.spell, flank: 0, corner: false,
    };
    setOff(plan, false, posIn(prev, goal.playerId, ph.at) ?? { x: 0.5, y: 0.5 });
    return plan;
  }

  /**
   * The paused clock before a free shot (Task 143; Tom's pick B from freeshots.html): everyone stops at the whistle;
   * once the referee is bringing the ball to the mark, the defending keeper goes to their line, the taker stands just
   * behind the ball and everyone else (but the other keeper, who stays put) takes a place on an arc behind the mark,
   * in their order across; a beat; then (`runUp`) the taker steps up to the ball as the shot comes. The ball and the
   * referee are scripted from the same staging (poseAt, pitchside.js).
   * @param {(typeof phases)[number]} ph @param {(typeof beats)[number]} b @param {Plan} prev
   * @returns {Plan}
   */
  function freeShotPlan(ph, b, prev) {
    const kickBeat = beats[ph.beat + 1];
    const fs = /** @type {Readonly<import('../chronicle/eventLog.js').LeagueEvent>} */ (ev.slice(kickBeat.first, kickBeat.end).find((t) => t.event.type === 'free_shot')?.event);
    const s = timeline.stateThrough(b.end);
    const dir = dirOf(fs.teamId, s.phase);
    const mark = freeShotMark(dir === 1 ? 1 : 0);
    const stage = freeShotStaging(/** @type {{ ms: number }} */ (pauseAt.get(b.at)).ms, shotMs);
    const attacking = fs.teamId === homeId ? 'home' : 'away';
    const ball = { x: mark.x, y: mark.y };
    /** @type {Plan} */
    const plan = {
      at: ph.at, prev, targets: [], byId: new Map(), start: new Map(), delay: new Map(), speed: new Map(),
      carrierId: fs.playerId, passIn: null, la: null, nextCarrierId: fs.playerId, teamId: fs.teamId, spell: s.spell, flank: 0, corner: false,
    };
    if (ph.runUp) {
      // Everyone holds where they are; the taker steps up to the ball, arriving as they strike it.
      const time = Math.max(1, stage.kick - stage.run);
      plan.targets = prev.targets.map((t) => (t.playerId === fs.playerId ? { ...t, x: ball.x - dir * 0.008, y: ball.y } : t));
      for (const t of plan.targets) {
        const now = posIn(prev, t.playerId, ph.at) ?? t;
        plan.start.set(t.playerId, now);
        plan.delay.set(t.playerId, 0);
        plan.speed.set(t.playerId, Math.max(runSpeed / 1000, dist(now, t) / time));
      }
      plan.byId = new Map(plan.targets.map((p) => [p.playerId, p]));
      return plan;
    }
    // Where everyone is at the whistle: they stop there (a frozen plan before this one) until the clearing starts.
    const at = new Map(prev.targets.map((t) => [t.playerId, posIn(prev, t.playerId, ph.at) ?? t]));
    const keeper = prev.targets.find((t) => t.slot === keeperSlot && t.side !== attacking);
    const others = prev.targets.filter((t) => t.playerId !== fs.playerId && t !== keeper && !(t.slot === keeperSlot && t.side === attacking));
    // The arc: behind the mark, its ends toward the touchlines, everyone in their order across.
    const arc = [...others].sort((p, q) => /** @type {Point} */ (at.get(p.playerId)).y - /** @type {Point} */ (at.get(q.playerId)).y);
    /** @type {Map<string, Point>} */
    const to = new Map();
    arc.forEach((t, i) => {
      const f = arc.length === 1 ? 0.5 : i / (arc.length - 1);
      const ang = (-0.42 + 0.84 * f) * Math.PI;
      to.set(t.playerId, { x: mark.x - dir * ARC_R * Math.cos(ang), y: mark.y + 2 * ARC_R * Math.sin(ang) });
    });
    if (keeper) to.set(keeper.playerId, { x: dir === 1 ? 0.975 : 0.025, y: 0.5 });
    to.set(fs.playerId, { x: mark.x - dir * TAKER_BACK, y: mark.y + 0.01 });
    plan.targets = prev.targets.map((t) => ({ ...t, ...(to.get(t.playerId) ?? at.get(t.playerId)) }));
    plan.byId = new Map(plan.targets.map((p) => [p.playerId, p]));
    const frozenTargets = prev.targets.map((t) => ({ ...t, .../** @type {Point} */ (at.get(t.playerId)) }));
    /** @type {Plan} */
    const frozen = { ...plan, prev: null, targets: frozenTargets, byId: new Map(frozenTargets.map((p) => [p.playerId, p])), start: at, delay: new Map(), speed: new Map() };
    for (const t of frozenTargets) { frozen.delay.set(t.playerId, 0); frozen.speed.set(t.playerId, 0); }
    plan.prev = frozen;
    for (const t of plan.targets) {
      const from = /** @type {Point} */ (at.get(t.playerId));
      // The taker waits a moment longer, for the referee to pass.
      const delay = stage.clearFrom + (t.playerId === fs.playerId ? 300 : 0);
      plan.start.set(t.playerId, from);
      plan.delay.set(t.playerId, delay);
      // Quick enough to be in place as the clearing ends, at a jog at least.
      plan.speed.set(t.playerId, Math.max(jogSpeed / 1000, dist(from, t) / Math.max(300, stage.cleared - delay - settleMs)));
    }
    return plan;
  }

  /**
   * The paused clock after any other foul (Task 144, Tom): a short, organic restart. Everyone carries on a moment, then
   * drifts into their shape for the fouled team on the ball (as round a keeper's restart); the fouled player stands
   * just behind the ball, which lies where the foul was (poseAt; the referee comes over and sets it, pitchside.js);
   * opponents near it give it room. As the pause ends the fouled player rolls a restart pass (makePlan).
   * @param {(typeof phases)[number]} ph @param {(typeof beats)[number]} b @param {Plan} prev
   * @returns {Plan}
   */
  function foulPlan(ph, b, prev) {
    // (foulSpots: kept for poseAt, so the ball lies exactly where the plan put the foul.)
    const foul = /** @type {any} */ (ev.slice(b.first, b.end).find((t) => t.event.type === 'foul')?.event);
    const s = timeline.stateThrough(b.end);
    // Where the ball is at the whistle: at the feet of whoever has it (or is receiving it) in the plan before.
    const had = prev.la && prev.la.at <= b.at && prev.nextCarrierId ? prev.nextCarrierId : prev.carrierId;
    const spot = (had && posIn(prev, had, ph.at)) || { x: 0.5, y: 0.5 };
    foulSpots.set(b.at, spot);
    // Whoever the picture has on the ball is the one fouled (the sim's fouled player may be shown elsewhere), so they're
    // already at the ball for the restart; failing that, the sim's.
    const side = s.possession === homeId ? s.onPitch.home : s.onPitch.away;
    const fouledId = had && side.some((p) => p.playerId === had) ? had : side.some((p) => p.playerId === foul?.data?.fouledId) ? foul.data.fouledId : s.carrierId;
    const dir = dirOf(s.possession, s.phase);
    const base = formationAt(b.end, 0, 0, fouledId);
    const onBall = s.possession === homeId ? 'home' : 'away';
    const targets = base.players.map((t) => {
      if (t.playerId === fouledId) return { ...t, x: spot.x - dir * 0.012, y: spot.y };
      if (t.side === onBall || t.slot === keeperSlot) return t;
      // Opponents give the ball room.
      const d = dist(t, spot);
      if (d >= FOUL_ROOM) return t;
      const [ux, uy] = d < 1e-9 ? [-dir, 0] : [(t.x - spot.x) / d, (t.y - spot.y) / 2 / d];
      return { ...t, x: clamp(spot.x + ux * FOUL_ROOM, 0.02), y: clamp(spot.y + uy * FOUL_ROOM * 2, 0.05) };
    });
    /** @type {Plan} */
    const plan = {
      at: ph.at, prev, targets, byId: new Map(targets.map((p) => [p.playerId, p])), start: new Map(), delay: new Map(), speed: new Map(),
      carrierId: fouledId, passIn: null, la: null, nextCarrierId: fouledId, teamId: s.possession, spell: s.spell, flank: prev.flank, corner: false,
    };
    // A moment's carry-on at the whistle, then at their usual pace (jogging when far from the ball).
    setOff(plan, false, spot, FOUL_HOLD_MS);
    return plan;
  }

  /** @type {Map<number, Point>} Where each foul's ball lies in its pause (Task 144), by the foul's moment. */
  const foulSpots = new Map();

  /** Phase j's plan, building any missing ones before it in order. @param {number} j */
  function planOf(j) {
    if (plans[j]) return plans[j];
    let k = j;
    while (k > 0 && !plans[k - 1]) k--;
    for (; k <= j; k++) plans[k] = makePlan(k, k > 0 ? plans[k - 1] : null);
    return plans[j];
  }

  /**
   * Players and the ball holder between events, ignoring the moment's own ball scripts. In play, keepers track the
   * ball (Task 35); outfield players never stand in a crease.
   * @param {number} count  Events that have happened (at least 1).
   * @param {number} e  Elapsed ms.
   */
  function steady(count, e) {
    const st = steadyRaw(count, e);
    const players = st.players.map((p) => (p.slot === keeperSlot ? { ...p, ...keeperAt(p, e) } : outOfCrease(p)));
    return { ...st, players };
  }

  /**
   * Where a keeper is at `e`: the average, over the last keeperTrackMs, of where they want to be (covering the ball
   * while play is live, their formation spot otherwise). Averaging gives the delay, caps their speed and blends
   * smoothly between the two, so nobody jumps.
   * @param {Placed} p  The keeper as the plan has them at `e` (used for any moment they weren't on the pitch).
   * @param {number} e
   * @returns {Point}
   */
  function keeperAt(p, e) {
    const want = (/** @type {number} */ t) => {
      const i = Math.max(0, t) / TRACK_GRID_MS;
      const i0 = Math.floor(i);
      const a = keeperGrid(i0).get(p.playerId) ?? p;
      const b = keeperGrid(i0 + 1).get(p.playerId) ?? p;
      return lerp(a, b, i - i0);
    };
    // The exact average of the piecewise-linear `want` over [e - keeperTrackMs, e].
    let x = 0;
    let y = 0;
    for (let t = e - keeperTrackMs; t < e;) {
      const next = Math.min(e, t < 0 ? 0 : (Math.floor(t / TRACK_GRID_MS) + 1) * TRACK_GRID_MS);
      const [a, b] = [want(t), want(next)];
      x += ((a.x + b.x) / 2) * (next - t);
      y += ((a.y + b.y) / 2) * (next - t);
      t = next;
    }
    return { x: x / keeperTrackMs, y: y / keeperTrackMs };
  }

  /** @type {Map<number, Map<string, Point>>} Where each keeper wants to be at each grid moment. */
  const keeperGrids = new Map();

  /** Where each keeper wants to be at grid moment `i` (i × TRACK_GRID_MS). @param {number} i */
  function keeperGrid(i) {
    let grid = keeperGrids.get(i);
    if (grid) return grid;
    grid = new Map();
    const g = i * TRACK_GRID_MS;
    const raw = steadyRaw(Math.max(1, timeline.countAt(g)), g);
    const now = timeline.stateAt(g);
    const live = PLAYING.has(now.phase) && !now.paused && !(now.last?.event.type === 'kickoff' && g < now.last.at + kickoffHoldMs);
    const ball = live ? trackPoint(raw, g) : null;
    for (const q of raw.players) {
      if (q.slot !== keeperSlot) continue;
      const goalX = (q.side === 'home') === (homeAttacksRight(now.phase) === 1) ? 0 : 1;
      grid.set(q.playerId, ball ? keeperSpot(goalX, ball) : { x: q.x, y: q.y });
    }
    keeperGrids.set(i, grid);
    return grid;
  }

  /**
   * Where the ball is, as far as keepers are concerned: at its holder's feet, or straight along a pass. Worked out from
   * the plan alone (not the passes' bends or the keepers' own tracking), so nothing depends on itself.
   * @param {ReturnType<typeof steadyRaw>} st @param {number} e
   * @returns {Point}
   */
  function trackPoint(st, e) {
    const at = (/** @type {string | Point | null} */ id) => (id && typeof id === 'object' ? id : posOf(st.players, id));
    const along = (/** @type {Point | null} */ a, /** @type {Point | null} */ b, /** @type {number} */ f) => (a && b ? lerp(a, b, ease(f)) : null);
    const pass = st.pass && e >= st.pass.start ? along(at(st.pass.from), at(st.pass.to), (e - st.pass.start) / (st.pass.end - st.pass.start)) : null;
    const passIn = st.passIn && e < st.passIn.end
      ? (e < st.passIn.start ? at(st.passIn.from) : along(at(st.passIn.from), at(st.carrierId), (e - st.passIn.start) / (st.passIn.end - st.passIn.start)))
      : null;
    return pass ?? passIn ?? at(st.carrierId) ?? { x: 0.5, y: 0.5 };
  }

  /**
   * steady() straight from the plan: keepers at their formation spots, nobody kept out of the creases.
   * @param {number} count @param {number} e
   */
  function steadyRaw(count, e) {
    const s = timeline.stateThrough(count);
    const plan = planOf(phaseAt(count, e));
    const players = plan.targets.map((t) => {
      const pos = /** @type {Point} */ (posIn(plan, t.playerId, e));
      const sway = swayOf(matchId, t.playerId, e);
      // A sub still running on from the bench is off the pitch: no clamping until they're on it.
      const off = pos.y < 0.05 || pos.y > 0.95;
      return { ...t, x: clamp(pos.x + sway.x, 0.02), y: off ? pos.y : clamp(pos.y + sway.y, 0.05) };
    });
    const la = plan.la;
    const passIn = plan.passIn;
    const teamId = plan.teamId;
    const loose = plan.loose ?? null;
    if (!la) return { s, players, carrierId: plan.carrierId, pass: null, passIn, teamId, loose };
    // The pass is timed from the last event that moved anyone; passive ones in between don't restart it.
    let start = count;
    while (start > 1 && PASSIVE.has(ev[start - 1].event.type)) start--;
    // ... and after any pass that opened the phase has arrived.
    const from = Math.max(plan.at, start > 0 ? ev[start - 1].at : 0, passIn?.end ?? 0);
    // A pass to whoever makes the next action, arriving as it happens (or before the shot leaves their foot).
    const end = la.shot ? la.at - shotMs : la.at;
    const pass = plan.nextCarrierId && plan.nextCarrierId !== plan.carrierId
      ? { from: plan.carrierId, to: plan.nextCarrierId, start: Math.max(from, end - passTime(plan.byId.get(plan.carrierId ?? ''), plan.byId.get(plan.nextCarrierId))), end: Math.max(from + 1, end) }
      : null;
    return { s, players, carrierId: plan.carrierId, pass, passIn, teamId, loose };
  }

  /**
   * Where a shot goes: into the net, wide, or into the keeper or blocker (where they stand as the shot is struck).
   * @param {number} first  Index of the first event of the shot's moment.
   */
  function shotPlan(first) {
    const beatAt = ev[first].at;
    const beat = [];
    for (let i = first; i < ev.length && ev[i].at === beatAt; i++) beat.push(ev[i].event);
    const shot = /** @type {Readonly<import('../chronicle/eventLog.js').LeagueEvent>} */ (beat.find((b) => b.type === 'shot'));
    const outcome = beat.find((b) => b.type === 'goal' || b.type === 'miss' || b.type === 'save' || b.type === 'block') ?? null;
    const phase = timeline.stateThrough(first).phase;
    const shotDir = dirOf(shot.teamId, phase);
    const goalX = shotDir === 1 ? 1 : 0;
    const rng = createRng(`${matchId}|shot|${shot.seq}`);
    const struck = beatAt - shotMs;
    // A free shot is struck from the mark (Task 143).
    const origin = /** @type {any} */ (shot.data)?.freeShot ? freeShotMark(goalX) : steadyBall(steady(first, struck), struck);
    /** @type {Point} */
    let impact;
    if (outcome?.type === 'goal') impact = { x: goalX + shotDir * NET_DEPTH, y: 0.5 + rng.float(-0.8, 0.8) * MOUTH_HALF };
    else if (outcome?.type === 'miss') impact = { x: goalX, y: 0.5 + missOffset(rng) };
    else impact = posOf(steady(first, struck).players, outcome?.playerId ?? null) ?? { x: goalX, y: 0.5 }; // keeper or blocker
    const goal = outcome?.type === 'goal';
    return {
      origin, impact, goalX, goal,
      hold: goal ? goalHoldMs : outcome?.type === 'miss' ? passMs : 0,
      scorcher: Boolean(/** @type {any} */ (outcome?.data)?.scorcher),
      bend: shotBendOf(origin, impact, `${matchId}|shotbend|${shot.seq}`, animation.shotBend),
    };
  }

  /** @param {Placed[]} players @param {string | null} id */
  const posOf = (players, id) => players.find((p) => p.playerId === id) ?? null;

  /** Whether the moment starting at event `first` includes an event of `type`. @param {number} first @param {string} type */
  const beatHas = (first, type) => {
    for (let i = first; i < ev.length && ev[i].at === ev[first].at; i++) if (ev[i].event.type === type) return true;
    return false;
  };

  /**
   * The ball between events: at the holder's feet, or on its way to the next holder in a look-ahead pass.
   * @param {ReturnType<typeof steady>} st @param {number} e
   * @returns {Point & { held: boolean, dir: 1 | -1 }}
   */
  function steadyBall(st, e) {
    const dir = dirOf(st.teamId, st.s.phase);
    const holder = posOf(st.players, st.carrierId);
    if (st.pass && e >= st.pass.start && st.pass.to) {
      const b = passBall(st.pass.from ?? '', st.pass.to, st.pass.start, st.pass.end, st.players, e);
      if (b) return { ...b, held: false, dir };
    }
    // A pass within the spell, to this phase's holder; until it sets off, the passer has the ball.
    if (st.passIn && e < st.passIn.start && typeof st.passIn.from === 'string') {
      const passer = posOf(st.players, st.passIn.from);
      if (passer) return { x: passer.x, y: passer.y, held: true, dir };
    }
    if (st.passIn && e < st.passIn.end && st.carrierId) {
      const b = passBall(st.passIn.from, st.carrierId, st.passIn.start, st.passIn.end, st.players, e);
      if (b) return { ...b, held: false, dir };
    }
    return holder ? { x: holder.x, y: holder.y, held: true, dir } : { x: 0.5, y: 0.5, held: false, dir };
  }

  /**
   * Who has the ball at `e`: the phase's holder, or the passer while a pass to them hasn't set off yet (a keeper's
   * outlet, Task 88).
   * @param {{ carrierId: string | null, passIn: Plan['passIn'] }} st @param {number} e
   */
  const heldBy = (st, e) => (st.passIn && e < st.passIn.start && typeof st.passIn.from === 'string' ? st.passIn.from : st.carrierId);

  /** Everyone's positions at elapsed `e`. @param {number} e */
  const playersAt = (e) => steady(Math.max(1, timeline.countAt(e)), e).players;

  /** @typedef {{ nx: number, ny: number, bend: number, lift: number, kick?: boolean }} PassPath  A bend along (nx, ny), a chip, or a keeper's big kick. */
  /** @type {Map<string, PassPath>} */
  const passPaths = new Map();
  /** Keepers' outlets (Task 88), by `${keeper}|${start}`: along the turf, never a big kick. @type {Set<string>} */
  const noKick = new Set();

  /**
   * The ball on a pass from `from` (a player, or a fixed point such as the board after a miss) to player `to`, between
   * `start` and `end`: straight if that's clear of everyone else, else bent round whoever is in the way, else chipped.
   * @param {string | Point} from @param {string} to @param {number} start @param {number} end
   * @param {Placed[]} players  Everyone at `e`. @param {number} e
   * @returns {(Point & { lift?: number, spin: number, curling?: boolean }) | null}  Null if the passer or receiver
   *   isn't on the pitch.
   */
  function passBall(from, to, start, end, players, e) {
    const a = typeof from === 'string' ? posOf(players, from) : from;
    const b = posOf(players, to);
    if (!a || !b) return null;
    const key = `${typeof from === 'string' ? from : `${from.x},${from.y}`}|${to}|${start}|${end}`;
    let path = passPaths.get(key);
    if (!path) passPaths.set(key, (path = choosePath(from, to, start, end)));
    const t = (e - start) / (end - start);
    const p = onPath(path, a, b, t);
    if (path.bend) {
      // A bulge to the travel's right (positive bend) turns the ball anticlockwise as it comes back round.
      return { ...p, spin: -Math.sign(path.bend) * (SPIN.curl + SPIN.curlPerBend * Math.abs(path.bend)), curling: true };
    }
    if (!path.lift) return { ...p, spin: rolling(a, b, SPIN.roll) };
    const f = Math.min(1, Math.max(0, t));
    return { ...p, lift: path.lift * (path.kick ? kickArc(f) : 4 * f * (1 - f)), spin: rolling(a, b, SPIN.chip) };
  }

  /**
   * Choose a pass's path by checking the ball against where everyone will be during it (motion is a function of the
   * moment, so the animation can look ahead within the pass). The smallest bend that keeps PASS_CLEAR from everyone but
   * the passer and receiver wins; if none does, the pass is chipped over them.
   * @param {string | Point} from @param {string} to @param {number} start @param {number} end
   * @returns {PassPath}
   */
  function choosePath(from, to, start, end) {
    const at = (/** @type {Placed[]} */ ps, /** @type {string | Point} */ ref) => (typeof ref === 'string' ? posOf(ps, ref) : ref);
    const frames = [];
    for (let i = 0; i <= PASS_SAMPLES; i++) frames.push(playersAt(Math.min(end - 1, start + ((end - start) * i) / PASS_SAMPLES)));
    const a0 = at(frames[0], from);
    const b1 = at(frames[PASS_SAMPLES], to);
    if (!a0 || !b1) return { nx: 0, ny: 0, bend: 0, lift: 0 };
    const dx = b1.x - a0.x;
    const dy = (b1.y - a0.y) / 2;
    const len = Math.hypot(dx, dy);
    // The sideways direction in pitch lengths, as pitch fractions (the pitch is half as wide as it is long).
    const straight = { nx: len > 1e-9 ? -dy / len : 0, ny: len > 1e-9 ? (2 * dx) / len : 0, bend: 0, lift: 0 };
    // A keeper's long ball goes up high, over everyone (Task 240).
    const keeperKick = bigKick && len >= bigKickMin && frames[0].find((q) => q.playerId === from)?.slot === keeperSlot && !noKick.has(`${from}|${start}`);
    if (typeof from === 'string' && keeperKick) {
      return { ...straight, lift: Math.min(BIG_KICK_PEAK, BIG_KICK_SHARE * len), kick: true };
    }
    /** The closest the ball comes to anyone else on a path, or -Infinity if it would leave the pitch. @param {PassPath} path */
    const clearance = (path) => {
      let worst = Infinity;
      for (let j = 0; j <= PASS_STEPS; j++) {
        const t = j / PASS_STEPS;
        const i = Math.min(PASS_SAMPLES - 1, Math.floor(t * PASS_SAMPLES));
        const k = t * PASS_SAMPLES - i;
        const mix = (/** @type {Point} */ p, /** @type {Point} */ q) => lerp(p, q, k);
        const [f0, f1] = [frames[i], frames[i + 1]];
        const a = at(f0, from);
        const a1 = at(f1, from);
        const b = posOf(f0, to);
        const bb = posOf(f1, to);
        if (!a || !a1 || !b || !bb) continue;
        const pa = mix(a, a1);
        const pb = mix(b, bb);
        const ball = onPath(path, pa, pb, t);
        if (path.bend && (ball.x < 0.02 || ball.x > 0.98 || ball.y < 0.04 || ball.y > 0.96)) return -Infinity;
        if (dist(ball, pa) < PASS_ENDS || dist(ball, pb) < PASS_ENDS) continue;
        for (const p of f0) {
          if (p.playerId === from || p.playerId === to) continue;
          const q = posOf(f1, p.playerId) ?? p;
          worst = Math.min(worst, dist(ball, mix(p, q)));
        }
      }
      return worst;
    };
    const need = PASS_CLEAR + PASS_MARGIN;
    if (clearance(straight) >= need) return straight;
    for (const size of BENDS) {
      if (size > BEND_MAX * len) break;
      const sides = [size, -size].map((bend) => ({ path: { ...straight, bend }, clear: clearance({ ...straight, bend }) }));
      const best = sides[0].clear >= sides[1].clear ? sides[0] : sides[1];
      if (best.clear >= need) return best.path;
    }
    return { ...straight, lift: Math.min(CHIP_PEAK, CHIP_SHARE * len) };
  }

  /** @type {Map<number, Point>} Where the ball was just before each moment. */
  const ballsBefore = new Map();

  /** The ball just before the moment that starts at event `first`. @param {number} first */
  function ballBefore(first) {
    let b = ballsBefore.get(first);
    if (!b) {
      const pose = at(ev[first].at - 1);
      b = pose?.ball ? { x: pose.ball.x, y: pose.ball.y } : { x: 0.5, y: 0.5 };
      ballsBefore.set(first, b);
    }
    return b;
  }

  /**
   * @param {number} e  Elapsed ms since kick-off.
   * @returns {Pose | null}  Null before kick-off.
   */
  function at(e) {
    const pose = poseAt(e);
    // The ball never leaves the pitch on the ground: if it's going to someone still coming on from the bench (a
    // keeper substituted at a restart), it waits at the touchline. Shots in flight are left alone.
    if (pose?.ball && !pose.effects.flight && (pose.ball.y < 0.02 || pose.ball.y > 0.98)) {
      return { ...pose, ball: { ...pose.ball, y: Math.min(0.98, Math.max(0.02, pose.ball.y)) } };
    }
    return pose;
  }

  /** The pose at elapsed `e`, before keeping the ball on the pitch. @param {number} e @returns {Pose | null} */
  function poseAt(e) {
    if (e < 0) return null;
    const now = timeline.stateAt(e);
    const noEffects = { burn: null, goal: null, flight: false, scorcher: false };
    if (now.phase === 'shootout' || now.phase === 'shootout_break') return shootout(e);

    const count = timeline.countAt(e);
    if (count === 0) return null;
    const st = steady(count, e);
    if (!PLAYING.has(now.phase)) return { players: st.players, ball: null, heat: 0, effects: noEffects };

    const players = st.players;
    let ball = steadyBall(st, e);
    // A held ball stays at its carrier's feet, wherever their run has got to.
    const carrier = ball.held ? posOf(players, heldBy(st, e)) : null;
    // Never off the pitch: if the holder is a sub still running on from the bench (the player who won the ball was
    // subbed off at that moment), the ball waits at the touchline until they reach it.
    if (carrier) ball = { ...ball, x: carrier.x, y: Math.min(0.98, Math.max(0.02, carrier.y)) };
    // A sub still running on to their spot (Task 153, Tom: a keeper brought on at a restart carried the ball over
    // from the bench): the ball waits for them there instead.
    const waitAt = ball.held ? arrivingSpot(count, heldBy(st, e), e, players) : null;
    if (waitAt) ball = { ...waitAt, held: false, dir: ball.dir, placed: true };
    const heat = now.heat;
    /** @type {Pose['effects']} */
    const effects = noEffects;

    // A shot in flight: it leaves the shooter's foot shotMs before its moment and lands exactly then.
    if (count < ev.length && e >= ev[count].at - shotMs && beatHas(count, 'shot')) {
      const plan = shotPlan(count);
      const f = (e - (ev[count].at - shotMs)) / shotMs;
      // A bending shot (Tom) bows sideways and comes back to where it lands, spinning the way it curls.
      const at = bentAt(plan.bend, plan.origin, plan.impact, f);
      const spin = plan.bend.bend ? -Math.sign(plan.bend.bend) * SPIN.shot : rolling(plan.origin, plan.impact, SPIN.shot);
      return { players, ball: { ...at, held: false, dir: ball.dir, spin }, heat, effects: { ...noEffects, flight: true, scorcher: plan.scorcher || heat >= 80 } };
    }

    // A free shot's pause (Task 143): the ball where the foul was, then in the referee's hands to the mark, then on it.
    const staged = freeShotBall(e);
    if (staged) return { players, ball: staged, heat, effects };
    // Any other foul's pause (Task 144): the ball lies where the foul was, set there by the referee.
    const fouled = foulAt(e);
    if (fouled) return { players, ball: { ...fouled.spot, held: false, dir: fouled.dir, placed: true }, heat, effects };

    // The latest moment's ball script.
    const first = beatStart[count - 1];
    const beatAt = ev[count - 1].at;
    const since = e - beatAt;
    const types = new Set(ev.slice(first, count).map((t) => t.event.type));
    // A loose ball (Task 82): it runs out from where it broke loose, slowing, to meet the player who wins the race.
    if (st.loose && since >= 0 && since < st.loose.ms) {
      const f = since / st.loose.ms;
      const at = lerp(st.loose.from, st.loose.to, 1 - (1 - f) * (1 - f));
      return { players, ball: { ...at, held: false, dir: ball.dir, spin: rolling(st.loose.from, st.loose.to, SPIN.roll) * (1 - f), loose: true }, heat, effects };
    }
    // A golden goal (Task 147): the ball stays in the net; there's no restart.
    if (beatAt === goldenAt && types.has('goal')) {
      const plan = shotPlan(first);
      const goal = since < goalHoldMs ? { x: plan.goalX, y: plan.impact.y, f: since / goalHoldMs, scorcher: plan.scorcher } : null;
      return { players, ball: { ...plan.impact, held: false, dir: ball.dir }, heat, effects: { ...effects, goal } };
    }
    const scriptMs = types.has('shot') ? goalHoldMs + passMs : burnFlashMs + passMs;
    if (types.has('kickoff') || first === 0 || since >= scriptMs) return { players, ball, heat, effects };

    const fromBall = ballBefore(first);
    const holder = { x: ball.x, y: ball.y };
    const dir = ball.dir;

    if (types.has('shot')) {
      // After the shot lands: a rest in the net (goal) or by the board (miss), then the ball to its new holder.
      const plan = shotPlan(first);
      if (since < plan.hold) ball = { ...plan.impact, held: false, dir };
      else if (since < plan.hold + passMs) {
        const start = beatAt + plan.hold;
        // To the holder (the keeper, if their outlet pass hasn't set off yet).
        const to = heldBy(st, e);
        // (Not to a sub still running on: the ball goes to where they're heading, Task 153.)
        const moved = to && !arrivingSpot(count, to, e, players) ? passBall(plan.impact, to, start, start + passMs, players, e) : null;
        ball = { ...(moved ?? { ...lerp(plan.impact, holder, ease((since - plan.hold) / passMs)), spin: rolling(plan.impact, holder, SPIN.roll) }), held: false, dir };
      }
      const goal = plan.goal && since < goalHoldMs ? { x: plan.goalX, y: plan.impact.y, f: since / goalHoldMs, scorcher: plan.scorcher } : null;
      return { players, ball, heat, effects: { ...noEffects, goal } };
    }

    if (types.has('burn')) {
      if (since < burnFlashMs) {
        return { players, ball: { ...fromBall, held: false }, heat: 100, effects: { ...noEffects, burn: { x: fromBall.x, y: fromBall.y, f: since / burnFlashMs } } };
      }
      if (since < burnFlashMs + passMs) ball = { ...lerp(fromBall, holder, ease((since - burnFlashMs) / passMs)), held: false, dir, spin: rolling(fromBall, holder, SPIN.roll) };
      return { players, ball, heat, effects };
    }

    if (types.has('possession_change') && since < passMs) {
      ball = { ...lerp(fromBall, holder, ease(since / passMs)), held: false, dir, spin: rolling(fromBall, holder, SPIN.roll) };
    }
    return { players, ball, heat, effects };
  }

  /**
   * Where a sub still running on from the bench is heading (Task 153), or null: the player brought on in the
   * substitution whose pause is on, while they're more than ARRIVED from their spot.
   * @param {number} count @param {string | null} id @param {number} e @param {Placed[]} players  As drawn (a keeper lags their plan).
   * @returns {Point | null}
   */
  function arrivingSpot(count, id, e, players) {
    if (!id || count === 0) return null;
    const q = timeline.pauses.find((p) => p.kind === 'substitution' && e >= p.at && e < p.at + p.ms);
    if (!q || !ev.some((t) => t.at === q.at && t.event.type === 'substitution' && t.event.playerId === id)) return null;
    const plan = planOf(phaseAt(count, e));
    const to = plan.byId.get(id);
    const now = posOf(players, id);
    return to && now && dist(now, to) > ARRIVED ? { x: to.x, y: to.y } : null;
  }

  /** @type {Map<number, { foul: Point, mark: Point, dir: 1 | -1, stage: ReturnType<typeof freeShotStaging> } | null>} Each free shot's pause, by its start. */
  const freeShots = new Map();

  /**
   * The free shot whose pause is on at `e`, if any (Task 143): where the foul was, the mark, the way the taker attacks,
   * and the staging's moments.
   * @param {number} e
   */
  function freeShotAt(e) {
    const q = timeline.pauses.find((p) => p.kind === 'free_shot' && e >= p.at && e < p.at + p.ms);
    if (!q) return null;
    if (!freeShots.has(q.at)) {
      const i = ev.findIndex((t) => t.at === q.at);
      const fs = ev.find((t) => t.at === q.at + q.ms && t.event.type === 'free_shot');
      if (i < 0 || !fs) freeShots.set(q.at, null);
      else {
        const dir = dirOf(fs.event.teamId, timeline.stateAt(q.at).phase);
        freeShots.set(q.at, { foul: ballBefore(beatStart[i]), mark: freeShotMark(dir === 1 ? 1 : 0), dir, stage: freeShotStaging(q.ms, shotMs) });
      }
    }
    const f = freeShots.get(q.at);
    return f ? { ...f, since: e - q.at } : null;
  }

  /**
   * The foul whose pause (not a free shot's) is on at `e`, if any (Task 144): where the ball lies, the way the fouled
   * team attacks, how far into the pause, and how long it is.
   * @param {number} e
   * @returns {{ spot: Point, dir: 1 | -1, since: number, ms: number } | null}
   */
  function foulAt(e) {
    const q = timeline.pauses.find((p) => p.kind === 'foul' && e >= p.at && e < p.at + p.ms);
    if (!q) return null;
    const i = ev.findIndex((t) => t.at === q.at);
    if (i < 0) return null;
    const s = timeline.stateThrough(beats[beatOf[i]].end);
    if (!foulSpots.has(q.at)) planOf(phaseAt(timeline.countAt(q.at), q.at));
    const spot = foulSpots.get(q.at);
    return spot ? { spot, dir: dirOf(s.possession, s.phase), since: e - q.at, ms: q.ms } : null;
  }

  /**
   * The ball in a free shot's pause (Task 143): where the foul was until the referee picks it up, carried in their
   * hands to the mark (a little off the turf), then on the mark until it's struck. Null outside a free shot's pause.
   * @param {number} e
   * @returns {Pose['ball']}
   */
  function freeShotBall(e) {
    const f = freeShotAt(e);
    if (!f) return null;
    const { stage: st, since } = f;
    if (since < st.pickUp) return { ...f.foul, held: false, dir: f.dir, placed: true };
    if (since < st.placed) return { ...lerp(f.foul, f.mark, ease((since - st.pickUp) / (st.placed - st.pickUp))), held: false, dir: f.dir, lift: 0.012, placed: true };
    return { ...f.mark, held: false, dir: f.dir, placed: true };
  }

  /**
   * @typedef {(e: number) => Point} At  A position that may move on its own (a waiting player milling about).
   * @typedef {{ t: number, at: At }} Frame  Where a player is at `t`; between frames they walk, eased.
   * @typedef {object} ShootoutKick
   * @property {number} A  When it lands (its moment). @property {number} S  When it's struck. @property {number} set  When
   *   the taker and the keeper are in place. @property {number} end  When the ball's been in the net or the keeper's
   *   hands long enough. @property {'home' | 'away'} side  The taker's. @property {boolean} scored
   * @property {string} takerId @property {string | null} keeperId  The defending keeper. @property {Point} spot  Where the
   *   taker stands before the run-up. @property {Point} impact  Where the ball ends up. @property {number} diveY  Where the
   *   keeper dives to.
   */
  /** @type {{ kicks: ShootoutKick[], frames: Map<string, Frame[]>, sideOf: Map<string, 'home' | 'away'>, winner: 'home' | 'away' } | null} */
  let soPlan = null;
  /**
   * The shootout staged (Task 277b), worked out once: every kick's times, where its taker stands and the ball ends up, and
   * each player's frames: from their own spot (outfield players near the centre circle, keepers by the box) to just
   * behind the mark and the run-up when they take one, into goal when they keep, and back.
   */
  function shootoutPlan() {
    if (soPlan) return soPlan;
    const S = /** @type {NonNullable<typeof SO>} */ (SO);
    const kickEvents = ev.filter((t) => t.event.type === 'shootout_kick');
    const onPitch = timeline.stateAt(kickEvents[0].at).onPitch;
    const mark = { x: SHOOTOUT_MARK, y: 0.5 };
    const goal = { x: 0.975, y: 0.5 };
    const strikeAt = { x: mark.x - 0.015, y: 0.5 };
    /** @type {Map<string, 'home' | 'away'>} */
    const sideOf = new Map();
    /** @type {Map<string, At>} */
    const rest = new Map();
    for (const side of /** @type {const} */ (['home', 'away'])) {
      let i = 0;
      for (const p of onPitch[side]) {
        sideOf.set(p.playerId, side);
        const r = createRng(`${matchId}|shootout|mill|${p.playerId}`);
        const [a, b, pa, pb] = [r.float(1600, 2400), r.float(2200, 3200), r.float(0, 6.3), r.float(0, 6.3)];
        const home = p.slot === keeperSlot ? { x: 0.88, y: side === 'home' ? 0.18 : 0.82 } : { x: 0.47 + i++ * 0.045, y: side === 'home' ? 0.32 : 0.68 };
        rest.set(p.playerId, (e) => ({ x: home.x + (S.mill / 2) * Math.sin(e / a + pa), y: home.y + S.mill * Math.sin(e / b + pb) }));
      }
    }
    const keeperOf = (/** @type {'home' | 'away'} */ side) => onPitch[side].find((p) => p.slot === keeperSlot)?.playerId ?? null;
    /** @type {ShootoutKick[]} */
    const kicks = kickEvents.map((t) => {
      const rng = createRng(`${matchId}|shootout|${t.event.seq}`);
      const side = t.event.teamId === homeId ? 'home' : 'away';
      const scored = Boolean(/** @type {any} */ (t.event.data).scored);
      const way = rng.chance(0.5) ? 1 : -1;
      const struck = t.at - shotMs;
      /** @type {Point} */
      let impact;
      let diveY;
      if (scored) {
        impact = { x: 1 + NET_DEPTH, y: 0.5 + way * rng.float(0.3, 0.85) * MOUTH_HALF };
        // The keeper guesses: the right way but not far enough, or the wrong way.
        diveY = 0.5 + (rng.chance(0.5) ? way : -way) * rng.float(0.04, 0.07);
      } else if (rng.chance(0.6)) {
        diveY = 0.5 + way * rng.float(0.03, 0.07);
        impact = { x: goal.x, y: diveY };
      } else {
        impact = { x: 1, y: 0.5 + way * rng.float(MISS_Y.min, MISS_Y.max) };
        diveY = 0.5 + way * rng.float(0.04, 0.07);
      }
      return {
        A: t.at, S: struck, set: struck - S.runUpMs - S.standMs, end: t.at + goalHoldMs, side, scored,
        takerId: /** @type {string} */ (t.event.playerId), keeperId: keeperOf(side === 'home' ? 'away' : 'home'),
        spot: { x: mark.x - 0.06, y: 0.5 + rng.float(-0.04, 0.04) }, impact, diveY,
      };
    });
    const last = /** @type {any} */ (kickEvents.at(-1)?.event.data).shootout;
    const winner = last[0] > last[1] ? 'home' : 'away';

    const walkMs = (/** @type {Point} */ a, /** @type {Point} */ b) => (Math.hypot(b.x - a.x, (b.y - a.y) / 2) * 1000) / S.walkSpeed;
    const fixed = (/** @type {Point} */ p) => () => p;
    /** @type {Map<string, Frame[]>} */
    const frames = new Map();
    for (const [id, home] of rest) {
      // Their jobs in order: a kick to take, a kick to keep goal for.
      /** @type {{ arrive: number, to: Point, inner: Frame[], leave: number, from: At }[]} */
      const jobs = [];
      for (const k of kicks) {
        if (k.takerId === id) {
          jobs.push({ arrive: k.set, to: k.spot, inner: [{ t: k.S - S.runUpMs, at: fixed(k.spot) }, { t: k.S, at: fixed(strikeAt) }], leave: k.end + (k.scored ? S.celebrateMs : 0), from: fixed(strikeAt) });
        } else if (k.keeperId === id) {
          // In goal: bouncing on the line until the dive (moved at the strike, eased to where they dive by the landing).
          const dived = { x: goal.x, y: k.diveY };
          const bouncing = (/** @type {number} */ e) => ({ x: goal.x, y: goal.y + S.bounce * Math.sin(((e - k.set) / S.bounceMs) * Math.PI * 2) });
          jobs.push({ arrive: k.set, to: goal, inner: [{ t: k.S, at: bouncing }, { t: k.A, at: fixed(dived) }], leave: k.end, from: fixed(dived) });
        }
      }
      /** @type {Frame[]} */
      const list = [{ t: -Infinity, at: home }];
      let cur = { t: -Infinity, at: home, resting: true };
      for (const job of jobs) {
        if (!cur.resting) {
          // Back to their spot first if there's time, else straight on.
          const back = cur.t + walkMs(cur.at(cur.t), home(cur.t));
          if (back + walkMs(home(back), job.to) < job.arrive) {
            list.push({ t: back, at: home });
            cur = { t: back, at: home, resting: true };
          }
        }
        // Where they set off from (a waiting player's spot, milling about, as the job comes).
        const from = cur.at(cur.resting ? job.arrive : cur.t);
        const depart = Math.max(cur.t, job.arrive - walkMs(from, job.to));
        // Never out of order (a taker or keeper running late hurries).
        let t = depart;
        for (const f of [{ t: depart, at: cur.at }, { t: job.arrive, at: fixed(job.to) }, ...job.inner, { t: job.leave, at: job.from }]) list.push({ t: (t = Math.max(t, f.t)), at: f.at });
        cur = { t: job.leave, at: job.from, resting: false };
      }
      if (!cur.resting && Number.isFinite(cur.t)) list.push({ t: cur.t + walkMs(cur.at(cur.t), home(cur.t)), at: home });
      frames.set(id, list);
    }
    soPlan = { kicks, frames, sideOf, winner };
    return soPlan;
  }

  /**
   * The shootout staged (Task 277b; settings.animation.shootout.lively): the players moving between their spots as above,
   * a kick struck shotMs before its moment, the ball back to the mark between kicks, arms up for a goal and at the end.
   * @param {number} e @returns {Pose}
   */
  function shootout(e) {
    const S = /** @type {NonNullable<typeof SO>} */ (SO);
    const plan = shootoutPlan();
    const mark = { x: SHOOTOUT_MARK, y: 0.5 };
    const lastKick = /** @type {ShootoutKick} */ (plan.kicks.at(-1));
    const over = e >= lastKick.A;
    /** @type {Placed[]} */
    const players = [];
    const onPitch = timeline.stateAt(e).onPitch;
    for (const side of /** @type {const} */ (['home', 'away'])) {
      for (const p of onPitch[side]) {
        const list = plan.frames.get(p.playerId);
        if (!list) continue;
        let i = list.length - 1;
        while (i > 0 && list[i].t > e) i--;
        const a = list[i];
        const b = list[i + 1];
        const pa = a.at(e);
        let pos = pa;
        if (b && b.at !== a.at && b.t > a.t) {
          const f = (e - a.t) / (b.t - a.t);
          pos = lerp(pa, b.at(e), f * f * (3 - 2 * f));
        }
        /** @type {Placed & { arms?: 'both' | 'head' }} */
        const placed = { ...p, side, ...pos };
        // Arms up: the side that's just scored, for a while; at the end the winners cheer and the losers hold their heads.
        const cheering = over ? side === plan.winner : plan.kicks.some((k) => k.scored && k.side === side && e >= k.A && e < k.A + S.celebrateMs);
        const keeping = plan.kicks.some((k) => k.keeperId === p.playerId && e >= k.set && e < k.end);
        if (cheering && !keeping) {
          placed.arms = 'both';
          placed.y -= 0.012 * Math.abs(Math.sin((e + p.playerId.length * 97) / 160));
        } else if (over && !keeping) placed.arms = 'head';
        players.push(placed);
      }
    }
    const noEffects = { burn: null, goal: null, flight: false, scorcher: false };
    // The ball: on the mark, struck, at rest where it ended, then rolled back to the mark for the next kick.
    const k = plan.kicks.findLast((x) => x.S <= e);
    if (!k) return { players, ball: { ...mark, held: false, dir: 1 }, heat: SHOOTOUT_HEAT, effects: noEffects };
    if (e < k.A) return { players, ball: { ...lerp(mark, k.impact, (e - k.S) / shotMs), held: false, dir: 1, spin: SPIN.shot }, heat: SHOOTOUT_HEAT, effects: { ...noEffects, flight: true, scorcher: true } };
    const effects = k.scored && e < k.A + goalHoldMs ? { ...noEffects, goal: { x: 1, y: k.impact.y, f: (e - k.A) / goalHoldMs, scorcher: true } } : noEffects;
    const back = k === lastKick ? 0 : Math.min(1, Math.max(0, (e - k.end) / S.returnMs));
    return { players, ball: { ...lerp(k.impact, mark, back), held: false, dir: 1 }, heat: SHOOTOUT_HEAT, effects };
  }

  /**
   * What a player is doing beyond running at elapsed `e` (Task 120; visual only, read from the plan the picture already
   * follows): a kick as a pass sets off (within `kickMs`) or a shot is struck (within `shotKickMs`), and a keeper's dive
   * at a shot that's saved or scored, from `diveLeadMs` before it lands to `diveMs + kneeMs` after. With `saves` (Tom,
   * 2026-10-20: not the dive every time), the keeper's move is seeded by the shot: a held save a standing catch
   * (`saves.catch` of them) or a dive, a parried one a standing parry (`saves.parry`) or a dive, a goal a dive or
   * beaten barely moving (`saves.beaten`: no move at all, the run's own pose); `style` says which. A standing save lasts
   * as the leap does, with no knee after it.
   * @param {number} e
   * @param {{ kickMs: number, shotKickMs: number, diveLeadMs: number, diveMs: number, kneeMs: number, saves?: { catch: number, parry: number, beaten: number } }} o
   * @returns {{ kick: { playerId: string, dir: 1 | -1, shot: boolean, since: number } | null,
   *   dive: { playerId: string, dirY: 1 | -1, since: number, landAt: number, style: 'dive' | 'catch' | 'parry' } | null }}
   */
  function actionAt(e, { kickMs, shotKickMs, diveLeadMs, diveMs, kneeMs, saves }) {
    const none = { kick: null, dive: null };
    // The shootout staged (Task 277b): the taker's strike and the keeper's dive.
    if (timeline.stateAt(e).phase === 'shootout') {
      const plan = shootoutPlan();
      const struck = plan.kicks.find((k) => e >= k.S && e < k.S + shotKickMs);
      const dived = plan.kicks.find((k) => k.keeperId && e >= k.A - diveLeadMs && e < k.A + diveMs + kneeMs);
      return {
        kick: struck ? { playerId: struck.takerId, dir: 1, shot: true, since: e - struck.S } : null,
        dive: dived ? { playerId: /** @type {string} */ (dived.keeperId), dirY: dived.diveY >= 0.5 ? 1 : -1, since: e - (dived.A - diveLeadMs), landAt: diveLeadMs + diveMs, style: /** @type {const} */ ('dive') } : null,
      };
    }
    const count = timeline.countAt(e);
    if (count === 0 || !PLAYING.has(timeline.stateAt(e).phase)) return none;
    /** @type {ReturnType<typeof actionAt>['kick']} */
    let kick = null;
    /** @type {ReturnType<typeof actionAt>['dive']} */
    let dive = null;
    // Shots: the moment in flight (the next one) or just landed (the last one).
    for (const first of [count < ev.length ? count : -1, beatStart[count - 1]]) {
      if (first < 0 || !beatHas(first, 'shot')) continue;
      const beatAt = ev[first].at;
      const struck = beatAt - shotMs;
      const beat = [];
      for (let i = first; i < ev.length && ev[i].at === beatAt; i++) beat.push(ev[i].event);
      const shot = beat.find((b) => b.type === 'shot');
      const outcome = beat.find((b) => b.type === 'goal' || b.type === 'save') ?? null;
      if (!shot?.playerId) continue;
      const shotDir = dirOf(shot.teamId, timeline.stateThrough(first).phase);
      if (!kick && e >= struck && e < struck + shotKickMs) kick = { playerId: shot.playerId, dir: shotDir, shot: true, since: e - struck };
      const from = beatAt - diveLeadMs;
      // The keeper's move, seeded by the shot (with `saves`).
      const r = createRng(`${matchId}|keeper|${shot.seq}`);
      const parried = Boolean(/** @type {any} */ (outcome?.data)?.parried);
      const style = !saves || !outcome ? 'dive' : outcome.type === 'goal' ? (r.chance(saves.beaten) ? null : 'dive')
        : r.chance(parried ? saves.parry : saves.catch) ? (parried ? 'parry' : 'catch') : 'dive';
      const until = beatAt + diveMs + (style === 'dive' ? kneeMs : 0);
      if (!dive && outcome && style && e >= from && e < until) {
        const players = steady(first, struck).players;
        // The save's keeper, or for a goal the defending side's.
        const keeper = outcome.type === 'save' ? posOf(players, outcome.playerId ?? null) : players.find((pl) => pl.slot === keeperSlot && pl.side !== (shot.teamId === homeId ? 'home' : 'away')) ?? null;
        if (keeper) {
          const plan = shotPlan(first);
          // A save's shot ends at the keeper, so its side is the seed's (with `saves`; always down before).
          const side = outcome.type === 'save' && saves ? (r.chance(0.5) ? 1 : -1) : plan.impact.y >= keeper.y ? 1 : -1;
          dive = { playerId: keeper.playerId, dirY: /** @type {1 | -1} */ (side), since: e - from, landAt: beatAt + diveMs - from, style };
        }
      }
    }
    // Passes: as one sets off from its passer.
    if (!kick) {
      const st = steady(count, e);
      for (const pass of [st.pass, st.passIn]) {
        if (!pass || typeof pass.from !== 'string' || e < pass.start || e >= pass.start + kickMs) continue;
        const a = posOf(st.players, pass.from);
        const b = typeof pass.to === 'string' ? posOf(st.players, pass.to) : posOf(st.players, st.carrierId);
        if (!a) continue;
        kick = { playerId: pass.from, dir: b && b.x < a.x ? -1 : 1, shot: false, since: e - pass.start };
        break;
      }
    }
    return { kick, dive };
  }

  /**
   * Who the picture has on the ball at `e` (Task 149: holding it, for the commentary), or null while it travels.
   * @param {number} e
   */
  const holderAt = (e) => {
    const count = timeline.countAt(e);
    if (count === 0 || !at(e)?.ball?.held) return null;
    return heldBy(steady(count, e), e);
  };

  return { at, actionAt, freeShotAt, foulAt, holderAt, shownCarrier, runAfter: (/** @type {number} */ count) => (count > 0 ? runAfter[count - 1] : null) };
}

/** @typedef {ReturnType<typeof createMotion>} Motion */

/** @param {Point} a @param {Point} b @param {number} f */
function lerp(a, b, f) {
  const t = Math.min(1, Math.max(0, f));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/**
 * A runner heading from `s` to `t`: at top speed `v` while far off, then slowing in over time constant `tau` as they
 * arrive (speed stays continuous). Distances are in pitch lengths (the pitch is twice as long as it is wide).
 * @param {Point} s @param {Point} t @param {number} dt  ms since they set off. @param {number} v  pitch lengths per ms.
 * @param {number} tau  ms.
 */
function approach(s, t, dt, v, tau) {
  if (dt <= 0) return s;
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const d0 = Math.hypot(dx, dy / 2);
  if (d0 < 1e-9) return { x: t.x, y: t.y };
  const cruise = v * tau; // within this distance they're slowing in
  let d;
  if (d0 > cruise) {
    const t1 = (d0 - cruise) / v;
    d = dt < t1 ? d0 - v * dt : cruise * Math.exp(-(dt - t1) / tau);
  } else d = d0 * Math.exp(-dt / tau);
  const k = 1 - d / d0;
  return { x: s.x + dx * k, y: s.y + dy * k };
}

/**
 * A shot's bend (Tom, 2026-10-16): for `share` of shots, from a stream of its own (the shot's stream sets where it lands),
 * a sideways bow either way of min to max pitch lengths at its widest, at most maxShare of the shot's length; none otherwise.
 * @param {Point} a @param {Point} b @param {string} seed
 * @param {{ share: number, min: number, max: number, maxShare: number }} [s]  animation.shotBend; no bends without it.
 * @returns {{ nx: number, ny: number, bend: number }}
 */
export function shotBendOf(a, b, seed, s) {
  const dx = b.x - a.x;
  const dy = (b.y - a.y) / 2;
  const len = Math.hypot(dx, dy);
  const rng = createRng(seed);
  if (!s || len < 1e-9 || !rng.chance(s.share)) return { nx: 0, ny: 0, bend: 0 };
  const size = Math.min(rng.float(s.min, s.max), s.maxShare * len);
  return { nx: -dy / len, ny: (2 * dx) / len, bend: rng.chance(0.5) ? size : -size };
}

/**
 * The ball `t` (0 → 1) of the way along a shot, at its own even pace, curling sideways by up to `path.bend`. It leaves
 * the foot straight and curls off later (Tom: not curving from the outset): the bow is t²(1 − t), flat at the start,
 * widest two thirds of the way, back in where it lands.
 * @param {{ nx: number, ny: number, bend: number }} path @param {Point} a @param {Point} b @param {number} t
 */
function bentAt(path, a, b, t) {
  const p = lerp(a, b, t);
  const arc = path.bend * (27 / 4) * t * t * (1 - t);
  return { x: p.x + path.nx * arc, y: p.y + path.ny * arc };
}

/**
 * The ball `t` (0 → 1) of the way along a pass from `a` to `b`, bulging sideways by `path.bend` at its middle.
 * @param {{ nx: number, ny: number, bend: number }} path @param {Point} a @param {Point} b @param {number} t
 */
function onPath(path, a, b, t) {
  const u = ease(t);
  const p = lerp(a, b, u);
  const arc = path.bend * 4 * u * (1 - u);
  return { x: p.x + path.nx * arc, y: p.y + path.ny * arc };
}

/**
 * How clear the straight lane from `a` to `b` is: the closest any of `others` comes to it, in pitch lengths, ignoring
 * the parts of the lane within PASS_ENDS of either end.
 * @param {Point} a @param {Point} b @param {Point[]} others
 */
function laneClear(a, b, others) {
  const dx = b.x - a.x;
  const dy = (b.y - a.y) / 2;
  const len2 = dx * dx + dy * dy;
  let worst = Infinity;
  for (const p of others) {
    const s = len2 > 1e-12 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + ((p.y - a.y) / 2) * dy) / len2)) : 0;
    const c = { x: a.x + dx * s, y: a.y + dy * 2 * s };
    if (dist(c, a) < PASS_ENDS || dist(c, b) < PASS_ENDS) continue;
    worst = Math.min(worst, dist(p, c));
  }
  return worst;
}

/**
 * The receiver of a pass steps sideways (up to the last of OPEN_SHIFTS) until the lane from the passer is open.
 * Keepers stay in their crease. Returns the players, with the receiver moved if that opens the lane.
 * @param {Placed[]} players @param {string} fromId @param {string} toId @param {string} keeperSlot
 */
function getOpen(players, fromId, toId, keeperSlot) {
  const from = players.find((p) => p.playerId === fromId);
  const to = players.find((p) => p.playerId === toId);
  if (!from || !to || to.slot === keeperSlot) return players;
  const others = players.filter((p) => p !== from && p !== to);
  const need = PASS_CLEAR + PASS_MARGIN;
  if (laneClear(from, to, others) >= need) return players;
  const dx = to.x - from.x;
  const dy = (to.y - from.y) / 2;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return players;
  for (const size of OPEN_SHIFTS) {
    const spots = [size, -size]
      .map((s) => ({ x: to.x + (-dy / len) * s, y: to.y + ((2 * dx) / len) * s }))
      .filter((q) => q.x > 0.04 && q.x < 0.96 && q.y > 0.08 && q.y < 0.92)
      .map((q) => ({ q, clear: laneClear(from, q, others) }))
      .sort((m, n) => n.clear - m.clear);
    if (spots[0]?.clear >= need) return players.map((p) => (p === to ? { ...p, ...spots[0].q } : p));
  }
  return players;
}

/**
 * A spot moved into the free-shot box in front of the goal a team attacks (Task 143): one further out than its depth
 * comes in to `depth` (the box's depth by default), one nearer than its near edge goes out to it; inside it across.
 * @param {Point} p @param {1 | -1} dir  The way the team attacks. @param {number} [depth]
 * @returns {Point}
 */
export function intoBox(p, dir, depth = FREE_SHOT_BOX.depth) {
  const goalX = dir === 1 ? 1 : 0;
  const away = Math.abs(goalX - p.x);
  const out = away > FREE_SHOT_BOX.depth ? depth : Math.max(FREE_SHOT_BOX.near, away);
  return { x: goalX - dir * out, y: Math.min(1 - FREE_SHOT_BOX.top, Math.max(FREE_SHOT_BOX.top, p.y)) };
}

/**
 * A spot moved out of the free-shot box in front of the goal a team attacks (Task 144: other fouls are never drawn
 * where a free shot would be): one inside it goes back to just beyond its depth.
 * @param {Point} p @param {1 | -1} dir  The way the team attacks.
 * @returns {Point}
 */
export function outOfBox(p, dir) {
  const goalX = dir === 1 ? 1 : 0;
  const inside = Math.abs(goalX - p.x) <= FREE_SHOT_BOX.depth && p.y >= FREE_SHOT_BOX.top && p.y <= 1 - FREE_SHOT_BOX.top;
  return inside ? { x: goalX - dir * (FREE_SHOT_BOX.depth + 0.03), y: p.y } : { x: p.x, y: p.y };
}

/**
 * Spin for a ball travelling from `a` to `b` at `rate`: clockwise on screen going right, anticlockwise going left.
 * @param {Point} a @param {Point} b @param {number} rate
 */
function rolling(a, b, rate) {
  return b.x < a.x ? -rate : rate;
}

/**
 * How long a pass of `d` pitch lengths takes (Task 169), in real ms: its length at passSpeed, between passMs and passMaxMs.
 * @param {number} d @param {{ passMs: number, passSpeed: number, passMaxMs: number }} a
 */
export function passDuration(d, { passMs, passSpeed, passMaxMs }) {
  return Math.round(Math.min(passMaxMs, Math.max(passMs, (d / passSpeed) * 1000)));
}

/** Distance from p to the segment a–b, in pitch lengths (y counts half: the pitch is twice as long as wide). @param {Point} p @param {Point} a @param {Point} b */
function laneDistance(p, a, b) {
  const [ax, ay, bx, by, px, py] = [a.x, a.y / 2, b.x, b.y / 2, p.x, p.y / 2];
  const len = (bx - ax) ** 2 + (by - ay) ** 2;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len)) : 0;
  return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
}

// The big kick's flight (Task 240, Tom: a straight line up and away from the keeper, then the more rounded arc toward
// the end): a cubic Bézier of height against the way along, from the foot (0, 0) to the landing (1, 0), its first
// control point setting the climb's straight line, its second the late peak and the rounded drop. Normalised to peak 1.
const KICK_CURVE = Object.freeze([[0.6, 0.95], [0.9, 1.3]]);
const KICK_STEPS = 64;
const kickTable = (() => {
  const [[x1, y1], [x2, y2]] = KICK_CURVE;
  const at = (/** @type {number} */ t, /** @type {number} */ a, /** @type {number} */ b) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  const pts = [];
  for (let i = 0; i <= KICK_STEPS; i++) {
    const t = i / KICK_STEPS;
    pts.push([at(t, x1, x2), at(t, y1, y2) - t ** 3]);
  }
  const peak = Math.max(...pts.map(([, y]) => y));
  return pts.map(([x, y]) => [x, y / peak]);
})();
/** The big kick's height at `f` of the way along (0 at the foot and the landing, 1 at its peak). @param {number} f */
function kickArc(f) {
  let i = 1;
  while (i < kickTable.length - 1 && kickTable[i][0] < f) i++;
  const [x0, y0] = kickTable[i - 1];
  const [x1, y1] = kickTable[i];
  return Math.max(0, y0 + (y1 - y0) * (x1 > x0 ? (f - x0) / (x1 - x0) : 0));
}

/** Distance in pitch lengths (the pitch is twice as long as it is wide). @param {Point} p @param {Point} q */
function dist(p, q) {
  return Math.hypot(p.x - q.x, (p.y - q.y) / 2);
}

/** @param {number} v @param {number} margin */
function clamp(v, margin) {
  return Math.min(1 - margin, Math.max(margin, v));
}

/** @param {number} f */
function ease(f) {
  const t = Math.min(1, Math.max(0, f));
  return t * t * (3 - 2 * t);
}
