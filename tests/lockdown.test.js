// The live site locked down (the launch, Task 275; docs/live.md §6): the dev tools only on the dev server, the URL
// otherwise ignored but for ?layout=broadcast; a card before season 1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { devParams, devToolsAllowed, publicParams } from '../src/channel/dev.js';
import { preseasonText } from '../src/channel/preseason.js';

test('the dev tools only on the dev server', () => {
  for (const h of ['localhost', '127.0.0.1', '[::1]', 'app.localhost']) assert.ok(devToolsAllowed(h), h);
  for (const h of ['scorchball.tv', 'www.scorchball.tv', 'scorchball.pages.dev', 'localhost.example.com']) assert.ok(!devToolsAllowed(h), h);
});

test('on the live site the URL can\'t move the clock or the seed, and nothing in it stops the channel', () => {
  const p = publicParams('?at=2027-01-01T00:00Z&seed=mine&speed=60&fbclid=abc&layout=broadcast');
  assert.deepEqual(p, { ...devParams(''), layout: 'broadcast' });
  assert.equal(publicParams('?layout=nonsense').layout, 'full');
  // The phone readout (phones, step 1) is allowed: it only shows numbers.
  assert.equal(publicParams('?perf=1').perf, true);
  assert.equal(publicParams('?perf=yes').perf, false);
  // So are the sound switches for phones, a bad value ignored there and refused on the dev server.
  assert.deepEqual(publicParams('?latency=0.25&crowdrate=48000&murmur=bed&ahead=0.1'), { ...devParams(''), latency: 0.25, crowdRate: 48000, murmurBed: true, ahead: 0.1 });
  assert.equal(publicParams('?recordings=off').recordingsOff, true);
  assert.equal(publicParams('?phone=1').phone, true);
  assert.equal(publicParams('?phone=0').phone, false);
  assert.deepEqual(publicParams('?latency=5&crowdrate=x&murmur=no'), devParams(''));
  assert.throws(() => devParams('?latency=5'), /latency/);
  assert.throws(() => devParams('?murmur=no'), /murmur/);
  // The dev server still refuses what it doesn't know, to catch typos.
  assert.throws(() => devParams('?fbclid=abc'), /Unknown URL parameter/);
});

test('before season 1: when it starts in the league\'s zone, and a countdown', () => {
  const start = Date.parse('2026-11-02T05:00:00Z'); // Monday 2 November, 00:00 in New York
  const t = preseasonText(start, start - (3 * 86_400 + 4 * 3600 + 5 * 60 + 6) * 1000, 'America/New_York');
  assert.deepEqual(t, { title: 'SEASON 1 KICKS OFF', when: 'MON 2 NOV · 00:00 NEW YORK TIME', countdown: 'IN 3 DAYS 04:05:06' });
  assert.equal(preseasonText(start, start - 59_500, 'America/New_York').countdown, 'IN 00:01:00');
  assert.equal(preseasonText(start, start - 86_400_000, 'America/New_York').countdown, 'IN 1 DAY 00:00:00');
});
