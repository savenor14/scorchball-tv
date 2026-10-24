import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { matchStatsAt, statRows } from '../src/channel/matchStats.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const slots = createCalendar(config).slots(1);
const live = new LiveLeague(config, { now: slots[slots.length - 1].kickoff, seed: 'stats-tests' });
const matches = live.matchesIn(1).map((m) => ({ m, tl: createTimeline(m, config) }));

test('at the final whistle the counts equal the sim\'s own match totals', () => {
  for (const { m, tl } of matches) {
    const s = matchStatsAt(tl, tl.duration);
    for (const [side, key] of /** @type {const} */ ([['home', 'home'], ['away', 'away']])) {
      const team = m.summary.teamStats[key];
      const teamId = side === 'home' ? m.homeId : m.awayId;
      const players = Object.values(m.summary.playerStats).filter((p) => p.teamId === teamId);
      const sum = (/** @type {'saves' | 'tackles' | 'shotsOnTarget'} */ k) => players.reduce((t, p) => t + p[k], 0);
      assert.equal(s[side].shots, team.shots, `${m.id} ${side} shots`);
      assert.equal(s[side].burns, team.burns);
      assert.equal(s[side].fouls, team.fouls);
      assert.equal(s[side].scorchers, team.scorchers);
      assert.equal(s[side].saves, sum('saves'));
      assert.equal(s[side].tackles, sum('tackles'));
      assert.equal(s[side].onTarget, sum('shotsOnTarget'));
      // Blocks (Task 183): the sim keeps no total, so against the match's own block events.
      assert.equal(s[side].blocks, m.events.filter((e) => e.type === 'block' && e.teamId === teamId).length);
      assert.equal(s[side].goals, side === 'home' ? m.summary.result.homeGoals : m.summary.result.awayGoals);
      // Event clocks are whole seconds, so possession drifts a few seconds over ~100 changes: well under 1% of a match.
      assert.ok(Math.abs(s[side].possession - team.possessionSeconds) < 20, `${m.id} ${side} possession ${s[side].possession} v ${team.possessionSeconds}`);
    }
    assert.equal(s.scorers.length, m.summary.result.homeGoals + m.summary.result.awayGoals);
  }
});

test('nothing ahead of the moment: counts only grow, and match the score at every goal', () => {
  const { tl } = matches[4];
  let prev = matchStatsAt(tl, 0);
  for (let e = 1000; e <= tl.duration; e += 7000) {
    const s = matchStatsAt(tl, e);
    for (const side of /** @type {const} */ (['home', 'away'])) {
      for (const k of /** @type {const} */ (['shots', 'saves', 'blocks', 'tackles', 'fouls', 'burns', 'goals', 'possession'])) assert.ok(s[side][k] >= prev[side][k] - 1e-9, `${k} went down`);
    }
    assert.deepEqual([s.home.goals, s.away.goals], tl.stateAt(e).score);
    prev = s;
  }
});

test('rows: possession as a share, the rest as counts', () => {
  const { tl } = matches[2];
  const rows = statRows(matchStatsAt(tl, tl.duration / 2));
  const poss = /** @type {[string, string, string]} */ (rows.find((r) => r[0] === 'POSS'));
  assert.equal(parseInt(poss[1], 10) + parseInt(poss[2], 10) >= 99, true);
  assert.deepEqual(rows.map((r) => r[0]), ['GOALS', 'SHOTS', 'ON GOAL', 'SAVES', 'POSS', 'BLOCKS', 'STEALS', 'TACKLES', 'SCORCHERS', 'BURNS', 'FOULS']);
  assert.deepEqual(statRows(matchStatsAt(tl, -1))[4], ['POSS', '-', '-']);
  // The score (Groundwork): at full time, the match's result (shootout kicks aside).
  const end = statRows(matchStatsAt(tl, tl.duration))[0];
  const r = tl.events.at(-1).event.data;
  assert.deepEqual(end, ['GOALS', String(r.homeGoals ?? r.score?.[0]), String(r.awayGoals ?? r.score?.[1])]);
});

test('steals are counted, and the panel shows steals and the other tackles as separate rows', () => {
  const s = { home: { goals: 0, shots: 0, onTarget: 0, saves: 0, possession: 0, blocks: 0, tackles: 10, steals: 6, scorchers: 0, burns: 0, fouls: 0 }, away: { goals: 0, shots: 0, onTarget: 0, saves: 0, possession: 0, blocks: 0, tackles: 3, steals: 0, scorchers: 0, burns: 0, fouls: 0 }, scorers: [] };
  const rows = Object.fromEntries(statRows(s).map((r) => [r[0], [r[1], r[2]]]));
  assert.deepEqual(rows.STEALS, ['6', '0']);
  assert.deepEqual(rows.TACKLES, ['4', '3']);
});
