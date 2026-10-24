import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateConfig } from '../src/config.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { audienceLine, createStaticServer } from '../src/cli/serve.js';
import { createAudience, onAirLine } from '../src/channel/audience.js';
import { createCalendar } from '../src/channel/calendar.js';
import { allPolls, pollsAt, voteAllowed } from '../src/channel/polls.js';

const real = await loadConfigFromDisk();

/** The real config with these polls in place of data/polls.json's. @param {any[]} polls */
function withPolls(polls) {
  const c = structuredClone(real);
  c.polls.polls = polls;
  return c;
}

const HOUR = 3_600_000;
const first = { id: 'first', question: 'Who wins?', options: 'teams', season: 2, opens: 'day 1 00:00', closes: 'day 3 12:00' };
const second = { id: 'second', question: 'Best kit?', options: 'teams', season: 2, opens: 'day 4 00:00', closes: 'day 7 21:00' };

test('the committed polls are valid, and the first is the favourite team, open through season 5 (held back until the address is shared; Tom, 2026-10-21)', () => {
  assert.deepEqual(validateConfig(structuredClone(real)), []);
  const cal = createCalendar(real);
  const [p] = allPolls(real, cal, cal.seasonStart(5));
  assert.equal(p.id, 'favourite_team');
  assert.equal(p.question, "WHO'S YOUR FAVOURITE TEAM?");
  assert.equal(p.options.length, real.teams.teams.length);
  assert.equal(p.opensAt, cal.seasonStart(5));
});

test('a poll is seen from when it opens; in gold while open or waiting for its result; past once its result is in', () => {
  const c = withPolls([first, second]);
  const cal = createCalendar(c);
  const s2 = cal.seasonStart(2);
  assert.deepEqual(pollsAt(c, cal, s2 - 1), { current: null, past: [] });
  let now = pollsAt(c, cal, s2 + HOUR);
  assert.equal(now.current?.id, 'first');
  assert.equal(now.current?.status, 'open');
  // Closed, no result yet: still the one in gold, closed.
  now = pollsAt(c, cal, s2 + 2.6 * 24 * HOUR);
  assert.equal(now.current?.id, 'first');
  assert.equal(now.current?.status, 'closed');
  // The next one open: the first is past, still without its result.
  now = pollsAt(c, cal, s2 + 3.5 * 24 * HOUR);
  assert.equal(now.current?.id, 'second');
  assert.deepEqual(now.past.map((p) => [p.id, p.votes]), [['first', null]]);
  // Closed with its result in: past, and nothing in gold.
  const withResult = withPolls([first, { ...second, result: { announced: { season: 2, at: 'day 7 21:00' }, votes: { 't-gulls': 3, 't-rime': 5 } } }]);
  now = pollsAt(withResult, cal, s2 + 7 * 24 * HOUR);
  assert.equal(now.current, null);
  assert.deepEqual(now.past.map((p) => p.id), ['second', 'first']);
  assert.deepEqual(now.past[0].votes, { 't-gulls': 3, 't-rime': 5 });
});

test('a vote counts only for an open poll and one of its options', () => {
  const c = withPolls([first]);
  const cal = createCalendar(c);
  const s2 = cal.seasonStart(2);
  assert.ok(voteAllowed(c, cal, s2 + HOUR, 'first', 't-gulls'));
  assert.ok(!voteAllowed(c, cal, s2 - HOUR, 'first', 't-gulls'), 'before it opens');
  assert.ok(!voteAllowed(c, cal, s2 + 3 * 24 * HOUR, 'first', 't-gulls'), 'after it closes');
  assert.ok(!voteAllowed(c, cal, s2 + HOUR, 'first', 't-nobody'));
  assert.ok(!voteAllowed(c, cal, s2 + HOUR, 'nope', 't-gulls'));
});

test('polls are checked: unique ids, closing after opening, one at a time, results only for its options', () => {
  const errors = validateConfig(withPolls([
    first,
    { ...first, closes: 'day 1 00:00' },
    { ...second, id: 'third', opens: 'day 2 00:00', result: { announced: { season: 2, at: 'day 7 21:00' }, votes: { 't-nobody': 1 } } },
    { ...second, id: 'fourth', season: 3, closes: 'day 9 00:00' },
  ]));
  assert.ok(errors.some((e) => e.includes('id "first" is used twice')));
  assert.ok(errors.some((e) => e.includes('polls[1]: closes must come after opens')));
  assert.ok(errors.some((e) => e.includes('polls[1]: opens before polls[0] closes')));
  assert.ok(errors.some((e) => e.includes('polls[2].result.votes: "t-nobody" is not one of the poll\'s options')));
  assert.ok(errors.some((e) => e.includes("polls[3]: opens and closes must fall within the season's 7 days")));
});

test('the audience module sends a vote, remembers it only once taken, and votes once a poll', async () => {
  /** @type {Record<string, string>} */
  const store = {};
  const storage = { getItem: (/** @type {string} */ k) => store[k] ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => { store[k] = v; } };
  /** @type {{ url: string, body: any }[]} */
  const sent = [];
  let ok = false;
  const send = /** @type {typeof fetch} */ (/** @type {unknown} */ (async (/** @type {string} */ url, /** @type {any} */ init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok };
  }));
  const audience = createAudience({ endpoint: '/api/audience', send, storage });
  assert.equal(await audience.vote('first', 't-gulls'), false, 'the endpoint refused it');
  assert.equal(audience.votedFor('first'), null);
  ok = true;
  assert.equal(await audience.vote('first', 't-rime'), true);
  assert.equal(audience.votedFor('first'), 't-rime');
  assert.equal(await audience.vote('first', 't-gulls'), false, 'once a poll');
  assert.deepEqual(sent, [
    { url: '/api/audience/vote', body: { pollId: 'first', optionId: 't-gulls' } },
    { url: '/api/audience/vote', body: { pollId: 'first', optionId: 't-rime' } },
  ]);
  // Storage blocked: the vote still goes, it just isn't remembered.
  const blocked = createAudience({ endpoint: '/api/audience', send, storage: null });
  assert.equal(await blocked.vote('first', 't-gulls'), true);
  assert.equal(blocked.votedFor('first'), null);
});

test('the dev server checks votes and notes and keeps them in output/audience', async (t) => {
  const now = Date.UTC(2026, 9, 12);
  assert.deepEqual(audienceLine('vote', { pollId: 'favourite_team', optionId: 't-gulls' }, real, now), { line: { at: '2026-10-12T00:00:00.000Z', pollId: 'favourite_team', optionId: 't-gulls' } });
  assert.ok('error' in audienceLine('vote', { pollId: 'favourite_team', optionId: 't-nobody' }, real, now));
  assert.ok('error' in audienceLine('vote', { pollId: 'favourite_team' }, real, now));
  assert.ok('error' in audienceLine('note', { text: '   ' }, real, now));
  assert.ok('error' in audienceLine('note', { text: 'x'.repeat(real.settings.audience.noteMaxChars + 1) }, real, now));
  assert.deepEqual(audienceLine('note', { text: 'A bug', onAir: 'S2 WED' }, real, now), { line: { at: '2026-10-12T00:00:00.000Z', text: 'A bug', onAir: 'S2 WED' } });

  const dir = await mkdtemp(join(tmpdir(), 'audience-'));
  const server = createStaticServer(fileURLToPath(new URL('../', import.meta.url)), { audienceDir: dir, loadConfig: async () => real });
  await new Promise((done) => server.listen(0, '127.0.0.1', () => done(undefined)));
  t.after(async () => { server.close(); await rm(dir, { recursive: true, force: true }); });
  const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
  const post = (/** @type {string} */ path, /** @type {string} */ body) => fetch(`http://127.0.0.1:${port}${path}`, { method: 'POST', body });
  assert.equal((await post('/api/audience/vote', JSON.stringify({ pollId: 'favourite_team', optionId: 't-gulls' }))).status, 204);
  assert.equal((await post('/api/audience/vote', JSON.stringify({ pollId: 'favourite_team', optionId: 't-nobody' }))).status, 400);
  assert.equal((await post('/api/audience/vote', '{ not json')).status, 400);
  assert.equal((await post('/api/audience/note', JSON.stringify({ text: 'x'.repeat(9000) }))).status, 413);
  assert.equal((await post('/api/audience/note', JSON.stringify({ text: 'The keeper walked through the post.', onAir: 'S2 WED 06:17' }))).status, 204);
  assert.equal((await post('/index.html', '{}')).status, 405);
  const votes = (await readFile(join(dir, 'votes.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(votes.map((v) => [v.pollId, v.optionId]), [['favourite_team', 't-gulls']]);
  const notes = (await readFile(join(dir, 'notes.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(notes.map((n) => [n.text, n.onAir]), [['The keeper walked through the post.', 'S2 WED 06:17']]);
});

test('notes: sent with the line saying what was on air, never empty, and not again within the cooldown', async () => {
  /** @type {Record<string, string>} */
  const store = {};
  const storage = { getItem: (/** @type {string} */ k) => store[k] ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => { store[k] = v; } };
  /** @type {any[]} */
  const sent = [];
  const send = /** @type {typeof fetch} */ (/** @type {unknown} */ (async (/** @type {string} */ url, /** @type {any} */ init) => {
    sent.push({ url, body: JSON.parse(init.body) });
    return { ok: true };
  }));
  const audience = createAudience({ endpoint: '/api/audience', noteCooldownSeconds: 60, send, storage });
  assert.equal(audience.noteWait(), 0);
  assert.equal(await audience.note('   ', 'S2'), false, 'nothing to send');
  assert.equal(await audience.note('A bug', 'S2 WED 06:17'), true);
  assert.deepEqual(sent, [{ url: '/api/audience/note', body: { text: 'A bug', onAir: 'S2 WED 06:17' } }]);
  assert.ok(audience.noteWait() > 55 && audience.noteWait() <= 60);
  assert.equal(await audience.note('Another', 'S2'), false, 'within the cooldown');
  assert.equal(audience.noteWait(Date.now() + 61_000), 0);
});

test('the line sent with a note says when, what was on air and the layout', () => {
  const t = Date.UTC(2026, 9, 14, 10, 17, 3);
  assert.equal(onAirLine({ t, season: 2, timeZone: 'America/New_York', kind: 'live', match: { stage: 'regular', round: 6, home: 'VAR', away: 'WRS' }, play: { score: [0, 1], period: '1H', clock: '8:04' }, layout: 'full' }),
    'S2 WED 06:17 · LIVE R6 VAR 0-1 WRS 1H 8:04 · FULL · 2026-10-14T10:17:03Z');
  assert.equal(onAirLine({ t, season: 2, timeZone: 'America/New_York', kind: 'reair full_time', match: { stage: 'final', round: null, home: 'LIS', away: 'VAR' }, play: null, layout: 'broadcast' }),
    'S2 WED 06:17 · REAIR FULL TIME F LIS v VAR · BROADCAST · 2026-10-14T10:17:03Z');
  assert.equal(onAirLine({ t, season: 2, timeZone: 'America/New_York', kind: 'ad', match: null, play: null, layout: 'full' }),
    'S2 WED 06:17 · AD · FULL · 2026-10-14T10:17:03Z');
});
