// The day keys (the launch, Task 271; docs/live.md §5): plays the live league day by day from its secret seed, noting
// every random stream (and published value) each day uses, and writes them as keys/s<season>d<day>.json, the only
// randomness a browser gets. The seed comes from SCORCHBALL_SEED (the environment, or .env), never the repo.
// Usage: npm run daykey -- --through <YYYY-MM-DD | today | tomorrow> [--out .]
// Every day from the first through that one is written (the same seed always writes the same keys), and a snapshot at
// each season's start from season 2 (Task 272): snapshots/s<season>.json, so browsers load it and this week's keys.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createCalendar } from '../channel/calendar.js';
import { keyDay, keyDaysThrough, keyPath } from '../channel/dayKeys.js';
import { LiveLeague } from '../channel/liveLeague.js';
import { keysForSeasons, matchFingerprint, snapshotPath, takeSnapshot } from '../channel/snapshot.js';
import { mergeKeys, recordingStreams, seedStreams } from '../sim/streams.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

/**
 * @typedef {{ season: number, day: number, streams: Record<string, string>, values: Record<string, any>, played: Record<string, string> }} DayKeyFile
 *   `played`: each match kicked off that day, by its fingerprint (the history check, Task 272).
 */

/**
 * Every day's key from the league's first through the day holding `through`, and the snapshots of the seasons that
 * start by then (`onSnapshot`, each as it's taken: a season's start, after the day before it is played).
 * @param {import('../config.js').Config} config @param {string} seed @param {number} through  Epoch ms.
 * @param {(snap: import('../channel/snapshot.js').Snapshot) => void} [onSnapshot]
 * @returns {Map<string, DayKeyFile>}
 */
export function makeDayKeys(config, seed, through, onSnapshot) {
  const calendar = createCalendar(config);
  const days = keyDaysThrough(calendar, through);
  /** @type {Map<string, DayKeyFile>} */
  const keys = new Map(days.map((d) => [d.name, { season: d.season, day: d.day, streams: {}, values: {}, played: {} }]));
  /** The day being played: what it asks for goes in its key, unless an earlier day's key already has it. */
  let current = days[0].name;
  /** @type {Set<string>} */
  const published = new Set();
  const streams = recordingStreams(/** @type {any} */ (seedStreams(seed)), seed, (kind, id, value) => {
    if (published.has(id)) return;
    published.add(id);
    const key = /** @type {any} */ (keys.get(current));
    if (kind === 'stream') key.streams[id] = value;
    else key.values[id] = value;
  });
  // The founding league and season 1's start (its schedule, its lots) are made with the league: the first day's key.
  const live = new LiveLeague(config, { now: days[0].from - 1, streams });
  days.forEach((d, i) => {
    current = d.name;
    live.advanceTo(d.until - 1);
    // Each match played that day, by its fingerprint: the history check plays them again (Task 272).
    const key = /** @type {DayKeyFile} */ (keys.get(d.name));
    for (const m of live.matches.values()) if (m.kickoff >= d.from && m.kickoff < d.until) key.played[m.id] = matchFingerprint(m);
    const next = days[i + 1];
    if (onSnapshot && next && next.season !== d.season) {
      const made = mergeKeys([...keys.values()]);
      onSnapshot(takeSnapshot(live, next.season, keysForSeasons(made, [d.season, next.season])));
    }
  });
  return keys;
}

/** The secret seed: SCORCHBALL_SEED from the environment, or from .env (the Director's too, Task 278). @returns {string | null} */
export function secretSeed() {
  if (process.env.SCORCHBALL_SEED) return process.env.SCORCHBALL_SEED;
  const env = resolve(import.meta.dirname, '..', '..', '.env');
  if (existsSync(env)) {
    const line = readFileSync(env, 'utf8').split(/\r?\n/).find((l) => l.startsWith('SCORCHBALL_SEED='));
    if (line) return line.slice('SCORCHBALL_SEED='.length).trim();
  }
  return null;
}

/**
 * A date ("2026-11-02"), today or tomorrow, as a moment inside that day in the league's zone.
 * @param {string} through @param {import('../channel/calendar.js').Calendar} calendar
 */
export function throughMoment(through, calendar) {
  const now = Date.now();
  if (through === 'today') return now;
  if (through === 'tomorrow') return keyDay(calendar, now).until;
  const t = Date.parse(`${through}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(through) || Number.isNaN(t)) throw new Error(`--through: a date like 2026-11-02, today or tomorrow (got "${through}")`);
  return t;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { through: { type: 'string', default: 'tomorrow' }, out: { type: 'string', default: '.' }, force: { type: 'boolean', default: false } } });
  const seed = secretSeed();
  if (!seed) {
    console.error('No seed: set SCORCHBALL_SEED in the environment or in .env (never in the repo).');
    process.exit(1);
  }
  const config = await loadConfigFromDisk();
  const calendar = createCalendar(config);
  const t0 = performance.now();
  const root = resolve(/** @type {string} */ (values.out));
  mkdirSync(join(root, 'keys'), { recursive: true });
  mkdirSync(join(root, 'snapshots'), { recursive: true });
  // Published keys and snapshots are history: one that would come out different (new code playing an aired day
  // differently) is never rewritten, unless --force (a dev or rehearsal league; never the live one). Task 272.
  /** @type {string[]} */
  const changed = [];
  const counts = { keys: 0, snapshots: 0 };
  /** @param {string} rel @param {any} data @param {'keys' | 'snapshots'} kind */
  const write = (rel, data, kind) => {
    const file = join(root, rel);
    const text = `${JSON.stringify(data)}\n`;
    if (existsSync(file)) {
      if (readFileSync(file, 'utf8') === text) return;
      if (!values.force) {
        changed.push(rel);
        return;
      }
    }
    writeFileSync(file, text);
    counts[kind]++;
  };
  const keys = makeDayKeys(config, seed, throughMoment(/** @type {string} */ (values.through), calendar), (snap) => write(snapshotPath(snap.season), snap, 'snapshots'));
  for (const [name, key] of keys) write(keyPath({ name, season: 0, day: 0, from: 0, until: 0 }), key, 'keys');
  const last = [...keys.keys()].at(-1);
  console.log(`Day keys through ${last}: ${keys.size} days, ${counts.keys} keys and ${counts.snapshots} snapshots written; in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
  if (changed.length) {
    console.error(`These would come out different with this code, so were left as they are (history can't change; --force for a dev league): ${changed.join(', ')}`);
    process.exit(1);
  }
}
