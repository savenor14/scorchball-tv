// The facts module (Task 243; src/chronicle/facts.js): what's notable about a match, checked against a fast-forwarded
// league's chronicle; the same seed giving the same facts; the facts reading only the matches up to theirs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { factsAfter } from '../src/chronicle/facts.js';
import { collectFacts } from '../src/chronicle/factsLeague.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { retirementChance } from '../src/sim/offseason.js';

const config = await loadConfigFromDisk();
const o = config.chronicle.facts;
const SEASONS = 25;
const { chronicle, after, before, kept } = collectFacts(config, 'facts-tests', SEASONS, 3);
const all = [...chronicle.matches.values()];
const pastOf = (/** @type {string} */ id) => all.slice(0, all.findIndex((m) => m.id === id));
const facts = after.flatMap((x) => x.facts.map((f) => ({ ...f, matchId: x.matchId })));
const ofKind = (/** @type {string} */ k) => facts.filter((f) => f.kind === k);

test('every match is looked at, the facts heaviest first, each weighed by its kind', () => {
  assert.equal(after.length, chronicle.matches.size);
  assert.equal(before.length, chronicle.matches.size);
  for (const x of [...after, ...before]) {
    for (let i = 1; i < x.facts.length; i++) assert.ok(x.facts[i - 1].weight >= x.facts[i].weight);
    for (const f of x.facts) assert.equal(f.weight, o.weights[f.kind]);
  }
  // The common kinds turn up; the history-making ones stay rare.
  for (const k of ['milestone', 'first_goal', 'old_club', 'final_rematch', 'scorcher_decider', 'win_run', 'head_to_head_run']) assert.ok(ofKind(k).length > 0, k);
  const heavy = after.filter((x) => (x.facts[0]?.weight ?? 0) >= 7).length / after.length;
  assert.ok(heavy < 0.2, `${heavy} of matches with a heavy fact`);
});

test('the same seed gives the same facts', () => {
  const again = collectFacts(config, 'facts-tests', 4);
  const first = after.filter((x) => x.season <= 4);
  assert.deepEqual(again.after, first);
});

test('a final met again: last season\'s finalists, their first meeting since', () => {
  for (const f of ofKind('final_rematch')) {
    const m = /** @type {any} */ (chronicle.matches.get(f.matchId));
    const final = all.find((x) => x.season === m.season - 1 && x.stage === 'final');
    assert.ok(final && [final.homeId, final.awayId].sort().join() === [m.homeId, m.awayId].sort().join());
    assert.ok(!pastOf(m.id).some((x) => x.season === m.season && [x.homeId, x.awayId].sort().join() === [m.homeId, m.awayId].sort().join()));
    assert.equal(f.revenge, m.winnerId !== null && m.winnerId !== final.winnerId);
  }
});

test('runs between two clubs and a team\'s own runs reach their bars', () => {
  for (const f of ofKind('head_to_head_ended')) {
    const h2h = chronicle.headToHead(/** @type {string} */ (f.teamId), /** @type {string} */ (f.opponentId)).filter((x) => pastOf(f.matchId).includes(x));
    assert.ok(/** @type {number} */ (f.value) >= o.headToHeadRun);
    assert.ok(h2h.slice(-/** @type {number} */ (f.value)).every((x) => x.winnerId !== f.teamId));
  }
  for (const f of [...ofKind('win_run'), ...ofKind('head_to_head_run')]) assert.ok(/** @type {number} */ (f.value) >= (f.kind === 'win_run' ? o.winRun : o.headToHeadRun));
  for (const f of ofKind('winless_ended')) assert.ok(/** @type {number} */ (f.value) >= o.winlessRun);
});

test('the Cup\'s facts: a first, a drought ended, back to back', () => {
  for (const f of [...ofKind('first_cup'), ...ofKind('cup_drought_ended'), ...ofKind('cups_in_a_row'), ...ofKind('dynasty')]) {
    const m = /** @type {any} */ (chronicle.matches.get(f.matchId));
    assert.equal(m.stage, 'final');
    assert.equal(m.winnerId, f.teamId);
    const cups = pastOf(m.id).filter((x) => x.stage === 'final' && x.winnerId === f.teamId);
    if (f.kind === 'first_cup') assert.equal(cups.length, 0);
    if (f.kind === 'cup_drought_ended') assert.ok(m.season - /** @type {any} */ (cups.at(-1)).season >= o.cupDrought);
    if (f.kind === 'cups_in_a_row') assert.equal(cups.at(-1)?.season, m.season - 1);
  }
});

test('players\' facts: milestones and records as the chronicle has them, an old club played for, a late decider', () => {
  assert.equal(ofKind('milestone').length, chronicle.milestones.length);
  assert.equal(ofKind('record').length, chronicle.recordsBroken.length);
  for (const f of ofKind('old_club')) {
    const p = /** @type {any} */ (chronicle.players.get(/** @type {string} */ (f.playerId)));
    const m = /** @type {any} */ (chronicle.matches.get(f.matchId));
    assert.equal(m.winnerId, f.teamId);
    const there = Object.entries(p.seasons).filter(([s, ps]) => Number(s) < m.season && /** @type {any} */ (ps).teamId === f.opponentId).length;
    assert.ok(there >= o.oldClubSeasons);
  }
  const late = o.lateShare * 2 * config.rules.match.halfMinutes;
  for (const f of [...ofKind('scorcher_decider'), ...ofKind('momentum_decider')]) {
    const m = /** @type {any} */ (chronicle.matches.get(f.matchId));
    if (f.decider === 'golden_goal') assert.equal(m.decidedBy, 'overtime');
    else assert.ok(/** @type {number} */ (f.minute) > late, `minute ${f.minute}`);
    if (f.decider === 'equaliser') assert.equal(m.winnerId, null);
  }
});

test('a likely last match: a long career, the team\'s season over, the odds high', () => {
  const L = o.lastMatch;
  for (const f of ofKind('likely_last')) {
    const p = /** @type {any} */ (chronicle.players.get(/** @type {string} */ (f.playerId)));
    const m = /** @type {any} */ (chronicle.matches.get(f.matchId));
    assert.ok(/** @type {number} */ (f.chance) >= L.chance && /** @type {number} */ (f.value) >= L.seasons);
    assert.equal(f.chance, retirementChance(config.rules.retirement, {
      age: m.season - p.birthSeason, keeper: p.position === config.positions.keeper, rating: p.overall[m.season], peakAge: p.peakAge, unsigned: false,
    }));
    const seeds = chronicle.season(m.season).seeds;
    assert.ok(m.stage === 'final' || (m.stage === 'semifinal' && m.winnerId !== f.teamId) || (m.stage === 'regular' && !seeds.includes(f.teamId)));
  }
});

test('one more season: a likely last match last season, and back', () => {
  for (const x of after) for (const f of x.facts) {
    if (f.kind !== 'one_more_season') continue;
    const earlier = after.filter((y) => y.season === x.season - 1).flatMap((y) => y.facts);
    assert.ok(earlier.some((g) => g.kind === 'likely_last' && g.playerId === f.playerId), 'a likely last match the season before');
    // Once a season at most: their first match of it.
    assert.equal(after.filter((y) => y.season === x.season).flatMap((y) => y.facts).filter((g) => g.kind === 'one_more_season' && g.playerId === f.playerId).length, 1);
  }
});

test('the facts read only the matches up to theirs: the teams\' facts are the same with the whole league folded in', () => {
  // Players' facts read where a player is now, so they're worked out as the match airs (the chronicle at most a round
  // ahead); the teams' facts read only the matches before theirs, however far the chronicle has run.
  const teamKinds = new Set(['final_rematch', 'head_to_head_ended', 'head_to_head_run', 'win_run', 'winless_ended', 'first_final', 'final_drought_ended', 'finals_in_a_row', 'first_cup', 'cup_drought_ended', 'cups_in_a_row', 'dynasty', 'scorcher_decider', 'momentum_decider', 'milestone', 'record']);
  const early = after.filter((x) => x.season <= 3);
  assert.equal(kept.size, early.length);
  for (const x of early) {
    const now = factsAfter(chronicle, config, /** @type {any} */ (kept.get(x.matchId)));
    assert.deepEqual(now.filter((f) => teamKinds.has(f.kind)), x.facts.filter((f) => teamKinds.has(f.kind)));
  }
});

test('a deal ending says whether the player chose to go', () => {
  const ended = [...chronicle.players.values()].flatMap((p) => p.moves.filter((x) => x.type === 'release' && x.reason === 'contract_end'));
  assert.ok(ended.length > 0);
  assert.ok(ended.some((x) => x.byPlayer) && ended.some((x) => !x.byPlayer));
});
