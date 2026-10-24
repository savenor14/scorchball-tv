// The chronicle (Task 215): folded from the event log alone, it agrees with the sim's own season records and league
// state, is the same for the same seed, and is the same whether the league is fast-forwarded or played live.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chronicle } from '../src/chronicle/chronicle.js';
import { EventLog } from '../src/chronicle/eventLog.js';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createTimeline } from '../src/channel/timeline.js';
import { createProgramme } from '../src/channel/programme.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const COUNTS = ['goals', 'assists', 'scorchers', 'shots', 'shotsOnTarget', 'saves', 'tackles', 'fouls', 'burns', 'blocks', 'conceded'];
const SEASONS = 6;

/** Fast-forward `n` seasons with a chronicle listening. @param {string} seed @param {number} n */
function fastForward(seed, n) {
  const chronicle = new Chronicle(config.chronicle);
  const log = new EventLog({ sinks: [chronicle.add] });
  const league = createLeague(config, seed, log);
  const records = [];
  for (let i = 0; i < n; i++) {
    const record = runSeason(league, config, log);
    runOffseason(league, config, log, record);
    records.push(record);
  }
  return { chronicle, league, records };
}

const { chronicle, league, records } = fastForward('chronicle-tests', SEASONS);

test('each season: the table, seeds, playoffs, champion, runner-up, Pennant and awards match the sim', () => {
  for (const r of records) {
    const s = chronicle.season(r.season);
    assert.deepEqual(s.table, r.table.map(({ form, ...row }) => row), `season ${r.season} table`);
    assert.deepEqual(s.seeds, r.seeds);
    assert.deepEqual(chronicle.playoffs(r.season).map((m) => ({ id: m.id, stage: m.stage, homeId: m.homeId, awayId: m.awayId, winnerId: m.winnerId, result: { homeGoals: m.homeGoals, awayGoals: m.awayGoals, decidedBy: m.decidedBy, shootout: m.shootout } })),
      r.playoffs.map((p) => ({ id: p.id, stage: p.stage, homeId: p.homeId, awayId: p.awayId, winnerId: p.winnerId, result: p.result })));
    assert.equal(s.championId, r.championId);
    assert.equal(s.runnerUpId, r.runnerUpId);
    assert.equal(s.shieldId, r.shieldId);
    const history = /** @type {any} */ (league.history.find((h) => h.season === r.season));
    assert.deepEqual(s.awards.map((a) => [a.award, a.playerId, a.teamId, a.value]), history.awards.map((/** @type {any} */ a) => [a.award, a.playerId, a.teamId, a.value]));
    assert.equal(s.matchIds.length, r.schedule.reduce((n, round) => n + round.matches.length, 0) + r.playoffs.length);
  }
});

test('each season: every player line, regular season and playoffs apart, matches the sim\'s season stats', () => {
  for (const r of records) {
    for (const part of /** @type {const} */ (['regular', 'playoffs'])) {
      const mine = chronicle.seasonStats(r.season, part);
      const theirs = r.stats[part];
      assert.deepEqual(Object.keys(mine).sort(), Object.keys(theirs).sort(), `season ${r.season} ${part}: who played`);
      for (const [id, t] of Object.entries(theirs)) {
        const m = mine[id];
        for (const k of ['teamId', 'appearances', 'starts', ...COUNTS]) assert.equal(/** @type {any} */ (m)[k], /** @type {any} */ (t)[k], `season ${r.season} ${part} ${id} ${k}`);
        // Whole-second clocks: within a few seconds a match.
        assert.ok(Math.abs(m.minutes - t.minutes) <= t.appearances * 0.1, `${id}: ${m.minutes} min against ${t.minutes}`);
        assert.ok(m.steals <= m.tackles);
      }
      // One player of the match a match.
      const potms = Object.values(mine).reduce((n, l) => n + l.potm, 0);
      const matches = chronicle.season(r.season).matchIds.filter((id) => (part === 'regular') === (chronicle.matches.get(id)?.stage === 'regular')).length;
      assert.equal(potms, matches, `season ${r.season} ${part}: players of the match`);
    }
  }
});

test('every player: where they are now, their team, their awards and how they joined agree with the league', () => {
  assert.equal(chronicle.players.size, Object.keys(league.players).length);
  const where = new Map();
  for (const t of Object.values(league.teams)) {
    for (const id of t.roster) where.set(id, { status: 'roster', teamId: t.id });
    for (const id of t.reserves) where.set(id, { status: 'reserves', teamId: t.id });
  }
  for (const id of league.freeAgents) where.set(id, { status: 'free', teamId: null });
  const awards = new Map();
  for (const h of league.history) for (const a of h.awards) awards.set(a.playerId, (awards.get(a.playerId) ?? 0) + 1);
  let drafted = 0;
  for (const [id, p] of Object.entries(league.players)) {
    const rec = /** @type {import('../src/chronicle/chronicle.js').PlayerRecord} */ (chronicle.players.get(id));
    const expected = p.status === 'retired' ? { status: 'retired', teamId: null } : where.get(id);
    assert.deepEqual({ status: rec.status, teamId: rec.teamId }, expected, id);
    assert.equal(rec.awards.length, awards.get(id) ?? 0, `${id} awards`);
    assert.equal(rec.region, p.region);
    // On a team now, or ever played: they joined somehow (a free agent who never signed may retire unsigned without).
    if (rec.status === 'roster' || rec.status === 'reserves' || Object.keys(rec.seasons).length > 0) assert.ok(rec.joined, `${id} joined a team somehow`);
    if (rec.joined?.how === 'draft') {
      drafted++;
      assert.ok(rec.joined.pick >= 1 && rec.joined.round >= 1);
    }
    if (p.status === 'retired') assert.ok(rec.retired && rec.moves.at(-1)?.type === 'retirement');
  }
  assert.ok(drafted > 50, `${drafted} drafted players`);
});

test('teams: a finish every season, the Pennants and Cups counted, head-to-heads from every match', () => {
  for (const t of chronicle.teams.values()) {
    assert.equal(Object.keys(t.seasons).length, SEASONS);
    assert.deepEqual(t.pennants, records.filter((r) => r.shieldId === t.id).map((r) => r.season));
    assert.deepEqual(t.cups, records.filter((r) => r.championId === t.id).map((r) => r.season));
    for (const [season, ts] of Object.entries(t.seasons)) {
      const r = records[Number(season) - 1];
      assert.equal(ts.position, r.table.findIndex((row) => row.teamId === t.id) + 1);
    }
  }
  const [a, b] = [...chronicle.teams.keys()];
  const h2h = chronicle.headToHead(a, b);
  // Twice a season in the regular season, plus any playoff meetings.
  assert.ok(h2h.filter((m) => m.stage === 'regular').length === 2 * SEASONS, `${h2h.length} meetings`);
});

test('a career adds up its seasons', () => {
  const p = [...chronicle.players.values()].find((x) => Object.keys(x.seasons).length >= 4);
  assert.ok(p);
  const c = chronicle.career(p.id, 'regular');
  const goals = Object.values(p.seasons).reduce((n, s) => n + (s.regular?.goals ?? 0), 0);
  assert.equal(c.goals, goals);
  assert.ok(c.seasons >= 4);
});

test('the same seed gives the same chronicle', () => {
  const again = fastForward('chronicle-tests', 2).chronicle;
  const first = fastForward('chronicle-tests', 2).chronicle;
  assert.equal(JSON.stringify([...again.players.values()]), JSON.stringify([...first.players.values()]));
  assert.equal(JSON.stringify([...again.seasons.values()]), JSON.stringify([...first.seasons.values()]));
});

test('the live league keeps a chronicle that agrees with a fast-forward, after its old match events are dropped', () => {
  const calendar = createCalendar(config);
  const s3 = calendar.slots(3);
  const live = new LiveLeague(config, { now: s3[0].kickoff, seed: 'chronicle-live' });
  // Season 1's matches are gone from the live league; the chronicle still has them.
  assert.equal(live.matchesIn(1).length, 0);
  const ff = fastForward('chronicle-live', 2).chronicle;
  for (const season of [1, 2]) {
    assert.deepEqual(live.chronicle.season(season), ff.season(season));
    assert.deepEqual(live.chronicle.seasonStats(season, 'regular'), ff.seasonStats(season, 'regular'));
  }
});

test('the live league\'s chronicle takes only what has aired: a match at its final whistle, the off-season as the next season starts', () => {
  const calendar = createCalendar(config);
  const slots = calendar.slots(1);
  const slot = slots[5];
  const live = new LiveLeague(config, { now: slot.kickoff + 60_000, seed: 'chronicle-aired' });
  const m = /** @type {import('../src/channel/liveLeague.js').LiveMatch} */ ([...live.matches.values()].find((x) => x.slot === slot.index));
  assert.ok(!live.chronicle.matches.has(m.id), 'not while it is being played');
  assert.ok(live.chronicle.matches.has(live.matchesIn(1)[4].id), 'the one before it has aired');
  const whistle = slot.kickoff + createTimeline(m, config).duration;
  live.advanceTo(whistle - 1000);
  assert.ok(!live.chronicle.matches.has(m.id), 'not a second before the whistle');
  live.advanceTo(whistle);
  assert.ok(live.chronicle.matches.has(m.id), 'at the whistle');

  // The final: its result at its whistle; the awards, the draft and the rest of the off-season once the off-season
  // show has aired them (settings.chronicle.offseasonAiredMinutes after the final's kick-off).
  const final = slots[slots.length - 1];
  live.advanceTo(final.kickoff + config.settings.chronicle.offseasonAiredMinutes * 60_000 - 1000);
  assert.equal(live.chronicle.season(1).championId, live.finished.get(1)?.record.championId);
  assert.equal(live.chronicle.season(1).awards.length, 0, 'no awards before the off-season has aired');
  assert.ok(![...live.chronicle.players.values()].some((p) => p.moves.some((mv) => mv.type === 'draft' && mv.season === 1)), 'no draft yet');
  live.advanceTo(final.kickoff + config.settings.chronicle.offseasonAiredMinutes * 60_000);
  // Every award but the Spark: the founding season has no rookies (Task 252).
  assert.equal(live.chronicle.season(1).awards.length, config.rules.awards.list.length - 1);
  assert.ok([...live.chronicle.players.values()].some((p) => p.moves.some((mv) => mv.type === 'draft' && mv.season === 1)));
});

test('the off-season show has signed off by the time the chronicle takes the off-season', () => {
  const calendar = createCalendar(config);
  const slots = calendar.slots(1);
  const final = slots[slots.length - 1];
  const live = new LiveLeague(config, { now: final.kickoff + 1, seed: 'chronicle-offseason' });
  /** @type {Map<string, any>} */
  const tls = new Map();
  const timelineOf = (/** @type {any} */ m) => tls.get(m.id) ?? tls.set(m.id, createTimeline(m, config)).get(m.id);
  const programme = createProgramme(live, timelineOf);
  const aired = final.kickoff + config.settings.chronicle.offseasonAiredMinutes * 60_000;
  let signoffEnds = 0;
  for (let t = final.kickoff + 1; t < aired + 30 * 60_000;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = /** @type {any} */ (programme.at(Math.max(p.from, t)));
    if (seg.kind === 'talk' && seg.topic === 'signoff') signoffEnds = p.until;
    t = p.until > t ? p.until : t + 1000;
  }
  assert.ok(signoffEnds > final.kickoff, 'the sign-off was found');
  assert.ok(signoffEnds <= aired, `the sign-off ends at ${new Date(signoffEnds).toISOString()}, after the chronicle takes the off-season`);
});
