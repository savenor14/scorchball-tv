import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog, memorySink } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { seedStreams } from '../src/sim/streams.js';
import { contest, keeperRestRounds, restsKeeper, selectLineup, simulateMatch, winnerOf } from '../src/sim/match.js';

const config = await loadConfigFromDisk();
const { rules, positions } = config;
const half = rules.match.halfMinutes * 60;
const league = createLeague(config, 'match-tests', new EventLog());
const teamIds = Object.keys(league.teams);

/**
 * @param {number} i  Varies the match id (and so its random stream).
 * @param {{ knockout?: boolean, leagueOverride?: any }} [opts]
 */
function play(i, { knockout = false, leagueOverride = league } = {}) {
  const { events, sink } = memorySink();
  const match = {
    id: `s1-r1-m${i}`, season: 1, stage: knockout ? 'semifinal' : 'regular', round: knockout ? null : 1,
    homeId: teamIds[i % teamIds.length], awayId: teamIds[(i + 1) % teamIds.length], neutral: false,
  };
  const summary = simulateMatch({ match, league: leagueOverride, config, log: new EventLog({ sinks: [sink] }), knockout });
  return { summary, events, match };
}

test('contest() follows the logistic curve and respects its clamps', () => {
  const c = { scale: 10, bias: 0, pMin: 0.1, pMax: 0.9 };
  assert.equal(contest(c, 50, 50), 0.5);
  assert.ok(contest(c, 60, 50) > 0.7 && contest(c, 60, 50) < 0.75);
  assert.equal(contest(c, 99, 1), 0.9);
  assert.equal(contest(c, 1, 99), 0.1);
});

test('selectLineup() fills K, D, D, P, S with natural players and keeps a backup keeper on the bench', () => {
  const team = league.teams[teamIds[0]];
  const { starters, bench } = selectLineup(team, league.players, config);
  assert.deepEqual(starters.map((s) => s.slot), ['K', 'D', 'D', 'M', 'S']);
  for (const s of starters) assert.equal(s.player.position, s.slot);
  assert.equal(bench.length, rules.roster.matchday - starters.length);
  assert.equal(bench[0].position, positions.keeper);
  const ids = [...starters.map((s) => s.player.id), ...bench.map((p) => p.id)];
  assert.equal(new Set(ids).size, ids.length);
});

test('selectLineup() skips injured players and finds a stand-in when no natural keeper is fit', () => {
  const copy = structuredClone(league);
  const team = copy.teams[teamIds[0]];
  for (const id of team.roster) if (copy.players[id].position === 'K') copy.players[id].injury = { matchesOut: 2 };
  const { starters, bench } = selectLineup(team, copy.players, config);
  assert.equal(starters[0].slot, 'K');
  assert.notEqual(starters[0].player.position, 'K');
  for (const p of [...starters.map((s) => s.player), ...bench]) assert.equal(p.injury, null);
});

test('the same match always plays out identically; different matches differ', () => {
  const a = play(1);
  const b = play(1);
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.summary, b.summary);
  assert.notDeepEqual(play(2).events.map((e) => e.type), a.events.map((e) => e.type));
});

test('the engine never changes the league', () => {
  const before = structuredClone(league);
  for (let i = 0; i < 5; i++) play(i);
  assert.deepEqual(league, before);
});

test('event stream is well-formed: order, clock, context and score', () => {
  for (let i = 0; i < 20; i++) {
    const { summary, events, match } = play(i);
    assert.deepEqual(events.slice(0, 3).map((e) => e.type), ['lineup', 'lineup', 'kickoff']);
    assert.equal(events.at(-1)?.type, 'match_result');
    assert.equal(events.filter((e) => e.type === 'half_time').length, 1);
    assert.equal(events.find((e) => e.type === 'half_time')?.clock, half);
    assert.equal(events.find((e) => e.type === 'full_time')?.clock, 2 * half);

    let clock = 0;
    let home = 0;
    let away = 0;
    for (const e of events) {
      assert.equal(e.matchId, match.id);
      assert.ok(/** @type {number} */ (e.clock) >= clock, 'clock never runs backwards');
      clock = /** @type {number} */ (e.clock);
      assert.ok(clock <= 2 * half);
      if (e.type === 'goal') {
        if (e.teamId === match.homeId) home++;
        else away++;
        assert.deepEqual(e.data.score, [home, away]);
      }
    }
    assert.deepEqual([home, away], [summary.result.homeGoals, summary.result.awayGoals]);
    assert.equal(summary.result.decidedBy, 'regulation');
  }
});

test('player and team stats add up', () => {
  for (let i = 0; i < 20; i++) {
    const { summary, events, match } = play(i);
    for (const [teamId, goals, teamStats] of [
      [match.homeId, summary.result.homeGoals, summary.teamStats.home],
      [match.awayId, summary.result.awayGoals, summary.teamStats.away],
    ]) {
      const players = Object.values(summary.playerStats).filter((p) => p.teamId === teamId);
      const total = (/** @type {keyof typeof players[0]} */ k) => players.reduce((s, p) => s + Number(p[k]), 0);
      assert.equal(total('goals'), goals);
      assert.ok(total('assists') <= goals);
      assert.ok(total('shotsOnTarget') >= goals);
      assert.equal(total('shots'), teamStats.shots);
      assert.equal(total('scorchers'), teamStats.scorchers);
      assert.equal(total('burns'), teamStats.burns);
      assert.equal(players.filter((p) => p.started).length, 5);
      assert.ok(players.length <= 5 + rules.match.maxSubstitutions);
      // Five players on the pitch for the whole match, unless someone was injured with no sub left.
      const injuredOff = summary.injuries.filter((x) => x.teamId === teamId).length;
      if (injuredOff === 0) assert.ok(Math.abs(total('secondsPlayed') - 5 * 2 * half) < 1e-6);
    }
    const possession = summary.teamStats.home.possessionSeconds + summary.teamStats.away.possessionSeconds;
    assert.ok(Math.abs(possession - 2 * half) < 1e-6);
    assert.equal(events.filter((e) => e.type === 'injury').length, summary.injuries.length);
  }
});

test('knockout matches always produce a winner, via overtime or a shootout when needed', () => {
  const decidedBy = new Set();
  for (let i = 0; i < 150; i++) {
    const { summary, events } = play(1000 + i, { knockout: true });
    assert.ok(winnerOf(summary), `match ${i} has no winner`);
    decidedBy.add(summary.result.decidedBy);
    if (summary.result.decidedBy === 'shootout') {
      const { homeGoals, awayGoals, shootout } = summary.result;
      assert.equal(homeGoals, awayGoals);
      assert.ok(shootout && shootout.home !== shootout.away);
      assert.ok(events.some((e) => e.type === 'shootout_kick'));
    }
    if (summary.result.decidedBy === 'overtime') {
      const goalsInOt = events.filter((e) => e.type === 'goal' && /** @type {number} */ (e.clock) > 2 * half);
      assert.equal(goalsInOt.length, 1, 'overtime ends on the first goal');
    }
  }
  assert.ok(decidedBy.has('overtime') || decidedBy.has('shootout'), 'some knockouts should need extra time');
});

test('winnerOf() handles wins, draws and shootouts', () => {
  const base = { homeId: 'h', awayId: 'a' };
  assert.equal(winnerOf({ ...base, result: { homeGoals: 3, awayGoals: 1, decidedBy: 'regulation', shootout: null } }), 'h');
  assert.equal(winnerOf({ ...base, result: { homeGoals: 2, awayGoals: 2, decidedBy: 'regulation', shootout: null } }), null);
  assert.equal(winnerOf({ ...base, result: { homeGoals: 2, awayGoals: 2, decidedBy: 'shootout', shootout: { home: 1, away: 3 } } }), 'a');
});

test('a team with only 3 fit players still completes the match', () => {
  const copy = structuredClone(league);
  const team = copy.teams[teamIds[0]];
  team.roster.slice(3).forEach((/** @type {string} */ id) => { copy.players[id].injury = { matchesOut: 5 }; });
  const { summary } = play(0, { leagueOverride: copy });
  assert.equal(Object.values(summary.playerStats).filter((p) => p.teamId === teamIds[0]).length, 3);
});

test('balance guard: scoring stays near the 5–8 target', () => {
  let goals = 0;
  const n = 150;
  for (let i = 0; i < n; i++) {
    const { summary } = play(5000 + i);
    goals += summary.result.homeGoals + summary.result.awayGoals;
  }
  const avg = goals / n;
  assert.ok(avg >= 4 && avg <= 9, `average goals ${avg.toFixed(2)} drifted far from the target`);
});

test('a tackle says whether it was a steal: the carrier tried to pass (their better skill) and it was cut out', () => {
  let steals = 0;
  let tackles = 0;
  for (let i = 0; i < 20; i++) {
    for (const e of play(i).events) {
      if (e.type !== 'possession_change' || /** @type {any} */ (e.data).reason !== 'tackle') continue;
      const steal = /** @type {any} */ (e.data).steal;
      assert.equal(typeof steal, 'boolean');
      tackles++;
      if (steal) steals++;
    }
  }
  // Defenders and midfielders mostly pass, strikers mostly dribble: about half of tackles are steals.
  assert.ok(steals / tackles > 0.3 && steals / tackles < 0.8, `${steals} steals of ${tackles} tackles`);
});

test('substitutions: up to maxSubstitutions per team', () => {
  for (let i = 0; i < 20; i++) {
    const counts = new Map();
    for (const e of play(i).events) if (e.type === 'substitution') counts.set(e.teamId, (counts.get(e.teamId) ?? 0) + 1);
    for (const n of counts.values()) assert.ok(n <= rules.match.maxSubstitutions);
  }
});

test('breakaways: an unchallenged advance into the attacking zone, then that player shoots with nobody to block it', () => {
  let breakaways = 0;
  let shots = 0;
  for (let i = 0; i < 20; i++) {
    const events = play(i).events;
    /** @type {string | null} */
    let breaker = null;
    events.forEach((e, j) => {
      if (e.type === 'advance' && /** @type {any} */ (e.data).breakaway) {
        breakaways++;
        assert.equal(/** @type {any} */ (e.data).to, 'attacking');
        breaker = e.playerId;
      }
      if (e.type !== 'shot' || !(/** @type {any} */ (e.data).breakaway)) return;
      // A breakaway shot is by the player who broke through, and nobody is near enough to block it.
      shots++;
      assert.equal(e.playerId, breaker);
      assert.notEqual(events[j + 1]?.type, 'block');
      breaker = null;
    });
  }
  // About 4 a match, and the breakaway player nearly always shoots.
  assert.ok(breakaways / 20 > 2 && breakaways / 20 < 7, `${breakaways} breakaways in 20 matches`);
  assert.ok(shots / breakaways > 0.75, `${shots} breakaway shots from ${breakaways}`);
});

test('a tired player comes off only at a stoppage or with their team on the ball in its own third (injuries any time)', () => {
  let checked = 0;
  for (let i = 0; i < 20; i++) {
    /** @type {{ possession: string | null, zone: string, stopped: boolean }} */
    const state = { possession: null, zone: 'middle', stopped: false };
    for (const e of play(i).events) {
      const data = /** @type {any} */ (e.data);
      if (e.type === 'substitution' && data.reason === 'fatigue') {
        assert.ok(state.stopped || (state.possession === e.teamId && state.zone === 'defensive'), `a fatigue sub at ${e.clock} in open play`);
        checked++;
        continue;
      }
      if (['substitution', 'heat_stage', 'injury', 'lineup', 'momentum'].includes(e.type)) continue;
      // Each other event is the latest thing that happened: did it stop play?
      state.stopped = ['goal', 'miss', 'foul', 'burn', 'half_time', 'overtime_start'].includes(e.type) || (e.type === 'save' && !data.parried)
        || (state.stopped && ['possession_change', 'free_shot', 'shot', 'block', 'save'].includes(e.type));
      if (e.type === 'possession_change') [state.possession, state.zone] = [e.teamId ?? null, data.zone];
      if (e.type === 'kickoff') [state.possession, state.zone, state.stopped] = [e.teamId ?? null, 'middle', false];
      if (e.type === 'advance') state.zone = data.to;
    }
  }
  assert.ok(checked > 50);
});

/** A copy of the league where every team has one fit keeper, so none is on the bench. */
function oneKeeperLeague() {
  const copy = structuredClone(league);
  for (const team of Object.values(copy.teams)) {
    const keepers = team.roster.filter((id) => copy.players[id].position === positions.keeper);
    for (const id of keepers.slice(1)) copy.players[id].injury = { matchesOut: 2 };
  }
  return copy;
}

test('Task 174b: keepers never come off tired, with or without a keeper on the bench', () => {
  let fatigueSubs = 0;
  for (const lg of [league, oneKeeperLeague()]) {
    for (let i = 0; i < 20; i++) {
      for (const e of play(i, { leagueOverride: lg }).events) {
        const data = /** @type {any} */ (e.data);
        if (e.type !== 'substitution' || data.reason !== 'fatigue') continue;
        assert.notEqual(data.slot, positions.keeper, `a tired keeper came off at ${e.clock}`);
        fatigueSubs++;
      }
    }
  }
  assert.ok(fatigueSubs > 40, `${fatigueSubs} fatigue substitutions in 40 matches`);
});

test('Task 174b: every backup keeper starts 1 or 2 regular-season matches, never the final round or the playoffs', () => {
  const n = teamIds.length;
  for (let season = 1; season <= 10; season++) {
    for (const teamId of teamIds) {
      const rounds = keeperRestRounds(seedStreams(league.seed), season, teamId, n, rules);
      assert.ok(rounds.size >= rules.roster.backupKeeperStarts.min && rounds.size <= rules.roster.backupKeeperStarts.max);
      for (const r of rounds) assert.ok(r >= 1 && r < 2 * (n - 1), `round ${r}`);
      assert.deepEqual(keeperRestRounds(seedStreams(league.seed), season, teamId, n, rules), rounds, 'the same seed, the same rounds');
      for (const r of rounds) assert.ok(restsKeeper(league, { season, stage: 'regular', round: r }, teamId, rules));
    }
  }
  assert.ok(!restsKeeper(league, { season: 1, stage: 'final', round: null }, teamIds[0], rules));
  assert.ok(!restsKeeper(league, { season: 1, stage: 'semifinal', round: null }, teamIds[0], rules));
});

test('Task 174b: a resting team starts its second keeper and benches its first; with one fit keeper, that one starts', () => {
  const team = league.teams[teamIds[0]];
  const normal = selectLineup(team, league.players, config);
  const rest = selectLineup(team, league.players, config, { restKeeper: true });
  assert.equal(rest.starters[0].slot, positions.keeper);
  assert.equal(rest.starters[0].player.position, positions.keeper);
  assert.notEqual(rest.starters[0].player.id, normal.starters[0].player.id);
  assert.equal(rest.bench[0].id, normal.starters[0].player.id);
  assert.deepEqual(rest.starters.slice(1), normal.starters.slice(1));
  const copy = oneKeeperLeague();
  const only = selectLineup(copy.teams[teamIds[0]], copy.players, config, { restKeeper: true });
  assert.equal(only.starters[0].player.position, positions.keeper);
});

test('Task 174c: a tired outfield player comes off only for an outfield player, never for the backup keeper', () => {
  let fatigueSubs = 0;
  for (let i = 0; i < 30; i++) {
    for (const e of play(i).events) {
      const data = /** @type {any} */ (e.data);
      if (e.type !== 'substitution' || data.reason !== 'fatigue') continue;
      assert.notEqual(league.players[/** @type {string} */ (e.playerId)].position, positions.keeper, `a keeper went on for a tired ${data.slot} at ${e.clock}`);
      fatigueSubs++;
    }
  }
  assert.ok(fatigueSubs > 60, `${fatigueSubs} fatigue substitutions in 30 matches`);
});

test('Task 176: nothing but the result follows a golden goal (no substitution after the winner)', () => {
  let goldenGoals = 0;
  for (let i = 0; i < 300 && goldenGoals < 5; i++) {
    const { summary, events } = play(i, { knockout: true });
    if (summary.result.decidedBy !== 'overtime') continue;
    goldenGoals++;
    const winner = events.findLastIndex((e) => e.type === 'goal');
    const after = events.slice(winner + 1).map((e) => e.type);
    // A golden scorcher's momentum (Task 237) is logged with it, harmlessly.
    assert.ok(after.every((t) => t === 'possession_change' || t === 'momentum' || t === 'player_of_the_match' || t === 'match_result'), `after the golden goal: ${after.join(', ')}`);
  }
  assert.ok(goldenGoals > 0, 'some knockouts were won in overtime');
});

test('Task 174: with no keeper on the bench, a tired keeper plays on', () => {
  const copy = oneKeeperLeague();
  let fatigueSubs = 0;
  for (let i = 0; i < 20; i++) {
    for (const e of play(i, { leagueOverride: copy }).events) {
      const data = /** @type {any} */ (e.data);
      if (e.type !== 'substitution' || data.reason !== 'fatigue') continue;
      assert.notEqual(data.slot, positions.keeper, `a tired keeper came off at ${e.clock} with no keeper on the bench`);
      fatigueSubs++;
    }
  }
  assert.ok(fatigueSubs > 20, `${fatigueSubs} fatigue substitutions in 20 matches`);
});

test('Task 174: an injured keeper with no keeper on the bench is still replaced by an outfield player', () => {
  const copy = oneKeeperLeague();
  const cfg = { ...config, rules: { ...rules, injuries: { ...rules.injuries, chancePerMatch: 0.3 } } };
  let standIns = 0;
  for (let i = 0; i < 10; i++) {
    const { sink, events } = memorySink();
    const match = { id: `s1-r1-m${i}`, season: 1, stage: 'regular', round: 1, homeId: teamIds[i % teamIds.length], awayId: teamIds[(i + 1) % teamIds.length], neutral: false };
    simulateMatch({ match, league: copy, config: cfg, log: new EventLog({ sinks: [sink] }) });
    for (const e of events) {
      const data = /** @type {any} */ (e.data);
      if (e.type === 'substitution' && data.reason === 'injury' && data.slot === positions.keeper) {
        assert.notEqual(copy.players[/** @type {string} */ (e.playerId)].position, positions.keeper);
        standIns++;
      }
    }
  }
  assert.ok(standIns > 0, 'no keeper was injured and replaced');
});

test('restarts (Task 88): the keeper\'s team is rarely turned over before it gets the ball out', () => {
  /** Tackles straight after a goal, miss or held save, over many matches, with a given restartPressFactor. @param {number} factor */
  const count = (factor) => {
    const cfg = { ...config, rules: { ...rules, tactics: { ...rules.tactics, restartPressFactor: factor } } };
    let n = 0;
    for (let i = 0; i < 40; i++) {
      const { events, sink } = memorySink();
      const match = { id: `s1-r1-m${i}`, season: 1, stage: 'regular', round: 1, homeId: teamIds[i % teamIds.length], awayId: teamIds[(i + 1) % teamIds.length], neutral: false };
      simulateMatch({ match, league, config: cfg, log: new EventLog({ sinks: [sink] }), knockout: false });
      const plays = events.filter((e) => e.type !== 'heat_stage' && e.type !== 'foul');
      plays.forEach((e, k) => {
        const before = plays[k - 1];
        if (e.type === 'possession_change' && /** @type {any} */ (e.data).reason === 'tackle' && before?.type === 'possession_change' && ['goal', 'miss', 'save'].includes(/** @type {any} */ (before.data).reason)) n++;
      });
    }
    return n;
  };
  const restartRule = count(rules.tactics.restartPressFactor);
  const asOtherPressing = count(rules.tactics.pressFactor);
  assert.ok(restartRule < asOtherPressing * 0.5, `${restartRule} turnovers after restarts, against ${asOtherPressing} with ordinary pressing`);
});

test('a breakaway always ends in the shot of the player who broke clear (Task 152)', async () => {
  const { runSeason } = await import('../src/sim/season.js');
  const mem = memorySink();
  const log = new EventLog({ sinks: [mem.sink] });
  runSeason(createLeague(config, 'breakaway-tests', log), config, log);
  const events = mem.events.filter((e) => e.matchId);
  let n = 0;
  events.forEach((e, i) => {
    if (e.type !== 'advance' || !(/** @type {any} */ (e.data).breakaway)) return;
    n++;
    const next = events.slice(i + 1).find((x) => x.matchId === e.matchId && ['shot', 'advance', 'possession_change', 'foul', 'burn', 'half_time', 'full_time'].includes(x.type));
    // (Unless the half or the match ends first, or the ball burns on the run.)
    if (next?.type === 'half_time' || next?.type === 'full_time' || (next?.type === 'burn' && next.playerId === e.playerId)) return;
    assert.ok(next?.type === 'shot' && next.playerId === e.playerId && /** @type {any} */ (next.data).breakaway, `breakaway ${e.seq} in ${e.matchId}`);
  });
  assert.ok(n > 50, `${n} breakaways`);
});
