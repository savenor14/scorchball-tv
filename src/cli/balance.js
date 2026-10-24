// Balance report: runs several seeded leagues for many seasons and checks the targets in
// docs/simulation.md §10. A developer tool.
// Usage: npm run balance -- [--seasons 30] [--leagues 5] [--seed balance] [--override '{"rules":{...},"positions":{...}}']
// --override deep-merges into the loaded config files (keys: settings, rules, positions, regions, teams) and is
// validated like the real files, so you can try values without editing data/.
import { parseArgs } from 'node:util';
import { ConfigError, validateConfig } from '../config.js';
import { deepMerge } from '../util.js';
import { EventLog } from '../chronicle/eventLog.js';
import { createLeague } from '../sim/league.js';
import { runOffseason } from '../sim/offseason.js';
import { overall } from '../sim/players.js';
import { runSeason } from '../sim/season.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

/**
 * Targets: [min, max] (either may be null). `info` metrics are reported without a target.
 * @type {Record<string, { label: string, min?: number, max?: number, digits?: number, unit?: string }>}
 */
export const TARGETS = {
  goalsPerMatch: { label: 'Goals per match', min: 5, max: 8, digits: 2 },
  nilNilRate: { label: '0-0 draws', max: 1, digits: 1, unit: '%' },
  drawRate: { label: 'Draws (regular season)', digits: 1, unit: '%' },
  homeWinRate: { label: 'Home wins (regular season)', min: 43, max: 52, digits: 1, unit: '%' },
  burnsPerMatch: { label: 'Burns per match', min: 1, max: 4, digits: 2 },
  scorcherShare: { label: 'Scorchers share', min: 20, max: 35, digits: 1, unit: '%' },
  topScorerGoals: { label: 'Top scorer goals (avg per season)', min: 20, max: 45, digits: 1 },
  // A rare record-chasing season is welcome (Tom, Task 14); this only catches runaway outliers.
  // 70 from Task 237 (Tom): momentum makes the odd record season a little likelier; the average is unchanged.
  topScorerMax: { label: 'Top scorer goals (best season)', max: 70, digits: 0 },
  shieldPoints: { label: 'Table winner points (avg, of 42)', min: 26, max: 34, digits: 1 },
  bottomPoints: { label: 'Bottom team points (avg)', min: 5, max: 14, digits: 1 },
  // Judged on the average 10-season stretch; rare dynasties are stories, and the Director (Milestone 5)
  // is meant to respond when one team dominates. The worst stretch is shown for information.
  avgChampions: { label: 'Different champions per 10 seasons (average)', min: 4, digits: 1 },
  // 4.5 from the Sim milestone's close (Tom, 2026-10-07): it has sat about 4.1–4.2 on wide checks since Task 140.
  avgMaxTitles: { label: 'Most titles by one team per 10 seasons (average)', max: 4.5, digits: 1 },
  minChampions: { label: 'Different champions per 10 seasons (worst)', digits: 0 },
  maxTitles: { label: 'Most titles by one team per 10 seasons (worst)', digits: 0 },
  // Players who got good (Task 231, Tom): about 16 newcomers a season for 80 roster places, so most drafted players wash
  // out early whatever the rules, and a median over all of them measures the fringe. The target is the careers of drafted
  // players who reached careerGoodOverall at some point; the median past the rookie season is shown for information.
  careerMedian: { label: 'Career length, drafted who reached 75+ (median)', min: 10, max: 15, digits: 1 },
  careerAllMedian: { label: 'Career length, drafted, past rookie season (median)', digits: 1 },
  oneSeasonShare: { label: 'Drafted who played one season only', digits: 1, unit: '%' },
  ratingDrift: { label: 'League avg overall drift (last − first season)', min: -3, max: 3, digits: 1 },
  avgOverall: { label: 'League avg overall (final season)', digits: 1 },
  freeAgents: { label: 'Free-agent pool (final season)', max: 40, digits: 0 },
  subsPerMatch: { label: 'Substitutions per match', digits: 2 },
  injuriesPerSeason: { label: 'Injuries per season', digits: 1 },
};

/** A player who "got good" for the career target: reached this overall at some point (Task 231, Tom). */
export const CAREER_GOOD_OVERALL = 75;

/**
 * @typedef {object} BalanceOptions
 * @property {number} seasons
 * @property {number} leagues
 * @property {string} seed
 * @property {any} override  Deep-merged into the config, e.g. { rules: {...}, positions: {...} }.
 */

/** @param {string[]} argv @returns {BalanceOptions} */
export function parseBalanceArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      // 30 seasons so careers of players drafted mid-run can finish; shorter runs undercount career length.
      seasons: { type: 'string', default: '30' },
      leagues: { type: 'string', default: '5' },
      seed: { type: 'string', default: 'balance' },
      override: { type: 'string' },
    },
    strict: true,
  });
  const seasons = Number(values.seasons);
  const leagues = Number(values.leagues);
  if (!Number.isInteger(seasons) || seasons < 1) throw new Error(`--seasons must be a positive integer (got "${values.seasons}")`);
  if (!Number.isInteger(leagues) || leagues < 1) throw new Error(`--leagues must be a positive integer (got "${values.leagues}")`);
  let override = {};
  if (values.override) {
    try {
      override = JSON.parse(values.override);
    } catch (err) {
      throw new Error(`--override is not valid JSON: ${err instanceof Error ? err.message : err}`);
    }
  }
  return { seasons, leagues, seed: values.seed, override };
}

/**
 * Run the leagues and compute every metric.
 * @param {BalanceOptions} options
 * @returns {Promise<Record<string, number>>}
 */
export async function runBalance(options) {
  const config = structuredClone(await loadConfigFromDisk());
  deepMerge(config, options.override);
  const errors = validateConfig(config);
  if (errors.length > 0) throw new ConfigError(errors);

  const counts = { matches: 0, regular: 0, goals: 0, nilNil: 0, draws: 0, homeWins: 0, burns: 0, scorcher: 0, subs: 0, injuries: 0 };
  /** @type {number[]} */ const topScorer = [];
  /** @type {number[]} */ const shieldPts = [];
  /** @type {number[]} */ const bottomPts = [];
  /** @type {number[]} */ const careers = [];
  /** @type {number[]} */ const goodCareers = [];
  /** @type {number[]} */ const drifts = [];
  /** @type {number[]} */ const finalAvg = [];
  /** @type {number[]} */ const freeAgents = [];
  let minChampions = Infinity;
  let maxTitles = 0;
  /** @type {number[]} */ const windowChampions = [];
  /** @type {number[]} */ const windowMaxTitles = [];

  for (let l = 0; l < options.leagues; l++) {
    const log = new EventLog({
      sinks: [(e) => {
        if (e.type === 'burn') counts.burns++;
        else if (e.type === 'goal' && e.data.scorcher) counts.scorcher++;
        else if (e.type === 'substitution') counts.subs++;
        else if (e.type === 'injury') counts.injuries++;
        else if (e.type === 'match_result') counts.matches++;
      }],
    });
    const league = createLeague(config, `${options.seed}-${l + 1}`, log);
    /** @type {Map<string, number>} */
    const seasonsPlayed = new Map();
    /** @type {number[]} */
    const avgBySeason = [];
    /** The best overall each player reached on a roster. @type {Map<string, number>} */
    const best = new Map();

    for (let s = 0; s < options.seasons; s++) {
      for (const t of Object.values(league.teams)) {
        for (const id of t.roster) best.set(id, Math.max(best.get(id) ?? 0, overall(league.players[id], config.positions)));
      }
      const record = runSeason(league, config, log);
      for (const m of record.schedule.flatMap((r) => r.matches)) {
        const r = /** @type {NonNullable<typeof m.result>} */ (m.result);
        counts.regular++;
        counts.goals += r.homeGoals + r.awayGoals;
        if (r.homeGoals + r.awayGoals === 0) counts.nilNil++;
        if (r.homeGoals === r.awayGoals) counts.draws++;
        if (r.homeGoals > r.awayGoals) counts.homeWins++;
      }
      for (const st of Object.values(record.stats.regular)) {
        if (st.appearances > 0) seasonsPlayed.set(st.playerId, (seasonsPlayed.get(st.playerId) ?? 0) + 1);
      }
      topScorer.push(league.history.at(-1)?.topScorers[0]?.goals ?? 0);
      shieldPts.push(record.table[0].points);
      bottomPts.push(/** @type {any} */ (record.table.at(-1)).points);

      const report = runOffseason(league, config, log, record);
      for (const id of report.retired) {
        const p = league.players[id];
        if (p.draft && seasonsPlayed.has(id)) {
          careers.push(/** @type {number} */ (seasonsPlayed.get(id)));
          if ((best.get(id) ?? 0) >= CAREER_GOOD_OVERALL) goodCareers.push(/** @type {number} */ (seasonsPlayed.get(id)));
        }
      }
      const rostered = Object.values(league.teams).flatMap((t) => t.roster.map((/** @type {string} */ id) => league.players[id]));
      avgBySeason.push(rostered.reduce((a, p) => a + overall(p, config.positions), 0) / rostered.length);
    }

    drifts.push(/** @type {number} */ (avgBySeason.at(-1)) - avgBySeason[0]);
    finalAvg.push(/** @type {number} */ (avgBySeason.at(-1)));
    freeAgents.push(league.freeAgents.length);
    for (let start = 0; start + 10 <= league.history.length; start += 10) {
      const window = league.history.slice(start, start + 10);
      /** @type {Map<string, number>} */
      const titles = new Map();
      for (const h of window) titles.set(h.championId, (titles.get(h.championId) ?? 0) + 1);
      minChampions = Math.min(minChampions, titles.size);
      maxTitles = Math.max(maxTitles, ...titles.values());
      windowChampions.push(titles.size);
      windowMaxTitles.push(Math.max(...titles.values()));
    }
  }

  const mean = (/** @type {number[]} */ xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const median = (/** @type {number[]} */ xs) => {
    if (xs.length === 0) return NaN;
    const s = [...xs].sort((a, b) => a - b);
    return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
  };
  const totalSeasons = options.leagues * options.seasons;
  return {
    goalsPerMatch: counts.goals / counts.regular,
    nilNilRate: (100 * counts.nilNil) / counts.regular,
    drawRate: (100 * counts.draws) / counts.regular,
    homeWinRate: (100 * counts.homeWins) / counts.regular,
    burnsPerMatch: counts.burns / counts.matches,
    scorcherShare: (100 * counts.scorcher) / counts.goals,
    topScorerGoals: mean(topScorer),
    topScorerMax: Math.max(...topScorer),
    shieldPoints: mean(shieldPts),
    bottomPoints: mean(bottomPts),
    minChampions: Number.isFinite(minChampions) ? minChampions : NaN,
    maxTitles: Number.isFinite(minChampions) ? maxTitles : NaN,
    avgChampions: mean(windowChampions),
    avgMaxTitles: mean(windowMaxTitles),
    careerMedian: median(goodCareers),
    careerAllMedian: median(careers.filter((c) => c >= 2)),
    oneSeasonShare: careers.length ? (100 * careers.filter((c) => c === 1).length) / careers.length : NaN,
    ratingDrift: mean(drifts),
    avgOverall: mean(finalAvg),
    freeAgents: mean(freeAgents),
    subsPerMatch: counts.subs / counts.matches,
    injuriesPerSeason: counts.injuries / totalSeasons,
  };
}

/**
 * Report lines with OK / !! markers.
 * @param {Record<string, number>} metrics
 * @returns {{ lines: string[], failures: string[] }}
 */
export function formatBalance(metrics) {
  const lines = ['Metric                                               Value     Target'];
  /** @type {string[]} */
  const failures = [];
  for (const [key, t] of Object.entries(TARGETS)) {
    const v = metrics[key];
    const unit = t.unit ?? '';
    const value = Number.isNaN(v) ? 'n/a' : `${v.toFixed(t.digits ?? 1)}${unit}`;
    const hasTarget = t.min !== undefined || t.max !== undefined;
    const target = !hasTarget ? '' : t.min !== undefined && t.max !== undefined ? `${t.min}–${t.max}${unit}`
      : t.min !== undefined ? `≥ ${t.min}${unit}` : `≤ ${t.max}${unit}`;
    const ok = !hasTarget || (!Number.isNaN(v) && (t.min === undefined || v >= t.min) && (t.max === undefined || v <= t.max));
    if (!ok) failures.push(t.label);
    lines.push(`${hasTarget ? (ok ? 'OK' : '!!') : '  '}  ${t.label.padEnd(48)} ${value.padStart(8)}   ${target}`);
  }
  return { lines, failures };
}

if (import.meta.main) {
  try {
    const options = parseBalanceArgs(process.argv.slice(2));
    const started = performance.now();
    console.log(`Balance: ${options.leagues} league(s) × ${options.seasons} season(s), seeds "${options.seed}-1…${options.leagues}"`);
    if (Object.keys(options.override).length) console.log(`Override: ${JSON.stringify(options.override)}`);
    const { lines, failures } = formatBalance(await runBalance(options));
    console.log('');
    for (const line of lines) console.log(line);
    console.log('');
    console.log(failures.length ? `${failures.length} target(s) missed.` : 'All targets met.');
    console.log(`(${((performance.now() - started) / 1000).toFixed(1)}s)`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
