// Fan Coins, version 2 in the channel (Tom, 2026-10-17; docs/channel.md §29.6): the bank (coinBank.js) against the
// audience service's own code, the feed as spends to draw, and each spend's queue as COINS tells it (fanCoins.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { createCoinBank, newViewer } from '../src/channel/coinBank.js';
import { emptyData, normalizeData, queueState, spendsFromFeed } from '../src/channel/fanCoins.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { localD1 } from '../src/cli/localD1.js';
import { handle } from '../worker/audience.js';

const config = await loadConfigFromDisk();
const s = config.settings.fanCoins;
const MIN = 60_000;
const slot = createCalendar(config).slots(2)[20];
const k = slot.kickoff;
/** @type {[[number, number], [number, number]]} */
const halves = [[k, k + 11 * MIN], [k + 12 * MIN, k + 24 * MIN]];
/** A live match as the channel has it (only what these need). */
const match = /** @type {any} */ ({ id: 'm1', season: 2, slot: slot.index, kickoff: k, homeId: config.teams.teams[0].id, awayId: config.teams.teams[1].id });

test('version 1\'s coins start afresh; a viewer\'s id is 32 hex characters', () => {
  assert.equal(normalizeData({ v: 1, balance: 300 }).balance, 0);
  assert.match(newViewer(), /^[0-9a-f]{32}$/);
  assert.notEqual(newViewer(), newViewer());
});

test('the bank: pending coins banked at a check-in, a spend queued, the feed read', async () => {
  const env = { DB: localD1(), VOTE_SALT: 'salt', DIRECTOR_TOKEN: '' };
  let now = k - 20 * MIN;
  /** The service at `now`, as fetch. @param {string} url @param {RequestInit} [init] */
  const fetch = (url, init) => handle(new Request(`https://scorchball.tv${url}`, { ...init, headers: { ...(init?.headers ?? {}), 'cf-connecting-ip': '203.0.113.7' } }), env, { now, getConfig: async () => config });
  const data = { ...emptyData(), viewer: newViewer() };
  const bank = createCoinBank({ config, data, endpoint: '/api/audience', fetch, day: () => new Date(now).toISOString().slice(0, 10) });
  data.pending = 1;
  await bank.checkIn();
  assert.deepEqual([data.balance, data.pending, data.today], [1, 0, 1]);
  for (let i = 0; i < 15; i++) {
    now += MIN;
    data.pending += 1;
    await bank.checkIn();
  }
  assert.equal(data.balance, 16);
  now = k + 2 * MIN;
  const spent = await bank.spend({ kind: 'ticker', choice: config.fanCoins.pictures[0].id });
  assert.ok(spent.ok);
  assert.equal(data.balance, 16 - s.prices.ticker);
  assert.deepEqual(bank.spends().map((x) => x.kind), ['ticker'], 'shown here before the feed has it');
  await bank.readFeed();
  assert.equal(bank.spends().length, 1, 'once in the feed, not twice');
  assert.equal((await bank.spend({ kind: 'ticker', choice: config.fanCoins.pictures[0].id })).ok, false, 'one of a kind at a time');
});

test('the feed as spends to draw: a match\'s spends tied to it, a shout\'s words made for its end', () => {
  const rows = [
    { id: 1, kind: /** @type {const} */ ('chant'), side: /** @type {const} */ ('away'), choice: config.fanCoins.chants[0].id, player: null, match: 's2-20', starts: k, until: k + 11 * MIN },
    { id: 2, kind: /** @type {const} */ ('shout'), side: /** @type {const} */ ('home'), choice: String(config.fanCoins.shouts.indexOf('I ♥ {star}')), player: 'p-1', match: 's2-20', starts: k + MIN, until: k + MIN + 30_000 },
    { id: 3, kind: /** @type {const} */ ('screen'), side: null, choice: 'hello', player: null, match: null, starts: k, until: k + 10 * MIN },
    { id: 4, kind: /** @type {const} */ ('flag'), side: /** @type {const} */ ('home'), choice: '', player: null, match: 's9-9', starts: k, until: k + MIN },
  ];
  const out = spendsFromFeed(config, rows, {
    matchOf: (key) => (key === 's2-20' ? match : null),
    timelineOf: () => /** @type {any} */ ({ pauses: [], breaks: [], duration: 24 * MIN }),
    teamOf: (id) => config.teams.teams.find((/** @type {any} */ t) => t.id === id),
    nameOf: () => 'VOSS',

  });
  assert.deepEqual(out.map((x) => x.kind), ['chant', 'shout', 'screen'], 'a match not known here is left out');
  assert.deepEqual([out[0].instance, out[0].side], ['live:m1', 'away']);
  assert.equal(out[1].choice, 'I ♥ VOSS');
  assert.deepEqual([out[2].at, out[2].until], [k, k + 10 * MIN], 'FAN BOARD from its start to its end');
  // One's own chant that started at once, held back past the slide to Broadcast (Tom, 2026-10-18); its end unchanged.
  const held = spendsFromFeed(config, [rows[0]], {
    matchOf: () => match,
    timelineOf: () => /** @type {any} */ ({ pauses: [], breaks: [], duration: 24 * MIN }),
    teamOf: (id) => config.teams.teams.find((/** @type {any} */ t) => t.id === id),
    nameOf: () => null,
    delayOf: (id) => (id === 1 ? 1100 : 0),
  });
  assert.deepEqual([held[0].at, held[0].until], [k + 1100, k + 11 * MIN]);
});

test('COINS\' queues from the feed: how many ahead, the free end, the viewer\'s own, full, no room', () => {
  const data = { ...emptyData(), balance: 100 };
  const t = k + 2 * MIN;
  const at = { t, match, halves };
  /** @param {Partial<import('../src/channel/coinBank.js').FeedRow>} r @returns {import('../src/channel/coinBank.js').FeedRow} */
  const row = (r) => ({ id: 0, kind: 'ticker', side: null, choice: '', player: null, match: null, starts: t, until: t + 10 * MIN, ...r });
  const one = [row({ id: 1 })];
  const ticker = queueState(config, data, one, new Set(), 'ticker', at);
  assert.deepEqual([ticker.ok, ticker.ahead, ticker.starts], [true, 1, t + 10 * MIN]);
  assert.equal(queueState(config, data, one, new Set([1]), 'ticker', at).why, 'YOURS IS ON');
  // One's own third in the queue: the one showing and one waiting ahead of it (the slots: NOW, one ahead, YOU).
  const three = [row({ id: 1 }), row({ id: 2, starts: t + 10 * MIN, until: t + 20 * MIN }), row({ id: 3, starts: t + 20 * MIN, until: t + 30 * MIN })];
  const mineThird = queueState(config, data, three, new Set([3]), 'ticker', at);
  assert.deepEqual([mineThird.why, mineThird.ahead, mineThird.showing, mineThird.starts], ['YOURS IS QUEUED', 2, true, t + 20 * MIN]);
  const full = [row({ id: 1 }), ...[1, 2, 3, 4, 5].map((i) => row({ id: i + 1, starts: t + i * 10 * MIN, until: t + (i + 1) * 10 * MIN }))];
  assert.equal(queueState(config, data, full, new Set(), 'ticker', at).why, 'QUEUE FULL');
  // A chant in the home end's first half: the away end is the one free now; the home end has the second half left.
  const stands = [row({ id: 7, kind: 'chant', side: 'home', match: 's2-20', starts: t, until: halves[0][1] })];
  const flag = queueState(config, data, stands, new Set(), 'flag', at);
  assert.deepEqual([flag.ok, flag.free], [true, ['away']]);
  const home = queueState(config, data, stands, new Set(), 'flag', at, 'home');
  assert.deepEqual([home.ok, home.starts], [true, halves[1][0]], 'queued for the second half');
  assert.equal(queueState(config, data, [], new Set(), 'chant', { t, match: null, halves: null }).why, 'IN A LIVE MATCH');
  assert.equal(queueState(config, { ...data, balance: 3 }, [], new Set(), 'ticker', at).why, `${s.prices.ticker - 3} MORE`);
});

test('a re-air\'s spends: asked once a match, none until the service has them (2026-10-18)', async () => {
  const rows = [{ id: 7, kind: 'chant', side: 'home', choice: config.fanCoins.chants[0].id, player: null, match: `s2-${slot.index}`, starts: k, until: halves[0][1] }];
  /** @type {string[]} */
  const asked = [];
  let over = false;
  let changed = 0;
  const bank = createCoinBank({
    config, data: emptyData(), endpoint: 'https://x.test/api/audience', day: () => '2026-10-18', onChange: () => changed++,
    fetch: async (url) => {
      asked.push(url);
      return new Response(JSON.stringify({ over, spends: over ? rows : [] }));
    },
  });
  const key = `s2-${slot.index}`;
  assert.deepEqual(bank.replayOf(key), []);
  assert.deepEqual(bank.replayOf(key), [], 'asked once, not every frame');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(asked, [`https://x.test/api/audience/coins/match/${key}`]);
  assert.deepEqual(bank.replayOf(key), [], 'not over yet: none, and not asked again at once');
  assert.equal(asked.length, 1);
  over = true;
  const fresh = createCoinBank({ config, data: emptyData(), endpoint: 'https://x.test/api/audience', day: () => '', onChange: () => changed++, fetch: async () => new Response(JSON.stringify({ over, spends: rows })) });
  fresh.replayOf(key);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(fresh.replayOf(key), rows);
  assert.ok(changed >= 1, 'told when they came');
  const drawn = spendsFromFeed(config, fresh.replayOf(key), { matchOf: () => match, timelineOf: () => /** @type {any} */ ({ pauses: [] }), teamOf: (id) => config.teams.teams.find((/** @type {any} */ t) => t.id === id), nameOf: () => null });
  assert.deepEqual(drawn.map((x) => [x.kind, x.at, x.until, x.instance]), [['chant', k, halves[0][1], 'live:m1']]);
});

test('a call that never answers is given up after requestSeconds, so the next check-in banks and a spend waits for the one under way (2026-10-18)', async () => {
  const quick = { ...config, settings: { ...config.settings, fanCoins: { ...s, shared: { ...s.shared, requestSeconds: 0.05 } } } };
  const data = emptyData();
  data.viewer = 'c'.repeat(32);
  data.pending = 3;
  let hang = true;
  /** @type {string[]} */
  const calls = [];
  const bank = createCoinBank({
    config: quick, data, endpoint: 'https://x.test/api/audience', day: () => '2026-10-18',
    fetch: (url, init) => {
      calls.push(String(url).replace('https://x.test/api/audience/coins/', ''));
      if (hang) return new Promise((_, fail) => init?.signal?.addEventListener('abort', () => fail(new Error('aborted'))));
      if (String(url).endsWith('checkin')) return Promise.resolve(new Response(JSON.stringify({ balance: 10, today: 10, mine: [] })));
      return Promise.resolve(new Response(JSON.stringify({ id: 1, starts: 0, until: 1, ahead: 0, balance: 5 })));
    },
  });
  await bank.checkIn();
  assert.equal(bank.state.sending, false, 'given up, not waiting for good');
  assert.equal(data.pending, 3, 'nothing settled');
  hang = false;
  await bank.checkIn();
  assert.deepEqual([data.balance, data.pending], [10, 0], 'the next one banks');
  // A spend while a check-in is under way waits for it, then spends.
  data.pending = 2;
  const under = bank.checkIn();
  const spent = await bank.spend({ kind: 'ticker', choice: 'x' });
  await under;
  assert.equal(spent.ok, true);
  assert.deepEqual(calls.slice(-2), ['checkin', 'spend'], 'one check-in, then the spend');
});

test('a shout pops up at once unless a celebration is on, and stays to its end once the feed drops it (2026-10-18, the final\'s 14 goals)', () => {
  const tl = /** @type {any} */ ({ pauses: [{ at: 2 * MIN, ms: 11_000, kind: 'goal' }, { at: 5 * MIN, ms: 11_000, kind: 'goal' }] });
  const opts = { matchOf: () => match, timelineOf: () => tl, teamOf: (/** @type {string} */ id) => config.teams.teams.find((/** @type {any} */ t) => t.id === id), nameOf: () => null };
  const row = (/** @type {number} */ id, /** @type {number} */ starts) => ({ id, kind: /** @type {const} */ ('shout'), side: /** @type {const} */ ('away'), choice: '0', player: null, match: `s2-${slot.index}`, starts, until: starts + s.shoutSeconds * 1000 });
  // A celebration coming 20 s in doesn't hold it back (it used to wait for a clear 30 s).
  const [soon] = spendsFromFeed(config, [row(1, k + 2 * MIN - 20_000)], opts);
  assert.equal(soon.at, k + 2 * MIN - 20_000);
  // Spent during one: up as it ends, its full length.
  const [during] = spendsFromFeed(config, [row(2, k + 5 * MIN + 3000)], opts);
  assert.deepEqual([during.at, during.until], [k + 5 * MIN + 11_000, k + 5 * MIN + 11_000 + s.shoutSeconds * 1000]);
  // Once the feed drops it (its slot over), kept until its own end; then gone.
  const kept = spendsFromFeed(config, [], { ...opts, previous: [during], now: during.until - 2000 });
  assert.deepEqual(kept.map((x) => x.id), [2]);
  assert.deepEqual(spendsFromFeed(config, [], { ...opts, previous: [during], now: during.until + 1 }), []);
});
