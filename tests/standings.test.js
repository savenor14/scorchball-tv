import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { addMatchStats, computeStandings, leaders } from '../src/sim/standings.js';

const { rules } = await loadConfigFromDisk();

/** @param {string} h @param {number} hg @param {number} ag @param {string} a */
const m = (h, hg, ag, a) => ({ homeId: h, awayId: a, result: { homeGoals: hg, awayGoals: ag } });

/** @param {string[]} teams @param {ReturnType<typeof m>[]} results @param {string} [seed] */
const order = (teams, results, seed = 'x|s1') => computeStandings(teams, results, rules, seed).map((r) => r.teamId);

test('rows count wins, draws, losses, goals and points', () => {
  const table = computeStandings(['A', 'B', 'C'], [m('A', 3, 1, 'B'), m('B', 2, 2, 'C'), m('C', 0, 4, 'A')], rules, 's');
  const a = table.find((r) => r.teamId === 'A');
  assert.deepEqual(
    { ...a, form: a?.form },
    { position: 1, teamId: 'A', played: 2, won: 2, drawn: 0, lost: 0, goalsFor: 7, goalsAgainst: 1, goalDifference: 6, points: 6, form: ['W', 'W'] },
  );
  const b = table.find((r) => r.teamId === 'B');
  assert.deepEqual([b?.won, b?.drawn, b?.lost, b?.points], [0, 1, 1, 1]);
  assert.deepEqual(table.map((r) => r.position), [1, 2, 3]);
});

test('ranked by points first', () => {
  assert.deepEqual(order(['A', 'B', 'C'], [m('A', 1, 0, 'B'), m('B', 1, 0, 'C'), m('C', 0, 0, 'A')]), ['A', 'B', 'C']);
});

test('level on points: goal difference, then goals scored', () => {
  // A and B both beat C; A by more.
  assert.deepEqual(order(['A', 'B', 'C'], [m('A', 5, 0, 'C'), m('B', 2, 0, 'C')]).slice(0, 2), ['A', 'B']);
  // Same GD, B scored more.
  assert.deepEqual(order(['A', 'B', 'C', 'D'], [m('A', 2, 1, 'C'), m('B', 4, 3, 'D')]).slice(0, 2), ['B', 'A']);
});

test('level on points, GD and goals: head-to-head points decide', () => {
  // A and B both finish on 3 pts, GD 0, 2 goals scored; A beat B.
  const results = [m('A', 2, 1, 'B'), m('B', 1, 0, 'C'), m('D', 1, 0, 'A')];
  const t = computeStandings(['A', 'B', 'C', 'D'], results, rules, 's');
  const a = t.find((r) => r.teamId === 'A');
  const b = t.find((r) => r.teamId === 'B');
  assert.deepEqual([a?.points, a?.goalDifference, a?.goalsFor], [b?.points, b?.goalDifference, b?.goalsFor]);
  assert.ok(t.indexOf(/** @type {any} */ (a)) < t.indexOf(/** @type {any} */ (b)));
});

test('head-to-head only counts matches between the teams still level', () => {
  // A, B, C all on 3 points with GD 0 and 2 goals scored. Mini-league among them: A beat B, B beat C, C beat A → all 3 h2h points,
  // all 0 h2h GD → falls to lots. D is clear at the bottom.
  const results = [m('A', 1, 0, 'B'), m('B', 1, 0, 'C'), m('C', 1, 0, 'A'), m('A', 1, 1, 'D'), m('B', 1, 1, 'D'), m('C', 1, 1, 'D')];
  const t = computeStandings(['A', 'B', 'C', 'D'], results, rules, 's');
  assert.equal(t[3].teamId, 'D');
  assert.deepEqual(new Set(t.slice(0, 3).map((r) => r.points)), new Set([4]));
});

test('drawing lots is deterministic, independent of input order, and varies by seed', () => {
  const teams = ['A', 'B', 'C', 'D', 'E', 'F'];
  const first = order(teams, [], 'league|s1');
  assert.deepEqual(order([...teams].reverse(), [], 'league|s1'), first);
  const seen = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => order(teams, [], `league|s${s}`).join('')));
  assert.ok(seen.size > 1);
});

test('form keeps the last five results, oldest first', () => {
  const results = [m('A', 1, 0, 'B'), m('A', 0, 1, 'B'), m('A', 1, 1, 'B'), m('A', 2, 0, 'B'), m('A', 2, 0, 'B'), m('A', 0, 3, 'B')];
  const a = computeStandings(['A', 'B'], results, rules, 's').find((r) => r.teamId === 'A');
  assert.deepEqual(a?.form, ['L', 'D', 'W', 'W', 'L']);
});

test('rejects results for unknown teams', () => {
  assert.throws(() => computeStandings(['A'], [m('A', 1, 0, 'Z')], rules, 's'), /unknown team/);
});

/** @param {Record<string, Partial<import('../src/sim/match.js').PlayerStats>>} players */
function summary(players) {
  const base = { teamId: 'T', started: true, secondsPlayed: 2400, goals: 0, assists: 0, scorchers: 0, shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0, fouls: 0, burns: 0 };
  return { playerStats: Object.fromEntries(Object.entries(players).map(([id, s]) => [id, { ...base, ...s }])) };
}

test('season stats accumulate across matches', () => {
  /** @type {Record<string, any>} */
  const totals = {};
  addMatchStats(totals, summary({ p1: { goals: 2, shots: 5, scorchers: 1 }, p2: { started: false, secondsPlayed: 600, assists: 1 } }));
  addMatchStats(totals, summary({ p1: { goals: 1, shots: 3 } }));
  assert.deepEqual(
    [totals.p1.appearances, totals.p1.starts, totals.p1.minutes, totals.p1.goals, totals.p1.shots, totals.p1.scorchers],
    [2, 2, 80, 3, 8, 1],
  );
  assert.deepEqual([totals.p2.appearances, totals.p2.starts, totals.p2.minutes, totals.p2.assists], [1, 0, 10, 1]);
});

test('leaders: highest first, ties to fewer appearances, zeroes left out', () => {
  /** @type {Record<string, any>} */
  const totals = {};
  addMatchStats(totals, summary({ a: { goals: 3 }, b: { goals: 3 }, c: { goals: 1 }, d: {} }));
  addMatchStats(totals, summary({ b: {} }));
  assert.deepEqual(leaders(totals, 'goals').map((t) => t.playerId), ['a', 'b', 'c']);
  assert.deepEqual(leaders(totals, 'goals', 1).map((t) => t.playerId), ['a']);
});
