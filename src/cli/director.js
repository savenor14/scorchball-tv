// The Director's watchers (Task 263; docs/director.md §7): rebuild the live league to a moment, propose for the desk
// (Task 264), check each rule change against the balance targets, and write the proposals.
// Usage: npm run director -- [--at 2026-10-18T22:00:00-04:00] [--seed S] [--override '{"director":{...}}'] [--no-check]
//   --at        the moment (default now); the league is rebuilt to its last finished season
//   --override  deep-merged into the config first (try a tighter band, another lever, a test rule change)
//   --no-check  skip the balance check (a few seconds a proposal)
// Writes output/director/proposals.json and prints a summary.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createCalendar } from '../channel/calendar.js';
import { ConfigError, validateConfig } from '../config.js';
import { dayTimeOf, finishedSeasons, measureSeasons, pollProposals, ruleProposals, changeAt } from '../director/watchers.js';
import { deepMerge } from '../util.js';
import { formatBalance, runBalance } from './balance.js';
import { secretSeed } from './daykey.js';
import { readRejections, serviceLines } from './directorDesk.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * @typedef {object} DirectorOptions
 * @property {number} at  Epoch ms.
 * @property {string | null} seed  null: the live league's (the secret SCORCHBALL_SEED when live.mode is "keys").
 * @property {any} override
 * @property {boolean} check
 * @property {string} votesFile
 * @property {string} out
 */

/** @param {string[]} argv @returns {DirectorOptions} */
export function parseDirectorArgs(argv) {
  const { values } = parseArgs({ args: argv, strict: true, options: {
    at: { type: 'string' }, seed: { type: 'string' }, override: { type: 'string' }, 'no-check': { type: 'boolean', default: false },
  } });
  const at = values.at ? Date.parse(values.at) : Date.now();
  if (Number.isNaN(at)) throw new Error(`--at must be a date-time like 2026-10-18T22:00:00-04:00 (got "${values.at}")`);
  let override = {};
  if (values.override) {
    try {
      override = JSON.parse(values.override);
    } catch {
      throw new Error('--override must be JSON, e.g. \'{"director":{"watchers":[...]}}\'');
    }
  }
  return {
    at, seed: values.seed ?? null, override, check: !values['no-check'],
    votesFile: join(PROJECT_ROOT, 'output', 'audience', 'votes.jsonl'),
    out: join(PROJECT_ROOT, 'output', 'director', 'proposals.json'),
  };
}

/**
 * Run the watchers.
 * @param {DirectorOptions} o
 * @param {(line: string) => void} [say]  Progress, as it goes.
 */
export async function runDirector(o, say = () => {}) {
  const config = structuredClone(await loadConfigFromDisk());
  deepMerge(config, o.override);
  const errors = validateConfig(config);
  if (errors.length) throw new ConfigError(errors);
  // With day keys the live league is the secret seed's (Task 278): named, never printed or written.
  const keys = config.settings.live.mode === 'keys' && o.seed === null;
  const seed = o.seed ?? (keys ? secretSeed() : config.settings.live.seed);
  if (!seed) throw new Error('No seed: the live league plays from day keys, so set SCORCHBALL_SEED in .env (never in the repo).');
  const seedName = keys ? 'SCORCHBALL_SEED' : seed;
  const calendar = createCalendar(config);
  const season = calendar.seasonAt(o.at);
  const finished = finishedSeasons(config, calendar, o.at);
  say(`Season ${season}; ${finished} finished. Rebuilding "${seedName}"…`);
  const measures = finished > 0 ? measureSeasons(config, seed, finished) : [];
  // A rule change takes effect next season, quietly (Task 265); a poll's result is announced from now.
  const now = dayTimeOf(calendar, o.at, config.settings.calendar.seasonDays);
  // Rejected on the desk (Task 264): a watcher silenced until its measure is back in its band; a poll's result never again.
  const rejections = await readRejections();
  const rules = ruleProposals(config, measures, season + 1, rejections);
  // The dev server's votes and the live site's (the audience service, with AUDIENCE_TOKEN; Task 278).
  const votes = [...(await readVotes(o.votesFile)), ...((await serviceLines(PROJECT_ROOT, config.settings.audience.service, 'votes')) ?? [])];
  const polls = pollProposals(config, calendar, o.at, votes, now, rejections);

  /** @type {Record<string, { ok: boolean, broken: string[] }>} */
  const checks = {};
  if (o.check && rules.length) {
    const opts = { leagues: config.director.check.leagues, seasons: config.director.check.seasons, seed: 'director-check' };
    say(`Checking ${rules.length} rule change${rules.length === 1 ? '' : 's'} against the balance targets…`);
    const before = formatBalance(await runBalance({ ...opts, override: o.override })).failures;
    for (const p of rules) {
      const after = formatBalance(await runBalance({ ...opts, override: deepMerge(structuredClone(o.override), { rules: changeAt(p.lever.path, p.lever.to) }) })).failures;
      // It fails only by breaking a target the unchanged league meets (some, like the titles, wobble on their own).
      const broken = after.filter((f) => !before.includes(f));
      checks[p.id] = { ok: broken.length === 0, broken };
    }
  }
  const proposals = [
    ...rules.map((p) => ({ ...p, check: checks[p.id] ?? null })),
    ...polls,
  ];
  const report = { at: new Date(o.at).toISOString(), seed: seedName, season, finished, measures: measures.map((m) => ({ ...m, goalsPerMatch: round(m.goalsPerMatch), scorcherShare: round(m.scorcherShare), burnsPerMatch: round(m.burnsPerMatch) })), proposals };
  await mkdir(dirname(o.out), { recursive: true });
  await writeFile(o.out, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

/** The votes kept by the audience endpoint, if any. @param {string} file @returns {Promise<{ pollId: string, optionId: string }[]>} */
async function readVotes(file) {
  try {
    return (await readFile(file, 'utf8')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/** @param {number} x */
const round = (x) => Number(x.toFixed(2));

/** The summary printed. @param {Awaited<ReturnType<typeof runDirector>>} r @returns {string[]} */
export function formatDirector(r) {
  const lines = [`The Director at ${r.at}: season ${r.season}, ${r.finished} finished (seed "${r.seed}").`];
  const last = r.measures.slice(-5);
  if (last.length) {
    lines.push('', 'Season  Goals/match  Scorchers  Burns/match');
    for (const m of last) lines.push(`${String(m.season).padStart(6)}  ${m.goalsPerMatch.toFixed(2).padStart(11)}  ${m.scorcherShare.toFixed(1).padStart(8)}%  ${m.burnsPerMatch.toFixed(2).padStart(11)}`);
  }
  lines.push('');
  if (!r.proposals.length) lines.push('No proposals: every measure is in its band, and no closed poll is waiting for its result.');
  for (const p of /** @type {any[]} */ (r.proposals)) {
    if (p.kind === 'rule_change') {
      const seasons = p.evidence.seasons.map((/** @type {any} */ s) => `S${s.season} ${s.value}`).join(', ');
      lines.push(`RULE CHANGE ${p.id}: ${p.evidence.measure} ${p.evidence.side} (band ${p.evidence.band.join('–')}): ${seasons}`);
      lines.push(`  ${p.lever.path} ${p.lever.from} → ${p.lever.to} from season ${p.change.season} (aiming at about ${p.lever.expected}); quiet, never announced`);
      lines.push(`  "${p.change.reason}"`);
      lines.push(`  Balance check: ${p.check === null ? 'skipped' : p.check.ok ? 'every target the league meets today still met' : `breaks ${p.check.broken.join(', ')}`}`);
    } else {
      const top = Object.entries(/** @type {Record<string, number>} */ (p.votes)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, n]) => `${id} ${n}`).join(', ');
      lines.push(`POLL RESULT ${p.id}: "${p.question}" ${p.total} votes (${top || 'none'}); announced S${p.result.announced.season} ${p.result.announced.at}`);
    }
  }
  return lines;
}

if (import.meta.main) {
  try {
    const report = await runDirector(parseDirectorArgs(process.argv.slice(2)), (line) => console.log(line));
    console.log(formatDirector(report).join('\n'));
    console.log(`\nWritten: output/director/proposals.json`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
