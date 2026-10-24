// The Director's watchers (Task 263; docs/director.md §7; data/director.json). The league is rebuilt from its seed
// and data to the last finished season (the same sim the channel runs, so the same league), each season's measures
// taken from its events, and proposals made for the desk (Task 264): a rule change when a measure has stayed out of
// its band, and a poll's result once the poll has closed. No DOM; the balance check lives in the CLI (src/cli/director.js).
import { EventLog } from '../chronicle/eventLog.js';
import { createLeague } from '../sim/league.js';
import { runOffseason } from '../sim/offseason.js';
import { seasonConfig } from '../sim/rules.js';
import { runSeason } from '../sim/season.js';
import { allPolls } from '../channel/polls.js';

/**
 * @typedef {object} SeasonMeasures  One finished season's measures.
 * @property {number} season
 * @property {number} matches
 * @property {number} goalsPerMatch
 * @property {number} scorcherShare  Scorchers as a percentage of goals.
 * @property {number} burnsPerMatch
 *
 * @typedef {object} RuleProposal
 * @property {string} id  "goals_s12": the watcher and the season it would take effect.
 * @property {'rule_change'} kind
 * @property {string} watcher
 * @property {{ measure: string, band: [number, number], aim: number, side: 'low' | 'high', seasons: { season: number, value: number }[] }} evidence
 * @property {{ path: string, from: number, to: number, expected: number }} lever  `expected`: the measure aimed at.
 * @property {{ id: string, season: number, reason: string, changes: Record<string, any> }} change
 *   The entry for data/ruleChanges.json, as the desk would write it.
 *
 * @typedef {object} PollProposal
 * @property {string} id  The poll's id.
 * @property {'poll_result'} kind
 * @property {string} question
 * @property {Record<string, number>} votes  Every option, 0 for none.
 * @property {number} total
 * @property {{ announced: { season: number, at: string }, votes: Record<string, number> }} result  The poll's `result`, as the desk would write it.
 */

/**
 * Play the league from its seed through `seasons` seasons (off-seasons between), taking each season's measures.
 * @param {import('../config.js').Config} config
 * @param {string} seed
 * @param {number} seasons
 * @returns {SeasonMeasures[]}
 */
export function measureSeasons(config, seed, seasons) {
  const c = { matches: 0, goals: 0, scorchers: 0, burns: 0 };
  const log = new EventLog({ sinks: [(e) => {
    if (e.type === 'burn') c.burns++;
    else if (e.type === 'goal') { c.goals++; if (/** @type {any} */ (e.data).scorcher) c.scorchers++; }
    else if (e.type === 'match_result') c.matches++;
  }] });
  const league = createLeague(config, seed, log);
  /** @type {SeasonMeasures[]} */
  const out = [];
  for (let s = 1; s <= seasons; s++) {
    Object.assign(c, { matches: 0, goals: 0, scorchers: 0, burns: 0 });
    const record = runSeason(league, config, log);
    out.push({ season: s, matches: c.matches, goalsPerMatch: c.goals / c.matches, scorcherShare: (100 * c.scorchers) / Math.max(1, c.goals), burnsPerMatch: c.burns / c.matches });
    if (s < seasons) runOffseason(league, config, log, record);
  }
  return out;
}

/** A dotted path's value in a rules object. @param {any} rules @param {string} path @returns {number} */
const valueAt = (rules, path) => path.split('.').reduce((o, k) => o?.[k], rules);

/** A partial rules object setting one dotted path. @param {string} path @param {number} value */
export const changeAt = (path, value) => path.split('.').reduceRight((/** @type {any} */ inner, k) => ({ [k]: inner }), value);

/**
 * Rule changes to propose, one per watcher at most: when its measure has been out of its band on the same side for the
 * watcher's last `seasons` finished seasons, all played with the lever at today's value, and no change to the lever is
 * already on its way, and the watcher isn't silenced by a rejection (Task 264, Tom: until its measure has come back
 * inside the band at least once).
 * @param {import('../config.js').Config} config
 * @param {SeasonMeasures[]} measures  Every finished season, oldest first.
 * @param {number} next  The season a change would take effect.
 * @param {Rejection[]} [rejections]  data/rejections.json's.
 * @returns {RuleProposal[]}
 */
export function ruleProposals(config, measures, next, rejections = []) {
  /** @type {RuleProposal[]} */
  const out = [];
  for (const w of /** @type {any[]} */ (config.director.watchers)) {
    const pending = (config.ruleChanges?.changes ?? []).some((/** @type {any} */ c) => c.season >= next && valueAt(c.changes, w.lever.path) !== undefined);
    const recent = measures.slice(-w.seasons);
    if (pending || recent.length < w.seasons || silenced(w, measures, rejections)) continue;
    const today = valueAt(seasonConfig(config, next).rules, w.lever.path);
    // Only seasons played with the lever at today's value count: a change resets the watch.
    if (recent.some((m) => valueAt(seasonConfig(config, m.season).rules, w.lever.path) !== today)) continue;
    const [lo, hi] = w.band;
    const values = recent.map((m) => /** @type {number} */ (/** @type {any} */ (m)[w.measure]));
    const side = values.every((v) => v < lo) ? 'low' : values.every((v) => v > hi) ? 'high' : null;
    if (!side) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const raw = Math.round((w.aim - mean) / w.lever.perStep);
    const steps = Math.max(-w.lever.maxSteps, Math.min(w.lever.maxSteps, raw === 0 ? Math.sign(w.aim - mean) * Math.sign(w.lever.perStep) : raw));
    const to = Number((today + steps * w.lever.step).toFixed(w.lever.digits));
    out.push({
      id: `${w.id}_s${next}`,
      kind: 'rule_change',
      watcher: w.id,
      evidence: { measure: w.measure, band: [lo, hi], aim: w.aim, side, seasons: recent.map((m, i) => ({ season: m.season, value: Number(values[i].toFixed(2)) })) },
      lever: { path: w.lever.path, from: today, to, expected: Number((mean + steps * w.lever.perStep).toFixed(2)) },
      change: { id: `director_${w.id}_s${next}`, season: next, reason: w.reasons[side], changes: changeAt(w.lever.path, to) },
    });
  }
  return out;
}

/**
 * Whether a watcher is silenced: rejected after its last finished season back inside the band. A rejection's
 * `finished` is the last finished season when it was rejected, so a measure back in the band in a season after that
 * lifts it, and three more seasons out would propose again.
 * @param {any} w  The watcher.
 * @param {SeasonMeasures[]} measures
 * @param {Rejection[]} rejections
 */
export function silenced(w, measures, rejections) {
  const last = rejections.filter((r) => r.kind === 'rule_change' && r.watcher === w.id).reduce((m, r) => Math.max(m, r.finished), -Infinity);
  if (last === -Infinity) return false;
  const [lo, hi] = w.band;
  return !measures.some((m) => m.season > last && /** @type {any} */ (m)[w.measure] >= lo && /** @type {any} */ (m)[w.measure] <= hi);
}

/**
 * A rejected proposal (data/rejections.json, Task 264): kept so a rejection silences its watcher, and for the desk's
 * REJECTIONS history.
 * @typedef {object} Rejection
 * @property {string} id  The proposal's ("goals_s37", or a poll's id).
 * @property {'rule_change' | 'poll_result'} kind
 * @property {string | null} watcher
 * @property {number} finished  The last finished season when it was rejected.
 * @property {string} rejected  When, the real date-time (ISO).
 * @property {string} summary  What was proposed, in a line.
 * @property {string} note  Tom's note, if any.
 */

/**
 * A poll's result to announce, for each poll closed by `t` without one and not rejected: the votes counted (only its
 * options).
 * @param {import('../config.js').Config} config
 * @param {{ instant: (season: number, minutes: number) => number }} calendar
 * @param {number} t  Epoch ms.
 * @param {{ pollId: string, optionId: string }[]} votes  Every vote kept (output/audience/votes.jsonl).
 * @param {{ season: number, at: string }} announced
 * @param {Rejection[]} [rejections]  A poll whose result was rejected is never proposed again.
 * @returns {PollProposal[]}
 */
export function pollProposals(config, calendar, t, votes, announced, rejections = []) {
  const withResult = new Set(/** @type {any[]} */ (config.polls.polls).filter((p) => p.result).map((p) => p.id));
  const rejected = new Set(rejections.filter((r) => r.kind === 'poll_result').map((r) => r.id));
  return allPolls(config, calendar, t).filter((p) => p.closesAt <= t && !withResult.has(p.id) && !rejected.has(p.id)).map((p) => {
    /** @type {Record<string, number>} */
    const counts = Object.fromEntries(p.options.map((o) => [o.id, 0]));
    for (const v of votes) if (v.pollId === p.id && v.optionId in counts) counts[v.optionId]++;
    return { id: p.id, kind: /** @type {const} */ ('poll_result'), question: p.question, votes: counts, total: Object.values(counts).reduce((a, b) => a + b, 0), result: { announced, votes: counts } };
  });
}

/**
 * How many seasons have finished by `t`: a season counts once its off-season show has aired (the chronicle's rule).
 * @param {import('../config.js').Config} config
 * @param {ReturnType<typeof import('../channel/calendar.js').createCalendar>} calendar
 * @param {number} t
 */
export function finishedSeasons(config, calendar, t) {
  const season = calendar.seasonAt(t);
  const final = calendar.slots(season).at(-1);
  const aired = final ? final.kickoff + config.settings.chronicle.offseasonAiredMinutes * 60_000 : Infinity;
  return t >= aired ? season : season - 1;
}

/**
 * The day time a moment falls at in its season, rounded up to the quarter hour ("day 7 22:15"), for an announcement.
 * Never past the season's last minute.
 * @param {ReturnType<typeof import('../channel/calendar.js').createCalendar>} calendar
 * @param {number} t
 * @param {number} seasonDays
 * @returns {{ season: number, at: string }}
 */
export function dayTimeOf(calendar, t, seasonDays) {
  const season = calendar.seasonAt(t);
  let m = Math.ceil((t - calendar.seasonStart(season)) / 60_000);
  // Wall-clock minutes (daylight saving can put an hour between them and elapsed ones).
  while (calendar.instant(season, m) < t) m++;
  while (m > 0 && calendar.instant(season, m - 1) >= t) m--;
  m = Math.min(Math.ceil(m / 15) * 15, seasonDays * 1440 - 1);
  const hh = String(Math.floor((m % 1440) / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return { season, at: `day ${Math.floor(m / 1440) + 1} ${hh}:${mm}` };
}
