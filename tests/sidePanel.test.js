import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { matchStatsAt, statRows } from '../src/channel/matchStats.js';
import { createProgramme } from '../src/channel/programme.js';
import { replayLabel, statsView, TABS, topView, weekView } from '../src/channel/sidePanel.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const slots = createCalendar(config).slots(1);
const MIN = 60_000;
const SEED = 'side-tests';
/** @type {Map<string, any>} */
const tls = new Map();
const timelineOf = (/** @type {any} */ m) => tls.get(m.id) ?? tls.set(m.id, createTimeline(m, config)).get(m.id);

test('tabs: STATS first, each with its own key', () => {
  assert.equal(TABS[0].id, 'stats');
  assert.equal(new Set(TABS.map((t) => t.key)).size, TABS.length);
  assert.ok(TABS.every((t) => !'0123456789h`'.includes(t.key)), 'no clash with the match keys or the dev panel');
});

test('STATS follows what\'s on screen: live as it stands, before kick-off at zero, in the gaps the last full time', () => {
  const live = new LiveLeague(config, { now: slots[6].kickoff + 8 * MIN, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  const m = live.matchesIn(1)[6];
  const t = m.kickoff + 8 * MIN;
  const seg = programme.at(t);
  assert.equal(seg.kind, 'live');
  const v = /** @type {any} */ (statsView(seg, m, live, t, timelineOf));
  assert.deepEqual(v.rows, statRows(matchStatsAt(timelineOf(m), t - m.kickoff)));
  assert.match(v.status, /^LIVE \d+'$/);

  const before = slots[7].kickoff - 3 * MIN;
  live.advanceTo(before);
  const pre = /** @type {any} */ (statsView(programme.at(before), null, live, before, timelineOf));
  assert.equal(pre.status, 'UP NEXT');
  assert.ok(pre.rows.filter((/** @type {any} */ r) => r[0] !== 'POSS').every((/** @type {any} */ r) => r[1] === '0' && r[2] === '0'));

  const gap = slots[7].kickoff - 30 * MIN;
  const studio = /** @type {any} */ (statsView({ kind: 'studio', card: 'results', rotation: 0, next: null, until: gap + 1 }, null, new LiveLeague(config, { now: gap, seed: SEED }), gap, timelineOf));
  assert.equal(studio.status, 'FULL TIME');
  assert.equal(studio.homeId, m.homeId);
});

test('a re-air shows the match as it stands at that moment of the replay, never ahead', () => {
  const live = new LiveLeague(config, { now: slots[11].kickoff + MIN, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  for (let t = slots[11].kickoff + 30 * MIN; t < slots[12].kickoff; t += 20_000) {
    const seg = programme.at(t);
    if (seg.kind !== 'reair' || seg.part !== 'match') continue;
    const v = /** @type {any} */ (statsView(seg, seg.match, live, t, timelineOf));
    assert.equal(v.status, 'REPLAY');
    // When it was played, under REPLAY (Tom, 2026-10-19).
    assert.equal(v.played, seg.match.kickoff);
    const s = timelineOf(seg.match).stateAt(seg.elapsed);
    assert.equal(v.scorers.length, s.score[0] + s.score[1]);
    return;
  }
  assert.fail('no re-air found');
});

test('WEEK: newest results, a re-aired match\'s score hidden, then the next fixtures', () => {
  const t = slots[10].kickoff - 20 * MIN;
  const live = new LiveLeague(config, { now: t, seed: SEED });
  const played = live.matchesIn(1);
  const rows = weekView(live, t, timelineOf, { results: 4, upcoming: 3, reairId: played[8].id });
  const results = rows.filter((r) => r.kind === 'result' || r.kind === 'replay');
  assert.deepEqual(results.map((r) => r.key), [played[9].id, played[8].id, played[7].id, played[6].id]);
  const replay = /** @type {any} */ (rows.find((r) => r.key === played[8].id));
  assert.equal(replay.kind, 'replay');
  assert.equal(replay.score, null);
  assert.equal(rows.filter((r) => r.kind === 'next').length, 3);
  assert.equal(rows.filter((r) => r.kind === 'next')[0].kickoff, slots[10].kickoff);
});

test('TOP: scorers from finished matches, most goals first', () => {
  const t = slots[20].kickoff - MIN;
  const rows = topView(new LiveLeague(config, { now: t, seed: SEED }), t, timelineOf, 10);
  assert.ok(rows.length > 0 && rows.length <= 10);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].goals <= rows[i - 1].goals);
});

test('the season\'s top scorers on screen count the regular season only, as the record does (Task 141)', async () => {
  const { leadersAt, topScorersAt } = await import('../src/channel/onScreen.js');
  const end = slots[slots.length - 1].kickoff + 6 * 60 * MIN;
  const live = new LiveLeague(config, { now: end, seed: SEED });
  const durationOf = (/** @type {any} */ m) => timelineOf(m).duration;
  const record = live.league.history.find((h) => h.season === 1);
  const screen = topScorersAt(live, 1, end, durationOf, 5);
  assert.deepEqual(screen.map((r) => [r.playerId, r.goals]), record.topScorers.map((r) => [r.playerId, r.goals]));
  // The playoffs apart: only semifinal and final goals, and every match together adds up.
  const playoffs = leadersAt(live, 1, end, durationOf, 'goals', Infinity, 'playoffs');
  const all = leadersAt(live, 1, end, durationOf, 'goals', Infinity, 'all');
  const regular = leadersAt(live, 1, end, durationOf, 'goals', Infinity);
  const sum = (/** @type {any[]} */ rows) => rows.reduce((n, r) => n + r.goals, 0);
  const playoffGoals = live.matchesIn(1).filter((m) => m.stage !== 'regular').reduce((n, m) => n + m.summary.result.homeGoals + m.summary.result.awayGoals, 0);
  assert.equal(sum(playoffs), playoffGoals);
  assert.equal(sum(regular) + sum(playoffs), sum(all));
});

test('TOP: the playoffs\' scorers apart, none before a playoff match has finished on screen (Task 141)', () => {
  const regular = slots.filter((s) => s.stage === 'regular');
  const before = regular[regular.length - 1].kickoff + 2 * 60 * MIN;
  const late = slots[slots.length - 1].kickoff + 90 * MIN;
  assert.deepEqual(topView(new LiveLeague(config, { now: before, seed: SEED }), before, timelineOf, 5, 'playoffs'), []);
  const live = new LiveLeague(config, { now: late, seed: SEED });
  const rows = topView(live, late, timelineOf, 5, 'playoffs');
  assert.ok(rows.length > 0);
  const playoffScorers = new Set(live.matchesIn(1).filter((m) => m.stage !== 'regular').flatMap((m) => Object.entries(m.summary.playerStats).filter(([, s]) => s.goals > 0).map(([id]) => id)));
  for (const r of rows) assert.ok(playoffScorers.has(r.playerId), `${r.playerId} scored in the playoffs`);
});

test('an earlier season\'s re-air is S1 REPLAY, this season\'s plain REPLAY (Task 277b)', () => {
  assert.equal(replayLabel({ season: 1 }, 2), 'S1 REPLAY');
  assert.equal(replayLabel({ season: 2 }, 2), 'REPLAY');
});
