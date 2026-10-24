import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { devParams, jumpSearch, jumpsFor, matchShare, zoneStamper } from '../src/channel/dev.js';
import { liftParts } from '../src/channel/trophyLift.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = structuredClone(await loadConfigFromDisk());
// Pinned: the dates below are the dev league's; the live start moves (the dress rehearsal, the launch).
config.settings.live.firstSeasonStarts = '2026-10-05';
const cal = createCalendar(config);
const stamp = zoneStamper('America/New_York');
const MIN = 60_000;

test('devParams reads ?at, ?speed, ?seed and ?hl and rejects bad values', () => {
  assert.deepEqual(devParams(''), { at: null, speed: 1, seed: null, highlightsSpeed: null, layout: 'full', sound: false, hush: null, fire: null, fill: true, moments: null, coins: null, cheer: null, perf: false, watching: false, from: null, latency: null, crowdRate: null, murmurBed: false, ahead: null, recordingsOff: false, phone: null });
  assert.deepEqual(devParams('?at=2026-10-07T18:00-04:00&speed=60&seed=f&hl=1.5&layout=broadcast&sound=on'), { at: Date.UTC(2026, 9, 7, 22), speed: 60, seed: 'f', highlightsSpeed: 1.5, layout: 'broadcast', sound: true, hush: null, fire: null, fill: true, moments: null, coins: null, cheer: null, perf: false, watching: false, from: null, latency: null, crowdRate: null, murmurBed: false, ahead: null, recordingsOff: false, phone: null });
  assert.equal(devParams('?moments=demo').moments, 'demo');
  assert.throws(() => devParams('?moments=all'), /\?moments= must be reset or demo/);
  assert.equal(devParams('?hush=murmur').hush, 'murmur');
  assert.throws(() => devParams('?hush=loud'), /\?hush= must be roar, murmur, both or none/);
  assert.throws(() => devParams('?layout=wide'), /\?layout= must be full or broadcast/);
  assert.throws(() => devParams('?sound=yes'), /\?sound= must be on/);
  assert.throws(() => devParams('?hl=0'), /\?hl= must be a number above 0/);
  assert.throws(() => devParams('?at=tuesday'), /\?at= must be a date-time/);
  assert.throws(() => devParams('?speed=-2'), /\?speed= must be a number above 0/);
  assert.throws(() => devParams('?speed=fast'), /\?speed=/);
  assert.throws(() => devParams('?seed='), /\?seed= must not be empty/);
  assert.throws(() => devParams('?sped=60'), /Unknown URL parameter \?sped=/);
});

test('stamps are league wall time in the form ?at= accepts, across daylight saving', () => {
  const summer = Date.UTC(2026, 9, 7, 21);
  assert.equal(stamp(summer), '2026-10-07T17:00-04:00');
  assert.equal(stamp(summer + 5_400), '2026-10-07T17:00:05-04:00'); // whole seconds only
  assert.equal(stamp(Date.UTC(2026, 10, 2, 5)), '2026-11-02T00:00-05:00');
  for (const t of [summer, summer + 5_000, Date.UTC(2026, 10, 1, 6, 30)]) assert.equal(devParams(`?at=${stamp(t)}`).at, t);
});

test('jumpSearch sets ?at= and keeps the other parameters', () => {
  assert.equal(jumpSearch('?seed=f&speed=60', '2026-10-07T17:00-04:00'), '?seed=f&speed=60&at=2026-10-07T17:00-04:00');
  assert.equal(jumpSearch('?at=2026-10-05T00:00-04:00', '2026-10-07T17:00-04:00'), '?at=2026-10-07T17:00-04:00');
  assert.equal(devParams(jumpSearch('', '2026-10-07T17:00:05-04:00')).at, Date.parse('2026-10-07T17:00:05-04:00'));
  // The layout and sound carried over a jump (Task 62).
  assert.equal(jumpSearch('?seed=f&sound=on', 'T', { layout: 'broadcast', sound: false }), '?seed=f&at=T&layout=broadcast');
  assert.equal(jumpSearch('?layout=broadcast', 'T', { layout: 'full', sound: true }), '?at=T&sound=on');
});

test('jumps cover the next match, the big days and the next season, in time order', () => {
  const t = Date.parse('2026-10-07T12:00-04:00');
  const jumps = jumpsFor(cal, t, config.settings, null);
  const byLabel = Object.fromEntries(jumps.map((j) => [j.label, j.at]));
  const slots = cal.slots(1);
  assert.equal(byLabel['S1 final round (live)'], Date.parse('2026-10-10T20:06-04:00'));
  assert.equal(byLabel['S1 final day card'], Date.parse('2026-10-10T19:57-04:00'));
  assert.equal(byLabel['S1 semifinal 1'], Date.parse('2026-10-11T14:02-04:00'));
  assert.equal(byLabel['S1 final'], Date.parse('2026-10-11T20:02-04:00'));
  assert.equal(byLabel['S2 countdown'], Date.parse('2026-10-11T23:57-04:00'));
  assert.equal(byLabel['S2 opening match'], cal.slots(2)[0].kickoff + 2 * MIN);
  const next = cal.at(t).next;
  assert.equal(jumps[0].at, /** @type {import('../src/channel/calendar.js').Slot} */ (next).kickoff - config.settings.segments.walkOutMinutes * MIN + 15_000);
  assert.equal(jumps[1].at, /** @type {import('../src/channel/calendar.js').Slot} */ (next).kickoff + 2 * MIN);
  assert.equal(byLabel['S1 opening match'], slots[0].kickoff + 2 * MIN);
  // Without the final's end, the champions and off-season jumps wait for it.
  assert.equal(byLabel['S1 champions'], null);
  assert.equal(byLabel['S1 off-season'], null);
  const known = jumps.slice(2).filter((j) => j.at !== null).map((j) => /** @type {number} */ (j.at));
  assert.deepEqual(known, [...known].sort((a, b) => a - b));
});

test('with the final\'s end known, champions follow the full-time card and the off-season follows them', () => {
  const finalEnd = Date.parse('2026-10-11T20:18-04:00');
  const byLabel = Object.fromEntries(jumpsFor(cal, finalEnd, config.settings, finalEnd).map((j) => [j.label, j.at]));
  const { fullTimeMinutes, potmSeconds, championMinutes } = config.settings.segments;
  // The trophy lift (Task 190) in the handshakes' place, then the show.
  const lift = liftParts(config.settings.trophyLift);
  assert.equal(byLabel['S1 trophy lift'], finalEnd + 15_000);
  assert.equal(byLabel['S1 the cup lifted'], finalEnd + lift.closeUpAt - 3000);
  const championFrom = finalEnd + lift.total + fullTimeMinutes * MIN + potmSeconds * 1000;
  assert.equal(byLabel['S1 champions'], championFrom + 15_000);
  assert.equal(byLabel['S1 awards'], championFrom + championMinutes * MIN + 15_000);
  const aw = config.settings.awards;
  assert.equal(byLabel['S1 off-season'], championFrom + championMinutes * MIN + (aw.talkSeconds + aw.order.length * aw.awardSeconds) * 1000 + 15_000);
  assert.equal(byLabel['Next match (final)'], undefined); // the final has kicked off: nothing left this season
});

test('with a finished match, jumps to its handshakes and post-match show come first', () => {
  const t = Date.parse('2026-10-07T12:00-04:00');
  const lastEnd = t - 10 * MIN;
  const jumps = jumpsFor(cal, t, config.settings, null, lastEnd);
  assert.deepEqual(jumps.slice(0, 2).map((j) => j.label), ['Last handshakes', 'Last post-match show']);
  assert.equal(jumps[0].at, lastEnd + 15_000);
  assert.equal(jumps[1].at, lastEnd + config.settings.segments.handshakeMinutes * MIN + 15_000);
});

test('match share: a match is on screen for most of the week, live for a smaller part', () => {
  const { share, live } = matchShare(config, 'share-tests', 1, 5 * MIN);
  assert.ok(share >= 0.6 && share <= 0.9, `share ${share}`);
  assert.ok(live > 0.08 && live < share, `live ${live}`);
});
