// The event log's completeness check (Task 214): every match's player lines, worked out from its events alone, equal
// the sim's own counts (MatchSummary), the player of the match included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog, memorySink } from '../src/chronicle/eventLog.js';
import { matchLines } from '../src/chronicle/matchLines.js';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { simulateMatch } from '../src/sim/match.js';
import { playerOfTheMatch } from '../src/sim/potm.js';

const config = await loadConfigFromDisk();
const COUNTS = ['goals', 'assists', 'scorchers', 'shots', 'shotsOnTarget', 'saves', 'tackles', 'fouls', 'burns', 'blocks', 'conceded'];

/**
 * The lines from the events agree with the sim's summary: the same players, teams, starts and counts; minutes within
 * a second per change of player (event clocks are whole seconds); the result; the player of the match.
 * @param {{ id: string, homeId: string, awayId: string, summary: import('../src/sim/match.js').MatchSummary }} m
 * @param {readonly import('../src/chronicle/eventLog.js').LeagueEvent[]} events
 */
function assertAgrees(m, events) {
  const lines = matchLines(events);
  assert.deepEqual(lines.result, m.summary.result, m.id);
  assert.deepEqual(Object.keys(lines.players).sort(), Object.keys(m.summary.playerStats).sort(), `${m.id}: who played`);
  for (const [id, s] of Object.entries(m.summary.playerStats)) {
    const l = lines.players[id];
    assert.equal(l.teamId, s.teamId, `${m.id} ${id} team`);
    assert.equal(l.started, s.started, `${m.id} ${id} started`);
    for (const k of COUNTS) assert.equal(/** @type {any} */ (l)[k], /** @type {any} */ (s)[k], `${m.id} ${id} ${k}`);
    assert.ok(Math.abs(l.secondsPlayed - s.secondsPlayed) <= 2, `${m.id} ${id}: ${l.secondsPlayed} s against ${s.secondsPlayed}`);
    assert.ok(l.steals <= l.tackles);
  }
  assert.deepEqual(lines.injuries.map((i) => i.playerId), m.summary.injuries.map((i) => i.playerId), `${m.id} injuries`);
  assert.equal(lines.potmId, playerOfTheMatch(m, config.interviews.potm).playerId, `${m.id} player of the match`);
}

test('a season and a half of the live league: every match rebuilt from its events matches the sim', () => {
  const calendar = createCalendar(config);
  const s2 = calendar.slots(2);
  const live = new LiveLeague(config, { now: s2[Math.floor(s2.length / 2)].kickoff, seed: 'match-lines' });
  let n = 0;
  for (const m of live.matches.values()) {
    assertAgrees(m, m.events);
    n++;
  }
  assert.ok(n > 60, `${n} matches`);
});

test('knockouts with many injuries (stand-in keepers, players short, overtime and shootouts) still match', () => {
  const league = createLeague(config, 'match-lines-ko', new EventLog());
  // One keeper a side, so an injured keeper is replaced by an outfield player (their move into goal isn't logged:
  // the goal's keeperId carries it).
  for (const team of Object.values(league.teams)) {
    const keepers = team.roster.filter((/** @type {string} */ id) => league.players[id].position === config.positions.keeper);
    team.roster = team.roster.filter((/** @type {string} */ id) => !keepers.slice(1).includes(id));
  }
  const cfg = { ...config, rules: { ...config.rules, injuries: { ...config.rules.injuries, chancePerMatch: 0.6 } } };
  const teamIds = Object.keys(league.teams);
  const seen = { overtime: 0, shootout: 0, standInConceded: 0 };
  for (let i = 0; i < 120; i++) {
    const { events, sink } = memorySink();
    const match = { id: `s1-sf${i}`, season: 1, stage: 'semifinal', round: null, homeId: teamIds[i % 8], awayId: teamIds[(i + 3) % 8], neutral: false };
    const summary = simulateMatch({ match, league, config: cfg, log: new EventLog({ sinks: [sink] }), knockout: true });
    assertAgrees({ id: match.id, homeId: match.homeId, awayId: match.awayId, summary }, events);
    if (summary.result.decidedBy !== 'regulation') seen[summary.result.decidedBy]++;
    for (const e of events) {
      const keeperId = /** @type {any} */ (e.data).keeperId;
      if (e.type === 'goal' && keeperId && league.players[keeperId].position !== config.positions.keeper) seen.standInConceded++;
    }
  }
  assert.ok(seen.overtime > 0 && seen.shootout > 0, JSON.stringify(seen));
  assert.ok(seen.standInConceded > 0, 'a stand-in keeper conceded at least once');
});
