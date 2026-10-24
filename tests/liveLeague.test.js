import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason, startSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const cal = createCalendar(config);
const SEED = 'live-tests';
const MIN = 60_000;

test('before season 1 nothing has kicked off, but the first schedule is known', () => {
  const live = new LiveLeague(config, { now: cal.seasonStart(1) - 1, seed: SEED });
  assert.equal(live.matches.size, 0);
  assert.equal(live.state.season, 1);
  assert.equal(live.state.schedule.length, 14);
  assert.equal(live.seed, SEED);
});

test('each match is simulated at its kick-off, in schedule order', () => {
  const slots = cal.slots(1);
  const live = new LiveLeague(config, { now: slots[9].kickoff - 1, seed: SEED });
  assert.equal(live.matches.size, 9);
  const kicked = live.advanceTo(slots[9].kickoff);
  assert.equal(kicked.length, 1);
  assert.equal(kicked[0].id, live.state.schedule[2].matches[1].id); // slot 9 = round 3, match 2
  assert.equal(kicked[0].kickoff, slots[9].kickoff);
  assert.deepEqual(live.advanceTo(slots[10].kickoff - 1), [], 'nothing between kick-offs');

  const m = kicked[0];
  assert.equal(m.events[0].type, 'lineup');
  assert.equal(m.events.at(-1)?.type, 'match_result');
  assert.ok(m.events.every((e) => e.matchId === m.id));
  assert.equal(m.summary.matchId, m.id);
});

test('the simultaneous final round plays all four matches at once', () => {
  const slots = cal.slots(1);
  const live = new LiveLeague(config, { now: slots[51].kickoff, seed: SEED });
  const round = live.advanceTo(slots[52].kickoff);
  assert.deepEqual(round.map((m) => m.round), [14, 14, 14, 14]);
  assert.equal(live.state.phase, 'playoffs', 'the table is final and the playoffs are seeded');
});

test('after the final, the off-season has run and the next season has started', () => {
  const slots = cal.slots(1);
  const live = new LiveLeague(config, { now: slots[58].kickoff, seed: SEED });
  assert.equal(live.state.season, 2);
  assert.equal(live.league.season, 2);
  assert.equal(live.league.history.length, 1);
  assert.ok(live.finished.get(1)?.offseason.draft.length);
  assert.equal(live.matchesIn(1).length, 59);
  assert.equal(live.matchesIn(2).length, 0);
  assert.equal(live.leagueEvents.at(-1)?.type, 'season_start');
});

test('the live league matches fast-forward for the same seed', () => {
  // Two seasons and their off-seasons, then season 3 starts.
  const log = new EventLog();
  const league = createLeague(config, SEED, log);
  for (let i = 0; i < 2; i++) runOffseason(league, config, log, runSeason(league, config, log));
  startSeason(league, config, log);

  const live = new LiveLeague(config, { now: cal.seasonStart(3) - 1, seed: SEED });
  assert.deepEqual(live.league, league);
  assert.equal(live.log.lastSeq, log.lastSeq);
});

test('advancing in small steps gives the same league as building in one go', () => {
  const end = cal.slots(1)[58].kickoff + 10 * MIN;
  const once = new LiveLeague(config, { now: end, seed: SEED });
  const stepped = new LiveLeague(config, { now: cal.seasonStart(1), seed: SEED });
  for (let t = cal.seasonStart(1); t < end; t += 97 * MIN) stepped.advanceTo(t);
  stepped.advanceTo(end);
  assert.deepEqual(stepped.league, once.league);
  assert.deepEqual([...stepped.matches.keys()], [...once.matches.keys()]);
  assert.deepEqual(stepped.leagueEvents.map((e) => e.seq), once.leagueEvents.map((e) => e.seq));
});

test('only the current and previous season are kept; time cannot go backwards', () => {
  const live = new LiveLeague(config, { now: cal.slots(3)[5].kickoff, seed: SEED });
  assert.deepEqual([...new Set([...live.matches.values()].map((m) => m.season))], [2, 3]);
  assert.deepEqual([...live.finished.keys()], [2]);
  assert.equal(live.league.history.length, 2, 'league history itself is never dropped');
  assert.throws(() => live.advanceTo(live.now - 1), /can't go back in time/);
});

test('rebuilding 20 seasons stays fast', () => {
  const started = performance.now();
  const live = new LiveLeague(config, { now: cal.seasonStart(21) + 1, seed: SEED });
  const seconds = (performance.now() - started) / 1000;
  assert.equal(live.league.history.length, 20);
  assert.ok(seconds < 8, `took ${seconds.toFixed(1)} s`);
});
