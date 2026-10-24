// The studio cards added in Task 102 (docs/channel.md §16.9): the form guide, the playoff race, the other leaders and
// head-to-head, built from what has happened on screen; and their place in the rotation (cardsPerBlock to a block).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { studioCard } from '../src/channel/cards.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { isFinished, tableAt, upcomingAt } from '../src/channel/onScreen.js';
import { createProgramme } from '../src/channel/programme.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const calendar = createCalendar(config);
const slots = calendar.slots(1);
const SEED = 'cards-tests';
/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const durationOf = (/** @type {any} */ m) => timelineOf(m).duration;
const ctx = { timelineOf, playerName: (/** @type {string} */ id) => id };
const cut = config.rules.playoffs.teams;

test('the form guide and the playoff race: every team, from the table as it stands on screen', () => {
  const t = slots[30].kickoff - 1000;
  const live = new LiveLeague(config, { now: t, seed: SEED });
  const table = tableAt(live, 1, t, durationOf);
  const form = /** @type {any} */ (studioCard('form', live, t, 0, ctx));
  assert.deepEqual(form.rows, table.map((r) => ({ teamId: r.teamId, form: r.form })));
  assert.ok(form.rows.every((/** @type {any} */ r) => r.form.length <= 5));
  const race = /** @type {any} */ (studioCard('race', live, t, 0, ctx));
  const games = (table.length - 1) * 2;
  assert.equal(race.done, false);
  assert.equal(race.cut, cut);
  for (const r of race.rows) {
    const row = /** @type {any} */ (table.find((x) => x.teamId === r.teamId));
    assert.equal(r.left, games - row.played);
    // Inside the cut: points clear of the first team outside it; outside: points off the last team inside.
    assert.equal(r.gap, r.position <= cut ? r.points - table[cut].points : table[cut - 1].points - r.points);
    assert.ok(r.gap >= 0);
  }
  // Once the regular season is over, the race is settled.
  const end = slots[calendar.regularCount].kickoff - 1000;
  const later = new LiveLeague(config, { now: end, seed: SEED });
  const settled = /** @type {any} */ (studioCard('race', later, end, 0, ctx));
  assert.equal(settled.done, true);
  assert.ok(settled.rows.every((/** @type {any} */ r) => r.left === 0));
});

test('a big stat\'s own leaders: assists, stops (tackles and blocks) and keepers by saves with their save %, the top five, most first', () => {
  const t = slots[30].kickoff - 1000;
  const live = new LiveLeague(config, { now: t, seed: SEED });
  for (const stat of ['assists', 'stops', 'keepers']) {
    const card = /** @type {any} */ (studioCard(stat, live, t, 0, ctx));
    assert.equal(card.kind, 'stat_leaders');
    assert.equal(card.stat, stat);
    assert.ok(card.rows.length > 0 && card.rows.length <= 5);
    for (let i = 1; i < card.rows.length; i++) assert.ok(card.rows[i - 1].value >= card.rows[i].value);
    if (stat === 'keepers') assert.ok(card.rows.every((/** @type {any} */ r) => r.pct >= 0 && r.pct <= 100));
    else assert.ok(card.rows.every((/** @type {any} */ r) => r.pct === null));
  }
});

test('head-to-head: the next match\'s teams, their meetings this season and last, only once finished on screen', () => {
  // Late in season 2, so last season's meetings count too.
  const s2 = calendar.slots(2);
  let withMeetings = 0;
  for (const i of [20, 35, 50, 55]) {
    const t = s2[i].kickoff - 1000;
    const live = new LiveLeague(config, { now: t, seed: SEED });
    const card = /** @type {any} */ (studioCard('head_to_head', live, t, 0, ctx));
    const next = upcomingAt(live, t, durationOf, 1)[0];
    assert.equal(card.home.teamId, next.homeId);
    assert.equal(card.away.teamId, next.awayId);
    for (const m of card.meetings) {
      assert.deepEqual([m.homeId, m.awayId].sort(), [next.homeId, next.awayId].sort());
      assert.ok(m.season === 1 || m.season === 2);
    }
    const all = [...live.matchesIn(1), ...live.matchesIn(2)].filter((m) => [m.homeId, m.awayId].includes(next.homeId) && [m.homeId, m.awayId].includes(next.awayId));
    assert.equal(card.meetings.length, Math.min(4, all.filter((m) => isFinished(m, t, durationOf)).length));
    if (card.meetings.length > 0) withMeetings++;
  }
  assert.ok(withMeetings > 0);
});

// The rotation is dealt from decks by phase since Tom's note 11 (2026-10-19): tests/studioDecks.test.js.

test('Task 206: the season\'s honours: the champions, the Pennant, the five awards and the No. 1 pick', () => {
  const after = slots.at(-1).kickoff + 2 * 3600_000;
  const off = new LiveLeague(config, { now: after, seed: SEED });
  off.advanceTo(after);
  const c = /** @type {any} */ (studioCard('honours', off, after, 0, ctx));
  const h = /** @type {any} */ (off.league.history[0]);
  assert.equal(c.title, 'SEASON 1 HONOURS');
  assert.equal(c.championId, h.championId);
  assert.equal(c.shieldId, h.shieldId);
  // The founding season's five: no Spark without rookies (Task 252).
  assert.deepEqual(c.awards.map((/** @type {any} */ a) => a.name), config.rules.awards.list.filter((/** @type {any} */ a) => a.id !== 'spark').map((/** @type {any} */ a) => a.name));
  assert.ok(c.firstPick?.player && c.firstPick.teamId);
});

test('Task 206: no highlights package more than highlights.perGap times in a gap (the first gap ever had one match about 40 times)', () => {
  const live = new LiveLeague(config, { now: slots[0].kickoff, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  /** @type {Record<string, number>} */
  const plays = {};
  let last = '';
  for (let t = slots[0].kickoff; t < slots[1].kickoff;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = programme.at(Math.max(p.from, t));
    if (seg.kind === 'highlights' && !seg.show && `${seg.match.id}|${p.from}` !== last) {
      last = `${seg.match.id}|${p.from}`;
      plays[seg.match.id] = (plays[seg.match.id] ?? 0) + 1;
    }
    t = p.until > t ? p.until : t + 1000;
  }
  for (const n of Object.values(plays)) assert.ok(n <= config.settings.highlights.perGap, JSON.stringify(plays));
});

test('the playoff race only once no team has more than raceFromGamesLeft games left (Friday), a team in the spotlight before', () => {
  /** The studio cards shown between two slots. @param {number} a @param {number} b */
  const cardsBetween = (a, b) => {
    const live = new LiveLeague(config, { now: slots[a].kickoff, seed: SEED });
    const programme = createProgramme(live, timelineOf);
    const seen = new Set();
    for (let t = slots[a].kickoff; t < slots[b].kickoff;) {
      live.advanceTo(t);
      const p = programme.pieceAt(t);
      const seg = programme.at(Math.max(p.from, t));
      if (seg.kind === 'studio') seen.add(seg.card);
      t = p.until > t ? p.until : t + 1000;
    }
    return seen;
  };
  const day = (/** @type {number} */ d) => slots.findIndex((x) => x.kickoff >= calendar.instant(1, (d - 1) * 1440));
  const tuesday = cardsBetween(day(2), day(2) + 5);
  assert.ok(!tuesday.has('race') && tuesday.has('spotlight'));
  const friday = cardsBetween(day(5) + 1, day(5) + 6);
  assert.ok(friday.has('race'), [...friday].join(' '));
});
