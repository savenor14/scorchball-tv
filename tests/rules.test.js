import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chronicle } from '../src/chronicle/chronicle.js';
import { EventLog, memorySink } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { validateConfig } from '../src/config.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { changesAt, changesInEffect, ruleChangeData, seasonConfig } from '../src/sim/rules.js';
import { runSeason } from '../src/sim/season.js';

const real = await loadConfigFromDisk();

/** The real config with these rule changes. @param {any[]} changes */
const withChanges = (changes) => ({ ...structuredClone(real), ruleChanges: { changes } });

const homeBonusUp = { id: 'home_bonus_up', season: 2, reason: 'Crowds grow louder.', changes: { match: { homeBonus: 3 } } };
const fewerSubs = { id: 'fewer_subs', season: 3, reason: 'Stamina tested.', changes: { match: { maxSubstitutions: 1 } } };

/** Play `seasons` seasons with off-seasons between; the events and the league. @param {any} config @param {number} seasons */
function play(config, seasons, seed = 'rules-test') {
  const { events, sink } = memorySink();
  const chronicle = new Chronicle(config.chronicle);
  const log = new EventLog({ sinks: [sink, chronicle.add] });
  const league = createLeague(config, seed, log);
  for (let s = 0; s < seasons; s++) {
    const record = runSeason(league, config, log);
    if (s < seasons - 1) runOffseason(league, config, log, record);
  }
  return { events, league, chronicle };
}

/** data/rules.json alone, no changes: what these tests change from. */
const plain = withChanges([]);

test('a season with no change in effect plays under data/rules.json itself', () => {
  assert.equal(seasonConfig(plain, 5), plain);
  assert.equal(seasonConfig(real, 1), real);
});

test('the real data brings in the rookie rule at season 2 (Task 230), the draft and market change, the rookie positions and the teammate assist at 4 (Tom, 2026-10-25, 2026-10-28)', () => {
  assert.deepEqual(real.ruleChanges.changes.map((/** @type {any} */ c) => [c.id, c.season]), [['rookie_rule', 2], ['draft_and_market', 4], ['rookie_positions', 4], ['teammate_assists', 4]]);
  assert.equal(seasonConfig(real, 3).rules.match.assists, 'lastAdvance');
  assert.equal(seasonConfig(real, 4).rules.match.assists, 'teammate');
  assert.equal(real.rules.roster.rookieStarters, 0);
  assert.equal(seasonConfig(real, 2).rules.roster.rookieStarters, 1);
});

test('a change applies from its season on, merged over the rules before it', () => {
  const config = withChanges([fewerSubs, homeBonusUp]);
  assert.equal(seasonConfig(config, 1), config);
  assert.equal(seasonConfig(config, 2).rules.match.homeBonus, 3);
  assert.equal(seasonConfig(config, 2).rules.match.maxSubstitutions, real.rules.match.maxSubstitutions);
  assert.equal(seasonConfig(config, 3).rules.match.maxSubstitutions, 1);
  assert.equal(seasonConfig(config, 9).rules.match.homeBonus, 3);
  // Only the changed values move; everything else is data/rules.json's.
  assert.deepEqual(seasonConfig(config, 3).rules.heat, real.rules.heat);
  assert.equal(seasonConfig(config, 3), seasonConfig(config, 3), 'the same season gives the same object');
  assert.deepEqual(changesAt(config, 3).map((c) => c.id), ['fewer_subs']);
  assert.deepEqual(changesInEffect(config, 3).map((c) => c.id), ['home_bonus_up', 'fewer_subs']);
});

test('ruleChangeData lists each value before and after', () => {
  assert.deepEqual(ruleChangeData(real.rules, homeBonusUp), {
    id: 'home_bonus_up', reason: 'Crowds grow louder.', values: [{ path: 'match.homeBonus', from: real.rules.match.homeBonus, to: 3 }],
  });
});

test('a bad change is caught: a typo, a wrong value, a cross-check, a repeated id, season 1', () => {
  const errorsFor = (/** @type {any[]} */ changes) => validateConfig(withChanges(changes));
  assert.deepEqual(errorsFor([homeBonusUp, fewerSubs]), []);
  assert.match(errorsFor([{ ...homeBonusUp, changes: { match: { homeBonsu: 3 } } }]).join('\n'), /data\/ruleChanges\.json → season 2's rules: match\.homeBonsu: unknown key/);
  assert.match(errorsFor([{ ...homeBonusUp, changes: { match: { maxSubstitutions: 'five' } } }]).join('\n'), /season 2's rules: match\.maxSubstitutions: expected a number/);
  assert.match(errorsFor([{ ...homeBonusUp, changes: { tiebreakers: ['points'] } }]).join('\n'), /season 2's rules: .*tiebreakers: last entry must be "lots"/);
  assert.match(errorsFor([homeBonusUp, { ...fewerSubs, id: 'home_bonus_up' }]).join('\n'), /id "home_bonus_up" is used twice/);
  assert.match(errorsFor([{ ...homeBonusUp, season: 1 }]).join('\n'), /changes\[0\]\.season: expected a number/);
});

test('a league with no changes plays exactly as before, and logs no rule_change', () => {
  const a = play(plain, 2);
  const b = play(withChanges([]), 2);
  assert.equal(a.events.length, b.events.length);
  assert.ok(a.events.every((e, i) => JSON.stringify(e) === JSON.stringify(b.events[i])), 'identical events');
  assert.ok(!a.events.some((e) => e.type === 'rule_change'));
  assert.deepEqual(a.league.history.map((h) => h.ruleChanges), [[], []]);
});

test('a change is logged once, at its season\'s start, and changes how that season is played', () => {
  const base = play(plain, 3);
  const changed = play(withChanges([fewerSubs]), 3);
  const changes = changed.events.filter((e) => e.type === 'rule_change');
  assert.equal(changes.length, 1);
  assert.equal(changes[0].season, 3);
  const start = changed.events.findIndex((e) => e.type === 'season_start' && e.season === 3);
  assert.equal(changed.events.indexOf(changes[0]), start - 1, 'right before season_start');
  assert.deepEqual(changes[0].data, { id: 'fewer_subs', reason: 'Stamina tested.', values: [{ path: 'match.maxSubstitutions', from: real.rules.match.maxSubstitutions, to: 1 }] });

  // Seasons 1–2 identical; season 3 played under the new rule (one substitution at most).
  const upTo = (/** @type {any[]} */ events) => events.filter((e) => e.season < 3);
  const [x, y] = [upTo(changed.events), upTo(base.events)];
  assert.ok(x.length === y.length && x.every((e, i) => JSON.stringify(e) === JSON.stringify(y[i])), 'seasons 1–2 identical');
  const subsInAMatch = (/** @type {any[]} */ events) => {
    /** @type {Map<string, number>} */ const n = new Map();
    for (const e of events) if (e.type === 'substitution' && e.season === 3) n.set(`${e.matchId}|${e.teamId}`, (n.get(`${e.matchId}|${e.teamId}`) ?? 0) + 1);
    return Math.max(...n.values());
  };
  assert.equal(subsInAMatch(base.events), real.rules.match.maxSubstitutions);
  assert.equal(subsInAMatch(changed.events), 1);

  assert.deepEqual(changed.league.history.map((h) => h.ruleChanges), [[], [], ['fewer_subs']]);
  assert.deepEqual(changed.chronicle.season(3).ruleChanges, [changes[0].data]);
  assert.deepEqual(changed.chronicle.season(2).ruleChanges, []);
});
