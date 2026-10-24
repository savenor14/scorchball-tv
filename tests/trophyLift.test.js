// The trophy lift after the final (the off-season show, Task 190; src/channel/trophyLift.js, docs/channel.md §19.1):
// it takes the handshakes' place, everyone moves without jumping, the five and the captain, the caption, the crowd and
// its sounds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../src/config.js';
import { createCalendar } from '../src/channel/calendar.js';
import { standsFullness } from '../src/channel/crowd.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createProgramme } from '../src/channel/programme.js';
import { createTimeline } from '../src/channel/timeline.js';
import { liftCaption, liftCoach, liftCues, liftFive, liftLength, liftMood, liftParts, liftPose, PODIUM_TOP_PX, PODIUM_Y, stageHolder } from '../src/channel/trophyLift.js';
import { PITCH } from '../src/channel/pitch.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createRng } from '../src/sim/rng.js';

const config = await loadConfigFromDisk();
const s = config.settings.trophyLift;
const MIN = 60_000;

test('after the final the trophy lift takes the handshakes\' place, then the post-match show and 4 minutes of champions', () => {
  const cal = createCalendar(config);
  const slots = cal.slots(1);
  const live = new LiveLeague(config, { now: slots[58].kickoff, seed: 'lift-tests' });
  /** @type {Map<string, any>} */
  const tls = new Map();
  const timelineOf = (/** @type {any} */ m) => tls.get(m.id) ?? tls.set(m.id, createTimeline(m, config)).get(m.id);
  const programme = createProgramme(live, timelineOf);
  const final = live.matchesIn(1)[58];
  const end = final.kickoff + timelineOf(final).duration;
  live.advanceTo(end + 1000);
  const seg = programme.at(end + 1000);
  assert.ok(seg.kind === 'handshakes' && seg.lift, 'the lift, marked on the handshakes segment');
  assert.equal(seg.until - end, liftLength(s));
  assert.equal(programme.pieceAt(end + 1000).label, 'trophy lift');
  assert.equal(programme.at(end + liftLength(s) + 1000).kind, 'full_time', 'then the post-match show as usual');
  // A regular match keeps its handshakes, unmarked.
  const sf = live.matchesIn(1)[56];
  const sfEnd = sf.kickoff + timelineOf(sf).duration;
  const before = createProgramme(new LiveLeague(config, { now: sfEnd + 1000, seed: 'lift-tests' }), timelineOf).at(sfEnd + 1000);
  assert.ok(before.kind === 'handshakes' && !before.lift);
  // The champions' card: championMinutes, 4 after Task 190, 1 since Task 206.
  assert.equal(config.settings.segments.championMinutes, 1);
  let t = end + liftLength(s);
  while (programme.at(t).kind !== 'champion' && t < end + 60 * MIN) t += 1000;
  const champ = programme.at(t);
  assert.equal(champ.kind, 'champion');
});

/** Two squads of ten, seeded spots on the pitch and the bench. */
function squads() {
  const rng = createRng('lift|squads');
  return /** @type {const} */ (['home', 'away']).flatMap((side) => Array.from({ length: 10 }, (_, i) => ({ playerId: `${side}-${i}`, slot: i === 0 ? 'K' : 'M', side, x: rng.float(0.05, 0.95), y: i < 5 ? rng.float(0.1, 0.9) : -0.04 })));
}

test('everyone moves without jumping, from the whistle to the close-up, and ends on the podium with the captain in the middle', () => {
  const sq = squads();
  const p = liftParts(s);
  for (const champSide of /** @type {const} */ (['home', 'away'])) {
    const captainId = `${champSide}-3`;
    let prev = liftPose(sq, 0, s, { champSide, captainId });
    assert.equal(prev.length, 20);
    // At the whistle, everyone where they were.
    for (const q of prev) {
      const at = /** @type {any} */ (sq.find((x) => x.playerId === q.playerId));
      assert.ok(Math.abs(q.x - at.x) < 1e-9 && Math.abs(q.y - at.y) < 1e-9);
    }
    for (let t = 100; t < p.closeUpAt; t += 100) {
      const now = liftPose(sq, t, s, { champSide, captainId });
      for (const q of now) {
        const was = /** @type {any} */ (prev.find((x) => x.playerId === q.playerId));
        // At most a sprint's step in 100 ms (and a hop's 0.012 up or down).
        assert.ok(Math.hypot(q.x - was.x, (q.y - was.y) / 2) < 0.03, `${q.playerId} jumped at ${t} ms`);
      }
      prev = now;
    }
    const champs = prev.filter((q) => q.side === champSide).sort((a, b) => a.x - b.x);
    // Stepped up exactly the podium's height, so they stand on it (Tom: they hovered over it).
    assert.ok(champs.every((q) => Math.abs(q.y - (PODIUM_Y - PODIUM_TOP_PX / PITCH.h)) < 1e-6), 'all up on the podium');
    // The captain in the middle (one of the two middle spots, with ten).
    assert.ok(Math.abs(/** @type {any} */ (champs.find((q) => q.playerId === captainId)).x - 0.5) <= 0.021, 'the captain in the middle');
  }
});

test('the five who started and their captain: the best outfield starter in the middle, the keeper at an end', () => {
  const starters = [{ playerId: 'k', slot: 'K' }, { playerId: 'd1', slot: 'D' }, { playerId: 'd2', slot: 'D' }, { playerId: 'm', slot: 'M' }, { playerId: 's', slot: 'S' }];
  const ovr = /** @type {Record<string, number>} */ ({ k: 90, d1: 70, d2: 72, m: 80, s: 78 });
  const { five, captainId } = liftFive(starters, 'K', (id) => ovr[id]);
  assert.equal(captainId, 'm', 'the keeper is never captain');
  assert.equal(five[2].playerId, 'm');
  assert.equal(five[0].playerId, 'k');
  assert.deepEqual(new Set(five.map((q) => q.playerId)), new Set(starters.map((q) => q.playerId)));
});

test('the caption, the crowd and the sounds follow the parts', () => {
  const p = liftParts(s);
  const m = { championId: 'a', runnerUpId: 'b', season: 3, score: '3-2' };
  const name = (/** @type {string} */ id) => id.toUpperCase();
  assert.deepEqual([1, p.guardAt + 1, p.anthemAt + 1, p.liftAt + 1].map((t) => liftCaption(t, s, m, name).title), ['SEASON 3 CHAMPIONS', 'A GUARD OF HONOUR', "THE CHAMPIONS' ANTHEM", 'THE SCORCH CUP']);
  assert.equal(liftMood(1, s, 'away', 0.5).jump, 'away', 'the champions\' fans jump as they celebrate');
  assert.equal(liftMood(p.guardAt + 1, s, 'away', 0.5).wave, 'both');
  assert.equal(liftMood(p.closeUpAt + 1, s, 'away', 0.5).jump, 'away', 'and as the cup goes up');
  const cues = liftCues(s, 'final', 'gulls');
  const anthem = /** @type {any} */ (cues.find((c) => c.kind === 'anthem'));
  assert.ok(anthem.at > p.anthemAt && anthem.at < p.liftAt && anthem.team === 'gulls');
  assert.ok(cues.some((c) => c.kind === 'roar' && c.at > p.closeUpAt), 'a roar as the cup goes up');
  assert.ok(cues.every((c) => c.at < p.total));
  // The crowd stays: the champions' fans full until near the end, the runners-up's thinning.
  const total = liftLength(s);
  const full = (/** @type {number} */ t) => standsFullness({ kind: 'handshakes', from: 0, until: total, lift: true }, t, { fill: config.settings.crowd.fill, segments: config.settings.segments }, 'away');
  assert.equal(full(total * 0.8).home, 1);
  assert.ok(full(total * 0.8).away < 1);
  assert.ok(full(total - 1).home < 1, 'the champions\' fans start to go at the very end');
});

test('settings: the close-up comes inside the lift', () => {
  const bad = { ...config, settings: { ...config.settings, trophyLift: { ...s, closeUpAfterSeconds: s.liftSeconds } } };
  assert.ok(validateConfig(/** @type {any} */ (bad)).some((e) => e.includes('closeUpAfterSeconds')));
  const late = { ...config, settings: { ...config.settings, trophyLift: { ...s, stageAfterSeconds: s.liftSeconds } } };
  assert.ok(validateConfig(/** @type {any} */ (late)).some((e) => e.includes('stageAfterSeconds')));
});

test('Tom, 2026-10-20: the second cut to the stage, the cup passed down the line, cheering all through the lift', () => {
  const p = liftParts(s);
  assert.ok(p.stageAt > p.closeUpAt && p.stageAt < p.total);
  // The caption comes back for the stage.
  const m = { championId: 'a', runnerUpId: 'b', season: 3, score: '3-2' };
  assert.equal(liftCaption(p.stageAt - 1, s, m, (id) => id), null);
  assert.equal(liftCaption(p.stageAt + 1, s, m, (id) => id)?.title, 'THE SCORCH CUP');
  // Nobody holds it at first, then the captain, then each down the line in turn.
  assert.equal(stageHolder(p.stageAt + 100, s, 10, 4), null);
  const holders = Array.from({ length: 12 }, (_, i) => stageHolder(p.stageAt + 1300 + i * 1500, s, 10, 4));
  assert.equal(holders[0], 4);
  assert.deepEqual(holders.slice(1, 11), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // The roars: from the cup going up to the end of the lift, never more than about 7 s apart, a surge at the stage.
  const roars = liftCues(s, 'final', 'gulls').filter((c) => c.kind === 'roar' && c.at > p.closeUpAt).map((c) => c.at).sort((a, b) => a - b);
  assert.ok(roars.length >= 20);
  assert.ok(roars.every((t, i) => i === 0 || t - roars[i - 1] <= 7000), 'no long silences');
  assert.ok(roars.some((t) => t === p.stageAt), 'a surge at the cut to the stage');
  assert.ok(roars.at(-1) > p.total - 10_000 && roars.at(-1) < p.total);
});

test('Task 197: three celebrations in turn, round the guard (never through it), the runners-up gone before the champions come to halfway; the caption gone at the close-up; the champions\' manager cheering now and then', () => {
  const sq = squads();
  const p = liftParts(s);
  const third = p.guardAt / 3;
  for (const champSide of /** @type {const} */ (['home', 'away'])) {
    const o = { champSide, captainId: `${champSide}-3` };
    const champsAt = (/** @type {number} */ t) => liftPose(sq, t, s, o).filter((q) => q.side === champSide);
    // Pairs: each pair within a few hundredths of each other.
    const pairs = champsAt(1.5 * third);
    for (let i = 0; i < pairs.length; i += 2) assert.ok(Math.abs(pairs[i].x - pairs[i + 1].x) < 0.05 && pairs[i].y === pairs[i + 1].y, 'a pair together');
    // Along the boards, waving.
    const boards = champsAt(2.5 * third);
    assert.ok(boards.every((q) => q.y === 0.95));
    assert.ok(new Set(boards.map((q) => q.x)).size === boards.length, 'spread out');
    // Round the guard of honour: no champion inside the runners-up's line while it stands.
    for (let t = p.guardAt; t < p.anthemAt; t += 250) {
      for (const q of champsAt(t)) assert.ok(!(q.x > 0.25 && q.x < 0.74 && q.y > 0.53 && q.y < 0.63), `${q.playerId} through the guard at ${t}`);
    }
    // The runners-up gone before the champions leave the far end for halfway.
    const go = p.anthemAt + 0.3 * (p.liftAt - p.anthemAt);
    assert.equal(liftPose(sq, go, s, o).filter((q) => q.side !== champSide).length, 0, 'the runners-up gone');
    const waiting = champsAt(go - 1);
    // The far end: the right for the home side, the left for the away side (Task 212: mirrored).
    assert.ok(waiting.every((q) => (champSide === 'home' ? q.x > 0.85 : q.x < 0.15)), 'the champions wait past the far end until then');
  }
  const m = { championId: 'a', runnerUpId: 'b', season: 3, score: '3-2' };
  assert.equal(liftCaption(p.closeUpAt, s, m, (id) => id), null);
  assert.ok(liftCaption(p.closeUpAt - 1, s, m, (id) => id));
  const moods = Array.from({ length: 280 }, (_, k) => liftCoach(k * 100));
  assert.ok(moods.includes('cheer') && moods.filter((x) => x === 'cheer').length < moods.length / 4, 'cheering now and then');
});

test('Task 212: the guard of honour from the champions\' side (mirrored on the right), leaving the boards one after another, a steady walk along it with a hand out to each runner-up', () => {
  const sq = squads();
  const p = liftParts(s);
  const guardMs = p.anthemAt - p.guardAt;
  for (const champSide of /** @type {const} */ (['home', 'away'])) {
    const o = { champSide, captainId: `${champSide}-3` };
    const dir = champSide === 'home' ? 1 : -1;
    const at = (/** @type {number} */ t) => liftPose(sq, t, s, o);
    // The runners-up's line: mirrored for the away side, the first of them nearest the champions' end.
    const line = at(p.anthemAt - 1).filter((q) => q.side !== champSide);
    assert.ok(dir * (line[1].x - line[0].x) > 0, 'the line runs away from the champions\' end');
    // Leaving the boards one after another: a few seconds in, the first on their way, the last still waiting.
    const early = at(p.guardAt + 0.03 * guardMs).filter((q) => q.side === champSide);
    assert.ok(early[0].y < 0.95 && early.at(-1).y === 0.95, 'one after another');
    // Each champion walks the line steadily the way it runs, never stopping, a hand out now and then.
    const first = `${champSide}-0`;
    /** @type {number[]} */
    const xs = [];
    let hands = 0;
    for (let t = p.guardAt; t < p.anthemAt; t += 100) {
      const q = /** @type {any} */ (at(t).find((x) => x.playerId === first));
      if (Math.abs(q.y - 0.47) < 1e-9 && q.x > 0.22 && q.x < 0.78) {
        xs.push(q.x);
        if (q.arms !== 'none') hands++;
      }
    }
    assert.ok(xs.length > 50, 'along the line');
    for (let k = 1; k < xs.length; k++) assert.ok(dir * (xs[k] - xs[k - 1]) > 0, `steady, the way the line runs (${champSide})`);
    assert.ok(hands > 0 && hands < xs.length / 2, 'a hand out to each runner-up as they pass');
  }
});
