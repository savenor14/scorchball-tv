// The desk's career card (Task 226; src/channel/careerCard.js): who it's about for each focus, and the focus cycling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chronicle, statOf } from '../src/chronicle/chronicle.js';
import { EventLog } from '../src/chronicle/eventLog.js';
import { CAREER_FOCUSES, careerCard, careerPick } from '../src/channel/careerCard.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const chronicle = new Chronicle(config.chronicle);
const log = new EventLog({ sinks: [chronicle.add] });
const league = createLeague(config, 'career-card-tests', log);
for (let i = 0; i < 9; i++) runOffseason(league, config, log, runSeason(league, config, log));
runSeason(league, config, log);
const opts = config.chronicle.careerCard;
const teamIds = Object.keys(league.teams).slice(0, 2);
const seasons = (/** @type {any} */ p) => Object.values(p.seasons).filter((s) => /** @type {any} */ (s).regular || /** @type {any} */ (s).playoffs).length;

test('a star: on one of the next match\'s teams, with enough seasons in', () => {
  const pick = careerPick(chronicle, config, 'star', { teamIds });
  assert.ok(pick);
  const p = /** @type {any} */ (chronicle.players.get(pick.playerId));
  assert.ok(teamIds.includes(p.teamId));
  assert.ok(seasons(p) >= opts.minSeasons);
});

test('a milestone in sight: an active player within the share of the next step', () => {
  const pick = careerPick(chronicle, config, 'milestone', { teamIds });
  if (!pick) return;
  const { stat, target, left } = /** @type {any} */ (pick.why);
  const p = /** @type {any} */ (chronicle.players.get(pick.playerId));
  assert.equal(p.status, 'roster');
  assert.equal(statOf(p.totals, stat) + left, target);
  assert.ok(left / config.chronicle.milestones[stat] <= opts.milestoneWithin);
});

test('the focus cycles with the rotation, falling through when nobody fits', () => {
  const shown = CAREER_FOCUSES.map((_, r) => careerCard(chronicle, config, r, { teamIds })?.why.focus);
  for (const [r, f] of shown.entries()) {
    if (careerPick(chronicle, config, CAREER_FOCUSES[r], { teamIds })) assert.equal(f, CAREER_FOCUSES[r]);
  }
  // A young league has no careers long enough for a star (a milestone needs none).
  const young = new Chronicle(config.chronicle);
  const youngLog = new EventLog({ sinks: [young.add] });
  const l2 = createLeague(config, 'career-card-young', youngLog);
  runSeason(l2, config, youngLog);
  const card = careerCard(young, config, 0, { teamIds });
  assert.ok(card === null || card.why.focus === 'milestone');
});
