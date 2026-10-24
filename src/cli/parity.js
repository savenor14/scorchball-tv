// Parity report, the long view (Task 228): runs several seeded leagues for 40 seasons and checks the
// long-view targets in docs/simulation.md §10b (Cups per team, droughts, runs in the bottom half, how
// often players change clubs). Beside each number, what a league of pure luck would show. A developer tool.
// Usage: npm run parity -- [--seasons 40] [--leagues 5] [--seed parity] [--override '{"rules":{...}}']
import { parseArgs } from 'node:util';
import { ConfigError, validateConfig } from '../config.js';
import { deepMerge } from '../util.js';
import { EventLog } from '../chronicle/eventLog.js';
import { createLeague } from '../sim/league.js';
import { runOffseason } from '../sim/offseason.js';
import { createRng } from '../sim/rng.js';
import { runSeason } from '../sim/season.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

/**
 * Targets (Tom, 2026-10-09; Cups and droughts reset after the baseline, since luck itself missed them: the drought for information, places moved added). Each league's value is its worst team (or its whole share); a target is judged
 * on the average over the leagues, the worst league shown beside it.
 * @type {Record<string, { label: string, min?: number, max?: number, digits?: number, unit?: string }>}
 */
export const PARITY_TARGETS = {
  maxCups: { label: 'Most Cups by one team', max: 9, digits: 1 },
  minCups: { label: 'Fewest Cups by one team', digits: 1 },
  maxPennants: { label: 'Most Pennants by one team', digits: 1 },
  champions: { label: 'Different Cup winners', digits: 1 },
  longestDrought: { label: 'Longest Cup drought (seasons)', digits: 1 },
  // 10 since Task 233 (Tom): a bad team takes a few seasons to rebuild, which pure luck's independent seasons (7.6) don't allow.
  longestBottomRun: { label: 'Longest run in the bottom half', max: 10, digits: 1 },
  placeMove: { label: 'Places a team moves a season (avg)', min: 2.2, digits: 2 },
  movesPerOffseason: { label: 'Moves per off-season', min: 2, digits: 1 },
  signingsPerOffseason: { label: 'Signings per off-season (all)', digits: 1 },
  twoClubShare: { label: 'Careers of 5+ seasons at 2+ clubs', min: 50, digits: 1, unit: '%' },
};

/**
 * @typedef {object} ParitySeason  What the report needs of one season.
 * @property {string} championId
 * @property {string} shieldId
 * @property {string[]} order  The regular-season table, top first.
 */

/**
 * The table-and-Cups metrics of one league's seasons. A drought counts every season in a row without a
 * Cup, including a run still open at the end (or never ended: a team with no Cup has a drought of every season).
 * @param {ParitySeason[]} seasons
 * @returns {{ maxCups: number, minCups: number, maxPennants: number, champions: number, longestDrought: number, longestBottomRun: number, placeMove: number }}
 */
export function tableMetrics(seasons) {
  const teamIds = seasons[0].order;
  const half = teamIds.length / 2;
  /** @type {Record<string, number>} */ const cups = {};
  /** @type {Record<string, number>} */ const pennants = {};
  let longestDrought = 0;
  let longestBottomRun = 0;
  for (const id of teamIds) {
    cups[id] = 0;
    pennants[id] = 0;
    let drought = 0;
    let bottom = 0;
    for (const s of seasons) {
      if (s.championId === id) { cups[id]++; drought = 0; } else drought++;
      if (s.shieldId === id) pennants[id]++;
      if (s.order.indexOf(id) >= half) bottom++; else bottom = 0;
      longestDrought = Math.max(longestDrought, drought);
      longestBottomRun = Math.max(longestBottomRun, bottom);
    }
  }
  let moved = 0;
  let pairs = 0;
  for (let i = 1; i < seasons.length; i++) {
    for (const id of teamIds) {
      moved += Math.abs(seasons[i].order.indexOf(id) - seasons[i - 1].order.indexOf(id));
      pairs++;
    }
  }
  const cupCounts = Object.values(cups);
  return {
    maxCups: Math.max(...cupCounts),
    minCups: Math.min(...cupCounts),
    maxPennants: Math.max(...Object.values(pennants)),
    champions: cupCounts.filter((c) => c > 0).length,
    longestDrought,
    longestBottomRun,
    placeMove: pairs ? moved / pairs : NaN,
  };
}

/**
 * A league of pure luck: every season's table a random order and the Cup a random team's. What the
 * table-and-Cups metrics look like when nobody is better than anybody, averaged over many leagues.
 * @param {number} teams @param {number} seasons @param {string} seed @param {number} [runs]
 * @returns {{ mean: Record<string, number>, worst: Record<string, number> }}
 */
export function luckMetrics(teams, seasons, seed, runs = 500) {
  const rng = createRng(`${seed}|luck`);
  const ids = Array.from({ length: teams }, (_, i) => `t${i}`);
  /** @type {Record<string, number>[]} */
  const all = [];
  for (let r = 0; r < runs; r++) {
    /** @type {ParitySeason[]} */
    const league = [];
    for (let s = 0; s < seasons; s++) {
      const order = rng.shuffle(ids);
      league.push({ order, shieldId: order[0], championId: rng.pick(ids) });
    }
    all.push(tableMetrics(league));
  }
  return summarise(all);
}

/**
 * The mean and the worst (by each target's direction) of per-league metrics.
 * @param {Record<string, number>[]} leagues
 */
export function summarise(leagues) {
  /** @type {Record<string, number>} */ const mean = {};
  /** @type {Record<string, number>} */ const worst = {};
  for (const key of Object.keys(leagues[0])) {
    const xs = leagues.map((l) => l[key]).filter((x) => !Number.isNaN(x));
    const t = PARITY_TARGETS[key];
    mean[key] = xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
    // Worst is the high end unless the target is a minimum (or, for info, fewer is worse: fewest Cups, champions).
    const lowIsWorst = t?.min !== undefined || key === 'champions' || key === 'placeMove' || key === 'minCups';
    worst[key] = xs.length ? (lowIsWorst ? Math.min(...xs) : Math.max(...xs)) : NaN;
  }
  return { mean, worst };
}

/**
 * @typedef {object} ParityOptions
 * @property {number} seasons
 * @property {number} leagues
 * @property {string} seed
 * @property {any} override  Deep-merged into the config, as in the balance report.
 */

/** @param {string[]} argv @returns {ParityOptions} */
export function parseParityArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      seasons: { type: 'string', default: '40' },
      leagues: { type: 'string', default: '5' },
      seed: { type: 'string', default: 'parity' },
      override: { type: 'string' },
    },
    strict: true,
  });
  const seasons = Number(values.seasons);
  const leagues = Number(values.leagues);
  if (!Number.isInteger(seasons) || seasons < 2) throw new Error(`--seasons must be an integer of 2 or more (got "${values.seasons}")`);
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
 * Run the leagues and compute each one's metrics. A move is a signing of a player who has played in
 * the League for another club; a career counts the clubs a player appeared for (regular season or playoffs).
 * @param {ParityOptions} options
 * @returns {Promise<{ leagues: Record<string, number>[], teams: number }>}
 */
export async function runParity(options) {
  const config = structuredClone(await loadConfigFromDisk());
  deepMerge(config, options.override);
  const errors = validateConfig(config);
  if (errors.length > 0) throw new ConfigError(errors);

  /** @type {Record<string, number>[]} */
  const leagues = [];
  let teams = 0;
  for (let l = 0; l < options.leagues; l++) {
    /** @type {Map<string, { seasons: number, clubs: Set<string> }>} */
    const careers = new Map();
    let moves = 0;
    let signings = 0;
    const log = new EventLog({
      sinks: [(e) => {
        if (e.type !== 'signing' || !e.playerId || !e.teamId) return;
        signings++;
        const c = careers.get(e.playerId);
        if (c && !c.clubs.has(e.teamId)) moves++;
      }],
    });
    const league = createLeague(config, `${options.seed}-${l + 1}`, log);
    teams = Object.keys(league.teams).length;

    for (let s = 0; s < options.seasons; s++) {
      const record = runSeason(league, config, log);
      /** @type {Map<string, string>} */
      const playedFor = new Map();
      for (const st of [...Object.values(record.stats.regular), ...Object.values(record.stats.playoffs)]) {
        if (st.appearances > 0) playedFor.set(st.playerId, st.teamId);
      }
      for (const [id, teamId] of playedFor) {
        const c = careers.get(id) ?? { seasons: 0, clubs: new Set() };
        c.seasons++;
        c.clubs.add(teamId);
        careers.set(id, c);
      }
      // The last season's off-season isn't needed: nothing after it is measured.
      if (s < options.seasons - 1) runOffseason(league, config, log, record);
    }

    const long = [...careers.values()].filter((c) => c.seasons >= 5);
    leagues.push({
      ...tableMetrics(league.history.map((h) => ({ championId: h.championId, shieldId: h.shieldId, order: h.table.map((r) => r.teamId) }))),
      movesPerOffseason: moves / (options.seasons - 1),
      signingsPerOffseason: signings / (options.seasons - 1),
      twoClubShare: long.length ? (100 * long.filter((c) => c.clubs.size >= 2).length) / long.length : NaN,
    });
  }
  return { leagues, teams };
}

/**
 * Report lines with OK / !! markers, each league's values and pure luck's beside the average.
 * @param {Record<string, number>[]} leagues
 * @param {{ mean: Record<string, number>, worst: Record<string, number> }} luck
 * @returns {{ lines: string[], failures: string[] }}
 */
export function formatParity(leagues, luck) {
  const { mean, worst } = summarise(leagues);
  const lines = [`Metric                                   Average    Worst   Target     Luck (worst)   Each league`];
  /** @type {string[]} */
  const failures = [];
  for (const [key, t] of Object.entries(PARITY_TARGETS)) {
    const unit = t.unit ?? '';
    const fmt = (/** @type {number | undefined} */ v, digits = t.digits ?? 1) => (v === undefined || Number.isNaN(v) ? 'n/a' : `${v.toFixed(digits)}${unit}`);
    const hasTarget = t.min !== undefined || t.max !== undefined;
    const target = !hasTarget ? '' : t.min !== undefined ? `≥ ${t.min}${unit}` : `≤ ${t.max}${unit}`;
    const v = mean[key];
    const ok = !hasTarget || (!Number.isNaN(v) && (t.min === undefined || v >= t.min) && (t.max === undefined || v <= t.max));
    if (!ok) failures.push(t.label);
    const luckCell = key in luck.mean ? `${fmt(luck.mean[key])} (${fmt(luck.worst[key], key === 'placeMove' ? 2 : 0)})` : '';
    const each = leagues.map((l) => fmt(l[key], key === 'placeMove' ? 2 : Number.isInteger(l[key]) ? 0 : 1)).join(' ');
    lines.push(`${hasTarget ? (ok ? 'OK' : '!!') : '  '}  ${t.label.padEnd(36)} ${fmt(v).padStart(8)} ${fmt(worst[key]).padStart(8)}   ${target.padEnd(9)}  ${luckCell.padEnd(13)}  ${each}`);
  }
  return { lines, failures };
}

if (import.meta.main) {
  try {
    const options = parseParityArgs(process.argv.slice(2));
    const started = performance.now();
    console.log(`Parity, the long view: ${options.leagues} league(s) × ${options.seasons} season(s), seeds "${options.seed}-1…${options.leagues}"`);
    if (Object.keys(options.override).length) console.log(`Override: ${JSON.stringify(options.override)}`);
    const { leagues, teams } = await runParity(options);
    const { lines, failures } = formatParity(leagues, luckMetrics(teams, options.seasons, options.seed));
    console.log('');
    for (const line of lines) console.log(line);
    console.log('');
    console.log('Luck: a league where every table and Cup is drawn at random (500 leagues; its worst in brackets).');
    console.log(failures.length ? `${failures.length} target(s) missed.` : 'All targets met.');
    console.log(`(${((performance.now() - started) / 1000).toFixed(1)}s)`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
