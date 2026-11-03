// Quells shown a game (Tom, 2026-11-03): their totals run into the thousands, so the screen shows quells a game, keeps
// no milestone, record or legend by their totals, counts a whole match's quells from season 5, and the Aegis goes to
// the best defender on a blend a game from season 5 (data/ruleChanges.json aegis_best_defender).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recordCaptions } from '../src/channel/captions.js';
import { awardView, positionLineText } from '../src/channel/awardShow.js';
import { cardStat } from '../src/channel/playerCard.js';
import { Chronicle, quellsAGame, UNSHOWN } from '../src/chronicle/chronicle.js';
import { EventLog } from '../src/chronicle/eventLog.js';
import { legendWhy, seasonStory } from '../src/chronicle/notable.js';
import { records } from '../src/chronicle/records.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { seasonAwards } from '../src/sim/awards.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { createRng } from '../src/sim/rng.js';
import { seasonConfig } from '../src/sim/rules.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
// The chronicle as the channel keeps it, and one counting a match's quells from season 1 (to see them without five seasons).
const chronicle = new Chronicle(config.chronicle);
const early = new Chronicle({ ...config.chronicle, notableMatchFrom: { stops: 1 } });
const log = new EventLog({ sinks: [chronicle.add, early.add] });
const league = createLeague(config, 'quells-tests', log);
const states = [];
for (let s = 0; s < 4; s++) {
  const state = runSeason(league, config, log);
  states.push(state);
  runOffseason(league, config, log, state);
}

test('quells a game, to one place', () => {
  assert.equal(quellsAGame(158, 10), '15.8');
  assert.equal(quellsAGame(0, 0), '0.0');
  assert.ok(UNSHOWN.has('stops'));
});

test('the card shows quells a game, the same for a season row and the career', () => {
  const [id] = [...chronicle.players.keys()];
  const c = chronicle.career(id, 'all');
  assert.equal(cardStat(c, 'stops'), c.appearances ? (c.tackles + c.blocks) / c.appearances : null);
});

test('no quell milestone, record or legend on screen; the chronicle still keeps the milestones (the snapshots hold them)', () => {
  // A quells milestone (kept, as the chronicle always has) never reaches LATEST.
  const m = /** @type {any} */ (chronicle.milestones.find((x) => x.season === 1));
  chronicle.milestones.push({ ...m, stat: 'stops', value: 1000 });
  for (let s = 1; s <= 4; s++) {
    for (const it of seasonStory(chronicle, config.chronicle, s)) {
      if (it.kind === 'milestone' || it.kind === 'record') assert.ok(it.stat !== 'stops', `season ${s}: ${it.kind} in quells`);
    }
  }
  chronicle.milestones.pop();
  for (const id of chronicle.players.keys()) assert.notEqual(legendWhy(chronicle, config.chronicle, id)?.stat, 'stops');
  const broken = /** @type {any} */ ([{ playerId: 'p', teamId: 't', matchId: 'm', season: 6, scope: 'career', stat: 'stops', value: 3000, previous: { playerId: 'q', value: 2999 } }]);
  assert.deepEqual(recordCaptions(broken, /** @type {any} */ ({ events: [] }), { playerName: () => '', captions: config.settings.captions }), []);
});

test('a whole match of 25 quells or more: kept from season 5 only, so the published snapshots are as they were', () => {
  assert.ok(chronicle.performances.every((x) => x.stops === undefined), 'seasons 1-4 as before');
  const big = early.performances.filter((x) => (x.stops ?? 0) >= config.chronicle.notableMatch.stops);
  assert.ok(big.length > 0, 'some 25-quell matches in four seasons');
  const r = records(early, config.chronicle.records);
  assert.equal(r.match.stops[0].value, Math.max(...early.performances.map((x) => x.stops ?? 0)));
  const story = [1, 2, 3, 4].flatMap((s) => seasonStory(early, config.chronicle, s)).filter((it) => it.kind === 'performance' && it.stat === 'stops');
  assert.ok(story.length > 0 && story.every((it) => /** @type {number} */ (it.value) >= config.chronicle.latest.matchQuells), 'LATEST says them');
});

test('RECORDS: quells a game, at least 28 games all-time and 7 in a season', () => {
  const r = records(chronicle, config.chronicle.records);
  const { minGames } = config.chronicle.records;
  for (const x of r.career.stopsPerGame) {
    const c = chronicle.career(x.playerId, 'all');
    assert.ok(c.appearances >= minGames.career);
    assert.equal(x.value, Math.round(((c.tackles + c.blocks) / c.appearances) * 10) / 10);
  }
  assert.ok(r.season.stopsPerGame.length > 0);
  for (const x of r.season.stopsPerGame) {
    const l = /** @type {any} */ (chronicle.players.get(x.playerId)?.seasons[/** @type {number} */ (x.season)]?.regular);
    assert.ok(l.appearances >= minGames.season);
  }
});

test('the Aegis from season 5: the best regular defender on quells, goals and assists a game; most quells before', () => {
  const before = seasonConfig(config, 4).rules.awards;
  const after = seasonConfig(config, 5).rules.awards;
  for (const state of states) {
    const players = league.players;
    const old = /** @type {any} */ (seasonAwards(state.stats.regular, players, before, createRng('a'), state.season).find((a) => a.award === 'quell'));
    const best = /** @type {any} */ (seasonAwards(state.stats.regular, players, after, createRng('a'), state.season).find((a) => a.award === 'quell'));
    const t = state.stats.regular[best.playerId];
    assert.equal(players[best.playerId].position, 'D');
    assert.equal(best.line.games, t.appearances);
    assert.ok(best.value >= 0 && best.value <= 1, 'a standing, never shown');
    const most = Math.max(...Object.values(state.stats.regular).map((x) => x.minutes));
    assert.ok(t.minutes >= 0.5 * most, 'a regular');
    assert.equal(old.value, Math.max(...Object.values(state.stats.regular).filter((x) => players[x.playerId].position === 'D').map((x) => x.tackles + x.blocks)));
  }
});

test('the award show: BEST DEFENDER with quells a game, goals and assists', () => {
  const line = { position: 'D', goals: 3, assists: 9, scorchers: 0, stops: 104, saves: 0, faced: 0, games: 14 };
  assert.equal(positionLineText(line), '7.4 Q · 3 G · 9 A');
  const event = /** @type {any} */ ({ season: 5, playerId: 'p', teamId: 't', data: { award: 'quell', value: 1, line, shortlist: [{ playerId: 'q', teamId: 't', value: 0.9, line: { ...line, goals: 1 } }] } });
  const v = awardView(event, seasonConfig(config, 5).rules.awards, (id) => id, (p) => ({ D: 'DEFENDERS' })[p] ?? p);
  assert.equal(v.forWhat, 'BEST DEFENDER');
  assert.equal(v.winner.stat, '7.4 Q · 3 G · 9 A');
  assert.equal(v.shortlist[0].stat, '7.4 Q · 1 G · 9 A');
});
