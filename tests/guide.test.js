// The TV guide (Task 115; docs/channel.md §17.2): the day's programme grouped into programmes, the day's edges, now
// marked, the matches-only filter, the final's teams kept back until both semifinals have finished, and the same day
// on every screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { buildDay, dayAround, groupEntries, guideAt, guideKind, studioJingle } from '../src/channel/guide.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createProgramme } from '../src/channel/programme.js';
import { JINGLE_TALKS, studioJingleMs, talkScript } from '../src/channel/talk.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const calendar = createCalendar(config);
const slots = calendar.slots(1);
const seed = 'guide-tests';
const timelineOf = () => {
  /** @type {Map<string, any>} */
  const tl = new Map();
  return (/** @type {any} */ m) => tl.get(m.id) ?? tl.set(m.id, createTimeline(m, config)).get(m.id);
};
const MIN = 60_000;

test('pieces group into programmes: a live match with its post-match show, a re-air, the studio between', () => {
  const fx = { id: 'f', homeId: 'a', awayId: 'b', stage: 'regular', kickoff: 30 };
  const old = { id: 'o', homeId: 'c', awayId: 'd', stage: 'regular', kickoff: -5000 };
  const pieces = [
    { kind: 'talk', topic: 'tee_up' }, { kind: 'pre_match', fixture: fx }, { kind: 'walk_out', fixture: fx }, { kind: 'live', match: fx, group: [fx] },
    { kind: 'handshakes', match: fx }, { kind: 'full_time', match: fx, show: true }, { kind: 'potm', match: fx, show: true }, { kind: 'ads', show: true },
    { kind: 'studio' }, { kind: 'ads' }, { kind: 'talk', topic: 'clip' },
    { kind: 'reair', match: old, part: 'intro' }, { kind: 'reair', match: old, part: 'match' }, { kind: 'reair', match: old, part: 'interview' },
    { kind: 'highlights', match: old }, { kind: 'studio' },
  ].map((seg, i) => ({ from: i * 10, until: (i + 1) * 10, seg }));
  const e = groupEntries(pieces);
  assert.deepEqual(e.map((x) => x.kind), ['studio', 'live', 'studio', 'reair', 'highlights', 'studio']);
  assert.deepEqual([e[1].from, e[1].until, e[1].kickoff, e[1].homeId], [10, 80, 30, 'a']);
  assert.deepEqual([e[3].from, e[3].until, e[3].played], [110, 140, -5000]);
});

test('a real day: midnight to midnight with no gaps, every live kick-off listed at its kick-off, the same on every screen', () => {
  const t = slots[20].kickoff + 10 * MIN;
  const day = buildDay(config, t, seed, timelineOf());
  assert.ok(t >= day.from && t < day.until);
  assert.equal(day.entries[0].from, day.from);
  assert.equal(day.entries.at(-1)?.until, day.until);
  for (let i = 1; i < day.entries.length; i++) assert.equal(day.entries[i].from, day.entries[i - 1].until);
  const kickoffs = slots.filter((s) => s.kickoff >= day.from && s.kickoff < day.until).map((s) => s.kickoff);
  assert.deepEqual(day.entries.filter((e) => e.kind === 'live').map((e) => e.kickoff), kickoffs);
  assert.ok(day.entries.some((e) => e.kind === 'reair') && day.entries.some((e) => e.kind === 'studio'));
  // Built again from scratch (another screen, a little later): the same day.
  assert.deepEqual(buildDay(config, t + 3 * 60 * MIN, seed, timelineOf()), day);
});

test('the day around a moment, at midnight', () => {
  const d = dayAround(calendar, slots[20].kickoff);
  assert.equal(dayAround(calendar, d.from).from, d.from);
  assert.equal(dayAround(calendar, d.until - 1).until, d.until);
  assert.equal(dayAround(calendar, d.until).from, d.until);
});

test('now is marked at the edges, the past and the matches-only filter', () => {
  const day = { from: 0, until: 100, entries: [
    { kind: /** @type {const} */ ('studio'), from: 0, until: 40 },
    { kind: /** @type {const} */ ('live'), from: 40, until: 70, homeId: 'a', awayId: 'b', stage: /** @type {const} */ ('regular'), kickoff: 45 },
    { kind: /** @type {const} */ ('reair'), from: 70, until: 100, homeId: 'c', awayId: 'd', stage: /** @type {const} */ ('regular'), played: -9 },
  ] };
  const at = (/** @type {number} */ now) => guideAt(day, now, { filter: 'all', semisDone: true }).map((e) => e.state);
  assert.deepEqual(at(39), ['now', 'next', 'next']);
  assert.deepEqual(at(40), ['past', 'now', 'next']);
  assert.deepEqual(at(99), ['past', 'past', 'now']);
  assert.equal(guideAt(day, 55, { filter: 'all', semisDone: true })[1].progress, 0.5);
  assert.deepEqual(guideAt(day, 55, { filter: 'matches', semisDone: true }).map((e) => e.kind), ['live', 'reair']);
});

test('playoffs day: the final listed, its teams kept back until both semifinals have finished on screen', () => {
  const n = calendar.regularCount;
  const day = buildDay(config, slots[n].kickoff, seed, timelineOf());
  const lives = day.entries.filter((e) => e.kind === 'live');
  assert.deepEqual(lives.map((e) => e.stage), ['semifinal', 'semifinal', 'final']);
  const final = (/** @type {boolean} */ semisDone) => guideAt(day, slots[n].kickoff, { filter: 'all', semisDone }).find((e) => e.kind === 'live' && e.stage === 'final');
  assert.equal(final(false)?.homeId, undefined);
  assert.ok(final(true)?.homeId);
  // The semifinals' teams are known from the table the day before: always shown.
  assert.ok(guideAt(day, slots[n].kickoff, { filter: 'all', semisDone: false }).filter((e) => e.stage === 'semifinal' && e.kind === 'live').every((e) => e.homeId));
});

test('the final round is one programme, listed once at its kick-off', () => {
  const t = slots[calendar.regularCount - 1].kickoff;
  const day = buildDay(config, t, seed, timelineOf());
  const rounds = day.entries.filter((e) => e.round);
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].kickoff, t);
});

test('the studio jingle never plays over the desk: only the talks that wait for it, not with the bumpers (Task 180)', () => {
  // The final's night (the champions, the off-season) and the next day's opening (the welcome, the tee-up).
  const final = slots.at(-1).kickoff;
  const from = final + 15 * MIN;
  const live = new LiveLeague(config, { now: from, seed });
  const tlOf = timelineOf();
  const programme = createProgramme(live, tlOf);
  const ctx = { timelineOf: tlOf, playerName: (/** @type {string} */ id) => id, formatTime: () => '' };
  const jingleMs = studioJingleMs(config);
  /** @type {string[]} */
  const jingles = [];
  /** @type {any} */
  let before = null;
  for (let t = from; t < final + 26 * 60 * MIN;) {
    live.advanceTo(t);
    const piece = programme.pieceAt(t);
    const seg = /** @type {any} */ (programme.at(Math.max(piece.from, t)));
    if (studioJingle(seg, before)) {
      jingles.push(seg.kind === 'talk' ? seg.topic : seg.kind);
      assert.notEqual(seg.kind, 'ads', 'not with the bumper');
      if (seg.kind === 'talk' && seg.podcast) {
        // OFF THE BALL's first talk (2026-10-21): its first line waits for the jingle too.
        assert.ok(seg.script[0].from >= jingleMs, 'OFF THE BALL: the first line waits for the jingle');
      } else if (seg.kind === 'talk') {
        assert.ok(JINGLE_TALKS.has(seg.topic), seg.topic);
        const script = talkScript(seg, live, seg.from, ctx);
        assert.ok(script && script[0].from >= jingleMs, `${seg.topic}: the first line waits for the jingle`);
      }
    }
    before = guideKind(seg);
    t = piece.until > t ? piece.until : t + 1000;
  }
  for (const topic of JINGLE_TALKS) assert.ok(jingles.includes(topic), `the jingle opens the ${topic}`);
  assert.ok(!jingles.includes('tee_up'), 'not the tee-up straight after the welcome');
});
