import { test } from 'node:test';
import { handshakeLength } from '../src/channel/ceremonies.js';
import { winnerOf } from '../src/channel/potm.js';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { fullTimeCard, preMatchCard, reairCard, studioCard } from '../src/channel/cards.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { highlightClips } from '../src/channel/highlights.js';
import { createProgramme, showsPlay } from '../src/channel/programme.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { restsKeeper } from '../src/sim/match.js';

const config = await loadConfigFromDisk();
const { segments, highlights } = config.settings;
const slots = createCalendar(config).slots(1);
const MIN = 60_000;
const SEED = 'programme-tests';

/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const ctx = { timelineOf, playerName: (/** @type {string} */ id) => id };

/** Run a programme across a span, noting each change of segment (each second: a short talk can run 4 s, Task 271). @param {any} programme @param {any} live */
function walk(programme, live, from, to, step = 1_000) {
  /** @type {any[]} */
  const runs = [];
  for (let t = from; t < to; t += step) {
    live.advanceTo(t);
    const seg = programme.at(t);
    const key = seg.kind === 'reair' ? `reair|${seg.match.id}|${seg.part}` : seg.kind === 'talk' ? `talk:${seg.topic}` : seg.kind;
    if (runs.at(-1)?.key !== key) runs.push({ key, seg, t });
  }
  return runs;
}

test('a whole slot: handshakes, the post-match show, re-air units, then the tee-up, pre-match, walk-out and live', () => {
  // The gap after match 12 (slot 11), seen by a league that has played up to it.
  const live = new LiveLeague(config, { now: slots[11].kickoff + MIN, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  const played = live.matchesIn(1);
  const justPlayed = played[11];
  const end = justPlayed.kickoff + timelineOf(justPlayed).duration;
  const walkOutFrom = slots[12].kickoff - segments.walkOutMinutes * MIN;
  const preMatchFrom = walkOutFrom - segments.preMatchMinutes * MIN;
  // The handshakes are shorter without a home win (Task 74).
  const showFrom = end + handshakeLength(segments.handshakeMinutes * MIN, config.settings.ceremonies, winnerOf(justPlayed) === justPlayed.homeId);
  const showUntil = showFrom + segments.postMatchMinutes * MIN;

  const runs = walk(programme, live, end, slots[12].kickoff + 6000);
  const kinds = runs.map((r) => r.key);
  // The show (§16.2): the result, the talk round the interview, this match's highlights, then a block opening with ads.
  assert.deepEqual(kinds.slice(0, 9), ['handshakes', 'full_time', 'talk:match', 'talk:interview_tee_up', 'potm', 'talk:wrap_up', 'highlights', 'ads', 'talk:clip']);
  assert.equal(runs[4].seg.match.id, justPlayed.id, 'player of the match from the match just played');
  assert.equal(runs[6].seg.match.id, justPlayed.id, 'the post-match show has the match just played');
  for (const r of runs) {
    if (['full_time', 'potm', 'highlights', 'studio', 'ads'].includes(r.seg.kind)) assert.equal(Boolean(r.seg.show), r.t < showUntil, `show flag at ${r.key}`);
  }
  // Then the re-airs: the matches 1, 3, 5 and 9 back, newest first, each in its parts with a studio block after; with
  // AROUND THE GROUNDS after the first (Tom's note 14), one fewer: the tour takes a re-air's place, which one turning
  // from gap to gap (the gap after match 12 drops the 11 % 4th).
  const reairs = runs.filter((r) => r.seg.kind === 'reair' && r.seg.part === 'intro').map((r) => r.seg.match.id);
  const toured = runs.some((r) => r.seg.kind === 'grounds');
  assert.ok(toured, 'a grounds tour in the gap');
  const offsets = /** @type {number[]} */ (config.settings.reairs.offsets);
  assert.deepEqual(reairs, offsets.filter((_, i) => i !== 11 % offsets.length).map((o) => played[11 - o].id));
  const first = runs.findIndex((r) => r.seg.kind === 'reair');
  assert.ok(runs[first].t >= showUntil);
  assert.deepEqual(runs.slice(first, first + 7).map((r) => r.seg.kind === 'reair' ? r.seg.part : r.seg.kind), ['intro', 'lineup', 'match', 'handshakes', 'full_time', 'interview', 'ads']);
  for (const r of runs) if (r.seg.kind === 'reair') assert.ok(r.seg.until <= preMatchFrom, 'a re-air never runs into the pre-match');
  assert.deepEqual(kinds.slice(-4), ['talk:tee_up', 'pre_match', 'walk_out', 'live']);
  assert.equal(programme.at(preMatchFrom).kind, 'pre_match');
  assert.equal(programme.at(walkOutFrom).kind, 'walk_out');
});

test('a re-air plays the whole match at 1×, with half-time shortened', () => {
  const live = new LiveLeague(config, { now: slots[11].kickoff + MIN, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  const end = slots[11].kickoff + timelineOf(live.matchesIn(1)[11]).duration;
  const runs = walk(programme, live, end, slots[12].kickoff, 1000);
  const start = /** @type {any} */ (runs.find((r) => r.seg.kind === 'reair' && r.seg.part === 'match')).seg;
  const m = start.match;
  const tl = timelineOf(m);
  const ht = /** @type {any} */ (tl.events.find((e) => e.event.type === 'half_time')).at;
  const at = (/** @type {number} */ p) => /** @type {any} */ (programme.at(start.from + p));
  assert.equal(at(0).elapsed, 0);
  assert.equal(at(ht - 1000).elapsed, ht - 1000, '1× before half-time');
  const shortHt = config.settings.reairs.halfTimeSeconds * 1000;
  const fullHt = config.settings.match.halfTimeRealMinutes * MIN;
  assert.ok(Math.abs(at(ht + shortHt / 2).elapsed - (ht + fullHt / 2)) < 1e-6, 'half-time runs faster');
  assert.equal(at(ht + shortHt + 5000).elapsed, ht + fullHt + 5000, '1× again after it');
  assert.equal(start.until - start.from, tl.duration - fullHt + shortHt);
  assert.equal(at(start.until - start.from).part, 'handshakes');
});

test('after the final round, the re-airs cycle through the most recent matches, all four of the round first', () => {
  const kickoff = slots[52].kickoff;
  const live = new LiveLeague(config, { now: kickoff, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  const round = live.matchesIn(1).filter((m) => m.kickoff === kickoff);
  const end = Math.max(...round.map((m) => m.kickoff + timelineOf(m).duration));
  const runs = walk(programme, live, end, end + 3 * 60 * MIN, 10_000);
  const reairs = runs.filter((r) => r.seg.kind === 'reair' && r.seg.part === 'intro').map((r) => r.seg.match.id);
  assert.deepEqual(new Set(reairs.slice(0, 4)), new Set(round.map((m) => m.id)));
});

test('highlights play their clips at highlights.speed, and the same moment always gives the same segment', () => {
  // The post-match show after match 12 has its highlights package.
  const live0 = new LiveLeague(config, { now: slots[11].kickoff + MIN, seed: SEED });
  const m = live0.matchesIn(1)[11];
  const from = m.kickoff + timelineOf(m).duration + (segments.handshakeMinutes + segments.fullTimeMinutes) * MIN + segments.potmSeconds * 1000;
  const a = createProgramme(new LiveLeague(config, { now: from, seed: SEED }), timelineOf);
  const b = createProgramme(new LiveLeague(config, { now: from, seed: SEED }), timelineOf);
  assert.deepEqual(JSON.stringify(a.at(from + 5000)), JSON.stringify(b.at(from + 5000)));
  // Check it shows a moment inside one of its clips, running at highlights.speed.
  for (let t = from; t < from + 5 * MIN; t += 7_000) {
    const s = a.at(t);
    if (s.kind !== 'highlights') continue;
    const clip = highlightClips(timelineOf(s.match), highlights)[s.clip];
    assert.ok(s.elapsed >= clip.from && s.elapsed < clip.to, 'inside its clip');
    const later = a.at(t + 1000);
    if (later.kind === 'highlights' && later.match.id === s.match.id && later.clip === s.clip) {
      assert.ok(Math.abs(later.elapsed - s.elapsed - 1000 * highlights.speed) < 1e-6);
      return;
    }
  }
  assert.fail('no highlights found');
});

test('across a whole season, play (a match live or re-aired, or highlights) is on screen at least 60% of the time', () => {
  const start = slots[0].kickoff;
  const finish = createCalendar(config).seasonStart(2);
  const live = new LiveLeague(config, { now: start, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  let on = 0;
  let all = 0;
  /** @type {Map<string, number>} */
  const reaired = new Map();
  let wasReair = '';
  for (let t = start; t < finish; t += 60_000) {
    live.advanceTo(t);
    const seg = programme.at(t);
    all++;
    if (showsPlay(seg)) on++;
    // Each re-air is followed by a studio rotation, so a new run of re-air samples is a new re-air.
    const now = seg.kind === 'reair' ? seg.match.id : '';
    if (now && now !== wasReair) reaired.set(now, (reaired.get(now) ?? 0) + 1);
    wasReair = now;
  }
  const share = on / all;
  assert.ok(share >= 0.6, `play (a match or highlights) is on ${(share * 100).toFixed(1)}% of the time`);
  // Every regular-season match but the very last few gets its re-airs: two at least since AROUND THE GROUNDS took a
  // re-air's place in each gap (Tom, 2026-10-19; three for most); since OFF THE BALL takes one in two gaps a day
  // (2026-10-20), one or two of them only once.
  const regular = live.matchesIn(1).filter((m) => m.stage === 'regular').slice(0, 40);
  for (const m of regular) assert.ok((reaired.get(m.id) ?? 0) >= 1, `${m.id} re-aired ${reaired.get(m.id) ?? 0} times`);
  assert.ok(regular.filter((m) => (reaired.get(m.id) ?? 0) >= 2).length >= 0.9 * regular.length, 'nine in ten re-aired twice or more');
});

test('before the first match: studio cards with the next fixture, then the pre-match', () => {
  const t = slots[0].kickoff - 60 * MIN;
  const programme = createProgramme(new LiveLeague(config, { now: t, seed: SEED }), timelineOf);
  const s = programme.at(t);
  assert.equal(s.kind, 'studio');
  assert.ok(s.kind === 'studio' && s.next && s.next.kickoff === slots[0].kickoff);
  const teeUp = programme.at(slots[0].kickoff - 4.5 * MIN - 1);
  assert.ok(teeUp.kind === 'talk' && teeUp.topic === 'tee_up', 'the tee-up talk before the pre-match');
  const welcome = programme.at(teeUp.from - 1);
  assert.ok(welcome.kind === 'talk' && welcome.topic === 'welcome', 'the welcome before it');
  assert.equal(programme.at(welcome.from - 1).kind, 'ident', 'the season\'s first match gets the opening');
  assert.equal(programme.at(slots[0].kickoff - 4 * MIN).kind, 'pre_match');
  assert.equal(programme.at(slots[0].kickoff - MIN).kind, 'walk_out');
});

test('the pre-match line-ups are the ones the sim fields at kick-off', () => {
  const before = slots[5].kickoff - 4 * MIN;
  const live = new LiveLeague(config, { now: before, seed: SEED });
  const s = createProgramme(live, timelineOf).at(before);
  assert.equal(s.kind, 'pre_match');
  if (s.kind !== 'pre_match') return;
  const card = preMatchCard(s.fixture, live, before, ctx);
  assert.equal(card.home.lineup.length, 5);
  live.advanceTo(slots[5].kickoff);
  const match = /** @type {any} */ (live.matchesIn(1)[5]);
  const fielded = match.events.filter((/** @type {any} */ e) => e.type === 'lineup')
    .map((/** @type {any} */ e) => e.data.starters.map((/** @type {any} */ p) => p.playerId));
  assert.deepEqual([card.home.lineup.map((p) => p.playerId), card.away.lineup.map((p) => p.playerId)], fielded);
});

test('Task 174b: when a team rests its keeper, the pre-match card shows the backup who starts', () => {
  const probe = new LiveLeague(config, { now: slots[0].kickoff - 4 * MIN, seed: SEED });
  const fixtures = probe.state.schedule.flatMap((r) => r.matches);
  const i = fixtures.findIndex((m) => restsKeeper(probe.league, m, m.homeId, config.rules) || restsKeeper(probe.league, m, m.awayId, config.rules));
  assert.ok(i >= 0 && i < 52, 'some team rests its keeper before the final round');
  const before = slots[i].kickoff - 4 * MIN;
  const live = new LiveLeague(config, { now: before, seed: SEED });
  const s = createProgramme(live, timelineOf).at(before);
  assert.equal(s.kind, 'pre_match');
  if (s.kind !== 'pre_match') return;
  assert.equal(s.fixture.id, fixtures[i].id);
  const card = preMatchCard(s.fixture, live, before, ctx);
  live.advanceTo(slots[i].kickoff);
  const match = /** @type {any} */ (live.matchesIn(1)[i]);
  const fielded = match.events.filter((/** @type {any} */ e) => e.type === 'lineup')
    .map((/** @type {any} */ e) => e.data.starters.map((/** @type {any} */ p) => p.playerId));
  assert.deepEqual([card.home.lineup.map((p) => p.playerId), card.away.lineup.map((p) => p.playerId)], fielded);
});

test('cards: full-time scorers match the score; the spotlight moves on each rotation', () => {
  const live = new LiveLeague(config, { now: slots[20].kickoff + 30 * MIN, seed: SEED });
  for (const m of live.matchesIn(1)) {
    const card = fullTimeCard(m, ctx);
    assert.equal(card.home.scorers.length, card.home.goals);
    assert.equal(card.away.scorers.length, card.away.goals);
    for (const s of [...card.home.scorers, ...card.away.scorers]) assert.ok(s.minute >= 1 && s.minute <= 45);
  }
  const t = slots[20].kickoff + 30 * MIN;
  const teams = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((r) => /** @type {any} */ (studioCard('spotlight', live, t, r, ctx)).teamId));
  assert.equal(teams.size, 8);
  const results = /** @type {any} */ (studioCard('results', live, t, 0, ctx));
  assert.equal(results.rows.length, 6);
});

test('the re-air intro card names the match and when it was played, never the score', () => {
  const live = new LiveLeague(config, { now: slots[3].kickoff + MIN, seed: SEED });
  const m = live.matchesIn(1)[2];
  const card = reairCard(m, { formatTime: () => 'TUE 14:10' });
  assert.deepEqual([card.homeId, card.awayId], [m.homeId, m.awayId]);
  assert.match(card.note, /Played TUE 14:10/);
  assert.ok(!JSON.stringify(card).includes('Goals'), 'no score');
});

test('Task 211: the off-season\'s music under every run of studio cards in a gap, from studioLeadSeconds in; never under the desk, ads, packages or re-airs', () => {
  const live = new LiveLeague(config, { now: slots[11].kickoff + MIN, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  const lead = config.settings.sound.music.studioLeadSeconds * 1000;
  /** @type {any[]} */
  const segs = [];
  for (let t = slots[11].kickoff + MIN; t < slots[12].kickoff;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    segs.push({ from: p.from, until: p.until, seg: programme.at(Math.max(p.from, t)) });
    t = p.until > t ? p.until : t + 1000;
  }
  let cards = 0;
  segs.forEach((x, i) => {
    const has = typeof x.seg.musicFrom === 'number';
    if (x.seg.kind !== 'studio') return assert.ok(!has, `${x.seg.kind} has none`);
    cards++;
    assert.ok(has, 'studio cards have it');
    const prev = segs[i - 1];
    // A run shares its start; a new run starts after the jingle.
    if (prev?.seg.kind === 'studio' && prev.until === x.from) assert.equal(x.seg.musicFrom, prev.seg.musicFrom);
    else assert.equal(x.seg.musicFrom, x.from + lead);
  });
  assert.ok(cards > 0);
});
