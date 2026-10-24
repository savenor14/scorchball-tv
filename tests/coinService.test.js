// Fan Coins, version 2 (Tom, 2026-10-17; docs/channel.md §29.6): the rules (src/channel/coinRules.js) and the audience
// service keeping them (worker/coins.js), with Node's own SQLite standing in for D1, and the dev server answering alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { bank, boardBlocked, place, plausibleDay } from '../src/channel/coinRules.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { localD1 } from '../src/cli/localD1.js';
import { createStaticServer } from '../src/cli/serve.js';
import { handle } from '../worker/audience.js';

const config = await loadConfigFromDisk();
const s = config.settings.fanCoins;
const calendar = createCalendar(config);
const MIN = 60_000;
/** A live match: season 2's 21st slot, its halves as the channel would send them. */
const slot = calendar.slots(2)[20];
const match = `s2-${slot.index}`;
const k = slot.kickoff;
/** @type {[number, number][]} */
const halves = [[k, k + 11 * MIN], [k + 12 * MIN, k + 24 * MIN]];
const day = (/** @type {number} */ t) => new Date(t).toISOString().slice(0, 10);
const viewerA = 'a'.repeat(32);
const viewerB = 'b'.repeat(32);

test('banking: a coin a minute at most, an hour unbanked at most, the household\'s daily cap', () => {
  const now = 1_000 * MIN;
  assert.deepEqual(bank(s, { coins: 5, credited: null, today: 0, now }), { grant: 1, credited: now }, 'a new wallet: a minute\'s grace');
  assert.equal(bank(s, { coins: 5, credited: now - 3 * MIN, today: 0, now }).grant, 3);
  assert.equal(bank(s, { coins: 1, credited: now - 30_000, today: 0, now }).grant, 0, 'checking in more often banks nothing more');
  assert.equal(bank(s, { coins: 120, credited: now - 600 * MIN, today: 0, now }).grant, s.shared.bankMinutes, 'an hour unbanked at most');
  assert.equal(bank(s, { coins: 10, credited: now - 10 * MIN, today: s.dailyCap - 4, now }).grant, 4, 'up to the cap');
  assert.equal(plausibleDay(day(Date.now()), Date.now()), true);
  assert.equal(plausibleDay('2020-01-01', Date.now()), false);
});

test('the queues: one after another, up to queueMax waiting, a chant or flag a half each', () => {
  const now = k + 2 * MIN;
  /** @param {Partial<import('../src/channel/coinRules.js').Row>} r */
  const row = (r) => /** @type {any} */ ({ kind: 'ticker', queue: 'ticker', side: null, choice: '', player: null, match: null, ...r });
  const first = /** @type {any} */ (place(s, 'ticker', [], now, null));
  assert.deepEqual([first.starts, first.ahead], [now, 0]);
  const queue = [row({ slot: now, starts: now, until: now + s.tickerMinutes * MIN })];
  const second = /** @type {any} */ (place(s, 'ticker', queue, now, null));
  assert.deepEqual([second.starts, second.ahead], [now + s.tickerMinutes * MIN, 1], 'after the one showing');
  for (let i = 1; i <= s.shared.queueMax; i++) queue.push(row({ slot: now + i * 10 * MIN, starts: now + i * 10 * MIN, until: now + (i + 1) * 10 * MIN }));
  assert.deepEqual(place(s, 'ticker', queue, now, null), { error: 'QUEUE FULL' });
  // Shouts at an end: one after another, none past the match.
  const shout = /** @type {any} */ (place(s, 'shout', [row({ kind: 'shout', slot: now, starts: now, until: now + 30_000 })], now, halves));
  assert.equal(shout.starts, now + 30_000);
  assert.deepEqual(place(s, 'shout', [], halves[1][1] - 10_000, halves), { error: 'NO ROOM THIS MATCH' });
  // Chants and flags at an end: the rest of a half each.
  const h1 = /** @type {any} */ (place(s, 'chant', [], now, halves));
  assert.deepEqual([h1.slot, h1.starts, h1.until], [1, now, halves[0][1]]);
  const h2 = /** @type {any} */ (place(s, 'flag', [row({ kind: 'chant', slot: 1, starts: now, until: halves[0][1] })], now, halves));
  assert.deepEqual([h2.slot, h2.starts, h2.until, h2.ahead], [2, halves[1][0], halves[1][1], 1], 'queued for the second half');
  const halfTime = /** @type {any} */ (place(s, 'chant', [], halves[0][1] + 10_000, halves));
  assert.equal(halfTime.slot, 2, 'at half-time: the second half');
  assert.deepEqual(place(s, 'chant', [row({ kind: 'chant', slot: 2, starts: halves[1][0], until: halves[1][1] })], halves[1][0] + MIN, halves), { error: 'NO ROOM THIS MATCH' });
});

/** A request to the service. @param {string} path @param {any} [body] @param {string} [ip] */
const call = (path, body, ip = '203.0.113.7') => new Request(`https://scorchball.tv/api/audience/coins/${path}`, body === undefined
  ? { method: 'GET' }
  : { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: JSON.stringify(body) });

test('the service: coins banked at check-ins, spent into the queue, the feed the same for everyone', async () => {
  const env = { DB: localD1(), VOTE_SALT: 'salt', DIRECTOR_TOKEN: 'token' };
  const at = async (/** @type {number} */ now, /** @type {Request} */ req) => {
    const res = await handle(req, env, { now, getConfig: async () => config });
    return { status: res.status, body: await res.json() };
  };
  let now = k - 30 * MIN;
  const checkIn = (/** @type {string} */ viewer, /** @type {number} */ coins, ip = '203.0.113.7') => at(now, call('checkin', { viewer, coins, day: day(now) }, ip));
  assert.equal((await checkIn(viewerA, 1)).body.balance, 1);
  assert.equal((await checkIn(viewerA, 1)).body.banked, 0, 'again at once: nothing more');
  for (let i = 0; i < 40; i++) {
    now += MIN;
    await checkIn(viewerA, 1);
  }
  now = k + 2 * MIN;
  const before = (await checkIn(viewerA, 0)).body.balance;
  assert.ok(before >= 40, `banked ${before}`);
  // A ticker message: paid for, first in the queue.
  const ticker = await at(now, call('spend', { viewer: viewerA, kind: 'ticker', choice: config.fanCoins.pictures[0].id }));
  assert.equal(ticker.status, 200);
  assert.deepEqual([ticker.body.starts, ticker.body.ahead, ticker.body.balance], [now, 0, before - s.prices.ticker]);
  assert.equal((await at(now, call('spend', { viewer: viewerA, kind: 'ticker', choice: config.fanCoins.pictures[0].id }))).body.error, 'YOURS IS QUEUED', 'one of a kind at a time');
  // Another viewer with nothing banked can't; with coins, they queue behind.
  assert.equal((await at(now, call('spend', { viewer: viewerB, kind: 'ticker', choice: config.teams.teams[0].id }, '198.51.100.9'))).status, 402);
  // A chant in the live match, and one outside any match.
  const chant = await at(now, call('spend', { viewer: viewerA, kind: 'chant', choice: config.fanCoins.chants[0].id, side: 'home', match, halves }));
  assert.deepEqual([chant.status, chant.body.until], [200, halves[0][1]]);
  assert.equal((await at(k - 60 * MIN, call('spend', { viewer: viewerA, kind: 'flag', side: 'away', match, halves }))).body.error, 'IN A LIVE MATCH');
  assert.equal((await at(now, call('spend', { viewer: viewerA, kind: 'flag', side: 'home', match, halves: [[k, k + MIN], [k + 2 * MIN, k + 600 * MIN]] }))).body.error, 'The match\'s halves', 'halves inside the match');
  // The feed: both spends, no viewer named.
  const feed = await at(now, call('feed'));
  assert.deepEqual(feed.body.spends.map((/** @type {any} */ x) => x.kind), ['ticker', 'chant']);
  assert.ok(feed.body.spends.every((/** @type {any} */ x) => !('viewer' in x)));
  assert.deepEqual((await checkIn(viewerA, 0)).body.mine, [ticker.body.id, chant.body.id], 'a viewer\'s own, for the countdown');
});

test('a household banks at most the daily cap, however many browsers it opens', async () => {
  const env = { DB: localD1(), VOTE_SALT: 'salt', DIRECTOR_TOKEN: 'token' };
  const now = k;
  let total = 0;
  for (let i = 0; i < s.dailyCap + 20; i++) {
    const viewer = i.toString(16).padStart(32, '0');
    const ok = await handle(new Request('https://scorchball.tv/api/audience/coins/checkin', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.7' }, body: JSON.stringify({ viewer, coins: 2, day: day(now) }) }), env, { now, getConfig: async () => config });
    total += (await ok.json()).banked;
  }
  assert.equal(total, s.dailyCap);
});

test('a page on another site can\'t spend; the dev server answers with the service\'s own code', async (t) => {
  const env = { DB: localD1(), VOTE_SALT: 'salt', DIRECTOR_TOKEN: 'token' };
  const cross = new Request('https://scorchball.tv/api/audience/coins/spend', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://evil.example' }, body: '{}' });
  assert.equal((await handle(cross, env, { getConfig: async () => config })).status, 403);
  const server = createStaticServer(undefined, { coinsDb: ':memory:' });
  await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)));
  t.after(() => server.close());
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const res = await fetch(`http://127.0.0.1:${port}/api/audience/coins/checkin`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ viewer: viewerA, coins: 1, day: day(Date.now()) }) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).balance, 1);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/audience/coins/feed`)).status, 200);
});

test('a finished match\'s spends for its re-airs: its chants, flags and shouts only, once its window is over (2026-10-18)', async () => {
  const env = { DB: localD1(), VOTE_SALT: 'salt', DIRECTOR_TOKEN: 'token' };
  const at = async (/** @type {number} */ now, /** @type {Request} */ req) => {
    const res = await handle(req, env, { now, getConfig: async () => config });
    return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() };
  };
  let now = k - 30 * MIN;
  for (let i = 0; i < 40; i++, now += MIN) await at(now, call('checkin', { viewer: viewerA, coins: 1, day: day(now) }));
  now = k + 2 * MIN;
  await at(now, call('spend', { viewer: viewerA, kind: 'ticker', choice: config.fanCoins.pictures[0].id }));
  const chant = await at(now, call('spend', { viewer: viewerA, kind: 'chant', choice: config.fanCoins.chants[0].id, side: 'home', match, halves }));
  assert.equal(chant.status, 200);
  // While the match can still take spends: nothing yet, kept only briefly.
  const during = await at(now, call(`match/${match}`));
  assert.deepEqual([during.status, during.body.over, during.body.spends.length], [200, false, 0]);
  assert.equal(during.cache, `public, max-age=${s.shared.feedCacheSeconds}`);
  // Once it's over: the chant (not the ticker message), kept a long while; they never change.
  const after = await at(k + (s.shared.matchWindowMinutes + 1) * MIN, call(`match/${match}`));
  assert.deepEqual([after.body.over, after.body.spends.map((/** @type {any} */ x) => [x.kind, x.starts, x.until])], [true, [['chant', now, halves[0][1]]]]);
  assert.ok(after.body.spends.every((/** @type {any} */ x) => !('viewer' in x)));
  assert.equal(after.cache, `public, max-age=${s.shared.replayCacheHours * 3600}`);
  assert.equal((await at(now, call('match/s2-999'))).status, 404);
  assert.equal((await at(now, call('match/s0-1'))).status, 404);
});

test('FAN BOARD\'s queue: one board after another, screenMinutes each, never in the final round (Tom, 2026-10-21)', () => {
  const s = config.settings.fanCoins;
  const calendar = createCalendar(config);
  const len = s.screenMinutes * 60_000;
  const t0 = calendar.instant(2, 2 * 1440 + 12 * 60);
  const first = /** @type {any} */ (place(s, 'screen', [], t0, null, boardBlocked(config, calendar, t0)));
  assert.deepEqual([first.starts, first.until], [t0, t0 + len]);
  const next = /** @type {any} */ (place(s, 'screen', [{ id: 1, kind: 'screen', queue: 'screen', slot: t0, starts: t0, until: t0 + len }], t0, null, []));
  assert.equal(next.starts, t0 + len, 'after the one before it ends');
  // Just before the final round: pushed past it.
  const round = calendar.slots(2)[calendar.regularCount - 1].kickoff;
  const late = /** @type {any} */ (place(s, 'screen', [], round - 5 * 60_000, null, boardBlocked(config, calendar, round - 5 * 60_000)));
  assert.equal(late.starts, round + s.shared.matchWindowMinutes * 60_000);
});
