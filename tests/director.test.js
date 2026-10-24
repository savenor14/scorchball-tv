import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { formatDirector } from '../src/cli/director.js';
import { validateConfig } from '../src/config.js';
import { createCalendar } from '../src/channel/calendar.js';
import { changeAt, dayTimeOf, finishedSeasons, measureSeasons, pollProposals, ruleProposals } from '../src/director/watchers.js';

const real = await loadConfigFromDisk();
const announced = { season: 6, at: 'day 7 22:00' };

/** Finished seasons with these goals per match (the other measures in their bands). @param {number[]} goals */
const seasons = (goals) => goals.map((g, i) => ({ season: i + 1, matches: 56, goalsPerMatch: g, scorcherShare: 25, burnsPerMatch: 3.5 }));

test('the committed watch list is valid: goals 6.2–7.8 on the save bias, the scorcher share 23–28 on the heat clock', () => {
  assert.deepEqual(validateConfig(structuredClone(real)), []);
  const [goals, scorchers] = real.director.watchers;
  assert.deepEqual([goals.measure, goals.band, goals.lever.path], ['goalsPerMatch', [6.2, 7.8], 'contests.save.bias']);
  assert.deepEqual([scorchers.measure, scorchers.band, scorchers.lever.path], ['scorcherShare', [23, 28], 'heat.burnSeconds']);
});

test('a rule change is proposed once a measure has been out on one side for three seasons, aimed back, one step at most', () => {
  assert.deepEqual(ruleProposals(real, seasons([7, 7, 7, 7, 7.9]), 7), [], 'one season out');
  assert.deepEqual(ruleProposals(real, seasons([7, 7, 8.1, 6.0, 8.2]), 7), [], 'out, but not on one side');
  assert.deepEqual(ruleProposals(real, seasons([5.9, 6.0]), 3), [], 'too few seasons');
  const [high] = ruleProposals(real, seasons([7, 7, 8.4, 8.6, 8.5]), 6);
  assert.equal(high.id, 'goals_s6');
  assert.deepEqual(high.evidence.seasons.map((s) => s.season), [3, 4, 5]);
  assert.equal(high.evidence.side, 'high');
  // Mean 8.5, aim 7.0: three steps wanted, one allowed (Task 268); the save bias up (fewer goals).
  assert.deepEqual([high.lever.from, high.lever.to, high.lever.expected], [1.05, 1.15, 8.04]);
  assert.deepEqual(high.change, { id: 'director_goals_s6', season: 6, reason: real.director.watchers[0].reasons.high, changes: { contests: { save: { bias: 1.15 } } } });
  const [low] = ruleProposals(real, seasons([7, 6.0, 6.1, 6.1]), 5);
  assert.deepEqual([low.evidence.side, low.lever.to], ['low', 0.95]);
  // A little out with the aim near the band: rounding says no step, but it's always at least one.
  const near = structuredClone(real);
  near.director.watchers[0].aim = 7.7;
  const [nudge] = ruleProposals(near, seasons([7.85, 7.9, 7.85]), 4);
  assert.equal(nudge.lever.to, 1.15);
});

test('a proposal written into data/ruleChanges.json is a valid rule change', () => {
  const [p] = ruleProposals(real, seasons([7, 7, 8.4, 8.6, 8.5]), 6);
  const c = structuredClone(real);
  c.ruleChanges.changes.push(p.change);
  assert.deepEqual(validateConfig(c), []);
});

test('no proposal while a change to the lever is on its way, and a change resets the watch', () => {
  const c = structuredClone(real);
  c.ruleChanges.changes.push({ id: 'keepers', season: 6, reason: 'x', changes: changeAt('contests.save.bias', 1.15) });
  assert.deepEqual(ruleProposals(c, seasons([7, 7, 8.4, 8.6, 8.5]), 6), [], 'already on its way');
  // In force from season 4: seasons 3–5 weren't all played with today's value (a fresh copy: rules are cached by config).
  const since = structuredClone(real);
  since.ruleChanges.changes.push({ id: 'keepers', season: 4, reason: 'x', changes: changeAt('contests.save.bias', 1.15) });
  assert.deepEqual(ruleProposals(since, seasons([7, 7, 8.4, 8.6, 8.5]), 6), []);
  assert.equal(ruleProposals(since, seasons([7, 7, 8.4, 8.6, 8.5, 8.7]), 7).length, 1, 'three seasons since');
});

test('a closed poll without its result gets one proposed, its votes counted', () => {
  const cal = createCalendar(real);
  const closed = cal.seasonStart(6);
  const votes = [{ pollId: 'favourite_team', optionId: 't-gulls' }, { pollId: 'favourite_team', optionId: 't-gulls' }, { pollId: 'favourite_team', optionId: 't-rime' }, { pollId: 'favourite_team', optionId: 't-nobody' }, { pollId: 'other', optionId: 't-gulls' }];
  assert.deepEqual(pollProposals(real, cal, cal.seasonStart(5) + 3_600_000, votes, announced), [], 'still open');
  const [p] = pollProposals(real, cal, closed, votes, announced);
  assert.equal(p.id, 'favourite_team');
  assert.equal(p.total, 3);
  assert.deepEqual([p.votes['t-gulls'], p.votes['t-rime'], p.votes['t-anvils']], [2, 1, 0]);
  assert.deepEqual(p.result, { announced, votes: p.votes });
  const c = structuredClone(real);
  c.polls.polls[0].result = { announced: { season: 5, at: 'day 7 22:00' }, votes: p.votes };
  assert.deepEqual(validateConfig(c), [], 'the result as the desk would write it');
  assert.deepEqual(pollProposals(c, cal, closed, votes, announced), [], 'once it has its result');
});

test('a season is finished once its off-season show has aired; announcement times round up to the quarter hour', () => {
  const cal = createCalendar(real);
  const final = cal.slots(2).at(-1).kickoff;
  assert.equal(finishedSeasons(real, cal, final), 1);
  assert.equal(finishedSeasons(real, cal, final + real.settings.chronicle.offseasonAiredMinutes * 60_000), 2);
  assert.deepEqual(dayTimeOf(cal, cal.instant(2, 6 * 1440 + 22 * 60 + 1), 7), { season: 2, at: 'day 7 22:15' });
  assert.deepEqual(dayTimeOf(cal, cal.instant(2, 6 * 1440 + 23 * 60 + 50), 7), { season: 2, at: 'day 7 23:59' });
  assert.deepEqual(dayTimeOf(cal, cal.instant(3, 90), 7), { season: 3, at: 'day 1 01:30' });
});

test('the measures are the same league every time, and the summary reads them', () => {
  const a = measureSeasons(real, 'director-test', 2);
  assert.deepEqual(measureSeasons(real, 'director-test', 2), a);
  assert.equal(a.length, 2);
  assert.ok(a.every((m) => m.matches > 50 && m.goalsPerMatch > 3 && m.scorcherShare > 5 && m.burnsPerMatch > 0.5));
  const lines = formatDirector({ at: '2026-10-25T02:00:00.000Z', seed: 'x', season: 3, finished: 2, measures: a, proposals: [] });
  assert.ok(lines.some((l) => l.startsWith('No proposals')));
});
