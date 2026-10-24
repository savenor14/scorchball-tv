// Viewers on the Director's desk (Task 277e; src/director/viewers.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewerStats, visitsFromHellos, withoutMine } from '../src/director/viewers.js';
import { audienceLine } from '../src/cli/serve.js';

const NOW = Date.parse('2026-10-14T16:00:00Z'); // Wednesday 12:00 in New York
const o = { timeZone: 'America/New_York', watchingMinutes: 15 };
const iso = (/** @type {number} */ ms) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

test('the desk\'s figures: viewers each day and over the week, watching now, a typical visit', () => {
  const visits = [
    { viewer: 'a', firstAt: iso(30 * MIN), lastAt: iso(5 * MIN) }, // today, 25 min, still watching
    { viewer: 'a', firstAt: iso(3 * 60 * MIN), lastAt: iso(2 * 60 * MIN) }, // today again, 60 min
    { viewer: 'b', firstAt: iso(20 * MIN), lastAt: iso(20 * MIN) }, // today, one hello, gone
    { viewer: 'c', firstAt: iso(26 * 60 * MIN), lastAt: iso(25 * 60 * MIN) }, // yesterday
    { viewer: 'd', firstAt: iso(9 * 24 * 60 * MIN), lastAt: iso(9 * 24 * 60 * MIN) }, // before the week
  ];
  const st = viewerStats(visits, NOW, o);
  assert.equal(st.days.length, 7);
  assert.deepEqual(st.days[0], { day: 'WED 14 OCT', viewers: 2, visits: 3 });
  assert.deepEqual(st.days[1], { day: 'TUE 13 OCT', viewers: 1, visits: 1 });
  assert.equal(st.week, 3);
  assert.equal(st.visits, 4);
  assert.equal(st.watching, 1);
  assert.equal(st.typicalMinutes, 43); // the median of 0, 25, 60, 60
  assert.equal(viewerStats([], NOW, o).typicalMinutes, null);
});

test('the dev server\'s hellos become visits; a hello needs its visit\'s id', () => {
  const v = visitsFromHellos([
    { at: iso(20 * MIN), session: 's1', viewer: 'x' },
    { at: iso(10 * MIN), session: 's1', viewer: 'x' },
    { at: iso(5 * MIN), session: 's2', viewer: 'y' },
  ]);
  assert.deepEqual(v, [{ viewer: 'x', firstAt: iso(20 * MIN), lastAt: iso(10 * MIN), from: null }, { viewer: 'y', firstAt: iso(5 * MIN), lastAt: iso(5 * MIN), from: null }]);
  const config = /** @type {any} */ ({});
  assert.deepEqual(audienceLine('hello', { session: '0123456789abcdef' }, config, NOW, 'tag'), { line: { at: new Date(NOW).toISOString(), session: '0123456789abcdef', viewer: 'tag' } });
  assert.ok('error' in audienceLine('hello', { session: 'x' }, config, NOW));
});

test('Tom\'s own tag is left out of the figures and marked in the list, most watched first (Task 278)', () => {
  const visits = [
    { viewer: 'tom', firstAt: iso(10 * 60 * MIN), lastAt: iso(2 * MIN) }, // all day, still watching
    { viewer: 'tom', firstAt: iso(26 * 60 * MIN), lastAt: iso(20 * 60 * MIN) },
    { viewer: 'b', firstAt: iso(40 * MIN), lastAt: iso(20 * MIN) },
    { viewer: 'c', firstAt: iso(9 * 24 * 60 * MIN), lastAt: iso(9 * 24 * 60 * MIN) }, // before the week
  ];
  const { stats, list } = withoutMine(visits, new Set(['tom']), NOW, o);
  assert.equal(stats.week, 1);
  assert.equal(stats.watching, 0);
  assert.equal(stats.typicalMinutes, 20);
  assert.deepEqual(list.map((r) => [r.viewer, r.visits, r.minutes, r.watching, r.me]), [['tom', 2, 958, true, true], ['b', 1, 20, false, false]]);
  assert.equal(withoutMine(visits, new Set(), NOW, o).stats.week, 2);
});

test('the ticker\'s count: asked for only when switched on; N FANS WATCHING last on the tape', async () => {
  const { createAudience } = await import('../src/channel/audience.js');
  const { watchingItem } = await import('../src/channel/ticker.js');
  /** @type {any[]} */
  const sent = [];
  const send = async (/** @type {any} */ _url, /** @type {any} */ init) => {
    const body = JSON.parse(init.body);
    sent.push(body);
    return new Response(JSON.stringify(body.watching ? { hello: true, watching: 14 } : { hello: true }), { status: 200 });
  };
  const audience = createAudience({ endpoint: '/api/audience', send, storage: null });
  assert.equal(await audience.hello('0123456789abcdef'), null);
  assert.equal(await audience.hello('0123456789abcdef', true), 14);
  assert.deepEqual(sent, [{ session: '0123456789abcdef' }, { session: '0123456789abcdef', watching: true }]);
  assert.equal(watchingItem(14)?.text, '14 FANS WATCHING');
  assert.equal(watchingItem(1)?.text, '1 FAN WATCHING');
  assert.equal(watchingItem(null), null);
});
