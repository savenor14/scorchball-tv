// Where a visit came in (getting the word out, docs/launch-plan.md): the link's ?from= tag, read by the channel, sent
// with the hellos, kept by the service and the dev server, and counted on the Director's desk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createAudience } from '../src/channel/audience.js';
import { devParams, publicParams, sourceTag } from '../src/channel/dev.js';
import { audienceLine } from '../src/cli/serve.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { viewerStats, visitsFromHellos } from '../src/director/viewers.js';
import { handle } from '../worker/audience.js';

const config = await loadConfigFromDisk();
const getConfig = async () => config;
const MIN = 60_000;

test('the tag: lower case, 1–16 letters, digits or dashes, anything else ignored; read on the live site and the dev server', () => {
  assert.equal(sourceTag('hn'), 'hn');
  assert.equal(sourceTag(' Bsky '), 'bsky');
  assert.equal(sourceTag('r-claudecode'), 'r-claudecode');
  for (const bad of [null, '', 'a b', 'x'.repeat(17), '<script>', 'hn&x=1', 'ünï']) assert.equal(sourceTag(bad), null, String(bad));
  assert.equal(publicParams('?from=hn&fbclid=abc').from, 'hn');
  assert.equal(publicParams('?from=<b>').from, null, 'never refused, only ignored');
  assert.equal(devParams('?from=cc').from, 'cc');
  assert.equal(devParams('').from, null);
});

test('a hello carries the tag when there is one', async () => {
  /** @type {any[]} */
  const sent = [];
  const send = /** @type {typeof fetch} */ (/** @type {unknown} */ (async (/** @type {string} */ _url, /** @type {any} */ init) => {
    sent.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ hello: true }) };
  }));
  const audience = createAudience({ endpoint: '/api/audience', send, storage: null });
  await audience.hello('0123456789abcdef', false, 'hn');
  await audience.hello('0123456789abcdef', true, null);
  assert.deepEqual(sent, [{ session: '0123456789abcdef', from: 'hn' }, { session: '0123456789abcdef', watching: true }]);
});

/** A D1-shaped wrapper round an in-memory SQLite with the visits table (as tests/audienceService.test.js). */
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const m of ['0002_visits.sql', '0004_visits_from.sql']) db.exec(readFileSync(new URL(`../worker/migrations/${m}`, import.meta.url), 'utf8'));
  /** @param {string} sql */
  const prepare = (sql) => {
    const stmt = db.prepare(sql);
    /** @param {any[]} args */
    const bound = (args) => ({
      run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
      first: async () => stmt.get(...args) ?? null,
      all: async () => ({ results: stmt.all(...args) }),
    });
    return { bind: (/** @type {any[]} */ ...args) => bound(args), ...bound([]) };
  };
  return { prepare, db };
}

test('the service keeps the first tag a visit sends, drops a bad one, and gives it to the desk', async () => {
  const e = { DB: fakeD1(), VOTE_SALT: 'salt', DIRECTOR_TOKEN: 'token' };
  const at = Date.parse('2026-11-10T12:00:00Z');
  /** @param {any} body @param {number} now */
  const hello = (body, now) => handle(new Request('https://scorchball.tv/api/audience/hello', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' }, body: JSON.stringify(body) }), e, { now, getConfig });
  assert.equal((await hello({ session: 'aaaaaaaaaaaaaaaa', from: 'hn' }, at)).status, 200);
  assert.equal((await hello({ session: 'aaaaaaaaaaaaaaaa', from: 'cc' }, at + 10 * MIN)).status, 200, 'a later tag never replaces the first');
  assert.equal((await hello({ session: 'bbbbbbbbbbbbbbbb' }, at)).status, 200);
  assert.equal((await hello({ session: 'bbbbbbbbbbbbbbbb', from: 'bsky' }, at + MIN)).status, 200, 'the first hello lost its tag: the next one gives it');
  assert.equal((await hello({ session: 'cccccccccccccccc', from: "x'); DROP TABLE visits;--" }, at)).status, 200, 'a bad tag is dropped, the visit still counted');
  const rows = /** @type {any[]} */ (e.DB.db.prepare('SELECT session, came_from FROM visits ORDER BY session').all());
  assert.deepEqual(rows.map((r) => [r.session.slice(0, 1), r.came_from]), [['a', 'hn'], ['b', 'bsky'], ['c', null]]);
  const visits = await (await handle(new Request('https://scorchball.tv/api/audience/admin/visits', { headers: { authorization: 'Bearer token' } }), e, { now: at + 20 * MIN, getConfig })).json();
  assert.deepEqual(visits.map((/** @type {any} */ v) => v.from).sort(), ['bsky', 'hn', null].sort());
});

test('the dev server keeps the tag on the hello line', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  const c = /** @type {any} */ ({});
  assert.deepEqual(audienceLine('hello', { session: '0123456789abcdef', from: 'hn' }, c, now, 'tag'), { line: { at: new Date(now).toISOString(), session: '0123456789abcdef', viewer: 'tag', from: 'hn' } });
  assert.deepEqual(audienceLine('hello', { session: '0123456789abcdef', from: 'NOT OK' }, c, now, 'tag'), { line: { at: new Date(now).toISOString(), session: '0123456789abcdef', viewer: 'tag' } });
});

test('the desk counts the week\'s visits by where they came in: households, a typical visit, who came back on a later day', () => {
  const NOW = Date.parse('2026-11-14T17:00:00Z'); // Saturday 12:00 in New York
  const iso = (/** @type {number} */ ms) => new Date(NOW - ms).toISOString();
  const DAY = 24 * 60 * MIN;
  const visits = [
    { viewer: 'a', firstAt: iso(3 * DAY), lastAt: iso(3 * DAY - 40 * MIN), from: 'hn' }, // HN, 40 min, came back
    { viewer: 'a', firstAt: iso(DAY), lastAt: iso(DAY - 10 * MIN), from: null }, // a's return, direct
    { viewer: 'b', firstAt: iso(2 * DAY), lastAt: iso(2 * DAY - 4 * MIN), from: 'hn' }, // HN, 4 min, not back
    { viewer: 'c', firstAt: iso(60 * MIN), lastAt: iso(30 * MIN), from: 'cc' },
    { viewer: 'c', firstAt: iso(20 * MIN), lastAt: iso(10 * MIN), from: 'cc' }, // the same day: not a return
  ];
  const { sources } = viewerStats(visits, NOW, { timeZone: 'America/New_York', watchingMinutes: 15 });
  assert.deepEqual(sources, [
    { from: 'cc', visits: 2, viewers: 1, typicalMinutes: 20, cameBack: 0 },
    { from: 'hn', visits: 2, viewers: 2, typicalMinutes: 22, cameBack: 1 },
    { from: 'direct', visits: 1, viewers: 1, typicalMinutes: 10, cameBack: 0 },
  ]);
  // The dev server's hellos keep the tag of the visit's first hello that has one.
  assert.deepEqual(visitsFromHellos([{ at: iso(5 * MIN), session: 's', viewer: 'x' }, { at: iso(4 * MIN), session: 's', viewer: 'x', from: 'hn' }]).map((v) => v.from), ['hn']);
});
