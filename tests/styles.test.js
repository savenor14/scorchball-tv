// Styles are flavour, not an edge (Task 233, Tom): a pressing side wins the ball more and tires faster; the box scores
// differ, the results don't (measured in docs/simulation.md §10b; the points are checked by hand, too noisy for a test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();

test('a pressing side wins the ball more, fouls more and tires sooner than one sitting back', () => {
  const tally = { press: { tackles: 0, fouls: 0, tiredSubs: 0 }, sit: { tackles: 0, fouls: 0, tiredSubs: 0 } };
  for (let s = 0; s < 3; s++) {
    let league = /** @type {any} */ (null);
    const log = new EventLog({ sinks: [(e) => {
      const side = e.teamId === 't-anvils' ? tally.press : e.teamId === 't-royale' ? tally.sit : null;
      if (!side) return;
      if (e.type === 'possession_change' && /** @type {any} */ (e.data).reason === 'tackle') side.tackles++;
      if (e.type === 'foul') side.fouls++;
      if (e.type === 'substitution' && /** @type {any} */ (e.data).reason === 'fatigue') side.tiredSubs++;
    }] });
    league = createLeague(config, `styles-${s}`, log);
    for (const t of Object.values(league.teams)) /** @type {any} */ (t).personality = { tempo: 0.5, aggression: 0.5 };
    league.teams['t-anvils'].personality.aggression = 0.8;
    league.teams['t-royale'].personality.aggression = 0.3;
    runSeason(league, config, log);
  }
  assert.ok(tally.press.tackles > tally.sit.tackles * 1.05, JSON.stringify(tally));
  assert.ok(tally.press.fouls > tally.sit.fouls, JSON.stringify(tally));
  assert.ok(tally.press.tiredSubs > tally.sit.tiredSubs, JSON.stringify(tally));
});
