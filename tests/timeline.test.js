import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { settings, rules } = config;
const MIN = 60_000;
const msPerGameSecond = (settings.match.realMinutes * MIN) / (2 * rules.match.halfMinutes * 60);
const halfTime = settings.match.halfTimeRealMinutes * MIN;
const brk = settings.match.overtimeBreakRealMinutes * MIN;

/**
 * Play seasons until we have a regular match, an overtime knockout and a shootout knockout.
 * @returns {Record<'regular' | 'overtime' | 'shootout', { events: any[], homeId: string, awayId: string }>}
 */
function findMatches() {
  /** @type {Map<string, any[]>} */
  const byMatch = new Map();
  const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId))?.push(e); }] });
  const league = createLeague(config, 'timeline-tests', log);
  /** @type {Record<string, any>} */
  const found = {};
  for (let s = 0; s < 60 && !(found.overtime && found.shootout); s++) {
    runOffseason(league, config, log, runSeason(league, config, log));
    for (const [id, events] of byMatch) {
      const r = events.at(-1).data;
      const kind = r.decidedBy;
      found[kind] ??= { events, homeId: r.homeId, awayId: r.awayId };
      byMatch.delete(id);
    }
  }
  assert.ok(found.regulation && found.overtime && found.shootout, 'test seasons should include overtime and a shootout');
  return { regular: found.regulation, overtime: found.overtime, shootout: found.shootout };
}

const matches = findMatches();

/** Total clock-pause time (goals and substitutions) before elapsed `at`, or in all. @param {any} tl @param {number} [at] */
const pausedBefore = (tl, at = Infinity) => tl.pauses.filter((/** @type {any} */ q) => q.at < at).reduce((t, /** @type {any} */ q) => t + q.ms, 0);
/** @param {any} tl @param {string} type */
const eventAt = (tl, type) => /** @type {import('../src/channel/timeline.js').TimedEvent} */ (tl.events.find((/** @type {any} */ t) => t.event.type === type));

test('a regular match lasts the match time plus half-time and its pauses, with phases and clock in step', () => {
  const tl = createTimeline(matches.regular, config);
  assert.ok(tl.pauses.length > 0, 'a regular match has goals or substitutions');
  assert.equal(tl.duration, settings.match.realMinutes * MIN + halfTime + pausedBefore(tl));
  assert.equal(tl.decidedBy, 'regulation');

  assert.deepEqual([tl.stateAt(-1).phase, tl.stateAt(-1).clock], ['pre', 0]);
  assert.equal(tl.stateAt(0).phase, 'first_half');
  const ht = eventAt(tl, 'half_time').at;
  assert.equal(ht, 1200 * msPerGameSecond + pausedBefore(tl, ht));
  assert.deepEqual([tl.stateAt(ht + 1).phase, tl.stateAt(ht + halfTime / 2).clock], ['half_time', 1200]);
  assert.deepEqual([tl.stateAt(ht + halfTime).phase, tl.stateAt(ht + halfTime).clock], ['second_half', 1200]);
  assert.deepEqual([tl.stateAt(tl.duration).phase, tl.stateAt(tl.duration).clock], ['finished', 2400]);
});

test('event times never go backwards, the clock reads each event\'s own time, and second-half events sit after the break', () => {
  for (const m of Object.values(matches)) {
    const tl = createTimeline(m, config);
    for (let i = 1; i < tl.events.length; i++) assert.ok(tl.events[i].at >= tl.events[i - 1].at, `${tl.events[i].event.type} at ${i}`);
    for (const { event: e, at } of tl.events) {
      if (e.clock === undefined || ['lineup', 'shootout_kick', 'match_result', 'full_time', 'half_time'].includes(e.type)) continue;
      if (tl.stateAt(at).phase === 'finished') continue;
      assert.ok(Math.abs(tl.stateAt(at).clock - /** @type {number} */ (e.clock)) < 1e-6, `${e.type} at clock ${e.clock}: ${tl.stateAt(at).clock}`);
    }
    const kickoffs = tl.events.filter((t) => t.event.type === 'kickoff');
    const ht = eventAt(tl, 'half_time');
    assert.equal(kickoffs[1].at, ht.at + halfTime);
  }
});

test('the clock pauses for goals and substitutions, one pause per moment', () => {
  for (const m of Object.values(matches)) {
    const tl = createTimeline(m, config);
    const ats = tl.pauses.map((q) => q.at);
    assert.equal(new Set(ats).size, ats.length, 'pauses at distinct moments');
    for (const { event: e, at } of tl.events.filter((t) => t.event.type === 'goal' || t.event.type === 'substitution')) {
      const q = tl.pauses.find((x) => x.at === at);
      if (!q) {
        // Only a change at the very end or start of a period goes unpaused (a golden goal is paused, Task 147).
        assert.ok( [0, 1200, 2400].includes(/** @type {number} */ (e.clock)), `${e.type} at ${e.clock} has no pause`);
        continue;
      }
      const want = e.type === 'goal' ? settings.match.goalPauseSeconds : settings.match.subPauseSeconds;
      assert.ok(q.ms >= want * 1000);
      const mid = tl.stateAt(at + q.ms / 2);
      assert.equal(mid.clock, e.clock);
      assert.ok(mid.paused);
      if (e.type === 'goal') assert.equal(mid.heat, 0);
      // Nothing happens during a pause, and the clock runs again after it.
      assert.ok(!tl.events.some((t) => t.at > at && t.at < at + q.ms));
      const after = tl.stateAt(at + q.ms + 500);
      // A substitution at the same game second as a goal gets its own pause straight after the goal's.
      const followed = tl.pauses.some((x) => x.at === at + q.ms && x.clock === e.clock);
      if (['first_half', 'second_half', 'overtime'].includes(after.phase) && !followed) {
        assert.ok(after.clock > /** @type {number} */ (e.clock) && after.paused === null, `clock runs after the ${e.type} at ${e.clock}`);
      }
    }
  }
});

test('the score changes exactly when each goal happens, and ends at the result', () => {
  const tl = createTimeline(matches.regular, config);
  const goals = tl.events.filter((t) => t.event.type === 'goal');
  assert.ok(goals.length > 0);
  for (const g of goals) {
    const at = tl.stateAt(g.at);
    assert.deepEqual(at.score, g.event.data.score);
    const before = tl.stateAt(g.at - 1).score;
    assert.equal(before[0] + before[1], at.score[0] + at.score[1] - 1);
  }
  const r = /** @type {any} */ (tl.events.at(-1)?.event.data);
  assert.deepEqual(tl.stateAt(tl.duration).score, [r.homeGoals, r.awayGoals]);
});

test('possession, zone, heat and carrier follow the events', () => {
  const tl = createTimeline(matches.regular, config);
  for (const { event: e, at } of tl.events) {
    const s = tl.stateAt(at);
    if (s.last?.event !== e) continue; // a later event at the same moment takes over
    if (e.type === 'possession_change') {
      assert.deepEqual([s.possession, s.zone, s.carrierId], [e.teamId, e.data.zone, e.playerId]);
      assert.ok(s.heat < 1e-9, `heat ${s.heat} right after a change of possession`);
    }
    if (e.type === 'advance') assert.deepEqual([s.zone, s.carrierId], [e.data.to, e.playerId]);
  }
  // Heat builds to (nearly) full just before a burn. Clocks are whole seconds, so allow a few points.
  const burns = tl.events.filter((t) => t.event.type === 'burn');
  for (const b of burns) assert.ok(tl.stateAt(b.at - 1).heat >= 90, `heat before burn ${tl.stateAt(b.at - 1).heat}`);
  // Heat agrees with the engine's heat_stage events, within the rounding of whole-second clocks.
  let checked = 0;
  for (const { event: e, at } of tl.events.filter((t) => t.event.type === 'heat_stage')) {
    const resets = tl.events.some((t) => t.at === at && ['possession_change', 'kickoff', 'free_shot', 'goal', 'half_time', 'full_time'].includes(t.event.type));
    if (resets) continue; // heat reset at the same moment (after a goal the ball is dead; at a whistle play stops)
    const s = tl.stateAt(at);
    assert.ok(Math.abs(s.heat - e.data.heat) <= 6, `heat ${s.heat.toFixed(1)} vs engine ${e.data.heat}`);
    checked++;
  }
  assert.ok(checked > 10);
});

test('players on the pitch follow substitutions and injuries', () => {
  for (const m of Object.values(matches)) {
    const tl = createTimeline(m, config);
    const start = tl.stateAt(0).onPitch;
    assert.deepEqual([start.home.length, start.away.length], [5, 5]);
    for (const { event: e, at } of tl.events.filter((t) => t.event.type === 'substitution')) {
      const side = e.teamId === m.homeId ? 'home' : 'away';
      const ids = tl.stateAt(at).onPitch[side].map((p) => p.playerId);
      assert.ok(ids.includes(/** @type {string} */ (e.playerId)));
      assert.ok(!ids.includes(e.data.offId));
      assert.equal(ids.length, new Set(ids).size);
    }
  }
});

test("overtime: a break after full time, then golden-goal play, and the match ends after the golden goal's pause (Task 147)", () => {
  const tl = createTimeline(matches.overtime, config);
  const fullTime = eventAt(tl, 'full_time').at;
  assert.equal(fullTime, 2400 * msPerGameSecond + halfTime + pausedBefore(tl, fullTime));
  assert.equal(tl.decidedBy, 'overtime');
  assert.equal(tl.stateAt(fullTime + 1).phase, 'overtime_break');
  assert.deepEqual([tl.stateAt(fullTime + brk).phase, tl.stateAt(fullTime + brk).clock], ['overtime', 2400]);
  const winner = /** @type {import('../src/channel/timeline.js').TimedEvent} */ (tl.events.findLast((t) => t.event.type === 'goal'));
  // Celebrated like any goal: the clock paused in overtime, then the final whistle.
  assert.equal(tl.duration, winner.at + settings.match.goalPauseSeconds * 1000);
  assert.deepEqual([tl.stateAt(winner.at + 1).phase, tl.stateAt(winner.at + 1).paused], ['overtime', 'goal']);
  assert.equal(tl.stateAt(tl.duration).phase, 'finished');
  assert.ok(tl.stateAt(tl.duration - 1).clock < /** @type {number} */ (winner.event.clock) + 1);
});

test('shootout: kicks come after a second break, one every few seconds, and the tally ends at the result', () => {
  const tl = createTimeline(matches.shootout, config);
  const otEnd = (2400 + rules.match.overtimeMinutes * 60) * msPerGameSecond + halfTime + brk + pausedBefore(tl);
  assert.equal(tl.stateAt(otEnd + 1).phase, 'shootout_break');
  const kicks = tl.events.filter((t) => t.event.type === 'shootout_kick');
  assert.equal(kicks[0].at, otEnd + brk + settings.match.shootoutKickRealSeconds * 1000);
  assert.equal(tl.stateAt(kicks[0].at - 1).phase, 'shootout');
  assert.equal(tl.stateAt(kicks[0].at - 1).shootout, null);
  assert.deepEqual(tl.stateAt(kicks[0].at).shootout, kicks[0].event.data.shootout);
  const r = /** @type {any} */ (tl.events.at(-1)?.event.data);
  assert.deepEqual(tl.stateAt(tl.duration).shootout, [r.shootout.home, r.shootout.away]);
  // The last kick is held like a goal before the final whistle (Task 277b).
  assert.equal(tl.duration, /** @type {number} */ (kicks.at(-1)?.at) + settings.match.goalPauseSeconds * 1000);
  assert.equal(tl.stateAt(tl.duration - 1).phase, 'shootout');
  // Within the longest knockout the config validator allows for (two rounds of sudden death).
  assert.ok(tl.duration <= otEnd + brk + 2 * (rules.playoffs.shootoutKicks + 2) * settings.match.shootoutKickRealSeconds * 1000 + settings.match.goalPauseSeconds * 1000 || kicks.length > 2 * (rules.playoffs.shootoutKicks + 2));
});

test('stateAt is fast enough to call every frame', () => {
  const tl = createTimeline(matches.shootout, config);
  const started = performance.now();
  for (let i = 0; i < 1000; i++) tl.stateAt((i / 1000) * tl.duration);
  const perCall = (performance.now() - started) / 1000;
  assert.ok(perCall < 1, `${perCall.toFixed(3)} ms per call`);
});

test('a free shot comes a beat after its foul: the clock stops for freeShotPauseSeconds in between', () => {
  /** @type {Map<string, any[]>} */
  const byMatch = new Map();
  const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId))?.push(e); }] });
  const league = createLeague(config, 'free-shot-pauses', log);
  runSeason(league, config, log);
  const beat = settings.match.freeShotPauseSeconds * 1000;
  let checked = 0;
  for (const [id, events] of byMatch) {
    const r = events.at(-1).data;
    const tl = createTimeline({ id, events, homeId: r.homeId, awayId: r.awayId }, config);
    tl.events.forEach((/** @type {any} */ t, /** @type {number} */ i) => {
      if (t.event.type !== 'free_shot') return;
      const foul = tl.events.slice(0, i).findLast((/** @type {any} */ x) => x.event.type === 'foul');
      assert.ok(foul && foul.event.clock === t.event.clock);
      assert.equal(t.at - foul.at, beat, 'a beat after the foul');
      const mid = tl.stateAt(foul.at + beat / 2);
      assert.equal(mid.paused, 'free_shot');
      assert.equal(Math.round(mid.clock), foul.event.clock, 'the clock stopped');
      // The shot and what it led to follow the free shot.
      for (const x of tl.events.slice(i + 1).filter((/** @type {any} */ x) => x.event.clock === t.event.clock)) assert.ok(x.at >= t.at);
      checked++;
    });
  }
  assert.ok(checked > 5, `only ${checked} free shots`);
});
