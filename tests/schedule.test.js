import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seedStreams } from '../src/sim/streams.js';

const createStream = (/** @type {string} */ seed, /** @type {number} */ season, /** @type {string} */ key) => seedStreams(seed).rng(season, key);
import { createSchedule } from '../src/sim/schedule.js';

/** @param {number} n */
const teamsOf = (n) => Array.from({ length: n }, (_, i) => `t-${i + 1}`);

/** @param {number} n @param {string} [seed] */
const build = (n, seed = 'sched') => createSchedule(teamsOf(n), 1, createStream(seed, 1, 'schedule'));

/** Home/away string for a team, e.g. "HAHAAH…". @param {ReturnType<typeof build>} rounds @param {string} team */
function venues(rounds, team) {
  return rounds.map((r) => {
    const m = r.matches.find((x) => x.homeId === team || x.awayId === team);
    assert.ok(m, `${team} has no match in round ${r.round}`);
    return m.homeId === team ? 'H' : 'A';
  }).join('');
}

test('8 teams: 14 rounds of 4 matches with correct ids', () => {
  const rounds = build(8);
  assert.equal(rounds.length, 14);
  for (const r of rounds) {
    assert.equal(r.matches.length, 4);
    r.matches.forEach((m, i) => {
      assert.equal(m.id, `s1-r${r.round}-m${i + 1}`);
      assert.deepEqual([m.season, m.stage, m.round, m.neutral, m.result], [1, 'regular', r.round, false, null]);
    });
  }
});

for (const n of [2, 4, 6, 8, 10, 12]) {
  test(`${n} teams: fair double round-robin`, () => {
    const rounds = build(n);
    const teams = teamsOf(n);
    assert.equal(rounds.length, 2 * (n - 1));

    // Everyone plays exactly once per round.
    for (const r of rounds) {
      const playing = r.matches.flatMap((m) => [m.homeId, m.awayId]);
      assert.deepEqual([...playing].sort(), [...teams].sort(), `round ${r.round}`);
    }

    // Every ordered pairing (home v away) happens exactly once.
    const fixtures = rounds.flatMap((r) => r.matches.map((m) => `${m.homeId}>${m.awayId}`));
    assert.equal(new Set(fixtures).size, n * (n - 1));

    for (const t of teams) {
      const v = venues(rounds, t);
      const half = n - 1;
      // Half the games at home overall, and a near-even split in each half.
      assert.equal([...v].filter((x) => x === 'H').length, n - 1, `${t}: ${v}`);
      for (const part of [v.slice(0, half), v.slice(half)]) {
        const homes = [...part].filter((x) => x === 'H').length;
        assert.ok(homes >= Math.floor(half / 2) && homes <= Math.ceil(half / 2), `${t}: ${v}`);
      }
      // Never 3 home or 3 away in a row.
      if (n > 2) assert.ok(!/HHH|AAA/.test(v), `${t}: ${v}`);
    }

    // The two meetings of each pair are n−2 or more rounds apart (no back-to-back rematches).
    if (n > 2) {
      /** @type {Map<string, number[]>} */
      const meetings = new Map();
      for (const r of rounds) {
        for (const m of r.matches) {
          const key = [m.homeId, m.awayId].sort().join('|');
          meetings.set(key, [...(meetings.get(key) ?? []), r.round]);
        }
      }
      for (const [pair, [a, b]] of meetings) assert.ok(b - a >= n - 2, `${pair} meet in rounds ${a} and ${b}`);
    }
  });
}

test('same seed gives the same schedule; different seeds differ', () => {
  assert.deepEqual(build(8, 'x'), build(8, 'x'));
  assert.notDeepEqual(build(8, 'x'), build(8, 'y'));
});

test('the team list passed in is not modified', () => {
  const teams = Object.freeze(teamsOf(8));
  createSchedule(teams, 1, createStream('s', 1, 'schedule'));
  assert.deepEqual(teams, teamsOf(8));
});

test('rejects odd, tiny and duplicate team lists', () => {
  const rng = createStream('s', 1, 'schedule');
  assert.throws(() => createSchedule(teamsOf(7), 1, rng), /even number/);
  assert.throws(() => createSchedule([], 1, rng), /even number/);
  assert.throws(() => createSchedule(['t-1', 't-1'], 1, rng), /unique/);
});
