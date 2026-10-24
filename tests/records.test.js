// The record books (Task 216): src/chronicle/records.js over a fast-forwarded league's chronicle, and the chronicle's
// winning goals, milestones and notable matches.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chronicle } from '../src/chronicle/chronicle.js';
import { EventLog } from '../src/chronicle/eventLog.js';
import { records } from '../src/chronicle/records.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';
import { withoutComments } from '../src/util.js';

const config = await loadConfigFromDisk();
const SEASONS = 12;
const chronicle = new Chronicle(config.chronicle);
const log = new EventLog({ sinks: [chronicle.add] });
const league = createLeague(config, 'records-tests', log);
for (let i = 0; i < SEASONS; i++) runOffseason(league, config, log, runSeason(league, config, log));
const opts = config.chronicle.records;
const r = records(chronicle, opts);
const players = [...chronicle.players.values()];

/** @param {{ value: number }[]} list */
const descending = (list) => list.every((x, i) => i === 0 || list[i - 1].value >= x.value);

test('one winning goal for every match won in play, none for draws or shootouts', () => {
  const decided = [...chronicle.matches.values()].filter((m) => m.homeGoals !== m.awayGoals).length;
  const total = players.reduce((n, p) => n + p.totals.winningGoals, 0);
  assert.equal(total, decided);
});

test('milestones: one for each step a career total has passed, in the match it came in, in order', () => {
  const steps = withoutComments(config.chronicle.milestones);
  for (const p of players) {
    for (const [stat, step] of Object.entries(steps)) {
      const value = stat === 'stops' ? p.totals.tackles + p.totals.blocks : /** @type {any} */ (p.totals)[stat];
      const mine = chronicle.milestones.filter((m) => m.playerId === p.id && m.stat === stat);
      assert.equal(mine.length, Math.floor(value / /** @type {number} */ (step)), `${p.id} ${stat}`);
      mine.forEach((m, i) => assert.equal(m.value, (i + 1) * /** @type {number} */ (step)));
    }
  }
  assert.ok(chronicle.milestones.some((m) => m.stat === 'goals' && m.value >= 100), 'a 100th goal in 12 seasons');
  // Each milestone's match is one the player played in, and they come in the order played.
  const order = [...chronicle.matches.keys()];
  let last = -1;
  for (const m of chronicle.milestones) {
    const at = order.indexOf(m.matchId);
    assert.ok(at >= last);
    last = at;
    assert.ok(chronicle.players.get(m.playerId)?.seasons[m.season]);
  }
});

test('notable matches: each reaches a bar, and the match records come from them', () => {
  const bars = withoutComments(config.chronicle.notableMatch);
  assert.ok(chronicle.performances.length > SEASONS * 10);
  for (const x of chronicle.performances) assert.ok(Object.entries(bars).some(([k, bar]) => /** @type {any} */ (x)[k] >= bar));
  for (const k of /** @type {const} */ (['goals', 'assists', 'saves'])) {
    assert.ok(descending(r.match[k]));
    assert.equal(r.match[k][0].value, Math.max(...chronicle.performances.map((x) => x[k])));
  }
});

test('player records: in order, the right length, the best career and season at the top', () => {
  for (const group of [r.career, r.season, r.playoffs]) {
    for (const [stat, list] of Object.entries(group)) {
      assert.ok(list.length > 0 && list.length <= opts.listLength, stat);
      assert.ok(descending(list), stat);
    }
  }
  const bestCareer = Math.max(...players.map((p) => chronicle.career(p.id, 'all').goals));
  assert.equal(r.career.goals[0].value, bestCareer);
  const bestSeason = Math.max(...players.flatMap((p) => Object.values(p.seasons).map((s) => s.regular?.goals ?? 0)));
  assert.equal(r.season.goals[0].value, bestSeason);
  // All-time counts the playoffs too, so it's at least the regular season's.
  const top = r.career.goals[0];
  assert.ok(top.value >= chronicle.career(top.playerId, 'regular').goals);
  // Save percentage: a share, only with enough shots faced.
  for (const x of r.season.savePct) assert.ok(x.value <= 1 && /** @type {number} */ (x.faced) >= opts.seasonMinFaced);
  for (const x of r.career.savePct) assert.ok(x.value <= 1 && /** @type {number} */ (x.faced) >= opts.careerMinFaced);
});

test('team records: honours add up, seasons and wins in order, runs that fit a season', () => {
  const t = r.teams;
  assert.equal(r.seasons, SEASONS);
  assert.equal(t.history.reduce((n, h) => n + h.cups.length, 0), SEASONS);
  assert.equal(t.history.reduce((n, h) => n + h.pennants.length, 0), SEASONS);
  // Every match counted once on each side.
  const games = t.history.reduce((n, h) => n + h.won + h.drawn + h.lost, 0);
  assert.equal(games, 2 * chronicle.matches.size);
  assert.ok(descending(t.mostPoints) && descending(t.mostGoals) && descending(t.biggestWins));
  assert.ok(t.fewestConceded.every((x, i) => i === 0 || t.fewestConceded[i - 1].value <= x.value), 'fewest conceded, lowest first');
  const perSeason = Math.max(...[...chronicle.seasons.values()].map((s) => s.matchIds.length));
  for (const list of [t.winningRuns, t.unbeatenRuns, t.winlessRuns]) {
    assert.ok(list.length > 0 && list.every((x, i) => x.length <= perSeason && (i === 0 || list[i - 1].length >= x.length)));
  }
  assert.ok(t.unbeatenRuns[0].length >= t.winningRuns[0].length);
  // Most games for the club: one a team, each no more than that player's career, the most first.
  assert.equal(t.clubGames.length, Object.keys(league.teams).length);
  assert.equal(new Set(t.clubGames.map((x) => x.teamId)).size, t.clubGames.length);
  for (const x of t.clubGames) assert.ok(x.value <= chronicle.career(x.playerId, 'all').appearances);
  assert.ok(descending(t.clubGames));
});

test('award counts: every award counted once, by award and in all', () => {
  const given = [...chronicle.seasons.values()].reduce((n, s) => n + s.awards.length, 0);
  const byAward = Object.values(r.awards.byAward);
  assert.equal(byAward.length, config.rules.awards.list.length);
  // The lists are cut at listLength, so count from the players' own awards.
  assert.equal(players.reduce((n, p) => n + p.awards.length, 0), given);
  assert.ok(descending(r.awards.most));
  const most = r.awards.most[0];
  assert.equal(most.value, /** @type {any} */ (chronicle.players.get(most.playerId)).awards.length);
});

test('as of an earlier season: nothing from after it', () => {
  const early = records(chronicle, opts, { upTo: 6 });
  assert.equal(early.seasons, 6);
  assert.ok(early.career.goals[0].value <= r.career.goals[0].value);
  for (const x of [...early.season.goals, ...early.match.goals]) assert.ok(/** @type {number} */ (x.season) <= 6);
  assert.equal(early.teams.history.reduce((n, h) => n + h.cups.length, 0), 6);
  for (const x of early.career.goals) assert.equal(x.value, chronicle.career(x.playerId, 'all', 6).goals);
});

test('records broken (Task 220b): each passes someone else\'s best, in order, only from recordsFrom on', () => {
  const from = config.chronicle.history.recordsFrom;
  assert.ok(chronicle.recordsBroken.length > 0, 'some records fell in 12 seasons');
  const order = [...chronicle.matches.keys()];
  let last = -1;
  /** @type {Record<string, number>} */
  const best = {};
  for (const r of chronicle.recordsBroken) {
    assert.ok(r.season >= from);
    assert.notEqual(r.playerId, r.previous.playerId);
    assert.ok(r.value > r.previous.value);
    const at = order.indexOf(r.matchId);
    assert.ok(at >= last);
    last = at;
    // Each record only ever goes up.
    const key = `${r.scope} ${r.stat}`;
    assert.ok(r.value > (best[key] ?? 0));
    best[key] = r.value;
  }
  // The all-time goals record now is the best career's goals.
  const top = Math.max(...players.map((p) => p.totals.goals));
  const lastGoals = chronicle.recordsBroken.filter((r) => r.scope === 'career' && r.stat === 'goals').at(-1);
  if (lastGoals) assert.ok(lastGoals.value <= top);
});
