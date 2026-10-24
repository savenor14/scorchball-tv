// The day keys (the launch, Task 271; docs/live.md §5): the live league's seed is secret, so each day's random streams
// are published as a key, keys/s<season>d<day>.json, and the channel plays only the days it has keys for. A day runs
// from 00:00 to the next 00:00 in the league's time zone, as the TV guide's day (guide.js dayAround). npm run daykey
// makes them (src/cli/daykey.js); this finds a moment's day and loads keys in the browser.
import { keyStreams, mergeKeys } from '../sim/streams.js';

const DAY_MINUTES = 1440;

/**
 * @typedef {{ season: number, day: number, from: number, until: number, name: string }} KeyDay  `day` from 0 (Monday);
 *   `name` the file's, e.g. "s3d2".
 */

/**
 * The key day a moment falls in (one before season 1 counts as its first day: the founding league's streams are in it).
 * @param {import('./calendar.js').Calendar} calendar @param {number} t  Epoch ms.
 * @returns {KeyDay}
 */
export function keyDay(calendar, t) {
  const season = calendar.seasonAt(t);
  const end = calendar.seasonStart(season + 1);
  for (let day = 0; ; day++) {
    const until = Math.min(calendar.instant(season, (day + 1) * DAY_MINUTES), end);
    if (t < until || until >= end) return { season, day, from: calendar.instant(season, day * DAY_MINUTES), until, name: `s${season}d${day}` };
  }
}

/** The day after. @param {import('./calendar.js').Calendar} calendar @param {KeyDay} d */
export const nextKeyDay = (calendar, d) => keyDay(calendar, d.until);

/**
 * Every key day from the league's first (or season `from`'s first) through the one holding `t`.
 * @param {import('./calendar.js').Calendar} calendar @param {number} t @param {number} [from]
 * @returns {KeyDay[]}
 */
export function keyDaysThrough(calendar, t, from = 1) {
  const last = keyDay(calendar, t);
  const days = [keyDay(calendar, calendar.seasonStart(from))];
  while (days.at(-1)?.name !== last.name) days.push(nextKeyDay(calendar, /** @type {KeyDay} */ (days.at(-1))));
  return days;
}

/** A day key's file. @param {KeyDay} d */
export const keyPath = (d) => `keys/${d.name}.json`;

/**
 * The live channel's keys (browser): every day's up to `now` and tomorrow's if it's out yet; topped up as days pass.
 * `has(t)` says whether the day holding t can be played; a day missing means a "back soon" card, not a guess.
 * @param {import('./calendar.js').Calendar} calendar
 * @param {(path: string) => Promise<any | null>} fetchJson  null for a key not published yet.
 * @param {{ fromSeason?: number, book?: import('../sim/streams.js').KeyBook }} [o]  From a snapshot (Task 272): the
 *   days from its season, its own entries to start with.
 */
export async function loadDayKeys(calendar, fetchJson, { fromSeason = 1, book: start } = {}) {
  /** @type {Set<string>} */
  const have = new Set();
  const book = mergeKeys(start ? [start] : []);
  /** @param {KeyDay} d */
  const fetchDay = async (d) => {
    if (have.has(d.name)) return true;
    const key = await fetchJson(keyPath(d));
    if (!key) return false;
    Object.assign(book.streams, key.streams);
    Object.assign(book.values, key.values);
    have.add(d.name);
    return true;
  };
  const keys = {
    book,
    streams: keyStreams(book),
    /** Whether the day holding `t` has its key. @param {number} t */
    has: (t) => have.has(keyDay(calendar, t).name),
    fromSeason,
    /**
     * Fetch every day's key through the day after `t` that isn't in yet (the days in order; tomorrow's may not be out).
     * @param {number} t
     */
    async topUp(t) {
      const days = keyDaysThrough(calendar, t, fromSeason);
      days.push(nextKeyDay(calendar, /** @type {KeyDay} */ (days.at(-1))));
      await Promise.all(days.filter((d) => !have.has(d.name)).map(fetchDay));
    },
  };
  return keys;
}
