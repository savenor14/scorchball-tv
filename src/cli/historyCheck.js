// The history check (the launch, Task 272; docs/live.md §2): before a publish, play every published day again with
// this code, from the latest snapshot and the day keys after it, and compare each match with the fingerprint its day
// key recorded when it was first played. Any difference means this code would change what viewers have watched (or
// will watch this week, from keys already out), so the publish stops. npm run publish runs it whenever there are keys.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCalendar } from '../channel/calendar.js';
import { keyDaysThrough } from '../channel/dayKeys.js';
import { LiveLeague } from '../channel/liveLeague.js';
import { matchFingerprint, restoreLive } from '../channel/snapshot.js';
import { keyStreams, mergeKeys } from '../sim/streams.js';

/**
 * @param {import('../config.js').Config} config @param {string} root  Where keys/ and snapshots/ are.
 * @returns {{ checked: number, from: string, problems: string[] } | null}  null when there are no keys to check.
 */
export function checkHistory(config, root) {
  const keyDir = join(root, 'keys');
  if (!existsSync(keyDir)) return null;
  const read = (/** @type {string} */ file) => JSON.parse(readFileSync(file, 'utf8'));
  /** @type {Map<string, any>} */
  const keys = new Map(readdirSync(keyDir).filter((f) => /^s\d+d\d+\.json$/.test(f)).map((f) => [f.slice(0, -5), read(join(keyDir, f))]));
  if (keys.size === 0) return null;
  const calendar = createCalendar(config);
  const snapDir = join(root, 'snapshots');
  const seasons = existsSync(snapDir) ? readdirSync(snapDir).map((f) => /^s(\d+)\.json$/.exec(f)?.[1]).filter(Boolean).map(Number) : [];
  const snap = seasons.length ? read(join(snapDir, `s${Math.max(...seasons)}.json`)) : null;
  const fromSeason = snap?.season ?? 1;
  // The published days from the snapshot's season (or the first), in order, up to the last one out.
  const last = [...keys.values()].reduce((a, k) => (k.season > a.season || (k.season === a.season && k.day > a.day) ? k : a));
  const lastDay = keyDaysThrough(calendar, calendar.instant(last.season, last.day * 1440 + 1), fromSeason);
  /** @type {string[]} */
  const problems = [];
  const missing = lastDay.filter((d) => !keys.has(d.name)).map((d) => d.name);
  if (missing.length) problems.push(`day keys missing: ${missing.join(', ')}`);
  const book = mergeKeys([snap?.keys ?? {}, ...lastDay.filter((d) => keys.has(d.name)).map((d) => keys.get(d.name))]);
  const streams = keyStreams(book);
  const end = /** @type {import('../channel/dayKeys.js').KeyDay} */ (lastDay.at(-1)).until - 1;
  let checked = 0;
  try {
    const live = snap ? restoreLive(config, snap, { now: snap.at, streams }) : new LiveLeague(config, { now: lastDay[0].from - 1, streams });
    for (const d of lastDay) {
      live.advanceTo(d.until - 1);
      const played = keys.get(d.name)?.played ?? {};
      for (const [id, want] of Object.entries(played)) {
        const m = live.matches.get(id);
        checked++;
        if (!m) problems.push(`${d.name}: ${id} wasn't played`);
        else if (matchFingerprint(m) !== want) problems.push(`${d.name}: ${id} plays differently`);
      }
    }
    if (end > live.now) live.advanceTo(end);
  } catch (err) {
    problems.push(`the league couldn't be played: ${err instanceof Error ? err.message : err}`);
  }
  return { checked, from: snap ? `the season ${snap.season} snapshot` : 'the first day', problems };
}
