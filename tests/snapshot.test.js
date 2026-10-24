// Snapshots (the launch, Task 272; docs/live.md §5): a league carried on from a snapshot plays exactly as one built from
// its first day; a browser needs only the latest snapshot and this week's day keys; no snapshot holds the seed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { keyDaysThrough } from '../src/channel/dayKeys.js';
import { buildDay } from '../src/channel/guide.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { tableAt } from '../src/channel/onScreen.js';
import { restoreLive, takeSnapshot } from '../src/channel/snapshot.js';
import { createTimeline } from '../src/channel/timeline.js';
import { makeDayKeys } from '../src/cli/daykey.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { pack, unpack } from '../src/pack.js';
import { lotsSeedFor } from '../src/sim/season.js';
import { keyStreams, mergeKeys } from '../src/sim/streams.js';

const config = await loadConfigFromDisk();
const calendar = createCalendar(config);
const DAY = 86_400_000;

/** A league's whole state as one string, its seed's name aside. @param {LiveLeague} live */
const whole = (live) => JSON.stringify(pack({ ...live.saveState(), league: { ...live.league, seed: null } }));

test('packing keeps Maps, Sets, shared and frozen objects, undefined and Infinity; it refuses class instances', () => {
  const shared = Object.freeze({ id: 'e1', n: 1 });
  const loop = /** @type {any} */ ({ name: 'loop' });
  loop.self = loop;
  const data = { a: [shared, shared], m: new Map([['k', shared], [2, new Set([1, 2])]]), u: undefined, inf: -Infinity, loop };
  const back = unpack(JSON.parse(JSON.stringify(pack(data))));
  assert.equal(back.a[0], back.a[1], 'one object, not two copies');
  assert.equal(back.m.get('k'), back.a[0]);
  assert.ok(Object.isFrozen(back.a[0]) && !Object.isFrozen(back.a));
  assert.deepEqual([...back.m.get(2)], [1, 2]);
  assert.ok('u' in back && back.u === undefined);
  assert.equal(back.inf, -Infinity);
  assert.equal(back.loop.self, back.loop);
  assert.throws(() => pack({ when: new Date(0) }), /Date/);
});

test('a league carried on from a snapshot is the league built from its first day, through the next off-season', () => {
  const at = calendar.seasonStart(3) - 1;
  const built = new LiveLeague(config, { now: at, seed: 'snapshot-tests' });
  const snap = JSON.parse(JSON.stringify(takeSnapshot(built, 3)));
  const restored = restoreLive(config, snap, { now: at, seed: 'snapshot-tests' });
  for (const t of [at, calendar.seasonStart(3) + 2.5 * DAY, calendar.seasonStart(4) + DAY]) {
    built.advanceTo(t);
    restored.advanceTo(t);
    assert.equal(whole(restored), whole(built), new Date(t).toISOString());
  }
});

// The live channel's way: the secret seed makes the keys and snapshots; a browser has the latest snapshot and this
// week's keys only.
const SECRET = 'snapshot-tests-secret';
const through = calendar.seasonStart(3) + 2 * DAY + 3_600_000;
/** @type {any[]} */
const snapshots = [];
const keys = makeDayKeys(config, SECRET, through, (s) => snapshots.push(JSON.parse(JSON.stringify(s))));
const snap3 = snapshots.find((s) => s.season === 3);
const week = keyDaysThrough(calendar, through, 3).map((d) => /** @type {any} */ (keys.get(d.name)));
const book = mergeKeys([snap3.keys, ...week]);

test('a snapshot at each season\'s start from season 2, none holding the seed', () => {
  assert.deepEqual(snapshots.map((s) => s.season), [2, 3]);
  for (const s of snapshots) {
    assert.ok(!JSON.stringify(s).includes(SECRET));
    assert.equal(s.at, calendar.seasonStart(s.season) - 1);
  }
});

test('from the snapshot and this week\'s keys alone, the browser plays the league the seed plays', () => {
  const fromSeed = new LiveLeague(config, { now: through, seed: SECRET });
  const browser = restoreLive(config, snap3, { now: through, streams: keyStreams(book) });
  assert.equal(whole(browser), whole(fromSeed));
  // What the screen asks for that the week's keys don't hold, the snapshot does: this season's and last season's lots.
  assert.equal(lotsSeedFor(browser.league, 3), lotsSeedFor(fromSeed.league, 3));
  assert.equal(lotsSeedFor(browser.league, 2), lotsSeedFor(fromSeed.league, 2));
  const dur = (/** @type {any} */ m) => createTimeline(m, config).duration;
  assert.deepEqual(tableAt(browser, 3, through, dur), tableAt(fromSeed, 3, through, dur));
});

test('the TV guide builds the day from the snapshot and this week\'s keys', () => {
  /** @type {Map<string, any>} */
  const tls = new Map();
  const timelineOf = (/** @type {any} */ m) => tls.get(m.id) ?? tls.set(m.id, createTimeline(m, config)).get(m.id);
  const fromKeys = buildDay(config, through, 'unused', timelineOf, keyStreams(book), snap3);
  const fromSeed = buildDay(config, through, SECRET, timelineOf);
  assert.ok(fromKeys.entries.length > 5);
  assert.deepEqual(fromKeys, fromSeed);
});

test('the history check: published days played again as first played pass; a match that plays differently stops the publish', async () => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { checkHistory } = await import('../src/cli/historyCheck.js');
  const { keyPath } = await import('../src/channel/dayKeys.js');
  const { snapshotPath } = await import('../src/channel/snapshot.js');
  const root = await mkdtemp(join(tmpdir(), 'history-'));
  try {
    await mkdir(join(root, 'keys'));
    await mkdir(join(root, 'snapshots'));
    for (const s of snapshots) await writeFile(join(root, snapshotPath(s.season)), JSON.stringify(s));
    for (const [name, key] of keys) await writeFile(join(root, keyPath({ name, season: 0, day: 0, from: 0, until: 0 })), JSON.stringify(key));
    const ok = /** @type {any} */ (checkHistory(config, root));
    assert.equal(ok.from, 'the season 3 snapshot');
    assert.ok(ok.checked > 10);
    assert.deepEqual(ok.problems, []);
    // As if new code played a match of this week differently from its recorded fingerprint.
    const day = /** @type {any} */ (keys.get('s3d1'));
    const id = Object.keys(day.played)[0];
    await writeFile(join(root, 'keys', 's3d1.json'), JSON.stringify({ ...day, played: { ...day.played, [id]: 'not-this' } }));
    assert.deepEqual(/** @type {any} */ (checkHistory(config, root)).problems, [`s3d1: ${id} plays differently`]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('the channel\'s own team fields (the ground\'s name) stay out of the league, so snapshots never change for them', () => {
  // Tom's note 14: adding `ground` to data/teams.json made the season's published snapshot come out different, and the
  // daily job (rightly) refused to rewrite history.
  const live = new LiveLeague(config, { now: createCalendar(config).slots(1)[0].kickoff, seed: 'channel-only' });
  for (const team of Object.values(live.league.teams)) assert.equal('ground' in team, false, team.id);
  const added = { ...config, teams: { ...config.teams, teams: config.teams.teams.map((/** @type {any} */ t) => ({ ...t, ground: `${t.ground} again` })) } };
  const at = createCalendar(config).slots(1)[3].kickoff;
  assert.equal(JSON.stringify(takeSnapshot(new LiveLeague(added, { now: at, seed: 'channel-only' }))), JSON.stringify(takeSnapshot(new LiveLeague(config, { now: at, seed: 'channel-only' }))));
});
