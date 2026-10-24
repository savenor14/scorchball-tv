// MOMENTS (Milestone 5¾): the tracker counts what's seen live while the tab shows, once each, and finds the secrets.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { byTeamOf, countOf, createMomentTracker, emptyData, normalizeData, progressOf } from '../src/channel/moments.js';
import { createMomentStore } from '../src/channel/momentStore.js';

const config = await loadConfigFromDisk();
const HALF = config.rules.match.halfMinutes * 60;
const KICKOFF = Date.parse('2026-10-19T14:00:00Z');
const DURATION = 30 * 60_000;

/**
 * A finished match: goals as [elapsed ms, clock s, team 'h'|'a', player, scorcher?], burns as [elapsed, team].
 * @param {object} o
 */
function fakeMatch({ id = 'm1', kickoff = KICKOFF, goals = /** @type {any[]} */ ([]), burns = /** @type {any[]} */ ([]), decidedBy = 'regulation', homeId = 't-anvils', awayId = 't-gulls' } = {}) {
  let seq = 100;
  const timed = [
    ...goals.map(([at, clock, side, playerId, scorcher]) => ({ at, event: { seq: 0, type: 'goal', clock, teamId: side === 'h' ? homeId : awayId, playerId, data: { scorcher: !!scorcher } } })),
    ...burns.map(([at, side]) => ({ at, event: { seq: 0, type: 'burn', clock: 0, teamId: side === 'h' ? homeId : awayId, playerId: null, data: {} } })),
  ].sort((a, b) => a.at - b.at);
  for (const x of timed) x.event.seq = seq++;
  const homeGoals = goals.filter((g) => g[2] === 'h').length;
  const awayGoals = goals.filter((g) => g[2] === 'a').length;
  const result = { seq: seq++, type: 'match_result', clock: 2 * HALF, teamId: null, playerId: null, data: { homeGoals, awayGoals, decidedBy } };
  const match = { id, season: 2, stage: 'regular', round: 1, kickoff, homeId, awayId, events: [...timed.map((x) => x.event), result], summary: null };
  const timeline = {
    events: timed,
    duration: DURATION,
    stateAt(/** @type {number} */ at) {
      const upTo = timed.filter((x) => x.event.type === 'goal' && x.at <= at);
      return { score: [upTo.filter((x) => x.event.teamId === homeId).length, upTo.filter((x) => x.event.teamId === awayId).length] };
    },
  };
  return { match, timeline };
}

/** A tracker over `matches`, and a way to play frames. @param {ReturnType<typeof fakeMatch>[]} matches @param {any} [records] */
function setup(matches, records = {}) {
  const data = emptyData();
  const byId = new Map(matches.map((x) => [x.match.id, x]));
  const tracker = createMomentTracker({
    config,
    data,
    timelineOf: (m) => /** @type {any} */ (byId.get(m.id)).timeline,
    recordsOf: (m) => records[m.id] ?? [],
    seasonAt: () => 2,
    abbr: (id) => id.slice(2, 5).toUpperCase(),
  });
  let wall = 0;
  /** @type {any[]} */
  const notices = [];
  /**
   * Frames every `step` ms of channel time from `from` to `to` (real time keeps pace), with `seg(t)` on screen.
   * @param {number} from @param {number} to @param {(t: number) => any} seg @param {{ step?: number, visible?: boolean, layout?: 'full' | 'broadcast', shown?: (t: number) => any }} [o]
   */
  const play = (from, to, seg, o = {}) => {
    const step = o.step ?? 1000;
    for (let t = from; t <= to; t += step) {
      wall += step;
      const s = seg(t);
      notices.push(...tracker.frame({ t, wall, visible: o.visible ?? true, seg: s, shown: o.shown ? o.shown(t) : s.match ?? null, layout: o.layout ?? 'full' }));
    }
  };
  /** Real time passing with nothing watched (a hidden tab or a sleeping laptop). @param {number} ms */
  const away = (ms) => { wall += ms; };
  return { data, tracker, play, away, notices };
}

const live = (/** @type {any} */ m) => () => ({ kind: 'live', match: m, group: [m] });
const studio = () => ({ kind: 'cards' });

test('a goal seen live is counted once, with the first step\'s notice', () => {
  const x = fakeMatch({ goals: [[60_000, 400, 'h', 'p1']] });
  const s = setup([x]);
  s.play(KICKOFF, KICKOFF + 120_000, live(x.match));
  s.play(KICKOFF + 120_000, KICKOFF + 120_000, live(x.match));
  assert.equal(countOf(s.data, 'goal'), 1);
  assert.deepEqual(s.notices.filter((n) => n.kind === 'goal'), [{ kind: 'goal', step: 1 }]);
  assert.equal(progressOf(s.data, config.moments.kinds[0]).level, 1);
  assert.deepEqual(byTeamOf(s.data, 'goals'), { 't-anvils': { n: 1, won: 0 } });
});

test('nothing counts while the tab is hidden, or in a re-air or highlights', () => {
  const x = fakeMatch({ goals: [[60_000, 400, 'h', 'p1']] });
  const s = setup([x]);
  s.play(KICKOFF, KICKOFF + 120_000, live(x.match), { visible: false });
  assert.equal(countOf(s.data, 'goal'), 0);
  s.play(KICKOFF, KICKOFF + 120_000, () => ({ kind: 'reair', part: 'match', match: x.match, elapsed: 0 }));
  s.play(KICKOFF, KICKOFF + 120_000, () => ({ kind: 'highlights', match: x.match, elapsed: 0 }));
  assert.equal(countOf(s.data, 'goal'), 0);
  assert.equal(countOf(s.data, 'day'), 1, 'a day tuned in all the same');
});

test('coming back to a hidden tab skips what played while it was away, and breaks a whole match', () => {
  const x = fakeMatch({ goals: [[60_000, 400, 'h', 'p1'], [200_000, 900, 'a', 'p2']] });
  const s = setup([x]);
  s.play(KICKOFF, KICKOFF + 30_000, live(x.match));
  s.away(150_000);
  s.play(KICKOFF + 180_000, KICKOFF + DURATION + 5000, (t) => (t < KICKOFF + DURATION ? live(x.match)() : { kind: 'handshakes', match: x.match }));
  assert.equal(countOf(s.data, 'goal'), 1, 'only the goal after coming back');
  assert.equal(countOf(s.data, 'whole_match'), 0);
});

test('a whole match from kick-off to the whistle; its clean sheet, big win and layout counted at the whistle', () => {
  const goals = [1, 2, 3, 4, 5].map((k) => [k * 60_000, k * 60, 'h', `p${k}`]);
  const x = fakeMatch({ goals });
  const s = setup([x]);
  s.play(KICKOFF, KICKOFF + DURATION - 1000, live(x.match), { layout: 'broadcast' });
  assert.equal(countOf(s.data, 'clean_sheet'), 0, 'not before the whistle');
  s.play(KICKOFF + DURATION, KICKOFF + DURATION + 2000, () => ({ kind: 'handshakes', match: x.match }), { layout: 'broadcast' });
  assert.equal(countOf(s.data, 'whole_match'), 1);
  assert.equal(countOf(s.data, 'clean_sheet'), 1);
  assert.equal(countOf(s.data, 'big_win'), 1);
  assert.deepEqual(Object.values(s.data.seen.whole_match)[0].slice(1), ['t-anvils', 't-gulls', 't-anvils', 'broadcast']);
  assert.deepEqual(byTeamOf(s.data, 'matches'), { 't-anvils': { n: 1, won: 1 }, 't-gulls': { n: 1, won: 0 } });
  assert.ok(s.data.places.includes('BROADCAST'));
});

test('tuning in after the start is no whole match', () => {
  const x = fakeMatch({});
  const s = setup([x]);
  s.play(KICKOFF + 120_000, KICKOFF + DURATION + 1000, (t) => (t < KICKOFF + DURATION ? live(x.match)() : { kind: 'handshakes', match: x.match }));
  assert.equal(countOf(s.data, 'whole_match'), 0);
});

test('a 0–0 watched whole is a secret; the two layouts make BOTH WAYS', () => {
  const a = fakeMatch({ id: 'a' });
  const b = fakeMatch({ id: 'b', kickoff: KICKOFF + 3_600_000, goals: [[60_000, 100, 'h', 'p1']] });
  const s = setup([a, b]);
  const whole = (/** @type {any} */ x, /** @type {'full' | 'broadcast'} */ layout) => s.play(x.match.kickoff, x.match.kickoff + DURATION + 1000, (t) => (t < x.match.kickoff + DURATION ? live(x.match)() : { kind: 'handshakes', match: x.match }), { layout });
  whole(a, 'full');
  assert.ok(s.data.secrets.nil_nil);
  assert.match(s.data.secrets.nil_nil.where, /^S2 MON \d\d:\d\d · ANV 0–0 GUL$/);
  assert.equal(s.data.secrets.both_ways, undefined);
  whole(b, 'broadcast');
  assert.ok(s.data.secrets.both_ways);
  assert.deepEqual(s.notices.filter((n) => n.secret).map((n) => n.secret), ['nil_nil', 'both_ways']);
});

test('first-minute goals a kind (Tom, in place of late winners); the winner in the last minute and a golden goal secrets', () => {
  const end = 2 * HALF;
  const late = fakeMatch({ id: 'late', goals: [[60_000, 300, 'a', 'p1'], [100_000, 600, 'h', 'p2'], [1_700_000, end - 90, 'h', 'p3']] });
  const last = fakeMatch({ id: 'last', kickoff: KICKOFF + 3_600_000, goals: [[20_000, 30, 'a', 'p1'], [600_000, 700, 'h', 'p4'], [1_700_000, end - 20, 'h', 'p2']] });
  const golden = fakeMatch({ id: 'gold', kickoff: KICKOFF + 7_200_000, decidedBy: 'overtime', goals: [[1_800_000 - 5000, end + 100, 'a', 'p9']] });
  const s = setup([late, last, golden]);
  for (const x of [late, last, golden]) s.play(x.match.kickoff, x.match.kickoff + DURATION + 1000, (t) => (t < x.match.kickoff + DURATION ? live(x.match)() : { kind: 'handshakes', match: x.match }));
  assert.equal(countOf(s.data, 'first_minute'), 1, 'the goal at 0:30');
  assert.equal(countOf(s.data, 'late_winner'), 0, 'no late winners any more');
  const early = fakeMatch({ id: 'early', kickoff: KICKOFF + 10_800_000, goals: [[20_000, 300, 'h', 'p1'], [1_700_000, end - 20, 'h', 'p2']] });
  const s2 = setup([early]);
  s2.play(early.match.kickoff, early.match.kickoff + DURATION + 1000, (t) => (t < early.match.kickoff + DURATION ? live(early.match)() : { kind: 'handshakes', match: early.match }));
  assert.equal(s2.data.secrets.last_minute, undefined, 'a late goal in a match already won is no winner');
  assert.equal(countOf(s2.data, 'first_minute'), 0);
  assert.ok(s.data.secrets.last_minute);
  assert.equal(s.data.secrets.first_minute, undefined, 'no longer a secret');
  assert.ok(s.notices.some((n) => n.kind === 'first_minute' && n.step === 1));
  assert.ok(s.data.secrets.golden_goal);
});

test('hat-tricks, scorchers, burns and records as they air', () => {
  const x = fakeMatch({ goals: [[60_000, 100, 'h', 'p1', true], [120_000, 200, 'h', 'p1'], [180_000, 300, 'h', 'p1']], burns: [[90_000, 'a']] });
  const s = setup([x], { m1: [{ key: 'record-m1-career-goals-p1', at: 185_000 }] });
  s.play(KICKOFF, KICKOFF + 200_000, live(x.match));
  assert.equal(countOf(s.data, 'hat_trick'), 1);
  assert.equal(countOf(s.data, 'scorcher'), 1);
  assert.equal(countOf(s.data, 'burn'), 1);
  assert.equal(countOf(s.data, 'record'), 1);
});

test('stops: every tackle and block seen counts; a whole match with 100 or more is a secret', () => {
  const x = fakeMatch({});
  // 100 tackles and blocks, a second apart from 1 s in, both teams.
  const extra = Array.from({ length: 100 }, (_, i) => ({ at: 1000 + i * 1000, event: { seq: 500 + i, type: i % 4 === 0 ? 'block' : 'possession_change', clock: i, teamId: i % 2 ? 't-gulls' : 't-anvils', playerId: null, data: { reason: 'tackle' } } }));
  x.timeline.events.push(...extra);
  x.timeline.events.sort((a, b) => a.at - b.at);
  x.match.events.splice(-1, 0, ...extra.map((e) => e.event));
  const s = setup([x]);
  s.play(KICKOFF, KICKOFF + 50_500, live(x.match));
  assert.equal(countOf(s.data, 'stop'), 50, 'counted as they air');
  assert.ok(s.notices.some((n) => n.kind === 'stop' && n.step === 1));
  s.play(KICKOFF + 51_500, KICKOFF + DURATION + 1000, (t) => (t < KICKOFF + DURATION ? live(x.match)() : { kind: 'handshakes', match: x.match }));
  assert.equal(countOf(s.data, 'stop'), 100);
  assert.ok(s.data.secrets.hundred_stops);
  assert.match(s.data.secrets.hundred_stops.where, /100 STOPS$/);
});

test('in the final round, only the match on screen counts', () => {
  const a = fakeMatch({ id: 'a', goals: [[60_000, 100, 'h', 'p1']] });
  const b = fakeMatch({ id: 'b', homeId: 't-rime', awayId: 't-oasis', goals: [[60_000, 100, 'h', 'p2'], [90_000, 150, 'a', 'p3']] });
  const s = setup([a, b]);
  s.play(KICKOFF, KICKOFF + 120_000, () => ({ kind: 'live', match: a.match, group: [a.match, b.match] }), { shown: () => b.match });
  assert.equal(countOf(s.data, 'goal'), 2);
  assert.deepEqual(Object.keys(byTeamOf(s.data, 'goals')).sort(), ['t-oasis', 't-rime']);
});

test('interviews and ad breaks count once watched from their start to their end; the season\'s opening to its sign-off', () => {
  const x = fakeMatch({});
  const s = setup([x]);
  s.play(KICKOFF, KICKOFF + 5000, () => ({ kind: 'ident', next: { season: 2, slot: 0 } }));
  s.play(KICKOFF, KICKOFF + 60_000, () => ({ kind: 'potm', show: true, match: x.match, from: KICKOFF }));
  assert.equal(countOf(s.data, 'interview'), 0, 'not until it ends');
  s.play(KICKOFF + 61_000, KICKOFF + 62_000, studio);
  assert.equal(countOf(s.data, 'interview'), 1);
  s.play(KICKOFF, KICKOFF + 5000, () => ({ kind: 'reair', part: 'interview', match: x.match }));
  assert.equal(countOf(s.data, 'interview'), 1, 'not a re-air');
  // A whole break: bumper in, two ads, bumper out, then the studio.
  const brk = (/** @type {number} */ from) => (/** @type {number} */ t) => ({ kind: 'ads', part: t < from + 3000 ? 'bumper_in' : t < from + 63_000 ? 'ad' : 'bumper_out', from: t < from + 3000 ? from : from + 3000 });
  s.play(KICKOFF + 100_000, KICKOFF + 166_000, brk(KICKOFF + 100_000));
  assert.equal(countOf(s.data, 'ad_break'), 0, 'not until it ends');
  s.play(KICKOFF + 167_000, KICKOFF + 168_000, studio);
  assert.equal(countOf(s.data, 'ad_break'), 1);
  // Tuned in part-way through a break: not counted.
  s.play(KICKOFF + 630_000, KICKOFF + 666_000, brk(KICKOFF + 600_000));
  s.play(KICKOFF + 667_000, KICKOFF + 668_000, studio);
  assert.equal(countOf(s.data, 'ad_break'), 1);
  // Away (a hidden tab) in the middle of one: not counted.
  s.play(KICKOFF + 900_000, KICKOFF + 920_000, brk(KICKOFF + 900_000));
  s.away(30_000);
  s.play(KICKOFF + 950_000, KICKOFF + 966_000, brk(KICKOFF + 900_000));
  s.play(KICKOFF + 967_000, KICKOFF + 968_000, studio);
  assert.equal(countOf(s.data, 'ad_break'), 1);
  s.play(KICKOFF, KICKOFF + 1000, () => ({ kind: 'talk', topic: 'signoff', repeat: true, match: x.match }));
  assert.equal(s.data.secrets.season_ends, undefined, 'not from a repeat');
  s.play(KICKOFF, KICKOFF + 1000, () => ({ kind: 'talk', topic: 'signoff', match: x.match }));
  assert.equal(s.data.secrets.season_ends?.where, 'SEASON 2');
});

test('seven days in a row, and every team in a day', () => {
  const s = setup([]);
  for (let d = 0; d < 7; d++) s.play(KICKOFF + d * 86_400_000, KICKOFF + d * 86_400_000, studio);
  assert.equal(countOf(s.data, 'day'), 7);
  assert.ok(s.data.secrets.seven_days);
  const teams = config.teams.teams.map((/** @type {any} */ t) => t.id);
  const day8 = KICKOFF + 8 * 86_400_000;
  const matches = [0, 2, 4, 6].map((k) => fakeMatch({ id: `e${k}`, kickoff: day8 + k * 3_600_000, homeId: teams[k], awayId: teams[k + 1] }));
  const s2 = setup(matches);
  for (const x of matches.slice(0, 3)) s2.play(x.match.kickoff, x.match.kickoff + 2000, live(x.match));
  assert.equal(s2.data.secrets.every_team, undefined);
  s2.play(matches[3].match.kickoff, matches[3].match.kickoff + 2000, live(matches[3].match));
  assert.ok(s2.data.secrets.every_team);
});

test('SEEN IT ALL once every place has been opened', () => {
  const s = setup([]);
  for (const p of config.moments.places.slice(0, -1)) s.tracker.visit(p, KICKOFF);
  assert.equal(s.data.secrets.seen_it_all, undefined);
  s.tracker.visit(config.moments.places.at(-1), KICKOFF);
  assert.ok(s.data.secrets.seen_it_all);
  s.play(KICKOFF, KICKOFF, studio);
  assert.ok(s.notices.some((n) => n.secret === 'seen_it_all'), 'handed over with the next frame');
});

test('the store keeps the data, survives a reload, and runs on without storage', () => {
  /** @type {Map<string, string>} */
  const mem = new Map();
  const storage = /** @type {any} */ ({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) });
  const a = createMomentStore('k', { storage, doc: null, win: null });
  a.data.seen.goal = { 'm1#1': 1 };
  assert.ok(a.save());
  const b = createMomentStore('k', { storage, doc: null, win: null });
  assert.equal(countOf(b.data, 'goal'), 1);
  const broken = /** @type {any} */ ({ getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
  const c = createMomentStore('k', { storage: broken, doc: null, win: null });
  assert.equal(countOf(c.data, 'goal'), 0);
  assert.equal(c.save(), false);
  assert.deepEqual(normalizeData({ v: 99 }), emptyData(), 'another version starts afresh');
  // FIRST-MINUTE GOAL was a secret: found, it's the new kind's first step, found when it was.
  const carried = normalizeData({ ...emptyData(), secrets: { first_minute: { at: 1234, where: 'S1 WED' }, nil_nil: { at: 5, where: 'x' } }, seen: { late_winner: { a: 1 } } });
  assert.equal(countOf(carried, 'first_minute'), 1);
  assert.deepEqual(carried.reached.first_minute, { 1: 1234 });
  assert.deepEqual(Object.keys(carried.secrets), ['nil_nil']);
  assert.deepEqual(carried.seen.late_winner, { a: 1 }, 'late winners kept, unshown');
  assert.deepEqual(normalizeData(carried), carried, 'carried once');
  assert.deepEqual(normalizeData('nonsense'), emptyData());
});

test('AUDIENCE\'s second tab renamed FEEDBACK (was POLLS): a viewer who opened it keeps it for SEEN IT ALL', () => {
  const d = normalizeData({ ...emptyData(), places: ['SIDE:STATS', 'AUDIENCE:POLLS'] });
  assert.deepEqual(d.places, ['SIDE:STATS', 'AUDIENCE:FEEDBACK']);
});
