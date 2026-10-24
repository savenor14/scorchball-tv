// The player card's contents (Tasks 221–222; src/channel/playerCard.js): who they are, how they joined, their standing,
// the career a row a season with the position's stats, honours, for a few kinds of player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chronicle } from '../src/chronicle/chronicle.js';
import { EventLog } from '../src/chronicle/eventLog.js';
import { CARD_STATS, playerCard, standingIn } from '../src/channel/playerCard.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const SEASONS = 14;
const chronicle = new Chronicle(config.chronicle);
const log = new EventLog({ sinks: [chronicle.add] });
const league = createLeague(config, 'card-tests-2', log);
for (let i = 0; i < SEASONS; i++) runOffseason(league, config, log, runSeason(league, config, log));
const players = [...chronicle.players.values()];

test('an active player: their team, standing, a row a season newest first, the totals adding up', () => {
  const p = /** @type {any} */ (players.filter((x) => x.status === 'roster').sort((a, b) => b.totals.appearances - a.totals.appearances)[0]);
  const c = playerCard(chronicle, config, p.id);
  assert.equal(c.teamId, p.teamId);
  assert.equal(c.name, `${p.firstName} ${p.lastName}`);
  assert.ok(c.standing && /STAR PLAYER|STARTER|SQUAD PLAYER/.test(c.standing.words));
  assert.deepEqual(c.career.map((r) => r.season), Object.keys(p.seasons).map(Number).sort((a, b) => b - a));
  assert.equal(c.career.reduce((n, r) => n + r.games, 0), c.totals.appearances);
  const stats = CARD_STATS[p.position];
  assert.equal(c.career[0].stats.length, stats.length);
  if (stats[0][0] === 'goals') assert.equal(c.career.reduce((n, r) => n + /** @type {number} */ (r.stats[0]), 0), c.totals.goals);
  assert.equal(c.career.reduce((n, r) => n + r.potm, 0), c.totals.potm);
  for (const r of c.career) assert.equal(r.cup, chronicle.season(r.season).championId === r.teamId);
  assert.equal(c.age, SEASONS - p.birthSeason);
});

test('outfield players all show goals, assists and stops; keepers saves and save %', () => {
  for (const pos of ['S', 'M', 'D']) assert.deepEqual(CARD_STATS[pos].map(([k]) => k), ['goals', 'assists', 'stops']);
  const k = /** @type {any} */ (players.find((x) => x.position === 'K' && x.totals.saves > 100));
  const c = playerCard(chronicle, config, k.id);
  const share = /** @type {number} */ (c.career.find((r) => r.games > 5)?.stats[1]);
  assert.ok(share > 0 && share <= 1, `a save % of ${share}`);
});

test('the retired: no team, no standing, retired with their age then; a legend says why', () => {
  const r = /** @type {any} */ (players.find((x) => x.retired && Object.keys(x.seasons).length >= 8));
  const c = playerCard(chronicle, config, r.id);
  assert.equal(c.teamId, null);
  assert.equal(c.standing, null);
  assert.equal(c.age, r.retired.season - r.birthSeason);
  for (const p of players.filter((x) => x.retired)) {
    const l = playerCard(chronicle, config, p.id).legend;
    if (l) assert.ok(['goals', 'assists', 'saves', 'stops', 'awards', 'cups'].includes(l.stat));
  }
});

test('how they joined: a founding squad, the draft with its pick, a signing, or never signed', () => {
  const hows = new Set(players.map((p) => playerCard(chronicle, config, p.id).joined?.how ?? 'never'));
  for (const how of ['founding', 'draft', 'signing']) assert.ok(hows.has(how), how);
  const drafted = /** @type {any} */ (players.find((p) => p.joined?.how === 'draft'));
  const j = /** @type {any} */ (playerCard(chronicle, config, drafted.id).joined);
  assert.ok(j.round >= 1 && j.pick >= 1 && j.season >= 1);
});

test('a reserve in the Kindling League: RESERVE, at their team, and no games yet', () => {
  const r = players.find((p) => p.status === 'reserves' && Object.keys(p.seasons).length === 0);
  if (!r) return;
  const c = playerCard(chronicle, config, r.id);
  assert.equal(c.status, 'reserves');
  assert.equal(c.teamId, r.teamId);
  assert.equal(c.career.length, 0);
  const s = standingIn(chronicle, config.chronicle, r.id, SEASONS);
  assert.ok(s === null || s.role === 'RESERVE');
});

test('a player who moved clubs: each club\'s seasons together, newest first', () => {
  const p = /** @type {any} */ (players.find((x) => new Set(Object.values(x.seasons).map((s) => s.teamId)).size >= 2));
  const c = playerCard(chronicle, config, p.id);
  const teams = c.career.map((r) => r.teamId);
  assert.ok(new Set(teams).size >= 2);
  for (const r of c.career) assert.equal(r.teamId, p.seasons[r.season].teamId);
});
