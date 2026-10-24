// How many Fan Coins a viewer earns (Fan Coins, plan step 1; docs/tasks.md): runs the channel's programme over some
// seasons as it airs and splits the air into what earns (Tom's first rates, 2026-10-15): a live match by the minute,
// a re-air by the half, a highlights package each, the studio by the minute at a rate to pick. Then any stretch of
// watching can be priced. Pure and browser-safe, for npm run coins.
//   live        every live minute, half-time included; in the final round one feed counts, whichever is watched
//   reair       the match part of a re-air (its halves); its intro, line-up, handshakes, full-time card and recorded
//               interview earn nothing (`reair_other`)
//   highlights  a package (the post-match show's, the gap's, the playoffs' reels)
//   studio      the rest that's made for the channel: pre-match, walk-out, handshakes and the trophy lift, the full-time
//               card, the desk's talk, the interview, studio cards, the off-season show
//   none        ads (bumpers too), the ident, the countdown
import { createCalendar } from './calendar.js';
import { LiveLeague } from './liveLeague.js';
import { createProgramme } from './programme.js';
import { createTimeline } from './timeline.js';

const DAY = 86_400_000;
/** The kinds of air, as they earn. */
export const AIR_KINDS = /** @type {const} */ (['live', 'offseason', 'reair', 'reair_other', 'highlights', 'studio', 'none']);
/** The off-season show's scenes (the lift is the handshakes' place after the final). */
const OFFSEASON = new Set(['champion', 'award', 'farewell', 'lottery', 'draft', 'moves']);
/** @typedef {typeof AIR_KINDS[number]} AirKind */

/** @param {import('./programme.js').Segment} seg @returns {AirKind} */
function kindOf(seg) {
  if (seg.kind === 'live') return 'live';
  // The off-season show as it airs (its repeats are replays: the rest).
  if ((seg.kind === 'handshakes' && seg.lift) || (OFFSEASON.has(seg.kind) && !(/** @type {any} */ (seg).repeat))) return 'offseason';
  if (seg.kind === 'reair') return seg.part === 'match' ? 'reair' : 'reair_other';
  if (seg.kind === 'highlights') return 'highlights';
  if (seg.kind === 'ads' || seg.kind === 'ident' || seg.kind === 'countdown') return 'none';
  return 'studio';
}

/**
 * The air from season `first` for `seasons` seasons (and a day past, so a stretch of watching can run over the end):
 * when each kind of air is on, and the units earned whole (a re-air's halves, highlights packages).
 * @param {any} config @param {string} seed @param {number} first @param {number} seasons
 */
export function airOf(config, seed, first, seasons) {
  const calendar = createCalendar(config);
  const days = seasons * config.settings.calendar.seasonDays;
  /** Each day's start (midnight in the league's zone), and one past the last. */
  const dayStarts = Array.from({ length: days + 1 }, (_, d) => calendar.instant(first + Math.floor(d / config.settings.calendar.seasonDays), (d % config.settings.calendar.seasonDays) * 1440));
  const from = dayStarts[0];
  const to = dayStarts[days] + DAY;
  const live = new LiveLeague(config, { now: from, seed });
  /** @type {Map<string, import('./timeline.js').Timeline>} */
  const timelines = new Map();
  const timelineOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => timelines.get(m.id) ?? /** @type {any} */ (timelines.set(m.id, createTimeline(m, config)).get(m.id));
  const programme = createProgramme(live, timelineOf);
  const { match, reairs } = config.settings;
  const reairHalfTimeMs = Math.min(reairs.halfTimeSeconds * 1000, match.halfTimeRealMinutes * 60_000);

  /** Runs of one kind, merged when they touch. @type {{ kind: AirKind, from: number, until: number }[]} */
  const spans = [];
  /** @type {{ kind: 'reair' | 'highlights', from: number, until: number }[]} */
  const units = [];
  /** @type {Set<string>} */
  const seen = new Set();
  const addSpan = (/** @type {AirKind} */ kind, /** @type {number} */ a, /** @type {number} */ b) => {
    const last = spans.at(-1);
    if (last && last.kind === kind && last.until === a) last.until = b;
    else spans.push({ kind, from: a, until: b });
  };
  for (let t = from; t < to;) {
    live.advanceTo(t);
    const seg = programme.at(t);
    const until = Math.min(to, 'until' in seg && seg.until > t ? seg.until : Math.max(programme.pieceAt(t).until, t + 1000));
    const kind = kindOf(seg);
    addSpan(kind, t, until);
    if (seg.kind === 'highlights' && !seen.has(`h${seg.from}`)) {
      seen.add(`h${seg.from}`);
      units.push({ kind: 'highlights', from: seg.from, until: seg.until });
    } else if (seg.kind === 'reair' && seg.part === 'match' && !seen.has(`r${seg.from}`)) {
      seen.add(`r${seg.from}`);
      const ht = /** @type {import('./timeline.js').TimedEvent} */ (timelineOf(seg.match).events.find((e) => e.event.type === 'half_time')).at;
      units.push({ kind: 'reair', from: seg.from, until: seg.from + ht });
      units.push({ kind: 'reair', from: seg.from + ht + reairHalfTimeMs, until: seg.until });
    }
    t = until;
  }
  units.sort((a, b) => a.from - b.from);
  return { days, dayStarts, from, to, spans, units };
}

/** @typedef {ReturnType<typeof airOf>} Air */

/**
 * A way of pricing a stretch of watching: what each kind of air earns in [a, b).
 * Live and studio by the minute watched (whole minutes over the stretch); a re-air's half and a highlights package
 * when watched whole.
 * @param {Air} air
 */
export function watcher(air) {
  /** Each kind's air before each span's start, for overlaps by binary search. */
  const before = air.spans.map(() => /** @type {Record<string, number>} */ ({}));
  /** @type {Record<string, number>} */
  const run = Object.fromEntries(AIR_KINDS.map((k) => [k, 0]));
  air.spans.forEach((s, i) => { before[i] = { ...run }; run[s.kind] += s.until - s.from; });
  /** Index of the last span starting at or before t. @param {number} t */
  const spanAt = (t) => {
    let lo = 0, hi = air.spans.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (air.spans[mid].from <= t) lo = mid; else hi = mid - 1; }
    return lo;
  };
  /** Each kind's ms of air before t. @param {number} t */
  const cumulative = (t) => {
    const i = spanAt(t);
    const s = air.spans[i];
    const out = { ...before[i] };
    out[s.kind] += Math.max(0, Math.min(t, s.until) - s.from);
    return out;
  };
  /** The first unit starting at or after t. @param {number} t */
  const unitFrom = (t) => {
    let lo = 0, hi = air.units.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (air.units[mid].from < t) lo = mid + 1; else hi = mid; }
    return lo;
  };
  /**
   * What watching [a, b) sees: ms of each kind, and whole re-air halves and highlights packages.
   * @param {number} a @param {number} b
   */
  return function watch(a, b) {
    const ca = cumulative(a), cb = cumulative(b);
    /** @type {Record<string, number>} */
    const ms = Object.fromEntries(AIR_KINDS.map((k) => [k, cb[k] - ca[k]]));
    let halves = 0, packages = 0;
    for (let i = unitFrom(a); i < air.units.length && air.units[i].from < b; i++) {
      if (air.units[i].until > b) continue;
      if (air.units[i].kind === 'reair') halves++; else packages++;
    }
    return { ms, halves, packages };
  };
}

/**
 * Fan Coins for what was watched, at the rates (Tom, 2026-10-16): live play and the off-season show as it airs by the
 * minute, a highlights package watched whole one, everything else by the minute at the studio's rate.
 * @param {ReturnType<ReturnType<typeof watcher>>} w
 * @param {{ liveMinutes: number, studioMinutes: number, offseasonMinutes: number }} rates  Minutes of each for a coin.
 */
export function coinsFor(w, rates) {
  const live = Math.floor(w.ms.live / 60_000 / rates.liveMinutes);
  const offseason = Math.floor(w.ms.offseason / 60_000 / rates.offseasonMinutes);
  // Everything else but highlights (a coin a package watched whole), by the minute at the studio's rate (Tom, 2026-10-16).
  const other = Math.floor((w.ms.studio + w.ms.reair + w.ms.reair_other + w.ms.none) / 60_000 / rates.studioMinutes);
  return { live, offseason, highlights: w.packages, other, total: live + offseason + w.packages + other };
}
