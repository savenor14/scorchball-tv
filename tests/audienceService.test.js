// The audience service (the launch, Task 276; worker/audience.js), with Node's own SQLite standing in for D1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createCalendar } from '../src/channel/calendar.js';
import { allPolls } from '../src/channel/polls.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { handle, household } from '../worker/audience.js';

const config = await loadConfigFromDisk();
const poll = allPolls(config, createCalendar(config), Date.now()).at(0);
const during = /** @type {any} */ (poll).opensAt + 3_600_000;

/** A D1-shaped wrapper round an in-memory SQLite, with the service's tables. */
function fakeD1() {
  const db = new DatabaseSync(':memory:');
  for (const m of ['0001_audience.sql', '0002_visits.sql', '0004_visits_from.sql']) db.exec(readFileSync(new URL(`../worker/migrations/${m}`, import.meta.url), 'utf8'));
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

const env = () => ({ DB: fakeD1(), VOTE_SALT: 'salt', DIRECTOR_TOKEN: 'token' });
/** @param {string} path @param {any} body @param {string} [ip] */
const post = (path, body, ip = '203.0.113.7') => new Request(`https://scorchball.tv/api/audience/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) });
const getConfig = async () => config;

test('a vote for an open poll counts once a connection; a closed or unknown one doesn\'t', async () => {
  const e = env();
  const option = /** @type {any} */ (poll).options[0].id;
  const id = /** @type {any} */ (poll).id;
  const first = await handle(post('vote', { pollId: id, optionId: option }), e, { now: during, getConfig });
  assert.deepEqual([first.status, await first.json()], [200, { counted: true }]);
  const again = await handle(post('vote', { pollId: id, optionId: option }), e, { now: during, getConfig });
  assert.deepEqual(await again.json(), { counted: false }, 'the same connection, ignored');
  const other = await handle(post('vote', { pollId: id, optionId: option }, '198.51.100.2'), e, { now: during, getConfig });
  assert.deepEqual(await other.json(), { counted: true });
  assert.equal((await handle(post('vote', { pollId: id, optionId: 'nobody' }), e, { now: during, getConfig })).status, 400);
  assert.equal((await handle(post('vote', { pollId: id, optionId: option }, '192.0.2.9'), e, { now: /** @type {any} */ (poll).closesAt + 1, getConfig })).status, 400, 'closed');
  // No address is kept: only its salted hash.
  const rows = e.DB.db.prepare('SELECT voter FROM votes').all();
  assert.equal(rows.length, 2);
  for (const r of rows) assert.ok(!String(r.voter).includes('203.0.113.7') && String(r.voter).length === 64);
});

test('notes: some text within the limit, a moment between them, twenty a day', async () => {
  const e = env();
  const { noteMaxChars, noteCooldownSeconds } = config.settings.audience;
  const send = (/** @type {any} */ body, /** @type {number} */ now) => handle(post('note', body), e, { now, getConfig });
  assert.equal((await send({ text: '  ', onAir: 'x' }, during)).status, 400);
  assert.equal((await send({ text: 'x'.repeat(noteMaxChars + 1), onAir: 'x' }, during)).status, 400);
  assert.equal((await send({ text: 'The ball went through a player', onAir: 'S2 MON 06:00 · LIVE' }, during)).status, 200);
  assert.equal((await send({ text: 'Too soon', onAir: '' }, during + 1000)).status, 429);
  let t = during;
  for (let i = 1; i < 20; i++) assert.equal((await send({ text: `note ${i}`, onAir: '' }, (t += (noteCooldownSeconds + 1) * 1000))).status, 200);
  assert.equal((await send({ text: 'one too many', onAir: '' }, (t += (noteCooldownSeconds + 1) * 1000))).status, 429);
});

test('the desk reads the votes and notes with its token, and nobody else can', async () => {
  const e = env();
  await handle(post('vote', { pollId: /** @type {any} */ (poll).id, optionId: /** @type {any} */ (poll).options[1].id }), e, { now: during, getConfig });
  await handle(post('note', { text: 'Lovely', onAir: 'S2 MON' }), e, { now: during, getConfig });
  const get = (/** @type {string} */ path, /** @type {string} */ token) => handle(new Request(`https://scorchball.tv/api/audience/admin/${path}`, { headers: { authorization: `Bearer ${token}` } }), e, { now: during, getConfig });
  assert.equal((await get('votes', 'wrong')).status, 401);
  assert.deepEqual(await (await get('votes', 'token')).json(), [{ at: new Date(during).toISOString(), pollId: /** @type {any} */ (poll).id, optionId: /** @type {any} */ (poll).options[1].id }]);
  assert.deepEqual(await (await get('notes', 'token')).json(), [{ at: new Date(during).toISOString(), text: 'Lovely', onAir: 'S2 MON' }]);
  assert.equal((await handle(new Request('https://scorchball.tv/api/audience/elsewhere'), e, { getConfig })).status, 404);
});

test('a hello counts a visit (Task 277e): first and last heard, the viewer a hash, never the address; the desk reads them with the token', async () => {
  const e = env();
  const at = Date.parse('2026-10-12T12:00:00Z');
  const hello = (/** @type {string} */ session, /** @type {string} */ ip = '203.0.113.7') => post('hello', { session }, ip);
  assert.equal((await handle(hello('0123456789abcdef0123'), e, { now: at, getConfig })).status, 200);
  assert.equal((await handle(hello('0123456789abcdef0123'), e, { now: at + 600_000, getConfig })).status, 200);
  assert.equal((await handle(hello('fedcba9876543210fedc', '198.51.100.2'), e, { now: at + 60_000, getConfig })).status, 200);
  assert.equal((await handle(hello('not a visit'), e, { now: at, getConfig })).status, 400);
  const rows = /** @type {any[]} */ (e.DB.db.prepare('SELECT * FROM visits ORDER BY first_at').all());
  assert.equal(rows.length, 2);
  assert.equal(rows[0].last_at, new Date(at + 600_000).toISOString());
  assert.ok(rows.every((r) => !JSON.stringify(r).includes('203.0.113.7') && /^[0-9a-f]{64}$/.test(r.viewer)));
  const admin = (/** @type {string} */ token) => new Request('https://scorchball.tv/api/audience/admin/visits', { headers: { authorization: `Bearer ${token}` } });
  assert.equal((await handle(admin('wrong'), e, { now: at, getConfig })).status, 401);
  const visits = await (await handle(admin('token'), e, { now: at + 3_600_000, getConfig })).json();
  assert.equal(visits.length, 2);
  assert.ok(visits.every((/** @type {any} */ v) => v.viewer.length === 12 && v.firstAt && v.lastAt));
  // Two months on, they're swept.
  await handle(admin('token'), e, { now: at + 61 * 86_400_000, getConfig });
  assert.equal(/** @type {any} */ (e.DB.db.prepare('SELECT COUNT(*) AS n FROM visits').get()).n, 0);
});

test('a household is one viewer (Task 277e): an IPv6 address by its /64, however its device part rotates; IPv4 as it is', async () => {
  assert.equal(household('203.0.113.7'), '203.0.113.7');
  assert.equal(household('2001:db8:85a3:12:aaaa:bbbb:cccc:dddd'), '2001:db8:85a3:12::/64');
  assert.equal(household('2001:0db8:85a3:0012:1111:2222:3333:4444'), '2001:db8:85a3:12::/64');
  assert.equal(household('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(household('::1'), '0:0:0:0::/64');
  const e = env();
  const at = Date.parse('2026-10-12T12:00:00Z');
  await handle(post('hello', { session: 'aaaaaaaaaaaaaaaa' }, '2001:db8:85a3:12:aaaa:bbbb:cccc:dddd'), e, { now: at, getConfig });
  await handle(post('hello', { session: 'bbbbbbbbbbbbbbbb' }, '2001:db8:85a3:12:1:2:3:4'), e, { now: at, getConfig });
  assert.equal(/** @type {any} */ (e.DB.db.prepare('SELECT COUNT(DISTINCT viewer) AS n FROM visits').get()).n, 1);
});

test('the security pass: only JSON from this site, nothing without the salt', async () => {
  const e = env();
  const vote = { pollId: /** @type {any} */ (poll).id, optionId: /** @type {any} */ (poll).options[0].id };
  /** @param {Record<string, string>} headers */
  const req = (headers) => new Request('https://scorchball.tv/api/audience/vote', { method: 'POST', headers: { 'cf-connecting-ip': '203.0.113.9', ...headers }, body: JSON.stringify(vote) });
  // A cross-site form or fetch: a "simple" text/plain POST, or another site's origin.
  assert.equal((await handle(req({ 'content-type': 'text/plain' }), e, { now: during, getConfig })).status, 403);
  assert.equal((await handle(req({ 'content-type': 'application/json', origin: 'https://evil.example' }), e, { now: during, getConfig })).status, 403);
  assert.equal((await handle(req({ 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }), e, { now: during, getConfig })).status, 403);
  // From the site itself: taken.
  assert.equal((await handle(req({ 'content-type': 'application/json', origin: 'https://scorchball.tv', 'sec-fetch-site': 'same-origin' }), e, { now: during, getConfig })).status, 200);
  // No salt: nothing taken.
  const unsalted = { ...env(), VOTE_SALT: '' };
  assert.equal((await handle(post('note', { text: 'hello' }), unsalted, { now: during, getConfig })).status, 503);
  assert.equal((await handle(post('hello', { session: 'abcdef0123456789' }), unsalted, { now: during, getConfig })).status, 503);
});

test('the security pass: a household votes once however its IPv6 device part rotates', async () => {
  const e = env();
  const vote = { pollId: /** @type {any} */ (poll).id, optionId: /** @type {any} */ (poll).options[0].id };
  const first = await (await handle(post('vote', vote, '2001:db8:1:2:aaaa::1'), e, { now: during, getConfig })).json();
  const second = await (await handle(post('vote', vote, '2001:db8:1:2:bbbb::9'), e, { now: during, getConfig })).json();
  assert.deepEqual([first.counted, second.counted], [true, false]);
});

test('the security pass: a household\'s new visits in a day are capped; a visit already known carries on', async () => {
  const e = env();
  const hex = (/** @type {number} */ i) => i.toString(16).padStart(16, '0');
  let refused = 0;
  for (let i = 0; i < 70; i++) if ((await handle(post('hello', { session: hex(i) }), e, { now: during, getConfig })).status === 429) refused++;
  assert.equal(refused, 10);
  assert.equal((await handle(post('hello', { session: hex(3) }), e, { now: during + 60_000, getConfig })).status, 200);
});

test('the security pass: a note keeps no invisible or text-reversing characters', async () => {
  const e = env();
  const res = await handle(post('note', { text: 'Great\u202E gnirts\u200B match\u0007', onAir: 'S2\u2066 WED' }), e, { now: during, getConfig });
  assert.equal(res.status, 200);
  const row = /** @type {any} */ (e.DB.db.prepare('SELECT text, on_air FROM notes').get());
  assert.equal(row.text, 'Great gnirts match');
  assert.equal(row.on_air, 'S2 WED');
  assert.equal((await handle(post('note', { text: '\u200B\u202E' }), env(), { now: during, getConfig })).status, 400);
});

test('a hello that asks hears how many are watching: households heard from within watchingMinutes (the ticker\'s count)', async () => {
  const e = env();
  const at = Date.parse('2026-10-16T12:00:00Z');
  const { watchingMinutes } = config.settings.audience;
  const ask = (/** @type {string} */ session, /** @type {string} */ ip, /** @type {number} */ now) => handle(post('hello', { session, watching: true }, ip), e, { now, getConfig }).then((r) => r.json());
  await handle(post('hello', { session: 'aaaaaaaaaaaaaaaa' }, '203.0.113.7'), e, { now: at - (watchingMinutes + 1) * 60_000, getConfig });
  assert.deepEqual(await handle(post('hello', { session: 'bbbbbbbbbbbbbbbb' }, '198.51.100.2'), e, { now: at - 60_000, getConfig }).then((r) => r.json()), { hello: true }, 'not asked, not counted');
  assert.deepEqual(await ask('cccccccccccccccc', '192.0.2.9', at), { hello: true, watching: 2 }, 'the one gone quiet left out');
  assert.deepEqual(await ask('dddddddddddddddd', '192.0.2.9', at), { hello: true, watching: 2 }, 'a second tab in the same household is one');
});
