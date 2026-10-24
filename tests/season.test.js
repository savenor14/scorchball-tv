import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog, memorySink } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { isSeasonOver, nextFixture, playNextMatch, runSeason, seasonRecord, startSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { rules } = config;

/** @param {string} seed */
function play(seed) {
  const { events, sink } = memorySink();
  const log = new EventLog({ sinks: [sink] });
  const league = createLeague(config, seed, log);
  const record = runSeason(league, config, log);
  return { league, record, events: events.filter((e) => e.stage !== 'preseason') };
}

const base = play('season-tests');

test('every regular-season match is played and the table adds up', () => {
  const { record } = base;
  const matches = record.schedule.flatMap((r) => r.matches);
  assert.equal(matches.length, 56);
  for (const m of matches) assert.ok(m.result, `${m.id} has no result`);
  for (const row of record.table) assert.equal(row.played, 14);

  const draws = matches.filter((m) => m.result?.homeGoals === m.result?.awayGoals).length;
  const points = record.table.reduce((s, r) => s + r.points, 0);
  assert.equal(points, (56 - draws) * rules.points.win + 2 * draws * rules.points.draw);
  const goals = matches.reduce((s, m) => s + (m.result?.homeGoals ?? 0) + (m.result?.awayGoals ?? 0), 0);
  assert.equal(record.table.reduce((s, r) => s + r.goalsFor, 0), goals);
  assert.equal(Object.values(record.stats.regular).reduce((s, p) => s + p.goals, 0), goals);
});

test('playoffs: top 4 seeded, 1 v 4 and 2 v 3 at the higher seed, the final at the better seed\'s ground', () => {
  const { record } = base;
  assert.deepEqual(record.seeds, record.table.slice(0, 4).map((r) => r.teamId));
  const [sf1, sf2, final] = record.playoffs;
  assert.deepEqual([sf1.id, sf1.stage, sf1.homeId, sf1.awayId, sf1.neutral], ['s1-sf1', 'semifinal', record.seeds[0], record.seeds[3], false]);
  assert.deepEqual([sf2.id, sf2.homeId, sf2.awayId], ['s1-sf2', record.seeds[1], record.seeds[2]]);
  assert.deepEqual([final.id, final.stage, final.neutral], ['s1-f', 'final', false]);
  assert.ok(record.seeds.indexOf(final.homeId) < record.seeds.indexOf(final.awayId), 'the better seed at home');
  assert.deepEqual(new Set([final.homeId, final.awayId]), new Set([sf1.winnerId, sf2.winnerId]));
  assert.equal(record.championId, final.winnerId);
  assert.notEqual(record.runnerUpId, record.championId);
  assert.equal(record.shieldId, record.table[0].teamId);
});

test('the season is recorded in league history', () => {
  const { league, record } = base;
  assert.equal(league.history.length, 1);
  const h = league.history[0];
  assert.deepEqual([h.season, h.championId, h.shieldId, h.runnerUpId], [1, record.championId, record.shieldId, record.runnerUpId]);
  assert.equal(h.topScorers.length, 5);
  assert.ok(h.topScorers[0].goals >= h.topScorers[4].goals);
});

test('event log: season_start, 14 standings snapshots, 59 matches, seeding, season_end, then the awards', () => {
  const { events, record } = base;
  assert.equal(events[0].type, 'season_start');
  // The season ends with season_end, then each award (Task 188), in the list's order.
  const end = events.findIndex((e) => e.type === 'season_end');
  assert.equal(events[end].data.championId, record.championId);
  // Not the Spark (Task 252): the founding season has no rookies.
  assert.deepEqual(events.slice(end + 1).map((e) => e.type === 'award' && e.data.award), rules.awards.list.map((/** @type {any} */ a) => a.id).filter((/** @type {string} */ id) => id !== 'spark'));
  const standings = events.filter((e) => e.type === 'standings');
  assert.deepEqual(standings.map((e) => e.round), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  assert.deepEqual(/** @type {any} */ (standings.at(-1)?.data.rows).map((/** @type {any} */ r) => r.teamId), record.table.map((r) => r.teamId));
  assert.equal(events.filter((e) => e.type === 'match_result').length, 56 + 3);
  assert.equal(events.filter((e) => e.type === 'playoff_seeding').length, 1);
});

test('injured players sit out until they return', () => {
  // Find a season with a short-term injury in the regular season.
  for (const seed of ['season-tests', 'inj-a', 'inj-b', 'inj-c', 'inj-d', 'inj-e']) {
    const { events } = seed === 'season-tests' ? base : play(seed);
    const injury = events.find((e) => e.type === 'injury' && e.stage === 'regular' && !e.data.seasonEnding
      && /** @type {number} */ (e.round) + /** @type {number} */ (e.data.matchesOut) <= 14);
    if (!injury) continue;
    const out = /** @type {number} */ (injury.data.matchesOut);
    const from = /** @type {number} */ (injury.round);
    const lineupsWith = (/** @type {number} */ round) => events.some((e) => e.type === 'lineup' && e.round === round
      && [...(/** @type {any} */ (e.data).starters.map((/** @type {any} */ s) => s.playerId)), ...(/** @type {any} */ (e.data).bench)].includes(injury.playerId));
    for (let r = from + 1; r <= from + out; r++) assert.ok(!lineupsWith(r), `injured player picked in round ${r}`);
    const back = events.find((e) => e.type === 'injury_return' && e.playerId === injury.playerId && /** @type {number} */ (e.round) >= from);
    assert.equal(back?.round, from + out);
    return;
  }
  assert.fail('no suitable injury found in any test season');
});

test('stepping one match at a time: fixtures in order, rounds and playoffs close at the right moments', () => {
  const { events, sink } = memorySink();
  const log = new EventLog({ sinks: [sink] });
  const league = createLeague(config, 'season-tests', log);
  const state = startSeason(league, config, log);
  assert.throws(() => seasonRecord(state), /isn't over yet/);

  /** @type {string[]} */
  const played = [];
  while (!isSeasonOver(state)) {
    const fixture = /** @type {NonNullable<ReturnType<typeof nextFixture>>} */ (nextFixture(state));
    assert.deepEqual(nextFixture(state), fixture, 'peeking does not advance the season');
    const before = events.length;
    const summary = playNextMatch(league, config, log, state);
    assert.equal(summary.matchId, fixture.id);
    played.push(fixture.id);
    const after = events.slice(before).map((e) => e.type);

    // Standings come only with the last match of a round; seeding only with the last round.
    const lastOfRound = fixture.stage === 'regular' && /m4$/.test(fixture.id);
    assert.equal(after.includes('standings'), lastOfRound, `standings after ${fixture.id}`);
    assert.equal(after.includes('playoff_seeding'), fixture.id === 's1-r14-m4', `seeding after ${fixture.id}`);
    assert.equal(after.includes('season_end'), fixture.stage === 'final', `season_end after ${fixture.id}`);
  }

  const regular = base.record.schedule.flatMap((r) => r.matches.map((m) => m.id));
  assert.deepEqual(played, [...regular, 's1-sf1', 's1-sf2', 's1-f']);
  assert.equal(nextFixture(state), null);
  assert.throws(() => playNextMatch(league, config, log, state), /over/);

  // Same result as runSeason, which is the same loop without the peeking.
  assert.deepEqual(seasonRecord(state), base.record);
  assert.deepEqual(events.filter((e) => e.stage !== 'preseason'), base.events);
  assert.deepEqual(league, base.league);
});

test('the final is only known once both semifinals are played', () => {
  const { sink } = memorySink();
  const log = new EventLog({ sinks: [sink] });
  const league = createLeague(config, 'season-tests', log);
  const state = startSeason(league, config, log);
  while (nextFixture(state)?.stage === 'regular') playNextMatch(league, config, log, state);
  assert.deepEqual(state.seeds, base.record.seeds);
  assert.equal(nextFixture(state)?.id, 's1-sf1');
  playNextMatch(league, config, log, state);
  assert.equal(nextFixture(state)?.id, 's1-sf2');
  playNextMatch(league, config, log, state);
  const final = nextFixture(state);
  assert.deepEqual([final?.homeId, final?.awayId, final?.neutral], [base.record.playoffs[2].homeId, base.record.playoffs[2].awayId, false]);
});

test('the same seed plays the same season', () => {
  const again = play('season-tests');
  assert.deepEqual(again.record, base.record);
  assert.deepEqual(again.league, base.league);
});
