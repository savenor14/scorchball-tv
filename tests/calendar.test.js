import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar, zoneOffsets } from '../src/channel/calendar.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createSchedule } from '../src/sim/schedule.js';
import { createRng } from '../src/sim/rng.js';

const config = structuredClone(await loadConfigFromDisk());
// Pinned: the dates below are the dev league's; the live start moves (the dress rehearsal, the launch).
config.settings.live.firstSeasonStarts = '2026-10-05';
const cal = createCalendar(config);
const iso = (/** @type {number} */ t) => new Date(t).toISOString();
const MIN = 60_000;

test('season 1 starts at 00:00 New York time on the configured Monday, and seasons are a week apart', () => {
  assert.equal(iso(cal.seasonStart(1)), '2026-10-05T04:00:00.000Z'); // EDT, UTC−4
  assert.equal(iso(cal.seasonStart(2)), '2026-10-12T04:00:00.000Z');
  // Clocks go back on Sunday 1 November 2026 (day 7 of season 4), so season 5 starts at UTC−5.
  assert.equal(iso(cal.seasonStart(5)), '2026-11-02T05:00:00.000Z');
});

test('a season has 56 regular slots in round order, then the semifinals and the final', () => {
  const slots = cal.slots(1);
  assert.equal(slots.length, 59);
  assert.equal(cal.regularCount, 56);
  assert.deepEqual(slots.slice(0, 5).map((s) => s.round), [1, 1, 1, 1, 2]);
  assert.equal(slots[55].round, 14);
  assert.deepEqual(slots.slice(56).map((s) => s.stage), ['semifinal', 'semifinal', 'final']);
  slots.forEach((s, i) => assert.equal(s.index, i));
  for (let i = 1; i < slots.length; i++) assert.ok(slots[i].kickoff >= slots[i - 1].kickoff, `slot ${i} goes back in time`);
  for (const s of slots) assert.equal(s.kickoff % MIN, 0, 'kick-offs are on whole minutes');
});

test('slot rounds match the schedule the sim builds', () => {
  const schedule = createSchedule(config.teams.teams.map((/** @type {any} */ t) => t.id), 1, createRng('x'));
  const rounds = schedule.flatMap((r) => r.matches.map(() => r.round));
  assert.deepEqual(cal.slots(1).slice(0, cal.regularCount).map((s) => s.round), rounds);
});

test('regular-season kick-offs: evenly spaced from day 1 00:30, final round together at day 6 20:00', () => {
  const slots = cal.slots(1);
  assert.equal(iso(slots[0].kickoff), '2026-10-05T04:30:00.000Z');
  const gaps = slots.slice(1, 52).map((s, i) => (s.kickoff - slots[i].kickoff) / MIN);
  assert.ok(gaps.every((g) => g === 161 || g === 160), `gaps ${[...new Set(gaps)]}`);
  for (const s of slots.slice(52, 56)) assert.equal(iso(s.kickoff), '2026-10-11T00:00:00.000Z'); // Sat 20:00 EDT
  assert.equal((slots[52].kickoff - slots[51].kickoff) / MIN, 161);
});

test('playoffs on day 7 keep their New York wall-clock times across the clock change', () => {
  const s1 = cal.slots(1).slice(56).map((s) => iso(s.kickoff));
  assert.deepEqual(s1, ['2026-10-11T18:00:00.000Z', '2026-10-11T21:00:00.000Z', '2026-10-12T00:00:00.000Z']);
  // Season 4: day 7 is Sunday 1 November, after the 02:00 change to EST (UTC−5).
  const s4 = cal.slots(4).slice(56).map((s) => iso(s.kickoff));
  assert.deepEqual(s4, ['2026-11-01T19:00:00.000Z', '2026-11-01T22:00:00.000Z', '2026-11-02T01:00:00.000Z']);
  // Season 23: day 7 is Sunday 14 March 2027, after the change to EDT (UTC−4).
  assert.equal(iso(cal.seasonStart(23)), '2027-03-08T05:00:00.000Z');
  assert.equal(iso(cal.slots(23)[56].kickoff), '2027-03-14T18:00:00.000Z');
});

test('seasonAt and at(): boundaries, phases, and the next slot', () => {
  const start2 = cal.seasonStart(2);
  assert.equal(cal.seasonAt(start2 - 1), 1);
  assert.equal(cal.seasonAt(start2), 2);
  assert.equal(cal.seasonAt(cal.seasonStart(5)), 5);
  assert.equal(cal.seasonAt(cal.seasonStart(5) - 1), 4);
  assert.equal(cal.seasonAt(Date.UTC(2020, 0, 1)), 1, 'before season 1 counts as season 1');

  const slots = cal.slots(2);
  const before = cal.at(start2);
  assert.deepEqual([before.season, before.phase, before.started, before.next?.index], [2, 'regular', 0, 0]);
  assert.equal(before.seasonEnd, cal.seasonStart(3));

  const atKickoff = cal.at(slots[10].kickoff);
  assert.deepEqual([atKickoff.started, atKickoff.next?.index], [11, 11]);
  const justBefore = cal.at(slots[10].kickoff - 1);
  assert.deepEqual([justBefore.started, justBefore.next?.index], [10, 10]);

  const finalRound = cal.at(slots[52].kickoff);
  assert.deepEqual([finalRound.started, finalRound.next?.stage, finalRound.phase], [56, 'semifinal', 'regular']);
  const semis = cal.at(slots[56].kickoff);
  assert.deepEqual([semis.phase, semis.next?.index], ['playoffs', 57]);
  const after = cal.at(slots[58].kickoff + 60 * MIN);
  assert.deepEqual([after.season, after.phase, after.started, after.next], [2, 'playoffs', 59, null]);
});

test('a 2-team playoff has just the final', () => {
  const c = structuredClone(config);
  c.rules.playoffs.teams = 2;
  c.settings.playoffs.kickoffs = ['day 7 20:00'];
  const slots = createCalendar(c).slots(1);
  assert.equal(slots.length, 57);
  assert.equal(slots[56].stage, 'final');
});

test('without a simultaneous final round, all 56 matches are spaced and the last kicks off at finalRoundKickoff', () => {
  const c = structuredClone(config);
  c.settings.calendar.finalRoundSimultaneous = false;
  const slots = createCalendar(c).slots(1);
  assert.equal(iso(slots[55].kickoff), '2026-10-11T00:00:00.000Z');
  assert.notEqual(slots[54].kickoff, slots[55].kickoff);
});

test('zoneOffsets: skipped spring times move an hour later, repeated autumn times take the first occurrence', () => {
  const ny = zoneOffsets('America/New_York');
  // 2027-03-14 02:30 doesn't exist in New York.
  assert.equal(iso(ny.wallToInstant(Date.UTC(2027, 2, 14, 2, 30))), '2027-03-14T07:30:00.000Z'); // 03:30 EDT
  // 2026-11-01 01:30 happens twice; the first is EDT.
  assert.equal(iso(ny.wallToInstant(Date.UTC(2026, 10, 1, 1, 30))), '2026-11-01T05:30:00.000Z');
  // An ordinary time either side.
  assert.equal(iso(ny.wallToInstant(Date.UTC(2026, 6, 1, 12, 0))), '2026-07-01T16:00:00.000Z');
  assert.equal(iso(ny.wallToInstant(Date.UTC(2026, 11, 1, 12, 0))), '2026-12-01T17:00:00.000Z');
});
