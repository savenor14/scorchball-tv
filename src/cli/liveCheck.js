// The live check (2026-10-19; docs/live.md §5): run before every push. The daily job (.github/workflows/daykeys.yml)
// makes tomorrow's day key from the secret live seed and refuses to rewrite any published key or snapshot this code
// would make differently; it runs in the cloud after a push, so a change that trips it (as the grounds' names did, by
// changing the snapshot's text) is only found there, and a refused run means no new day key: BACK SOON on the channel.
// This makes the same keys and snapshots here, in memory, from SCORCHBALL_SEED in .env (never printed), compares each
// with the published file, and runs npm run publish's history check too. Nothing is written.
// Usage: npm run livecheck [-- --through <YYYY-MM-DD | today | tomorrow>]
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createCalendar } from '../channel/calendar.js';
import { keyPath } from '../channel/dayKeys.js';
import { snapshotPath } from '../channel/snapshot.js';
import { makeDayKeys, secretSeed, throughMoment } from './daykey.js';
import { checkHistory } from './historyCheck.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

/**
 * Compare what this code makes with what's published under `root`.
 * @param {import('../config.js').Config} config @param {string} seed @param {number} through @param {string} root
 * @returns {{ same: number, fresh: string[], different: string[] }}  fresh: not published yet (the next run's to write).
 */
export function compareWithPublished(config, seed, through, root) {
  const result = { same: 0, fresh: /** @type {string[]} */ ([]), different: /** @type {string[]} */ ([]) };
  /** @param {string} rel @param {any} data */
  const compare = (rel, data) => {
    const file = join(root, rel);
    if (!existsSync(file)) result.fresh.push(rel);
    else if (readFileSync(file, 'utf8') === `${JSON.stringify(data)}\n`) result.same++;
    else result.different.push(rel);
  };
  const keys = makeDayKeys(config, seed, through, (snap) => compare(snapshotPath(snap.season), snap));
  for (const [name, key] of keys) compare(keyPath({ name, season: 0, day: 0, from: 0, until: 0 }), key);
  return result;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { through: { type: 'string', default: 'tomorrow' } } });
  const root = resolve(import.meta.dirname, '..', '..');
  const seed = secretSeed();
  if (!seed) {
    console.error('Live check: no SCORCHBALL_SEED in the environment or .env, so the daily job\'s check can\'t be run here. Don\'t push without it.');
    process.exit(1);
  }
  const config = await loadConfigFromDisk();
  const t0 = performance.now();
  const r = compareWithPublished(config, seed, throughMoment(/** @type {string} */ (values.through), createCalendar(config)), root);
  const history = checkHistory(config, root);
  const problems = [
    ...r.different.map((f) => `${f} would come out different with this code (the daily job would refuse it and stop: no new day key)`),
    ...(history?.problems ?? []).map((p) => `history check: ${p}`),
  ];
  const fresh = r.fresh.length ? `; not yet published, for the job to write: ${r.fresh.join(', ')}` : '';
  if (problems.length) {
    console.error(`Live check FAILED: don't push.\n  ${problems.join('\n  ')}`);
    console.error('If the change is the channel\'s alone, keep it out of the league (src/sim/league.js CHANNEL_ONLY; docs/live.md §5).');
    process.exit(1);
  }
  console.log(`Live check passed: ${r.same} published keys and snapshots as this code makes them${fresh}; history check ${history ? `${history.checked} matches as first played` : 'no keys'}; in ${((performance.now() - t0) / 1000).toFixed(1)} s.`);
}
