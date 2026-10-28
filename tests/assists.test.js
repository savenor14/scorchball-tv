import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog, memorySink } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runSeason } from '../src/sim/season.js';

const real = await loadConfigFromDisk();

/** A season's events with rules.match.assists set to `mode`. @param {string} mode */
function season(mode) {
  const config = structuredClone(real);
  config.rules.match.assists = mode;
  const { events, sink } = memorySink();
  const log = new EventLog({ sinks: [sink] });
  const league = createLeague(config, 'assists-test', log);
  runSeason(league, config, log);
  return { events, league };
}

test('the teammate assist (Tom, 2026-10-28): only who is credited changes, never the scorer, never a free shot', () => {
  const before = season('lastAdvance');
  const after = season('teammate');
  const results = (/** @type {any[]} */ events) => events.filter((e) => e.type === 'match_result').map((e) => JSON.stringify(e.data));
  assert.deepEqual(results(after.events), results(before.events), 'the same results');

  const goals = after.events.filter((e) => e.type === 'goal');
  for (const g of goals.filter((x) => x.data.assistId)) {
    assert.notEqual(g.data.assistId, g.playerId);
    assert.equal(after.league.players[g.data.assistId].teamId, g.teamId, 'a teammate');
  }
  assert.ok(goals.filter((g) => g.data.freeShot).every((g) => g.data.assistId === null), 'none on a free shot');
  const share = (/** @type {any[]} */ events) => {
    const gs = events.filter((e) => e.type === 'goal');
    return gs.filter((g) => g.data.assistId).length / gs.length;
  };
  assert.ok(share(before.events) < 0.65 && share(after.events) > 0.72, `${share(before.events)} to ${share(after.events)}`);
});
