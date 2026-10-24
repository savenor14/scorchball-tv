import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { finalDayCard, finalDayResultsCard } from '../src/channel/cards.js';
import { alertAt } from '../src/channel/captions.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { byStakes, stakesOf } from '../src/channel/onScreen.js';
import { createProgramme } from '../src/channel/programme.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const slots = createCalendar(config).slots(1);
const MIN = 60_000;
const SEED = 'final-round-tests';

/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const ctx = { timelineOf, playerName: (/** @type {string} */ id) => id };

/** A table from points, best first. @param {number[]} points */
const tableOf = (points) => points.map((p, i) => /** @type {any} */ ({ position: i + 1, teamId: `t${i + 1}`, points: p }));

test('stakes: the Shield race, the playoff race, and dead rubbers', () => {
  const s = stakesOf(tableOf([30, 28, 25, 21, 19, 17, 10, 5]), 4, 3);
  assert.deepEqual(s.get('t1'), { shield: true, playoff: false }, 'leader can be caught by 2nd (2 behind)');
  assert.deepEqual(s.get('t2'), { shield: true, playoff: false });
  assert.deepEqual(s.get('t3'), { shield: false, playoff: false }, '5 behind the leader, 6 clear of 5th');
  assert.deepEqual(s.get('t4'), { shield: false, playoff: true }, '4th is 2 clear of 5th');
  assert.deepEqual(s.get('t5'), { shield: false, playoff: true });
  assert.deepEqual(s.get('t6'), { shield: false, playoff: false }, '4 behind 4th');
  assert.deepEqual(s.get('t8'), { shield: false, playoff: false });

  const table = tableOf([30, 28, 25, 21, 19, 17, 10, 5]);
  const matches = [
    { homeId: 't7', awayId: 't8', slot: 52 }, // nothing at stake
    { homeId: 't4', awayId: 't5', slot: 53 }, // playoff six-pointer
    { homeId: 't1', awayId: 't2', slot: 54 }, // title decider
    { homeId: 't3', awayId: 't6', slot: 55 },
  ];
  const ordered = byStakes(matches, s, table).map((m) => m.slot);
  assert.deepEqual(ordered, [54, 53, 55, 52], 'two-race ties broken by combined points; the dead rubber last');
});

test('the featured match is one of the four and holds steady while it is live', () => {
  const kickoff = slots[52].kickoff;
  const live = new LiveLeague(config, { now: kickoff + 60 * MIN, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  const first = programme.at(kickoff + MIN);
  assert.equal(first.kind, 'live');
  if (first.kind !== 'live') return;
  assert.equal(first.group.length, 4);
  assert.ok(first.group.includes(first.match));
  const end = first.match.kickoff + timelineOf(first.match).duration;
  for (let t = kickoff + MIN; t < end; t += 30_000) {
    const s = programme.at(t);
    assert.equal(s.kind === 'live' && s.match.id, first.match.id, 'no switching while the featured match is live');
  }
  // Once it has ended, if another is still going, the channel moves to it.
  const later = programme.at(end + 1);
  if (later.kind === 'live') assert.notEqual(later.match.id, first.match.id);
});

test('goal alerts: from other matches, exactly when the goal happens, with the match number', () => {
  const kickoff = slots[52].kickoff;
  const live = new LiveLeague(config, { now: kickoff + 60 * MIN, seed: SEED });
  const group = live.matchesIn(1).slice(52, 56);
  const shown = group[0];
  const actx = { timelineOf, abbr: (/** @type {string} */ id) => live.league.teams[id].abbr, alertMs: config.settings.captions.alertMs };
  /** Every goal in the other matches, with its on-screen moment. */
  const goalTimes = new Map(group.slice(1).flatMap((m) => timelineOf(m).events
    .filter((/** @type {any} */ e) => e.event.type === 'goal').map((/** @type {any} */ e) => [String(e.event.seq), m.kickoff + e.at])));
  let checked = 0;
  group.slice(1).forEach((m, i) => {
    for (const { event, at } of timelineOf(m).events.filter((/** @type {any} */ e) => e.event.type === 'goal')) {
      const a = alertAt(group, shown.id, m.kickoff + at, actx);
      if (a?.key !== String(event.seq)) {
        // Only allowed if another match scored at exactly the same moment.
        assert.equal(goalTimes.get(/** @type {string} */ (a?.key)), m.kickoff + at, 'a different alert only for a simultaneous goal');
        continue;
      }
      assert.equal(a?.index, i + 2);
      assert.ok(a?.text.includes(`${event.data.score[0]}-${event.data.score[1]}`));
      assert.notEqual(alertAt(group, shown.id, m.kickoff + at + actx.alertMs, actx)?.key, String(event.seq));
      checked++;
    }
  });
  assert.ok(checked > 0);
  // Goals in the match on screen never alert.
  const own = timelineOf(shown).events.find((/** @type {any} */ e) => e.event.type === 'goal');
  if (own) assert.notEqual(alertAt(group, shown.id, shown.kickoff + own.at, actx)?.key, String(own.event.seq));
});

test('final-day cards: the four fixtures with stakes, then all results with the Shield and playoff places', () => {
  const kickoff = slots[52].kickoff;
  const before = kickoff - 4 * MIN;
  const live = new LiveLeague(config, { now: before, seed: SEED });
  const pre = createProgramme(live, timelineOf).at(before);
  assert.equal(pre.kind, 'pre_match');
  if (pre.kind !== 'pre_match') return;
  assert.equal(pre.group.length, 4);
  const card = finalDayCard(pre.group, live, before, ctx);
  assert.deepEqual(card.rows.map((r) => r.number), [1, 2, 3, 4]);

  live.advanceTo(kickoff);
  const ends = live.matchesIn(1).filter((m) => m.kickoff === kickoff).map((m) => m.kickoff + timelineOf(m).duration);
  const after = Math.max(...ends) + (config.settings.segments.handshakeMinutes + 1) * MIN;
  live.advanceTo(after);
  const ft = createProgramme(live, timelineOf).at(after);
  assert.equal(ft.kind, 'full_time');
  if (ft.kind !== 'full_time') return;
  assert.equal(ft.group.length, 4);
  const results = finalDayResultsCard(ft.group, live, after, ctx);
  assert.equal(results.rows.length, 4);
  assert.equal(results.shieldId, live.state.table[0].teamId);
  assert.deepEqual(results.playoffIds, live.state.seeds);
});
