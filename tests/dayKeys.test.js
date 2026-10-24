// The day keys (the launch, Task 271; docs/live.md §5): a league played from published keys is the league played from
// its secret seed, event for event; a day without its key can't be played; no key gives the seed away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { keyDay, keyDaysThrough, loadDayKeys } from '../src/channel/dayKeys.js';
import { buildDay } from '../src/channel/guide.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createTimeline } from '../src/channel/timeline.js';
import { makeDayKeys } from '../src/cli/daykey.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { MissingKeyError, keyStreams, mergeKeys } from '../src/sim/streams.js';

const config = await loadConfigFromDisk();
const calendar = createCalendar(config);
const SECRET = 'day-keys-test-secret';
// Two seasons and the first two days of the third: two off-seasons, two season starts.
const through = calendar.instant(3, 1440 + 60);
const keys = makeDayKeys(config, SECRET, through);
const all = mergeKeys([...keys.values()]);

/** Everything a league did, as one string (but the seed's name: the secret on one side, "keys" on the other). @param {LiveLeague} live */
const story = (live) => JSON.stringify([{ ...live.league, seed: null }, [...live.matches.values()].map((m) => [m.id, m.summary])]);

test('a key for every day, Monday to Sunday, the founding league in the first', () => {
  const names = [...keys.keys()];
  assert.equal(names.length, 16);
  assert.deepEqual(names.slice(0, 8), ['s1d0', 's1d1', 's1d2', 's1d3', 's1d4', 's1d5', 's1d6', 's2d0']);
  const first = /** @type {any} */ (keys.get('s1d0'));
  assert.ok(first.streams['s1|league-setup'] && first.streams['s1|schedule']);
  // The final's day holds the off-season and the next season's start.
  const sunday = /** @type {any} */ (keys.get('s1d6'));
  assert.ok(sunday.streams['s1|draft'] && sunday.streams['s2|schedule'] && sunday.values['s2|lots'] !== undefined);
});

test('the league played from the keys is the league played from the seed, event for event', () => {
  const fromSeed = new LiveLeague(config, { now: through, seed: SECRET });
  const fromKeys = new LiveLeague(config, { now: through, streams: keyStreams(all) });
  assert.ok(fromSeed.matches.size > 50); // the live league keeps this season's and last season's
  assert.equal(story(fromKeys), story(fromSeed));
});

test('a day without its key stops the league rather than guess', () => {
  const upTo = mergeKeys([...keys.values()].slice(0, 9)); // through s2d1
  const live = new LiveLeague(config, { now: calendar.instant(2, 1440 + 60), streams: keyStreams(upTo) });
  assert.throws(() => live.advanceTo(calendar.instant(2, 2 * 1440 + 60)), MissingKeyError);
});

test('no key gives the seed away', () => {
  for (const [name, key] of keys) assert.ok(!JSON.stringify(key).includes(SECRET), name);
  // Another seed's keys share nothing.
  const other = makeDayKeys(config, 'another-secret', calendar.instant(1, 60));
  const mine = new Set(Object.values(/** @type {any} */ (keys.get('s1d0')).streams));
  for (const hex of Object.values(/** @type {any} */ (other.get('s1d0')).streams)) assert.ok(!mine.has(hex));
});

test('a day\'s key holds everything its TV guide needs, with only the days before it', () => {
  /** @type {Map<string, any>} */
  const tls = new Map();
  const timelineOf = (/** @type {any} */ m) => tls.get(m.id) ?? tls.set(m.id, createTimeline(m, config)).get(m.id);
  for (const name of ['s1d3', 's1d6', 's2d0']) {
    const names = [...keys.keys()];
    const upTo = mergeKeys(names.slice(0, names.indexOf(name) + 1).map((n) => /** @type {any} */ (keys.get(n))));
    const day = keyDaysThrough(calendar, through).find((d) => d.name === name);
    const guide = buildDay(config, /** @type {any} */ (day).from + 3_600_000, 'unused', timelineOf, keyStreams(upTo));
    assert.ok(guide.entries.length > 5, name);
  }
});

test('the browser loads every day through today and tomorrow\'s once it\'s out, and says which days it can play', async () => {
  const asked = [];
  const now = calendar.instant(1, 2 * 1440 + 600); // day 3, 10:00
  const published = new Set(['s1d0', 's1d1', 's1d2']); // tomorrow's not out yet
  const loaded = await loadDayKeys(calendar, async (path) => {
    asked.push(path);
    const name = path.slice('keys/'.length, -'.json'.length);
    return published.has(name) ? keys.get(name) : null;
  });
  await loaded.topUp(now);
  assert.deepEqual(asked.sort(), ['keys/s1d0.json', 'keys/s1d1.json', 'keys/s1d2.json', 'keys/s1d3.json']);
  assert.ok(loaded.has(now) && !loaded.has(keyDay(calendar, now).until));
  published.add('s1d3');
  await loaded.topUp(now);
  assert.ok(loaded.has(keyDay(calendar, now).until), 'tomorrow, once out');
  const live = new LiveLeague(config, { now: keyDay(calendar, now).until + 3_600_000, streams: loaded.streams });
  assert.ok(live.matches.size > 0);
});
