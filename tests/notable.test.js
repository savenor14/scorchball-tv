// What's notable (Task 220; src/chronicle/notable.js): LATEST's season and off-season stories, HISTORY's landmarks and
// legends, on this day, over a fast-forwarded league's chronicle.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chronicle } from '../src/chronicle/chronicle.js';
import { EventLog } from '../src/chronicle/eventLog.js';
import { isLegend, landmarks, legendWhy, offseasonStory, onThisDay, seasonStory } from '../src/chronicle/notable.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const opts = config.chronicle;
const SEASONS = 20;
const chronicle = new Chronicle(opts);
const log = new EventLog({ sinks: [chronicle.add] });
const league = createLeague(config, 'notable-tests', log);
for (let i = 0; i < SEASONS; i++) runOffseason(league, config, log, runSeason(league, config, log));

test('a season\'s story: in the order it happened, each item clearing its bar, the Cup last', () => {
  const L = opts.latest;
  let total = 0;
  for (let s = 1; s <= SEASONS; s++) {
    const story = seasonStory(chronicle, opts, s);
    total += story.length;
    const order = chronicle.season(s).matchIds;
    let last = -1;
    for (const it of story) {
      const at = order.indexOf(/** @type {string} */ (it.matchId));
      assert.ok(at >= last, `${it.kind} in order`);
      last = at;
      if (it.kind === 'performance') assert.ok(/** @type {number} */ (it.value) >= { goals: L.matchGoals, assists: L.matchAssists, saves: L.matchSaves }[/** @type {'goals'} */ (it.stat)]);
      if (it.kind === 'run') assert.ok(/** @type {number} */ (it.value) >= (it.stat === 'won' ? L.winRun : L.winlessRun));
      if (it.kind === 'milestone' && it.stat === 'appearances') assert.ok(/** @type {number} */ (it.value) >= L.appearancesFrom);
    }
    assert.equal(story.at(-1)?.kind, 'champion');
    assert.equal(story.at(-1)?.teamId, chronicle.season(s).championId);
    const pennant = story.find((it) => it.kind === 'pennant');
    assert.equal(pennant?.teamId, chronicle.season(s).shieldId);
    assert.deepEqual(story.find((it) => it.kind === 'playoffs')?.teamIds, chronicle.season(s).seeds);
  }
  // About 25 a season (the week fits).
  const perSeason = total / SEASONS;
  assert.ok(perSeason > 12 && perSeason < 40, `${perSeason} a season`);
});

test('the off-season\'s story: every award in the show\'s order, the No. 1 pick, call-ups, legends retiring', () => {
  const order = config.settings.awards.order;
  for (let s = 1; s <= SEASONS; s++) {
    const story = offseasonStory(chronicle, opts, s, order);
    const awards = story.filter((it) => it.kind === 'award');
    assert.deepEqual(awards.map((a) => a.stat), order.filter((/** @type {string} */ a) => chronicle.season(s).awards.some((x) => x.award === a)));
    assert.equal(story.filter((it) => it.kind === 'first_pick').length, 1, `season ${s}: one No. 1 pick`);
    for (const it of story.filter((x) => x.kind === 'legend')) assert.ok(chronicle.season(s).retired.includes(/** @type {string} */ (it.playerId)));
  }
});

test('legends: only the retired, each by a rule, and not too many', () => {
  const G = opts.legends;
  const legends = [...chronicle.players.values()].filter((p) => isLegend(chronicle, opts, p.id));
  const retired = [...chronicle.players.values()].filter((p) => p.retired && Object.keys(p.seasons).length);
  assert.ok(legends.length > 0, 'some legends in 20 seasons');
  assert.ok(legends.length <= retired.length / 4, `${legends.length} legends of ${retired.length} retired`);
  for (const p of chronicle.players.values()) if (!p.retired) assert.equal(isLegend(chronicle, opts, p.id), false);
  // V. Bonnefoy-style careers: three awards or more is always enough; a short career needs awards or Cups.
  for (const p of retired) if (p.awards.length >= G.awards) assert.ok(isLegend(chronicle, opts, p.id));
  assert.ok(legends.length <= SEASONS, `${legends.length} legends in ${SEASONS} seasons: about one a season at most`);
  // Each by a rule, which their line names.
  for (const p of legends) {
    const why = /** @type {{ stat: string, value: number }} */ (legendWhy(chronicle, opts, p.id));
    const c = chronicle.career(p.id, 'all');
    if (why.stat === 'awards') assert.equal(why.value, p.awards.length);
    else if (why.stat === 'cups') assert.ok(why.value >= G.cups);
    else assert.ok(why.value >= G[why.stat] && why.value === (why.stat === 'stops' ? c.tackles + c.blocks : /** @type {any} */ (c)[why.stat]));
  }
});

test('landmarks: the first season, every team\'s first Cup once, records only from recordsFrom on', () => {
  assert.ok(landmarks(chronicle, opts, 1).some((it) => it.kind === 'first_season'));
  const firsts = new Map();
  for (let s = 1; s <= SEASONS; s++) {
    for (const it of landmarks(chronicle, opts, s)) {
      if (it.kind === 'first_cup') {
        assert.ok(!firsts.has(it.teamId), `${it.teamId} has one first Cup`);
        firsts.set(it.teamId, s);
      }
      if (it.kind === 'record') assert.ok(s >= opts.history.recordsFrom);
      if (it.kind === 'cups_in_a_row') assert.ok(/** @type {number} */ (it.value) >= 2);
      if (it.kind === 'double' || it.withPennant) assert.equal(chronicle.season(s).shieldId, chronicle.season(s).championId);
      if (it.kind === 'record') assert.ok(['goals', 'assists', 'saves', 'stops'].includes(/** @type {string} */ (it.stat)) && it.playerId !== it.previousId);
    }
  }
  for (const [teamId, s] of firsts) assert.equal(/** @type {any} */ (chronicle.teams.get(teamId)).cups[0], s);
});

test('on this day: earlier seasons only, the same day, the Cup first', () => {
  // A stand-in for the calendar: a match's day is its place in the season, seven days.
  const dayOf = (/** @type {number} */ s, /** @type {string} */ id) => Math.floor((chronicle.season(s).matchIds.indexOf(id) / chronicle.season(s).matchIds.length) * 7);
  const sunday = onThisDay(chronicle, opts, { before: SEASONS + 1, day: 6, dayOf });
  assert.equal(sunday.length, 3);
  assert.equal(sunday[0].kind, 'champion');
  for (const it of sunday) assert.equal(dayOf(it.season, /** @type {string} */ (it.matchId)), 6);
  assert.equal(onThisDay(chronicle, opts, { before: 1, day: 3, dayOf }).length, 0, 'nothing before season 1');
});
