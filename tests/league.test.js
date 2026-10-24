import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog, memorySink } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { ageOf, createLeague } from '../src/sim/league.js';
import { generateAttributes, overall, pickName } from '../src/sim/players.js';
import { createRng } from '../src/sim/rng.js';

const config = await loadConfigFromDisk();
const { rules, positions } = config;

function build(seed = 'test-league') {
  const { events, sink } = memorySink();
  const league = createLeague(config, seed, new EventLog({ sinks: [sink] }));
  return { league, events };
}

test('overall() is the position-weighted average', () => {
  const attributes = { shooting: 80, passing: 50, dribbling: 70, tackling: 10, pace: 60, composure: 90, stamina: 40, keeping: 5 };
  // S weights: shooting .40, passing .05, dribbling .20, pace .15, composure .15, stamina .05
  assert.equal(Math.round(overall({ position: 'S', attributes }, positions) * 100) / 100, 32 + 2.5 + 14 + 9 + 13.5 + 2);
});

test('generateAttributes() hits the target overall and keeps attributes in 1–99', () => {
  const rng = createRng('attrs');
  for (const position of positions.positions) {
    for (const target of [25, 45, 60, 75, 90]) {
      const attributes = generateAttributes(rng, position, target, config);
      for (const v of Object.values(attributes)) assert.ok(Number.isInteger(v) && v >= 1 && v <= 99);
      assert.ok(Math.abs(overall({ position, attributes }, positions) - target) <= 1, `${position} ${target}`);
    }
  }
});

test('generated keepers are good at keeping and strikers are not', () => {
  const rng = createRng('roles');
  const k = generateAttributes(rng, 'K', 65, config);
  const s = generateAttributes(rng, 'S', 65, config);
  assert.ok(k.keeping > s.keeping + 20);
  assert.ok(s.shooting > k.shooting + 10);
});

test('pickName() never repeats a full name and fails clearly when names run out', () => {
  const rng = createRng('names');
  const region = { id: 'tiny', firstNames: ['A', 'B'], lastNames: ['X', 'Y'] };
  const taken = new Set();
  const names = Array.from({ length: 4 }, () => pickName(rng, region, taken)).map((n) => `${n.firstName} ${n.lastName}`);
  assert.equal(new Set(names).size, 4);
  assert.throws(() => pickName(rng, region, taken), /Ran out of unused names in region "tiny"/);
});

test('the same seed builds the same league; a different seed does not', () => {
  assert.deepEqual(build('same').league, build('same').league);
  assert.notDeepEqual(build('same').league.players, build('other').league.players);
});

test('every team gets a full roster meeting the position minimums', () => {
  const { league } = build();
  assert.equal(Object.keys(league.teams).length, config.teams.teams.length);
  for (const team of Object.values(league.teams)) {
    assert.equal(team.roster.length, rules.roster.size);
    for (const [pos, min] of Object.entries(rules.roster.minimums)) {
      const count = team.roster.filter((/** @type {string} */ id) => league.players[id].position === pos).length;
      assert.ok(count >= min, `${team.id} has ${count} ${pos}`);
    }
    for (const id of team.roster) assert.equal(league.players[id].teamId, team.id);
    const keepers = team.roster.filter((/** @type {string} */ id) => league.players[id].position === positions.keeper);
    assert.equal(keepers.length, rules.roster.minimums[positions.keeper], `${team.id} should not get extra keepers`);
  }
});

test('free agents exist, include a keeper and have no team', () => {
  const { league } = build();
  assert.equal(league.freeAgents.length, rules.league.initialFreeAgents);
  assert.ok(league.freeAgents.some((id) => league.players[id].position === positions.keeper));
  for (const id of league.freeAgents) assert.equal(league.players[id].teamId, null);
});

test('players are valid: unique ids and names, sensible ages, potential ≥ current overall', () => {
  const { league } = build();
  const players = Object.values(league.players);
  assert.equal(players.length, config.teams.teams.length * rules.roster.size + rules.league.initialFreeAgents);
  assert.equal(new Set(players.map((p) => p.id)).size, players.length);
  assert.equal(new Set(players.map((p) => `${p.firstName} ${p.lastName}`)).size, players.length);
  assert.equal(league.nextPlayerId, players.length + 1);
  for (const p of players) {
    const age = ageOf(p, league.season);
    assert.ok(age >= rules.league.initialAge.min && age <= rules.league.initialAge.max);
    assert.ok(p.potential + 1 >= overall(p, positions), `${p.id} potential below overall`);
    assert.equal(p.status, 'active');
  }
});

test('most of a team comes from its home region', () => {
  const { league } = build();
  let home = 0;
  let total = 0;
  for (const team of Object.values(league.teams)) {
    for (const id of team.roster) {
      total++;
      if (league.players[id].region === team.region) home++;
    }
  }
  assert.ok(home / total > 0.6 && home / total < 0.95, `home share ${home / total}`);
});

test('teams differ in strength, but not wildly', () => {
  const { league } = build();
  const averages = Object.values(league.teams).map((t) =>
    t.roster.reduce((/** @type {number} */ s, /** @type {string} */ id) => s + overall(league.players[id], positions), 0) / t.roster.length);
  const spread = Math.max(...averages) - Math.min(...averages);
  assert.ok(spread > 1 && spread < 20, `spread ${spread}`);
});

test('a player_created event is logged for every player, with everything needed to rebuild them', () => {
  const { league, events: all } = build();
  // The founding squads' contracts (Task 231) are logged too.
  const events = all.filter((e) => e.type !== 'contract');
  assert.equal(events.length, Object.keys(league.players).length);
  for (const e of events) {
    assert.equal(e.type, 'player_created');
    assert.equal(e.stage, 'preseason');
    const p = league.players[/** @type {string} */ (e.playerId)];
    assert.equal(e.teamId, p.teamId);
    assert.deepEqual(e.data.attributes, p.attributes);
    assert.equal(e.data.potential, p.potential);
    assert.equal(e.data.peakAge, p.peakAge);
  }
});
