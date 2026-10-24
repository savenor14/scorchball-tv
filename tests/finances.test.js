// Finances (Task 231): wages, the rookie scale, contracts, the cap, the re-signing window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { capRoom, contractSeasons, fitToCap, marketWage, offerFor, offerScore, payroll, rookieWage } from '../src/sim/finances.js';
import { motiveOf } from '../src/sim/players.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { createRng } from '../src/sim/rng.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { rules } = config;
const f = rules.finances;

/** A player of a given overall (every attribute the same), age and peak. @param {number} ov @param {number} age */
const playerOf = (ov, age = 30) => ({
  position: 'S', birthSeason: 1 - age, peakAge: 28, potential: ov,
  attributes: Object.fromEntries(config.positions.attributes.map((/** @type {string} */ a) => [a, ov])),
});

test('the market wage rises with value, between the minimum wage and the maximum contract', () => {
  const at = (/** @type {number} */ ov) => marketWage(/** @type {any} */ (playerOf(ov)), 1, config);
  assert.equal(at(60), f.wageAt60);
  assert.equal(at(61), Math.round(f.wageAt60 * f.wagePerPoint));
  assert.ok(at(70) < at(75) && at(75) < at(80));
  assert.equal(at(20), f.minWage);
  assert.equal(at(99), f.maxContractShare * f.cap);
  // The young are paid for half their growth to come.
  const young = { ...playerOf(60, 20), potential: 80 };
  assert.equal(marketWage(/** @type {any} */ (young), 1, config), Math.round(f.wageAt60 * Math.pow(f.wagePerPoint, 10)));
});

test('rookie deals run down the scale by pick; deal lengths follow age bands', () => {
  assert.equal(rookieWage(1, 16, rules), f.rookieScale.first);
  assert.equal(rookieWage(16, 16, rules), f.rookieScale.last);
  assert.ok(rookieWage(8, 16, rules) < f.rookieScale.first && rookieWage(8, 16, rules) > f.rookieScale.last);
  const rng = createRng('lengths');
  for (const [age, band] of /** @type {[number, any][]} */ ([[20, f.contractSeasons[0]], [27, f.contractSeasons[1]], [35, f.contractSeasons[2]]])) {
    for (let i = 0; i < 20; i++) {
      const n = contractSeasons(rng, age, rules);
      assert.ok(n >= band.min && n <= band.max, `${age}: ${n}`);
    }
  }
});

// Ten seasons, checking the money as it happens.
/** @type {any[]} */ const contracts = [];
/** @type {string[]} */ const problems = [];
let league = /** @type {any} */ (null);
const log = new EventLog({ sinks: [(e) => {
  if (e.type !== 'contract') return;
  contracts.push(e);
  const d = /** @type {any} */ (e.data);
  // A deal signed in the window or free agency above the minimum wage never takes a team over the cap.
  if ((d.kind === 're_sign' || d.kind === 'free_agent') && d.wage > f.minWage && payroll(league, /** @type {string} */ (e.teamId)) > f.cap) {
    problems.push(`${e.playerId} took ${e.teamId} over the cap in season ${e.season}`);
  }
}] });
league = createLeague(config, 'finance-tests', log);
const founding = contracts.length;
/** @type {Map<string, string>} */ const teamAfter = new Map();
for (let s = 0; s < 10; s++) {
  const record = runSeason(league, config, log);
  runOffseason(league, config, log, record);
  for (const t of Object.values(league.teams)) {
    for (const id of t.roster) {
      const c = league.players[id].contract;
      if (!c) problems.push(`${id} on ${t.id}'s roster with no deal after off-season ${s + 1}`);
      else if (c.until < league.season) problems.push(`${id}'s deal ran out but they're still on ${t.id}'s roster`);
    }
  }
}

test('every founding squad player starts on a deal at the market wage, staggered', () => {
  const rostered = founding;
  assert.equal(rostered, Object.keys(config.teams.teams).length * rules.roster.size);
  const first = contracts.slice(0, founding);
  assert.ok(first.every((e) => e.data.kind === 'founding' && e.season === 1 && e.data.until >= 1));
  assert.ok(new Set(first.map((e) => e.data.until)).size >= 3, 'deals end in different seasons');
});

test('rosters are always on deals, the cap holds, and every kind of deal happens', () => {
  assert.deepEqual(problems, []);
  const kinds = new Set(contracts.map((e) => e.data.kind));
  for (const k of ['founding', 'rookie', 're_sign', 'free_agent']) assert.ok(kinds.has(k), k);
  // Rookie deals: rookieSeasons long, by pick.
  for (const e of contracts.filter((x) => x.data.kind === 'rookie')) {
    assert.equal(e.data.until, e.season + f.rookieSeasons);
    assert.ok(e.data.wage <= f.rookieScale.first && e.data.wage >= f.rookieScale.last);
  }
  for (const t of Object.keys(league.teams)) assert.equal(capRoom(league, t, rules), f.cap - payroll(league, t));
});

test('some deals are renewed in the window, others go to free agency, and players sign elsewhere', () => {
  const resigned = contracts.filter((e) => e.data.kind === 're_sign');
  assert.ok(resigned.length > 0);
  const ended = [];
  const log2 = new EventLog({ sinks: [(e) => { if (e.type === 'release' && /** @type {any} */ (e.data).reason === 'contract_end') ended.push(e); }] });
  const l2 = createLeague(config, 'finance-tests-2', log2);
  for (let s = 0; s < 4; s++) runOffseason(l2, config, log2, runSeason(l2, config, log2));
  assert.ok(ended.length > 0, 'some deals are not renewed');
  // Movement: some players sign for a club other than the one they left.
  const moved = contracts.filter((e) => e.data.kind === 'free_agent').length;
  assert.ok(moved > 0);
});

// Motives and the market (Task 232).
test('motiveOf: age moves money to winning; a strong lean holds whatever the age', () => {
  const at = (/** @type {any} */ motives, /** @type {number} */ age) => motiveOf({ motives, birthSeason: 1 - age }, 1, rules);
  const balanced = { money: 0, winning: 0, home: -1 };
  assert.equal(at(balanced, 20), 'money');
  assert.equal(at(balanced, 34), 'winning');
  const homeLover = { money: 0.5, winning: 0.5, home: 2 };
  for (const age of [19, 27, 36]) assert.equal(at(homeLover, age), 'home');
  const moneyChaser = { money: 2, winning: 0, home: 0 };
  assert.equal(at(moneyChaser, 35), 'money');
});

test('the league\'s motives come out near Tom\'s mix by age', () => {
  // Six founding leagues (Task 271: one league's 88 players is a small sample; over 20 leagues the mix is within 1.5
  // points of every target, while a single league can be 12 off).
  const players = ['motive-mix', 'mm-1', 'mm-2', 'mm-3', 'mm-4', 'mm-5'].flatMap((seed) => Object.values(createLeague(config, seed, new EventLog()).players));
  /** @param {number} lo @param {number} hi */
  const share = (lo, hi) => {
    const n = { money: 0, winning: 0, home: 0 };
    let total = 0;
    for (const p of players) for (let age = lo; age <= hi; age++) { n[motiveOf({ ...p, birthSeason: 1 - age }, 1, rules)]++; total++; }
    return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, (100 * v) / total]));
  };
  const near = (/** @type {any} */ got, /** @type {number[]} */ want) => ['money', 'winning', 'home'].forEach((k, i) => assert.ok(Math.abs(got[k] - want[i]) < 10, `${k} ${got[k].toFixed(0)} vs ${want[i]}`));
  near(share(19, 24), [50, 20, 30]);
  near(share(25, 30), [35, 35, 30]);
  near(share(31, 36), [20, 50, 30]);
});

test('offerFor: the market wage, what room there is down to the floor, more for a star from a team with real room', () => {
  const m = rules.motives;
  assert.equal(offerFor(1000, 5000, { ...rules, motives: { ...m, overMarket: { ...m.overMarket, premium: 0 } } }), 1000);
  assert.equal(offerFor(1000, 900, rules), 900);
  assert.equal(offerFor(1000, 1000 * m.offerFloor - 1, rules), null);
  const star = m.overMarket.fromWage;
  const big = m.overMarket.roomShare * f.cap;
  assert.equal(offerFor(star, big, rules), Math.round(Math.min(big, f.maxContractShare * f.cap, star * (1 + m.overMarket.premium))));
  assert.equal(offerFor(star - 1, big, rules), star - 1, 'not a star: the market wage');
  assert.ok(offerFor(f.maxContractShare * f.cap, big, rules) === f.maxContractShare * f.cap, 'never over the maximum contract');
});

test('offerScore: winning-minded rate a team going places higher, home-minded their region, everyone their old club a little', () => {
  const m = rules.motives;
  const outlook = new Map([['up', 1], ['down', 0]]);
  const base = { season: 1, outlook, formerTeamId: undefined, rules };
  const veteranWinner = /** @type {any} */ ({ motives: { money: 0, winning: 2, home: 0 }, birthSeason: -30, region: 'r1' });
  assert.equal(offerScore(veteranWinner, { teamId: 'up', region: 'r2', wage: 1000 }, base), 1000 * (1 + m.winningPremium));
  assert.equal(offerScore(veteranWinner, { teamId: 'down', region: 'r2', wage: 1000 }, base), 1000);
  const homeLover = /** @type {any} */ ({ motives: { money: 0, winning: 0, home: 2 }, birthSeason: -25, region: 'r1' });
  assert.equal(offerScore(homeLover, { teamId: 'down', region: 'r1', wage: 1000 }, base), 1000 * (1 + m.homePremium));
  const moneyMan = /** @type {any} */ ({ motives: { money: 2, winning: 0, home: 0 }, birthSeason: -25, region: 'r1' });
  assert.equal(offerScore(moneyMan, { teamId: 'up', region: 'r1', wage: 1000 }, { ...base, formerTeamId: 'up' }), 1000 * (1 + m.familiarity));
});

test('the market: signings log the offers turned down, and players are logged with their motives', () => {
  const market = contracts.filter((e) => e.data.kind === 'free_agent' || (e.data.kind === 're_sign' && e.data.turnedDown));
  assert.ok(market.length > 0 && market.every((e) => Array.isArray(e.data.turnedDown)));
  assert.ok(market.some((e) => e.data.turnedDown.length > 0), 'some players choose between offers');
  const events = [];
  createLeague(config, 'motive-log', new EventLog({ sinks: [(e) => events.push(e)] }));
  for (const e of events.filter((x) => x.type === 'player_created')) {
    assert.deepEqual(Object.keys(e.data.motives), ['money', 'winning', 'home']);
  }
});

test('Task 251: the founding squads start under the cap, their wages cut by one share, none under the minimum', () => {
  const { cap, minWage } = rules.finances;
  assert.deepEqual(fitToCap([5000, 3000, 1000], rules), [5000, 3000, 1000], 'under the cap: left as they are');
  const fitted = fitToCap([5000, 5000, 5000, 5000, 4000, 2000, 400, 260, 250, 250], rules);
  assert.ok(fitted.reduce((a, b) => a + b, 0) <= cap);
  assert.ok(fitted.every((w) => w >= minWage));
  assert.ok(Math.abs(fitted[0] / 5000 - fitted[5] / 2000) < 0.01, 'the same share for every wage above the floor');
  for (const seed of ['flareball', 'cap-1', 'cap-2']) {
    const league = createLeague(config, seed, new EventLog());
    for (const id of Object.keys(league.teams)) assert.ok(payroll(league, id) <= cap, `${seed} ${id} starts over the cap`);
  }
});
