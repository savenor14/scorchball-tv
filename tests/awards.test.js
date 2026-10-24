// The season's awards (the off-season show, Task 188; src/sim/awards.js, data/rules.json awards): each to the
// regular season's leader in its stat among the positions it's open to, logged after season_end and kept in history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog, memorySink } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { seasonAwards } from '../src/sim/awards.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { createRng } from '../src/sim/rng.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { awards } = config.rules;
const byId = Object.fromEntries(awards.list.map((/** @type {any} */ a) => [a.id, a]));

/** Three seasons of a league, with its events. @param {string} seed */
function seasons(seed) {
  const { events, sink } = memorySink();
  const log = new EventLog({ sinks: [sink] });
  const league = createLeague(config, seed, log);
  const records = [];
  for (let s = 0; s < 3; s++) {
    // Positions as they stood when the season ended (before the off-season's retirements and moves).
    const record = runSeason(league, config, log);
    records.push({ record, positions: Object.fromEntries(Object.values(league.players).map((p) => [p.id, p.position])) });
    runOffseason(league, config, log, record);
  }
  return { league, records, events };
}

const run = seasons('awards-tests');

test('every season: the awards logged after season_end, in order, and kept in history (the Spark from season 2)', () => {
  const { league, records, events } = run;
  for (const { record } of records) {
    const end = events.findIndex((e) => e.type === 'season_end' && e.season === record.season);
    const expected = awards.list.filter((/** @type {any} */ a) => a.id !== 'spark' || record.season > 1);
    const given = events.slice(end + 1, end + 1 + expected.length);
    assert.deepEqual(given.map((e) => [e.type, e.stage, e.data.award]), expected.map((/** @type {any} */ a) => ['award', 'final', a.id]));
    const h = league.history.find((x) => x.season === record.season);
    assert.deepEqual(h?.awards.map(({ award, playerId, teamId }) => [award, playerId, teamId]), given.map((e) => [e.data.award, e.playerId, e.teamId]));
  }
});

test('each goes to the leader in its stat over the regular season, among those it\'s open to', () => {
  for (const { record, positions } of run.records) {
    const totals = Object.values(record.stats.regular);
    const won = Object.fromEntries((/** @type {any[]} */ (run.league.history.find((x) => x.season === record.season)?.awards)).map((a) => [a.award, a]));
    const most = (/** @type {(t: any) => number} */ f, /** @type {(t: any) => boolean} */ ok = () => true) => Math.max(...totals.filter(ok).map(f));
    assert.equal(won.ember_boot.value, most((t) => t.goals));
    assert.equal(won.blaze.value, most((t) => t.scorchers));
    assert.equal(won.compass.value, most((t) => t.assists));
    // The Quell: defenders only, tackles (steals among them) plus blocks.
    assert.equal(positions[won.quell.playerId], 'D');
    assert.equal(won.quell.value, most((t) => t.tackles + t.blocks, (t) => positions[t.playerId] === 'D'));
    // The Ironclad: a keeper who faced at least half the busiest keeper's shots, the best save percentage.
    const faced = (/** @type {any} */ t) => t.saves + t.conceded;
    const busiest = most(faced);
    const iron = won.ironclad;
    assert.equal(positions[iron.playerId], 'K');
    assert.ok(iron.faced >= byId.ironclad.minFacedShare * busiest, `${iron.faced} faced of ${busiest}`);
    assert.ok(Math.abs(iron.value - most((t) => t.saves / faced(t), (t) => positions[t.playerId] === 'K' && faced(t) >= byId.ironclad.minFacedShare * busiest)) < 1e-4);
    assert.ok(iron.value > 0.5 && iron.value < 1);
    // The shortlist (Task 191): the next two, never the winner, no better than the winner, best first.
    for (const a of Object.values(won)) {
      assert.equal(a.shortlist.length, 2);
      assert.ok(a.shortlist.every((/** @type {any} */ x) => x.playerId !== a.playerId && x.value <= a.value));
      assert.ok(a.shortlist[0].value >= a.shortlist[1].value);
    }
  }
});

test('the season\'s stats: blocks match the block events, and every goal is conceded by a keeper', () => {
  const { record } = run.records[0];
  const blocks = run.events.filter((e) => e.type === 'block' && e.season === record.season && e.stage === 'regular');
  const totals = Object.values(record.stats.regular);
  assert.equal(totals.reduce((s, t) => s + t.blocks, 0), blocks.length);
  assert.equal(totals.reduce((s, t) => s + t.conceded, 0), totals.reduce((s, t) => s + t.goals, 0));
});

test('ties: fewer appearances first, then a seeded draw, the same every time', () => {
  /** @param {string} playerId @param {number} goals @param {number} appearances */
  const p = (playerId, goals, appearances) => ({ playerId, teamId: 't', appearances, starts: 0, minutes: 0, goals, assists: 0, scorchers: 0, shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0, fouls: 0, burns: 0, blocks: 0, conceded: 0 });
  const players = { a: { position: 'S' }, b: { position: 'S' }, c: { position: 'S' }, d: { position: 'S' } };
  const boot = { list: [{ id: 'ember_boot', stat: 'goals' }] };
  // Level on goals: fewer appearances wins.
  assert.equal(seasonAwards({ a: p('a', 20, 14), b: p('b', 20, 12), c: p('c', 19, 10) }, players, boot, createRng('x'), 1)[0].playerId, 'b');
  // Level on both: a seeded draw, the same for the same seed, not always the same player.
  const level = { a: p('a', 20, 14), b: p('b', 20, 14), c: p('c', 20, 14), d: p('d', 20, 14) };
  const pick = (/** @type {string} */ seed) => seasonAwards(level, players, boot, createRng(seed), 1)[0].playerId;
  assert.equal(pick('s1'), pick('s1'));
  assert.ok(new Set(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'].map(pick)).size > 1);
  // Nobody with any of the stat: no award.
  assert.deepEqual(seasonAwards({ a: p('a', 0, 14) }, players, boot, createRng('x'), 1), []);
});

test('the Ironclad\'s runners-up come from other teams, one a team, while enough teams qualify (Tom, 2026-10-18)', () => {
  /** @param {string} playerId @param {string} teamId @param {number} saves */
  const k = (playerId, teamId, saves) => ({ playerId, teamId, appearances: 14, starts: 14, minutes: 0, goals: 0, assists: 0, scorchers: 0, shots: 0, shotsOnTarget: 0, saves, tackles: 0, fouls: 0, burns: 0, blocks: 0, conceded: 100 - saves });
  const players = { a1: { position: 'K' }, a2: { position: 'K' }, a3: { position: 'K' }, b: { position: 'K' }, c: { position: 'K' } };
  const ironclad = { list: [{ id: 'ironclad', stat: 'savePct', positions: ['K'], minFacedShare: 0.5, oneATeam: true }] };
  // Team A's keepers first, second and third by save %; B and C below them.
  const totals = { a1: k('a1', 'A', 80), a2: k('a2', 'A', 78), a3: k('a3', 'A', 77), b: k('b', 'B', 70), c: k('c', 'C', 60) };
  const [award] = seasonAwards(totals, players, ironclad, createRng('x'), 1);
  assert.equal(award.playerId, 'a1');
  assert.deepEqual(award.shortlist.map((s) => s.playerId), ['b', 'c']);
  // Only two teams qualify: the third place falls back to the best left.
  const [two] = seasonAwards({ a1: totals.a1, a2: totals.a2, b: totals.b }, players, ironclad, createRng('x'), 1);
  assert.deepEqual(two.shortlist.map((s) => s.playerId), ['b', 'a2']);
  // Without the flag, by the stat alone.
  const [plain] = seasonAwards(totals, players, { list: [{ ...ironclad.list[0], oneATeam: false }] }, createRng('x'), 1);
  assert.deepEqual(plain.shortlist.map((s) => s.playerId), ['a2', 'a3']);
});

test('the same seed gives the same awards', () => {
  const again = seasons('awards-tests');
  assert.deepEqual(again.league.history.map((h) => h.awards), run.league.history.map((h) => h.awards));
});

test('Task 252: the Spark goes to a rookie with enough minutes, the best standing among them; none in the founding season', () => {
  const spark = byId.spark;
  for (const { record } of run.records) {
    const won = run.league.history.find((x) => x.season === record.season)?.awards.find((a) => a.award === 'spark');
    if (record.season === 1) { assert.equal(won, undefined, 'no rookies in the founding season'); continue; }
    assert.ok(won && won.line && won.position);
    const p = run.league.players[won.playerId];
    assert.ok(p.draft, 'drafted');
    assert.ok(p.debutSeason === record.season, 'in their first season');
    const totals = Object.values(record.stats.regular);
    const t = record.stats.regular[won.playerId];
    assert.ok(t.minutes >= spark.minMinutesShare * Math.max(...totals.map((x) => x.minutes)));
    assert.deepEqual(won.line, { position: p.position, goals: t.goals, assists: t.assists, scorchers: t.scorchers, stops: t.tackles + t.blocks, saves: t.saves, faced: t.saves + t.conceded });
    assert.ok(won.value >= 0 && won.value <= 1);
    assert.equal(won.shortlist.length, 2);
    for (const s of won.shortlist) {
      assert.ok(s.value <= won.value);
      assert.ok(run.league.players[s.playerId].draft && run.league.players[s.playerId].debutSeason === record.season);
    }
  }
});

test('Task 252: the Spark weighs each rookie against their own position, so a great defender beats an ordinary striker', () => {
  /** @param {string} playerId @param {Partial<Record<string, number>>} s */
  const p = (playerId, s) => ({ playerId, teamId: 't', appearances: 14, starts: 14, minutes: 600, goals: 0, assists: 0, scorchers: 0, shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0, fouls: 0, burns: 0, blocks: 0, conceded: 0, ...s });
  const vet = { draft: null, debutSeason: 1 };
  const rookie = { draft: { season: 1, round: 1, pick: 1 }, debutSeason: 2 };
  const players = {
    d1: { position: 'D', ...vet }, d2: { position: 'D', ...vet }, d3: { position: 'D', ...vet }, dr: { position: 'D', ...rookie },
    s1: { position: 'S', ...vet }, s2: { position: 'S', ...vet }, s3: { position: 'S', ...vet }, sr: { position: 'S', ...rookie },
  };
  const totals = {
    d1: p('d1', { tackles: 60 }), d2: p('d2', { tackles: 70 }), d3: p('d3', { tackles: 80 }), dr: p('dr', { tackles: 130 }),
    // The rookie striker has more goals than the rookie defender has... but sits mid-table among strikers.
    s1: p('s1', { goals: 10 }), s2: p('s2', { goals: 20 }), s3: p('s3', { goals: 30 }), sr: p('sr', { goals: 18 }),
  };
  const [won] = seasonAwards(totals, /** @type {any} */ (players), { list: [byId.spark] }, createRng('x'), 2);
  assert.equal(won.playerId, 'dr');
  assert.equal(won.value, 1);
  assert.deepEqual(won.shortlist.map((s) => s.playerId), ['sr']);
  // No rookies: no Spark.
  assert.deepEqual(seasonAwards({ d1: totals.d1, s1: totals.s1 }, /** @type {any} */ (players), { list: [byId.spark] }, createRng('x'), 2), []);
});
