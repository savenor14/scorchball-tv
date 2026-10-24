import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { tableView } from '../src/channel/onScreen.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const slots = createCalendar(config).slots(1);
const MIN = 60_000;
const SEED = 'table-tests';

/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const viewAt = (/** @type {number} */ t) => {
  const live = new LiveLeague(config, { now: t, seed: SEED });
  return { live, view: tableView(live, 1, t, timelineOf) };
};

test('a match in progress doesn\'t move the table until full time; its two teams are marked', () => {
  const t = slots[3].kickoff + 5 * MIN; // last match of round 1, still being played
  const { live, view } = viewAt(t);
  assert.equal(view.title, 'TABLE - S1');
  assert.equal(view.rows.reduce((s, r) => s + r.played, 0), 6, 'the match being played isn\'t counted yet');
  assert.equal(live.state.table.reduce((s, r) => s + r.played, 0), 8, 'the sim is already ahead of the screen');
  const match = live.matchesIn(1)[3];
  assert.deepEqual(view.rows.filter((r) => r.live).map((r) => r.teamId).sort(), [match.homeId, match.awayId].sort());
  const before = viewAt(slots[3].kickoff - MIN).view.rows;
  assert.deepEqual(view.rows.map((r) => [r.teamId, r.points]), before.map((r) => [r.teamId, r.points]), 'same as before kick-off');
});

test('after full time the match counts', () => {
  const { view } = viewAt(slots[3].kickoff + 80 * MIN); // after full time, before the next kick-off
  assert.equal(view.title, 'TABLE - S1');
  assert.equal(view.rows.reduce((s, r) => s + r.played, 0), 8);
  assert.ok(view.rows.every((r) => !r.live));
});

test('the final round doesn\'t move the table either, until its matches finish', () => {
  const { view } = viewAt(slots[52].kickoff + 12 * MIN);
  assert.equal(view.title, 'TABLE - S1');
  assert.equal(view.rows.filter((r) => r.live).length, 8, 'every team is playing');
  assert.ok(view.rows.every((r) => r.played === 13), 'the final round isn\'t counted yet');
  assert.equal(view.cut, config.rules.playoffs.teams);
});

test('once the final round has finished on screen it is the final table', () => {
  const { live, view } = viewAt(slots[52].kickoff + 80 * MIN);
  assert.equal(view.title, 'FINAL TABLE - S1');
  assert.deepEqual(view.rows.map((r) => r.teamId), live.state.seeds.concat(
    /** @type {any} */ (live.state.table).slice(config.rules.playoffs.teams).map((/** @type {any} */ r) => r.teamId),
  ));
  assert.ok(view.rows.every((r) => !r.live));
});
