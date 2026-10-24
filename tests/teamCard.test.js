// The team card's contents (Task 223; src/channel/teamCard.js): this season from the matches, the squad, the last
// off-season's moves, history a row a finished season, the club's records and head-to-heads adding up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chronicle } from '../src/chronicle/chronicle.js';
import { EventLog } from '../src/chronicle/eventLog.js';
import { fromSide, teamCard } from '../src/channel/teamCard.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { lotsSeedFor, runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const SEASONS = 10;
const chronicle = new Chronicle(config.chronicle);
const log = new EventLog({ sinks: [chronicle.add] });
const league = createLeague(config, 'team-card-tests', log);
for (let i = 0; i < SEASONS; i++) runOffseason(league, config, log, runSeason(league, config, log));
const teams = Object.values(league.teams);
/** The league's own lots, as the channel's team card gets them (Task 271). @param {number} season */
const lotsOf = (season) => lotsSeedFor(league, season);

test('this season: the record from its regular-season matches, the run at its end', () => {
  for (const team of teams) {
    const c = teamCard(chronicle, config, team, lotsOf);
    assert.equal(c.season.season, SEASONS);
    const row = /** @type {any} */ (c.season.row);
    const regular = [...chronicle.matches.values()].filter((m) => m.season === SEASONS && m.stage === 'regular' && (m.homeId === team.id || m.awayId === team.id));
    assert.equal(row.played, regular.length);
    assert.equal(row.won + row.drawn + row.lost, row.played);
    // The final table's place once the season is over.
    assert.equal(row.position, chronicle.season(SEASONS).table.find((r) => r.teamId === team.id)?.position);
    if (c.season.run) assert.ok(c.season.run.length >= 1);
  }
});

test('the squad: the team\'s roster, keepers first, a rookie only in their first season, the payroll its contracts', () => {
  for (const team of teams) {
    const c = teamCard(chronicle, config, team, lotsOf);
    const roster = [...chronicle.players.values()].filter((p) => p.status === 'roster' && p.teamId === team.id);
    assert.deepEqual(c.squad.map((p) => p.id).sort(), roster.map((p) => p.id).sort());
    const order = c.squad.map((p) => 'KDMS'.indexOf(p.position));
    assert.deepEqual(order, order.slice().sort((a, b) => a - b));
    for (const p of c.squad.filter((x) => x.rookie)) {
      const rec = /** @type {any} */ (chronicle.players.get(p.id));
      assert.equal(rec.joined.how, 'draft');
      assert.ok(Object.keys(rec.seasons).every((s) => Number(s) >= SEASONS));
    }
    for (const p of c.reserves) assert.equal(chronicle.players.get(p.id)?.status, 'reserves');
    assert.equal(c.payroll, roster.reduce((n, p) => n + (p.contract?.wage ?? 0), 0));
    assert.equal(c.cap, config.rules.finances.cap);
  }
});

test('the moves: drafted by them, signed as free agents, and who left after playing for them', () => {
  for (const team of teams) {
    const { moves } = teamCard(chronicle, config, team, lotsOf);
    assert.equal(moves.season, SEASONS - 1);
    for (const d of moves.drafted) assert.ok(chronicle.players.get(d.id)?.moves.some((m) => m.type === 'draft' && m.teamId === team.id && m.season === SEASONS - 1));
    for (const s of moves.signed) assert.ok(chronicle.season(SEASONS - 1).deals.some((d) => d.playerId === s.id && d.teamId === team.id && d.kind === 'free_agent'));
    for (const l of moves.left) {
      const p = /** @type {any} */ (chronicle.players.get(l.id));
      assert.equal(p.seasons[SEASONS - 1].teamId, team.id);
      assert.notEqual(p.teamId, team.id);
    }
  }
});

test('history a row a finished season, newest first; Cups and Pennants as the chronicle has them', () => {
  for (const team of teams) {
    const c = teamCard(chronicle, config, team, lotsOf);
    assert.deepEqual(c.history.map((h) => h.season), Array.from({ length: SEASONS }, (_, i) => SEASONS - i));
    for (const h of c.history) {
      assert.equal(h.playoffs === 'champion', c.cups.includes(h.season));
      assert.equal(h.pennant, h.position === 1);
    }
  }
  const cups = teams.reduce((n, t) => n + teamCard(chronicle, config, t, lotsOf).cups.length, 0);
  assert.equal(cups, SEASONS);
});

test('head-to-heads add up to every match the team played; records are the club\'s own', () => {
  for (const team of teams) {
    const c = teamCard(chronicle, config, team, lotsOf);
    const ours = [...chronicle.matches.values()].filter((m) => m.homeId === team.id || m.awayId === team.id);
    assert.equal(c.headToHead.length, teams.length - 1);
    assert.equal(c.headToHead.reduce((n, h) => n + h.won + h.drawn + h.lost, 0), ours.length);
    assert.equal(c.headToHead.reduce((n, h) => n + h.for, 0), ours.reduce((n, m) => n + fromSide(m, team.id).for, 0));
    const r = c.records;
    assert.ok(r.games && r.games.value > 0);
    // Most games for the club: no one else played more for them.
    const games = [...chronicle.players.values()].map((p) => Object.values(p.seasons).flatMap((s) => [s.regular, s.playoffs]).filter((l) => l && l.teamId === team.id).reduce((n, l) => n + /** @type {any} */ (l).appearances, 0));
    assert.equal(r.games.value, Math.max(...games));
    if (r.biggestWin) assert.ok(r.biggestWin.for > r.biggestWin.against);
    if (r.winningRun && r.unbeatenRun) assert.ok(r.unbeatenRun.length >= r.winningRun.length);
  }
});

test('SQUAD\'s STATS (Task 278n): each player\'s goals, assists, stops and saves this season, a keeper\'s save percentage', () => {
  let goals = 0;
  let keepers = 0;
  for (const team of teams) {
    const c = teamCard(chronicle, config, team, lotsOf);
    for (const p of c.squad) {
      for (const v of [p.goals, p.assists, p.stops, p.saves]) assert.ok(Number.isInteger(v) && v >= 0);
      goals += p.goals;
      if (p.position === config.positions.keeper && p.savePct !== null) {
        keepers++;
        assert.ok(p.savePct >= 0 && p.savePct <= 1);
      }
    }
  }
  assert.ok(goals > 100, 'a season of goals among the squads');
  assert.ok(keepers >= teams.length, 'every team\'s keeper has faced shots');
});
