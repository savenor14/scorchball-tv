import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog, memorySink } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createDraftClass, draftOrder, runDraft, statNeeds, styleFit } from '../src/sim/draft.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { overall } from '../src/sim/players.js';
import { createRng } from '../src/sim/rng.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { rules, positions } = config;

/** Play `n` full seasons (season + off-season). @param {string} seed @param {number} n */
function run(seed, n) {
  const { events, sink } = memorySink();
  const log = new EventLog({ sinks: [sink] });
  const league = createLeague(config, seed, log);
  const seasons = [];
  for (let i = 0; i < n; i++) {
    const record = runSeason(league, config, log);
    const before = structuredClone(league);
    const report = runOffseason(league, config, log, record);
    seasons.push({ record, report, before });
  }
  return { league, seasons, events };
}

/** Every structural rule that must hold between seasons. @param {import('../src/sim/league.js').League} league */
function assertValidLeague(league) {
  const seen = new Set();
  for (const team of Object.values(league.teams)) {
    assert.equal(team.roster.length, rules.roster.size, `${team.id} roster size`);
    const counts = new Map();
    for (const id of team.roster) {
      const p = league.players[id];
      assert.equal(p.status, 'active');
      assert.equal(p.teamId, team.id);
      assert.ok(!seen.has(id), `${id} on two rosters`);
      seen.add(id);
      counts.set(p.position, (counts.get(p.position) ?? 0) + 1);
    }
    for (const [pos, min] of Object.entries(rules.roster.minimums)) {
      assert.ok((counts.get(pos) ?? 0) >= min, `${team.id} has too few ${pos}`);
    }
    // The reserves (Task 194b): their own draft picks, rights held, not on the roster.
    for (const id of team.reserves) {
      const p = league.players[id];
      assert.equal(p.status, 'active');
      assert.equal(p.teamId, team.id);
      assert.equal(p.draft?.teamId, team.id, 'a reserve is the team\'s own pick');
      assert.ok(p.reserveUntil !== null && p.reserveUntil >= league.season && p.reserveUntil <= (p.draft?.season ?? 0) + rules.reserves.rightsSeasons);
      assert.ok(!seen.has(id), `${id} both a reserve and elsewhere`);
      seen.add(id);
    }
  }
  for (const id of league.freeAgents) {
    const p = league.players[id];
    assert.equal(p.status, 'active');
    assert.equal(p.teamId, null);
    assert.ok(!seen.has(id), `${id} is both signed and a free agent`);
    seen.add(id);
  }
  const active = Object.values(league.players).filter((p) => p.status === 'active');
  assert.equal(active.length, seen.size, 'every active player is on a roster or in the pool');
  assert.equal(new Set(active.map((p) => `${p.firstName} ${p.lastName}`)).size, active.length, 'active names are unique');
  for (const p of Object.values(league.players)) {
    if (p.status === 'retired') assert.equal(p.teamId, null);
    assert.equal(p.injury, null, 'all injuries heal over the off-season');
  }
}

const three = run('offseason-tests', 3);

test('the league stays valid across several seasons', () => {
  assert.equal(three.league.season, 4);
  assertValidLeague(three.league);
});

test('off-season refuses a record from a different season', () => {
  const log = new EventLog();
  const league = createLeague(config, 'mismatch', log);
  const record = runSeason(league, config, log);
  league.season = 7;
  assert.throws(() => runOffseason(league, config, log, record), /given the record for season 1/);
});

test('retired players leave their team or the pool and are logged', () => {
  const { league, seasons, events } = three;
  const retiredEvents = events.filter((e) => e.type === 'retirement');
  const reported = seasons.flatMap((s) => s.report.retired);
  assert.deepEqual(retiredEvents.map((e) => e.playerId), reported);
  for (const id of reported) {
    assert.equal(league.players[id].status, 'retired');
    assert.ok(!league.freeAgents.includes(id));
  }
  assert.ok(reported.length > 0);
});

test('draft order: non-playoff teams first, then the playoff teams in reverse order of the table (Tom, 2026-10-18)', () => {
  for (const { record, report } of three.seasons) {
    const order = report.draftOrder;
    assert.equal(new Set(order).size, 8);
    const nonPlayoff = record.table.slice(4).map((r) => r.teamId);
    assert.deepEqual(new Set(order.slice(0, 4)), new Set(nonPlayoff));
    assert.deepEqual(order.slice(4), record.table.slice(0, 4).map((r) => r.teamId).reverse(), 'the top seed last, whoever won the Cup');
  }
});

test('a statistical need: the weakest attack leans to strikers, the leakiest defence to defenders, none from the middle (Tom, 2026-10-18)', () => {
  const { record } = three.seasons[0];
  const { bonus } = rules.draft.statNeed;
  assert.ok(bonus > 0);
  const needs = statNeeds(record, rules);
  const fewestFor = [...record.table].reverse().sort((a, b) => a.goalsFor - b.goalsFor);
  const mostAgainst = [...record.table].reverse().sort((a, b) => b.goalsAgainst - a.goalsAgainst);
  assert.equal(needs.get(fewestFor[0].teamId)?.S, bonus);
  assert.equal(needs.get(mostAgainst[0].teamId)?.D, bonus);
  for (const r of fewestFor.slice(record.table.length / 2)) assert.equal(needs.get(r.teamId)?.S ?? 0, 0, 'none from the middle on');
  // Off at 0.
  assert.equal(statNeeds(record, { ...rules, draft: { ...rules.draft, statNeed: { ...rules.draft.statNeed, bonus: 0 } } }).size, 0);
});

test('the lottery favours the worst team in line with its weight', () => {
  const record = three.seasons[0].record;
  const worst = record.table.at(-1)?.teamId;
  const rng = createRng('lottery');
  let wins = 0;
  const n = 4000;
  for (let i = 0; i < n; i++) if (draftOrder(rng, record, rules)[0] === worst) wins++;
  const expected = rules.draft.lotteryWeights[0] / rules.draft.lotteryWeights.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(wins / n - expected) < 0.03, `worst team won ${wins / n}`);
});

test('two draft rounds: every team picks in order, picks are recorded on the player', () => {
  const { league, seasons } = three;
  for (const { report } of seasons) {
    assert.equal(report.draft.length, 8 * rules.draft.rounds);
    assert.deepEqual(report.draft.map((p) => p.pick), Array.from({ length: 16 }, (_, i) => i + 1));
    assert.deepEqual(report.draft.slice(0, 8).map((p) => p.teamId), report.draftOrder);
    assert.deepEqual(report.draft.slice(8).map((p) => p.teamId), report.draftOrder);
    for (const pick of report.draft) {
      const p = league.players[pick.playerId];
      assert.deepEqual(p.draft, { season: /** @type {any} */ (p.draft).season, round: pick.round, pick: pick.pick, teamId: pick.teamId });
      const age = /** @type {any} */ (p.draft).season + 1 - p.birthSeason;
      assert.ok(age >= rules.draft.prospectAge.min && age <= rules.draft.prospectAge.max);
    }
  }
});

test('Task 176: in the draft a close call goes to the local player; a clearly better outsider still goes first', () => {
  const cfg = { ...config, rules: { ...rules, draft: { ...rules.draft, scoutingNoise: 0, headliners: [] } } };
  const pick = (/** @type {number} */ outsiderEdge) => {
    const lg = structuredClone(three.league);
    const teamId = Object.keys(lg.teams)[0];
    const home = lg.teams[teamId].region;
    const away = Object.values(lg.teams).find((t) => t.region !== home)?.region;
    const [local, outsider] = createDraftClass(lg, cfg, createRng('local-tests'), () => {}).slice(0, 2);
    // Twins but for where they're from and the outsider's extra potential, at a position the team isn't short of.
    Object.assign(local, { region: home, position: 'D', potential: 70 });
    Object.assign(outsider, { region: away, position: 'D', potential: 70 + outsiderEdge, attributes: { ...local.attributes } });
    return runDraft(lg, cfg, createRng('local-tests'), () => {}, [teamId], [local, outsider])[0].playerId === local.id;
  };
  // Value weighs potential by potentialWeight, so the bonus covers localBonus / potentialWeight points of potential.
  const covers = rules.roster.localBonus / rules.draft.potentialWeight;
  assert.ok(pick(covers / 2), 'a slightly better outsider loses to the local');
  assert.ok(!pick(covers * 1.5), 'a clearly better outsider wins');
});

test('Task 177: style fit: aggressive teams like tacklers, direct teams shooters and pace, patient teams passers; keepers are neutral', () => {
  const base = { shooting: 60, passing: 60, dribbling: 60, tackling: 60, pace: 60, composure: 60, stamina: 60, keeping: 20 };
  const player = (/** @type {Record<string, number>} */ more, position = 'D') => /** @type {any} */ ({ position, attributes: { ...base, ...more } });
  const team = (/** @type {number} */ tempo, /** @type {number} */ aggression) => ({ personality: { tempo, aggression } });
  const tackler = player({ tackling: 80 });
  const shooter = player({ shooting: 80, pace: 75 });
  const passer = player({ passing: 80, composure: 75 });
  assert.ok(styleFit(tackler, team(0.5, 0.9), positions) > styleFit(tackler, team(0.5, 0.2), positions));
  assert.ok(styleFit(shooter, team(0.9, 0.5), positions) > 0 && styleFit(shooter, team(0.1, 0.5), positions) < 0);
  assert.ok(styleFit(passer, team(0.1, 0.5), positions) > 0 && styleFit(passer, team(0.9, 0.5), positions) < 0);
  assert.equal(styleFit(tackler, team(0.5, 0.5), positions), 0, 'a middling team has no lean');
  assert.equal(styleFit(player({ keeping: 90 }, 'K'), team(0.9, 0.9), positions), 0);
});

test('Task 176: rosters stay more local with the bonus than without', () => {
  // Over three leagues: one league's 12 seasons swing either way (Task 251 found one with no gap, before and after).
  const seeds = ['local-tests', 'local-tests-2', 'local-tests-3'];
  const share = (/** @type {number} */ bonus) => {
    const cfg = { ...config, rules: { ...rules, roster: { ...rules.roster, localBonus: bonus } } };
    let total = 0;
    for (const seed of seeds) {
      const lg = createLeague(cfg, seed, new EventLog());
      for (let s = 0; s < 12; s++) runOffseason(lg, cfg, new EventLog(), runSeason(lg, cfg, new EventLog()));
      const teams = Object.values(lg.teams);
      total += teams.reduce((n, tm) => n + tm.roster.filter((id) => lg.players[id].region === tm.region).length, 0) / (teams.length * rules.roster.size);
    }
    return total / seeds.length;
  };
  const without = share(0);
  const withBonus = share(rules.roster.localBonus);
  // The bonus is 5 since Task 232 (home-minded free agents carry the regions too), so the gap is smaller.
  assert.ok(withBonus > without + 0.05, `home-grown ${(100 * withBonus).toFixed(0)}% with the bonus, ${(100 * without).toFixed(0)}% without`);
});

test('Task 175: every draft class opens with its headline prospects, in their ranges, and they go early', () => {
  const { league, seasons, events } = three;
  const heads = rules.draft.headliners;
  seasons.forEach(({ record, report }) => {
    const created = events.filter((e) => e.type === 'player_created' && e.stage === 'offseason' && e.season === record.season).map((e) => /** @type {string} */ (e.playerId));
    heads.forEach((h, i) => {
      const p = league.players[created[i]];
      assert.ok(p.potential >= h.potential.min && p.potential <= h.potential.max, `headliner ${i + 1}'s potential ${p.potential}`);
      // The overall when picked, as logged (rounded; generation lands within a point or so of its target).
      const pick = events.find((e) => e.type === 'draft_pick' && e.playerId === created[i]);
      if (pick) {
        const o = /** @type {any} */ (pick.data).overall;
        assert.ok(o >= h.overall.min - 2 && o <= Math.min(h.overall.max, p.potential) + 2, `headliner ${i + 1}'s overall ${o}`);
      }
    });
    const firstPicks = report.draft.slice(0, 4).map((pk) => pk.playerId);
    assert.ok(firstPicks.includes(created[0]), 'the first headliner goes in the top four');
  });
});

test('development: young players improve and old players decline on average', () => {
  const dev = three.events.filter((e) => e.type === 'player_development');
  const avg = (/** @type {typeof dev} */ list) => list.reduce((s, e) => s + Number(e.data.after) - Number(e.data.before), 0) / list.length;
  const young = dev.filter((e) => Number(e.data.age) <= 22);
  const old = dev.filter((e) => Number(e.data.age) >= 34);
  assert.ok(young.length > 10 && old.length > 3);
  assert.ok(avg(young) > 1, `young players changed ${avg(young)}`);
  assert.ok(avg(old) < -1, `old players changed ${avg(old)}`);
});

test('specialist attributes do not develop: outfield players never learn to keep', () => {
  const { league, seasons } = three;
  const start = seasons[0].before;
  for (const p of Object.values(league.players)) {
    if (p.position === positions.keeper || !start.players[p.id]) continue;
    assert.equal(p.attributes.keeping, start.players[p.id].attributes.keeping);
  }
});

test('free agents count unsigned seasons; signed players reset to zero', () => {
  const { league } = three;
  for (const id of league.freeAgents) assert.ok(league.players[id].seasonsUnsigned >= 1);
  for (const team of Object.values(league.teams)) {
    for (const id of team.roster) {
      const p = league.players[id];
      if (p.seasonsUnsigned !== 0) assert.ok(p.draft || p.joinedSeason === 1, 'only never-free players may keep a count');
    }
  }
});

test('the same seed produces the same league after several seasons', () => {
  assert.deepEqual(run('offseason-tests', 3).league, three.league);
});

test('ten seasons run without breaking any roster rule', () => {
  const log = new EventLog();
  const league = createLeague(config, 'ten-seasons', log);
  for (let i = 0; i < 10; i++) {
    runOffseason(league, config, log, runSeason(league, config, log));
    assertValidLeague(league);
  }
  assert.equal(league.history.length, 10);
  const ratings = Object.values(league.players).filter((p) => p.status === 'active').map((p) => overall(p, positions));
  for (const r of ratings) assert.ok(r >= 1 && r <= 99);
});

test('the Kindling League: this draft\'s picks are never released, only sent down; reserves come up or go when their rights end', () => {
  const { events, sink } = memorySink();
  const log = new EventLog({ sinks: [sink] });
  const league = createLeague(config, 'kindling', log);
  for (let i = 0; i < 8; i++) runOffseason(league, config, log, runSeason(league, config, log));
  const off = events.filter((e) => e.stage === 'offseason');
  for (let s = 1; s <= 8; s++) {
    const picks = new Set(off.filter((e) => e.season === s && e.type === 'draft_pick').map((e) => e.playerId));
    for (const e of off.filter((x) => x.season === s && x.type === 'release')) {
      assert.ok(!picks.has(e.playerId) || /** @type {any} */ (e.data).reason === 'position', 'a pick is sent down, not released');
    }
  }
  const sent = off.filter((e) => e.type === 'reserve');
  // Fewer since contracts and the market (Tasks 231–232): deals ending leave rosters room for this draft's picks.
  assert.ok(sent.length >= 4, `sent down ${sent.length}`);
  for (const e of sent) assert.equal(/** @type {any} */ (e.data).until, e.season + rules.reserves.rightsSeasons);
  const up = off.filter((e) => e.type === 'call_up');
  assert.ok(up.length > 0);
  for (const e of up) assert.ok(sent.some((s) => s.playerId === e.playerId && s.teamId === e.teamId && s.season < e.season), 'called up by the team that sent them down');
  // Rights end after rightsSeasons: released then, if never called up.
  const expired = off.filter((e) => e.type === 'release' && /** @type {any} */ (e.data).reason === 'rights_expired');
  assert.ok(expired.length > 0);
  for (const e of expired) {
    const down = /** @type {any} */ (sent.find((s) => s.playerId === e.playerId));
    assert.equal(e.season, down.data.until);
  }
});

test('Task 201: no two active players share a surname, season after season', () => {
  const log = new EventLog();
  const league = createLeague(config, 'surnames', log);
  for (let i = 0; i < 12; i++) {
    runOffseason(league, config, log, runSeason(league, config, log));
    const active = Object.values(league.players).filter((p) => p.status === 'active');
    assert.equal(new Set(active.map((p) => p.lastName)).size, active.length, `season ${i + 1}`);
  }
});
