// The pitch map (Task 78): where the ball and the players spend a match, measured from the channel's own motion, so
// "play uses the whole pitch" and "nobody stands idle far upfield" are numbers as well as a look. Pure and DOM-free;
// used by the CLI (npm run pitchmap) and the dev page (pitchmap.html), so both give the same numbers. See
// docs/channel.md §15.2.
//
// Everything is seen from the team with the ball, attacking left to right: `a` along the pitch (0 = their own goal
// line, 1 = the goal they attack), `y` across as on screen (0 top, 1 bottom). Only moments of play are sampled: not
// pauses, breaks, kick-off holds before the clock runs, or ceremonies.
import { EventLog } from '../chronicle/eventLog.js';
import { createLeague } from '../sim/league.js';
import { runSeason } from '../sim/season.js';
import { homeAttacksRight } from './formation.js';
import { createMotion } from './motion.js';
import { createTimeline } from './timeline.js';

/** The grid: sixths along, quarters across, so the corner areas and the top and bottom show. */
export const GRID = Object.freeze({ along: 6, across: 4 });
/** A wide quarter: y below WIDE or above 1 − WIDE. "Very wide": the outer VERY_WIDE. */
export const WIDE = 0.25;
const VERY_WIDE = 0.15;
/** A corner area: the last sixth at an end, in a wide quarter. */
export const CORNER_A = 1 / 6;
/** Further than this from the ball (pitch lengths) counts as far from play. */
const FAR = 0.35;
/** The gap histogram: bins of GAP_BIN pitch lengths from −GAP_SPAN to +GAP_SPAN. */
const GAP_BIN = 0.01;
const GAP_SPAN = 0.6;
const Y_BINS = 1000;
const PLAY = new Set(['first_half', 'second_half', 'overtime']);
/** Events that end a breakaway if its shot never comes. */
const BREAK_END = new Set(['shot', 'possession_change', 'kickoff', 'half_time', 'full_time', 'overtime_start']);

/**
 * The measures and their targets (channel.md §15.2). `tetherGap` and `breakawayGap` are in pitch lengths; the rest
 * are shares of play (0–1) unless a unit says otherwise.
 * @type {Record<string, { label: string, min?: number, max?: number, pct?: boolean, digits?: number }>}
 */
export const TARGETS = {
  wide: { label: 'Ball in the wide quarters', min: 0.3, pct: true },
  veryWide: { label: 'Ball in the outer 15% across', pct: true },
  middleThird: { label: 'Ball in the middle third across', max: 0.5, pct: true },
  cornerAny: { label: 'Ball in a corner area (either end)', pct: true },
  cornerAttacking: { label: 'Ball in the attacking corner area', min: 0.05, max: 0.075, pct: true },
  playersY5: { label: 'Outfield players across, 5th percentile (y)', max: 0.15, digits: 3 },
  playersY95: { label: 'Outfield players across, 95th percentile (y)', min: 0.85, digits: 3 },
  beyondLine: { label: 'Furthest attacker beyond the last defender (any amount)', pct: true },
  tetherBreach: { label: 'An attacker off the ball > tether + 0.02 beyond the line or ball (not breakaways)', max: 0.01, pct: true },
  worstGap: { label: 'Worst gap off the ball, not breakaways (pitch lengths)', digits: 3 },
  far: { label: 'Outfield players > 0.35 pitch lengths from the ball', pct: true },
  breakawaysPerMatch: { label: 'Breakaways per match', digits: 1 },
  loosePerMatch: { label: 'Loose balls per match (Task 82)', digits: 1 },
  firstTime: { label: 'Open-play goals shot within 1 s of getting the ball (Task 170)', min: 0.4, max: 0.6, pct: true },
  straight: { label: 'Open-play goals shot within 0.5 s of getting the ball', pct: true },
};
/** How far back the first-time measure looks, a step at a time (ms). */
const HAD_STEP = 50;
/** A breach of the tether: an attacker off the ball this far (pitch lengths) past it (§15.2). */
const TETHER_SLACK = 0.02;

/**
 * @typedef {object} PitchMap
 * @property {number} matches
 * @property {number} samples  Moments of play sampled.
 * @property {number[]} ball  GRID.along × GRID.across counts, index along * GRID.across + across.
 * @property {Record<string, number[]>} players  Per role (`with K`, `with D` … `without S`), the same grid.
 * @property {number[]} playersY  Outfield players' y, in Y_BINS bins.
 * @property {number} playerSamples
 * @property {number} far  Outfield player samples further than FAR from the ball.
 * @property {number} wide @property {number} veryWide @property {number} middleThird
 * @property {number} cornerAny @property {number} cornerAttacking
 * @property {number} beyondLine  Samples with the furthest outfield attacker beyond the last outfield defender.
 * @property {number[]} gap  Off-the-ball gap beyond max(line, ball), outside breakaways, histogram.
 * @property {number} gapSamples
 * @property {number} worstGap
 * @property {number} breakaways
 * @property {number} breakawaySamples
 * @property {number} loose  Loose balls (a sample with the ball loose after one without).
 * @property {number} goals  Open-play goals (not free shots).
 * @property {number} firstTime  Of those, shot within 1 s of getting it. @property {number} straight  Within 0.5 s.
 */

/** @returns {PitchMap} */
export function emptyMap() {
  const cells = () => new Array(GRID.along * GRID.across).fill(0);
  /** @type {Record<string, number[]>} */
  const players = {};
  for (const has of ['with', 'without']) for (const slot of ['K', 'D', 'M', 'S']) players[`${has} ${slot}`] = cells();
  return {
    matches: 0, samples: 0, ball: cells(), players, playersY: new Array(Y_BINS).fill(0), playerSamples: 0, far: 0,
    wide: 0, veryWide: 0, middleThird: 0, cornerAny: 0, cornerAttacking: 0, beyondLine: 0,
    gap: new Array(Math.round((2 * GAP_SPAN) / GAP_BIN)).fill(0), gapSamples: 0, worstGap: -Infinity,
    breakaways: 0, breakawaySamples: 0, loose: 0, goals: 0, firstTime: 0, straight: 0,
  };
}

/** The grid cell for a spot (a along, y across). @param {number} a @param {number} y */
export function cellOf(a, y) {
  const i = Math.min(GRID.along - 1, Math.max(0, Math.floor(a * GRID.along)));
  const j = Math.min(GRID.across - 1, Math.max(0, Math.floor(y * GRID.across)));
  return i * GRID.across + j;
}

/** In a wide quarter. @param {number} y */
export const isWide = (y) => y < WIDE || y > 1 - WIDE;

/** In a corner area at either end. @param {number} a @param {number} y */
export const inCorner = (a, y) => isWide(y) && (a < CORNER_A || a > 1 - CORNER_A);

/**
 * The stretches of a timeline that are breakaways: from each advance the sim calls a breakaway to its shot (or
 * whatever ends the possession first).
 * @param {import('./timeline.js').Timeline} timeline
 * @returns {[number, number][]}  [from, to] in ms since kick-off.
 */
export function breakawayWindows(timeline) {
  const ev = timeline.events;
  /** @type {[number, number][]} */
  const out = [];
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i].event;
    if (e.type !== 'advance' || !(/** @type {any} */ (e.data)?.breakaway)) continue;
    let j = i + 1;
    while (j < ev.length && !BREAK_END.has(ev[j].event.type)) j++;
    out.push([ev[i].at, j < ev.length ? ev[j].at : timeline.duration]);
  }
  return out;
}

/**
 * Add one match to a map, sampling its motion every `sampleMs` of play.
 * @param {PitchMap} map  Changed in place.
 * @param {import('./timeline.js').Timeline} timeline
 * @param {{ at: (e: number) => import('./motion.js').Pose | null, holderAt?: (e: number) => string | null }} motion
 * @param {{ homeId: string, keeperSlot: string, sampleMs?: number, shotMs?: number }} opts  shotMs: the shot's flight
 *   (settings.animation), for the first-time measure.
 * @returns {PitchMap}
 */
export function addMatch(map, timeline, motion, { homeId, keeperSlot, sampleMs = 250, shotMs = 0 }) {
  // First-time finishes (Task 170): for each open-play goal, how long the scorer had the ball (as drawn) before it
  // left their foot.
  if (motion.holderAt) {
    for (const t of timeline.events) {
      if (t.event.type !== 'goal' || /** @type {any} */ (t.event.data)?.freeShot) continue;
      const struck = t.at - shotMs - 1;
      let had = 0;
      while (had < 10_000 && motion.holderAt(struck - had) === t.event.playerId) had += HAD_STEP;
      // Not held as it was struck: a pass (or a loose ball) met first time.
      map.goals++;
      if (had < 1000) map.firstTime++;
      if (had < 500) map.straight++;
    }
  }
  const windows = breakawayWindows(timeline);
  map.matches++;
  map.breakaways += windows.length;
  let w = 0;
  let wasLoose = false;
  for (let e = 0; e < timeline.duration; e += sampleMs) {
    const s = timeline.stateAt(e);
    if (!PLAY.has(s.phase) || s.paused || !s.possession) continue;
    const pose = motion.at(e);
    if (!pose?.ball) continue;
    while (w < windows.length && windows[w][1] <= e) w++;
    const breakaway = w < windows.length && windows[w][0] <= e;

    const homeDir = homeAttacksRight(s.phase);
    const attacking = s.possession === homeId ? 'home' : 'away';
    const dir = attacking === 'home' ? homeDir : -homeDir;
    const along = (/** @type {{ x: number }} */ p) => (dir === 1 ? p.x : 1 - p.x);

    const ball = { a: along(pose.ball), y: pose.ball.y };
    if (pose.ball.loose && !wasLoose) map.loose++;
    wasLoose = Boolean(pose.ball.loose);
    map.samples++;
    map.ball[cellOf(ball.a, ball.y)]++;
    if (isWide(ball.y)) map.wide++;
    if (ball.y < VERY_WIDE || ball.y > 1 - VERY_WIDE) map.veryWide++;
    if (ball.y >= 1 / 3 && ball.y < 2 / 3) map.middleThird++;
    if (inCorner(ball.a, ball.y)) map.cornerAny++;
    if (isWide(ball.y) && ball.a > 1 - CORNER_A) map.cornerAttacking++;

    /** @type {{ a: number, y: number, dist: number }[]} */
    const att = [];
    let line = -Infinity;
    for (const p of pose.players) {
      const a = along(p);
      const has = p.side === attacking;
      const slot = p.slot === keeperSlot ? 'K' : p.slot;
      const grid = map.players[`${has ? 'with' : 'without'} ${slot}`];
      if (grid) grid[cellOf(a, p.y)]++;
      if (slot === 'K') continue;
      const dist = Math.hypot(a - ball.a, (p.y - ball.y) / 2);
      map.playerSamples++;
      map.playersY[Math.min(Y_BINS - 1, Math.max(0, Math.floor(p.y * Y_BINS)))]++;
      if (dist > FAR) map.far++;
      if (has) att.push({ a, y: p.y, dist });
      else line = Math.max(line, a);
    }
    if (att.length && Number.isFinite(line)) {
      if (Math.max(...att.map((p) => p.a)) > line) map.beyondLine++;
      if (breakaway) map.breakawaySamples++;
      else {
        // The tether's measure: attackers off the ball (the one nearest a held ball is on it), beyond the line or the
        // ball, whichever is further forward.
        const onBall = pose.ball.held ? att.reduce((m, p) => (p.dist < m.dist ? p : m)) : null;
        const off = att.filter((p) => p !== onBall);
        if (off.length) {
          const gap = Math.max(...off.map((p) => p.a)) - Math.max(line, ball.a);
          map.gapSamples++;
          map.gap[Math.min(map.gap.length - 1, Math.max(0, Math.floor((gap + GAP_SPAN) / GAP_BIN)))]++;
          map.worstGap = Math.max(map.worstGap, gap);
        }
      }
    }
  }
  return map;
}

/**
 * The measures (TARGETS' keys) from a map.
 * @param {PitchMap} map
 * @param {number} tether  settings.play.tether, for the tether's measure.
 * @returns {Record<string, number>}
 */
export function measures(map, tether) {
  const n = map.samples || 1;
  const yAt = (/** @type {number} */ q) => {
    let seen = 0;
    for (let i = 0; i < map.playersY.length; i++) {
      seen += map.playersY[i];
      if (seen >= q * map.playerSamples) return (i + 0.5) / Y_BINS;
    }
    return 1;
  };
  const breachFrom = Math.round((tether + TETHER_SLACK + GAP_SPAN) / GAP_BIN);
  const breaches = map.gap.slice(breachFrom).reduce((s, v) => s + v, 0);
  return {
    wide: map.wide / n,
    veryWide: map.veryWide / n,
    middleThird: map.middleThird / n,
    cornerAny: map.cornerAny / n,
    cornerAttacking: map.cornerAttacking / n,
    playersY5: yAt(0.05),
    playersY95: yAt(0.95),
    beyondLine: map.beyondLine / n,
    tetherBreach: breaches / (map.gapSamples || 1),
    worstGap: Number.isFinite(map.worstGap) ? map.worstGap : 0,
    far: map.far / (map.playerSamples || 1),
    breakawaysPerMatch: map.breakaways / (map.matches || 1),
    loosePerMatch: map.loose / (map.matches || 1),
    firstTime: map.firstTime / (map.goals || 1),
    straight: map.straight / (map.goals || 1),
  };
}

/**
 * Whether a measure meets its target: true, false, or null if it has none.
 * @param {string} key @param {number} value
 */
export function meets(key, value) {
  const t = TARGETS[key];
  if (!t || (t.min === undefined && t.max === undefined)) return null;
  return (t.min === undefined || value >= t.min) && (t.max === undefined || value <= t.max);
}

/** A measure as text. @param {string} key @param {number} value */
export function formatMeasure(key, value) {
  const t = TARGETS[key];
  if (t?.pct) return `${(100 * value).toFixed(1)}%`;
  return value.toFixed(t?.digits ?? 2);
}

/** A target as text ("≥ 30%", "5–7.5%", ""). @param {string} key */
export function formatTarget(key) {
  const t = TARGETS[key];
  if (!t) return '';
  const f = (/** @type {number} */ v) => (t.pct ? `${+(100 * v).toFixed(1)}%` : String(v));
  if (t.min !== undefined && t.max !== undefined) return `${f(t.min)}–${f(t.max)}`;
  if (t.min !== undefined) return `≥ ${f(t.min)}`;
  if (t.max !== undefined) return `≤ ${f(t.max)}`;
  return '';
}

/**
 * The first `count` matches of a fresh league's first season, as the channel would show them, with their timelines and
 * motion. The CLI and the dev page both use this, so they measure the same matches.
 * @param {any} config  A loaded config (config.js).
 * @param {string} seed
 * @param {number} count
 */
export function firstMatches(config, seed, count) {
  /** @type {Map<string, any[]>} */
  const byMatch = new Map();
  const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId))?.push(e); }] });
  const league = createLeague(config, seed, log);
  runSeason(league, config, log);
  const keeperSlot = config.positions.keeper;
  const animation = config.settings.animation;
  return [...byMatch].slice(0, count).map(([id, events]) => {
    const r = events.at(-1).data;
    const timeline = createTimeline({ id, events, homeId: r.homeId, awayId: r.awayId }, config);
    const motion = createMotion(timeline, { matchId: id, homeId: r.homeId, keeperSlot, animation, play: config.settings.play });
    return { id, homeId: r.homeId, awayId: r.awayId, timeline, motion };
  });
}
