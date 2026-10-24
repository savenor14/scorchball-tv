// Fast-forward runner: simulates whole seasons headlessly (no visuals, no real-time pacing).
// A developer tool for testing balance and reproducing bugs; the live league uses the same engine.
// Usage: npm run ff -- --seasons 10 --seed 42 [--quiet] [--no-events]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { EventLog } from '../chronicle/eventLog.js';
import { createLeague } from '../sim/league.js';
import { runOffseason } from '../sim/offseason.js';
import { runSeason } from '../sim/season.js';
import { createJsonlFileSink } from './jsonlFileSink.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';
import { runSummary, seasonLine, seasonReport } from './report.js';

const DEFAULT_OUTPUT = fileURLToPath(new URL('../../output/', import.meta.url));

/**
 * @typedef {object} FfOptions
 * @property {number} seasons     Number of seasons to simulate.
 * @property {string} seed        League seed; the same seed always produces the same league.
 * @property {boolean} quiet      One line per season instead of full reports.
 * @property {boolean} events     Write the event log to output/ff-<seed>/events.jsonl.
 */

/**
 * Parse fast-forward command-line arguments.
 * @param {string[]} argv  Arguments after the script name.
 * @returns {FfOptions}
 */
export function parseCliArgs(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      seasons: { type: 'string', default: '1' },
      seed: { type: 'string', default: 'flareball' },
      quiet: { type: 'boolean', default: false },
      'no-events': { type: 'boolean', default: false },
    },
    strict: true,
  });

  const seasons = Number(values.seasons);
  if (!Number.isInteger(seasons) || seasons < 1) {
    throw new Error(`--seasons must be a positive integer (got "${values.seasons}")`);
  }
  return { seasons, seed: values.seed, quiet: values.quiet, events: !values['no-events'] };
}

/**
 * The output folder for a seed: output/ff-<seed>, with unsafe characters replaced.
 * @param {string} seed @param {string} [root]
 */
export function outputDir(seed, root = DEFAULT_OUTPUT) {
  return join(root, `ff-${seed.replace(/[^A-Za-z0-9_-]/g, '_')}`);
}

/**
 * Create a league and play `seasons` seasons, each followed by its off-season.
 * Writes summary.json (and events.jsonl unless disabled) to the output folder.
 * @param {FfOptions} options
 * @param {{ print?: (line: string) => void, outputRoot?: string }} [io]
 * @returns {Promise<{ league: import('../sim/league.js').League, dir: string, events: number }>}
 */
export async function fastForward(options, { print = console.log, outputRoot = DEFAULT_OUTPUT } = {}) {
  const config = await loadConfigFromDisk();
  const dir = outputDir(options.seed, outputRoot);
  mkdirSync(dir, { recursive: true });
  const file = options.events ? createJsonlFileSink(join(dir, 'events.jsonl')) : null;
  const log = new EventLog({ sinks: file ? [file.sink] : [] });
  const started = performance.now();

  print(`Scorchball fast-forward: ${options.seasons} season(s), seed "${options.seed}"`);
  print('');
  const league = createLeague(config, options.seed, log);
  try {
    for (let i = 0; i < options.seasons; i++) {
      const record = runSeason(league, config, log);
      const offseason = runOffseason(league, config, log, record);
      const lines = options.quiet ? [seasonLine(league, record)] : seasonReport(league, record, offseason, config.positions);
      for (const line of lines) print(line);
    }
  } finally {
    file?.close();
  }

  print('');
  for (const line of runSummary(league)) print(line);

  writeFileSync(join(dir, 'summary.json'), `${JSON.stringify({ seed: options.seed, seasons: options.seasons, history: league.history }, null, 2)}\n`);
  const seconds = (performance.now() - started) / 1000;
  print('');
  print(`${options.seasons} season(s), ${log.lastSeq.toLocaleString('en-US')} events in ${seconds.toFixed(1)}s. Output: ${dir}`);
  return { league, dir, events: log.lastSeq };
}

if (import.meta.main) {
  try {
    await fastForward(parseCliArgs(process.argv.slice(2)));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
