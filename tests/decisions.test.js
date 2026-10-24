import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chronicle } from '../src/chronicle/chronicle.js';
import { EventLog, memorySink } from '../src/chronicle/eventLog.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { validateConfig } from '../src/config.js';
import { announcementsAt } from '../src/channel/announcements.js';
import { createCalendar } from '../src/channel/calendar.js';
import { pollsAt } from '../src/channel/polls.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';

const real = await loadConfigFromDisk();

/** The real config with these decisions. @param {any[]} decisions */
const withDecisions = (decisions) => ({ ...structuredClone(real), decisions: { decisions } });

/** Play `seasons` seasons with off-seasons between. @param {any} config @param {number} seasons */
function play(config, seasons, seed = 'decisions-test') {
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

/** An induction of `playerId` taking effect at season 2, announced on the night of season 1's final. @param {string} playerId */
const induction = (playerId) => ({ id: 'induct_one', kind: 'induction', season: 2, announced: { season: 1, at: 'day 7 22:00' }, playerId, reason: 'The League honours a founder.' });

test('the committed decisions are valid (none yet)', () => {
  assert.deepEqual(real.decisions.decisions, []);
  assert.deepEqual(validateConfig(structuredClone(real)), []);
});

test('decisions are checked: unique ids, announced within the season and no later than they take effect', () => {
  const errors = validateConfig(withDecisions([
    induction('p-1'),
    { ...induction('p-2') },
    { ...induction('p-3'), id: 'late', announced: { season: 2, at: 'day 1 00:01' } },
    { ...induction('p-4'), id: 'off_calendar', announced: { season: 1, at: 'day 9 10:00' } },
  ]));
  assert.ok(errors.some((e) => e.includes('decisions: id "induct_one" is used twice')));
  assert.ok(errors.some((e) => e.includes('decisions[2].announced: must be no later than the start of season 2')));
  assert.ok(errors.some((e) => e.includes("decisions[3].announced: must fall within the season's 7 days")));
  // Each kind its own fields (Task 265): an announcement a headline and words, an induction a player and season.
  const kinds = validateConfig(withDecisions([
    { id: 'news', kind: 'announcement', announced: { season: 2, at: 'day 3 12:00' }, headline: 'Two new clubs join in season 9', words: 'The League grows.', roadmap: 'expansion' },
    { id: 'no_words', kind: 'announcement', announced: { season: 2, at: 'day 3 12:00' }, headline: 'x', playerId: 'p-1' },
    { id: 'no_player', kind: 'induction', announced: { season: 1, at: 'day 7 22:00' }, season: 2, reason: 'x', headline: 'x' },
  ]));
  assert.ok(!kinds.some((e) => e.includes('decisions[0]')), 'a full announcement is fine');
  assert.ok(kinds.some((e) => e.includes('decisions[1]: an announcement needs words')));
  assert.ok(kinds.some((e) => e.includes('decisions[1]: an announcement has no playerId')));
  assert.ok(kinds.some((e) => e.includes('decisions[2]: an induction needs playerId')));
  assert.ok(kinds.some((e) => e.includes('decisions[2]: an induction has no headline')));
  // Rule changes carry no announced date (upkeep is quiet).
  const c = structuredClone(real);
  c.ruleChanges.changes[0].announced = { season: 1, at: 'day 7 22:00' };
  assert.ok(validateConfig(c).some((e) => e.includes('announced')));
});

test('an induction is logged at its season start, after the rule changes, and changes nothing played', () => {
  const before = play(real, 2);
  const founder = /** @type {string} */ (before.events.find((e) => e.type === 'player_created')?.playerId);
  const after = play(withDecisions([induction(founder)]), 2);
  const inducted = after.events.filter((e) => e.type === 'induction');
  assert.equal(inducted.length, 1);
  assert.deepEqual([inducted[0].season, inducted[0].stage, inducted[0].playerId, inducted[0].data], [2, 'regular', founder, { id: 'induct_one', reason: 'The League honours a founder.' }]);
  const i = after.events.indexOf(inducted[0]);
  assert.equal(after.events[i - 1].type, 'rule_change');
  assert.equal(after.events[i + 1].type, 'season_start');
  // Everything else exactly as before (only the sequence numbers after it move up by one).
  const strip = (/** @type {any[]} */ evs) => evs.filter((e) => e.type !== 'induction').map(({ seq, ...e }) => e);
  assert.deepEqual(strip(after.events), strip(before.events));
  // The chronicle keeps it on the player and the season.
  assert.deepEqual(after.chronicle.players.get(founder)?.inducted, { season: 2, id: 'induct_one', reason: 'The League honours a founder.' });
  assert.deepEqual(after.chronicle.season(2).inductions, [founder]);
  assert.equal(before.chronicle.players.get(founder)?.inducted, null);
});

test('an induction of a player the chronicle does not know is skipped', () => {
  const { chronicle } = play(withDecisions([induction('p-nobody')]), 2);
  assert.deepEqual(chronicle.season(2).inductions, []);
});

test('announcements: only once aired, newest first; Tom\'s, an induction, a poll opening and its result; rule changes never', () => {
  const c = structuredClone(real);
  c.decisions.decisions = [
    induction('p-000001'),
    { id: 'expansion_news', kind: 'announcement', announced: { season: 2, at: 'day 3 12:00' }, headline: 'Two new clubs join in season 9', words: 'The League grows by two.', roadmap: 'expansion' },
  ];
  c.ruleChanges.changes.push({ id: 'louder', season: 3, reason: 'Crowds grow louder.', changes: { match: { homeBonus: 3 } } });
  c.polls.polls[0].season = 2; // the poll in season 2 here, beside the other season 2 announcements
  c.polls.polls[0].result = { announced: { season: 2, at: 'day 7 22:30' }, votes: { 't-gulls': 4, 't-rime': 7 } };
  assert.deepEqual(validateConfig(c), []);
  const cal = createCalendar(c);
  const ids = (/** @type {number} */ t) => announcementsAt(c, cal, t).map((a) => a.id);
  const s2 = cal.seasonStart(2);
  assert.deepEqual(ids(cal.instant(1, 6 * 1440 + 21 * 60)), []);
  assert.deepEqual(ids(cal.instant(1, 6 * 1440 + 22 * 60)), ['induction:induct_one']);
  assert.deepEqual(ids(s2), ['poll_open:favourite_team', 'induction:induct_one'], 'the rookie rule never announced');
  assert.deepEqual(ids(cal.seasonStart(3)), ['poll_result:favourite_team', 'announcement:expansion_news', 'poll_open:favourite_team', 'induction:induct_one'], 'nor louder');
  const [result, news, open] = announcementsAt(c, cal, cal.seasonStart(3));
  assert.deepEqual([result.kind, result.poll?.winner, result.poll?.total], ['poll_result', { id: 't-rime', label: 'RIME', share: 64 }, 11]);
  assert.equal(result.headline, "POLL: WHO'S YOUR FAVOURITE TEAM? RIME, 64%");
  assert.deepEqual([news.kind, news.headline, news.words, news.roadmap], ['announcement', 'TWO NEW CLUBS JOIN IN SEASON 9', 'The League grows by two.', 'expansion']);
  assert.equal(open.headline, "NEW POLL: WHO'S YOUR FAVOURITE TEAM? VOTE IN AUDIENCE");
  // The poll's tally shows from its announcement, not before.
  assert.equal(pollsAt(c, cal, cal.instant(2, 6 * 1440 + 22 * 60)).current?.votes, null);
  assert.deepEqual(pollsAt(c, cal, cal.instant(2, 6 * 1440 + 22 * 60 + 30)).past[0].votes, { 't-gulls': 4, 't-rime': 7 });
});

test('a poll result is announced no earlier than the poll closes', () => {
  const c = structuredClone(real);
  c.polls.polls[0].result = { announced: { season: 2, at: 'day 7 20:00' }, votes: {} };
  assert.ok(validateConfig(c).some((e) => e.includes('polls[0].result.announced: must be no earlier than the poll closes')));
});
