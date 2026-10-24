// The rookie rule (Task 230, Tom): every team starts a rookie, from season 2 (data/ruleChanges.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog, memorySink } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { selectLineup } from '../src/sim/match.js';
import { runOffseason } from '../src/sim/offseason.js';
import { isRookie, overall } from '../src/sim/players.js';
import { seasonConfig } from '../src/sim/rules.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { events, sink } = memorySink();
const log = new EventLog({ sinks: [sink] });
const league = createLeague(config, 'rookie-tests', log);
const seasons = [runSeason(league, config, log)];
runOffseason(league, config, log, seasons[0]);
// Season 2's squads, before a ball is kicked: the rule's first season.
const before = structuredClone(league);
seasons.push(runSeason(league, config, log));
const season2 = seasonConfig(config, 2);

test('isRookie: drafted and never played before this season', () => {
  const p = { draft: { season: 1, round: 1, pick: 1, teamId: 't' }, debutSeason: null };
  assert.equal(isRookie(p, 2), true);
  assert.equal(isRookie({ ...p, debutSeason: 2 }, 2), true, 'a rookie all season');
  assert.equal(isRookie({ ...p, debutSeason: 2 }, 3), false);
  assert.equal(isRookie({ draft: null, debutSeason: null }, 2), false, 'never drafted: never a rookie');
});

test('season 1 has no rookie rule; season 2 has it, and every lineup says who the rookie is', () => {
  const lineups = events.filter((e) => e.type === 'lineup');
  assert.ok(lineups.filter((e) => e.season === 1).every((e) => !('rookieId' in e.data)));
  const s2 = lineups.filter((e) => e.season === 2);
  assert.ok(s2.every((e) => 'rookieId' in e.data));
  // Each named rookie started, and is a drafted player from the first draft.
  for (const e of s2) {
    const id = /** @type {string | null} */ (e.data.rookieId);
    if (id === null) continue;
    assert.ok(/** @type {any[]} */ (e.data.starters).some((s) => s.playerId === id));
    assert.equal(league.players[id].draft?.season, 1);
  }
  const lapsed = s2.filter((e) => e.data.rookieId === null).length;
  assert.ok(lapsed / s2.length < 0.15, `the rule lapses seldom (${lapsed} of ${s2.length})`);
});

test('every team keeps a rookie on its roster through the off-season', () => {
  for (const team of Object.values(before.teams)) {
    assert.ok(team.roster.some((/** @type {string} */ id) => isRookie(before.players[id], 2)), team.id);
  }
});

test('the lineup swaps the rookie in for the weakest starter at their position', () => {
  for (const team of Object.values(before.teams)) {
    const free = selectLineup(team, before.players, season2);
    const ruled = selectLineup(team, before.players, season2, { season: 2 });
    const rookies = ruled.starters.filter((s) => isRookie(s.player, 2));
    assert.ok(rookies.length >= 1, team.id);
    if (free.starters.some((s) => isRookie(s.player, 2))) {
      assert.deepEqual(ruled.starters.map((s) => s.player.id), free.starters.map((s) => s.player.id), 'already starting: no change');
      continue;
    }
    // Exactly one place changed, at the rookie's own position, and the one who left was that slot's weakest.
    const changed = ruled.starters.map((s, i) => [s, free.starters[i]]).filter(([a, b]) => a.player !== b.player);
    assert.equal(changed.length, 1);
    const [[inn, out]] = changed;
    assert.equal(inn.slot, inn.player.position);
    const at = (/** @type {any} */ p) => overall({ position: inn.slot, attributes: p.attributes }, config.positions);
    const sameSlot = free.starters.filter((s) => s.slot === inn.slot).map((s) => at(s.player));
    assert.equal(at(out.player), Math.min(...sameSlot));
    // The one left out sits on the bench.
    assert.ok(ruled.bench.includes(out.player));
  }
});

test('with no fit rookie the rule lapses; without a season it is not applied', () => {
  const team = /** @type {any} */ (Object.values(before.teams)[0]);
  const players = structuredClone(before.players);
  for (const id of team.roster) if (isRookie(players[id], 2)) players[id].injury = { matchesOut: 1, seasonEnding: false };
  const lapsed = selectLineup(team, players, season2, { season: 2 });
  assert.equal(lapsed.starters.length, 5);
  assert.ok(!lapsed.starters.some((s) => isRookie(s.player, 2)));
  const plain = selectLineup(team, before.players, season2);
  const ruled = selectLineup(team, before.players, config, { season: 2 });
  assert.deepEqual(ruled.starters.map((s) => s.player.id), plain.starters.map((s) => s.player.id), 'season 1 rules: no rule');
});

test('debuts are stamped: everyone who played has a debut season, rookies their first', () => {
  for (const p of Object.values(league.players)) {
    if (p.debutSeason === null) continue;
    assert.ok(p.debutSeason === 1 || p.debutSeason === 2);
    if (p.draft?.season === 1 && p.debutSeason !== null) assert.equal(p.debutSeason, 2);
  }
  const s2Starters = new Set(events.filter((e) => e.type === 'lineup' && e.season === 2).flatMap((e) => /** @type {any[]} */ (e.data.starters).map((s) => s.playerId)));
  for (const id of s2Starters) assert.notEqual(league.players[id].debutSeason, null);
});
