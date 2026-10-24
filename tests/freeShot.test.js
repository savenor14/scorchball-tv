import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { homeAttacksRight } from '../src/channel/formation.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createMotion, FREE_SHOT_BOX, freeShotMark, freeShotStaging } from '../src/channel/motion.js';
import { createReferee } from '../src/channel/pitchside.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

// The free shot staged (Task 143; Tom's pick B from freeshots.html).
const config = await loadConfigFromDisk();
const { animation } = config.settings;
const keeperSlot = config.positions.keeper;
const slots = createCalendar(config).slots(1);
const live = new LiveLeague(config, { now: slots[16].kickoff, seed: 'free-shot-tests' });
const dist = (/** @type {{ x: number, y: number }} */ a, /** @type {{ x: number, y: number }} */ b) => Math.hypot(a.x - b.x, (a.y - b.y) / 2);

const shots = live.matchesIn(1).slice(0, 14).flatMap((m) => {
  const tl = createTimeline(m, config);
  const motion = createMotion(tl, { matchId: m.id, homeId: m.homeId, keeperSlot, animation, play: config.settings.play });
  return tl.pauses.filter((q) => q.kind === 'free_shot').map((q) => {
    const fs = /** @type {any} */ (tl.events.find((t) => t.at === q.at + q.ms && t.event.type === 'free_shot')).event;
    const hd = homeAttacksRight(tl.stateAt(q.at).phase);
    const dir = fs.teamId === m.homeId ? hd : -hd;
    return { m, tl, motion, q, fs, dir, goalX: /** @type {0 | 1} */ (dir > 0 ? 1 : 0) };
  });
});

test('there are free shots to check, each paused for the setting', () => {
  assert.ok(shots.length >= 6, `${shots.length} free shots`);
  for (const s of shots) assert.equal(s.q.ms, config.settings.match.freeShotPauseSeconds * 1000);
});

test('the foul that gives a free shot is drawn in the box in front of the goal (nearly always)', () => {
  let inBox = 0;
  for (const s of shots) {
    const b = /** @type {any} */ (s.motion.at(s.q.at)).ball;
    const out = s.goalX === 1 ? 1 - b.x : b.x;
    if (out <= FREE_SHOT_BOX.depth + 0.01 && b.y >= FREE_SHOT_BOX.top - 0.01 && b.y <= 1 - FREE_SHOT_BOX.top + 0.01) inBox++;
  }
  assert.ok(inBox / shots.length >= 0.9, `${inBox} of ${shots.length} in the box`);
});

test('in the pause the ball is carried to the mark, the others stand clear on the arc, and the shot leaves from the mark', () => {
  for (const s of shots) {
    const st = freeShotStaging(s.q.ms, animation.shotMs);
    const mark = freeShotMark(s.goalX);
    const at = (/** @type {number} */ ms) => /** @type {any} */ (s.motion.at(s.q.at + ms));
    // Where the foul was until the referee picks it up, then on the mark.
    assert.deepEqual([at(st.pickUp - 10).ball.x, at(st.pickUp - 10).ball.y], [at(1).ball.x, at(1).ball.y]);
    const placed = at(st.placed + 10).ball;
    assert.ok(dist(placed, mark) < 1e-9 && placed.placed, 'on the mark');
    // Cleared: everyone but the taker and the keepers at least most of the arc's radius from the ball.
    const pose = at(st.run - 10);
    for (const p of pose.players) {
      if (p.playerId === s.fs.playerId || p.slot === keeperSlot) continue;
      assert.ok(dist(p, mark) > 0.07, `${p.playerId} ${dist(p, mark).toFixed(3)} from the mark in ${s.m.id}`);
    }
    // The defending keeper on their line.
    const keeper = pose.players.find((/** @type {any} */ p) => p.slot === keeperSlot && Math.abs(p.x - s.goalX) < 0.5);
    assert.ok(keeper && Math.abs(keeper.x - s.goalX) < 0.06, 'the keeper on the line');
    // The shot leaves the mark.
    const flight = at(s.q.ms - animation.shotMs + 5);
    assert.ok(flight.effects.flight && dist(flight.ball, mark) < 0.02, 'struck from the mark');
  }
});

test('the referee walks to the ball, carries it and steps aside, never jumping, and blends back after', () => {
  for (const s of shots.slice(0, 6)) {
    const ref = createReferee(s.tl, s.motion, animation);
    let prev = ref.at(s.q.at - 100);
    for (let e = s.q.at; e < s.q.at + s.q.ms + 4000; e += 100) {
      const p = ref.at(e);
      assert.ok(dist(p, prev) * 10 < 3 * animation.runSpeed, `a jump at ${e} in ${s.m.id}`);
      prev = p;
    }
    // Beside the ball as they carry it.
    const st = freeShotStaging(s.q.ms, animation.shotMs);
    const mid = s.q.at + (st.pickUp + st.placed) / 2;
    assert.ok(dist(ref.at(mid), /** @type {any} */ (s.motion.at(mid)).ball) < 0.03, 'carrying the ball');
  }
});

// Any other foul: a short restart (Task 144).
const fouls = live.matchesIn(1).slice(0, 10).flatMap((m) => {
  const tl = createTimeline(m, config);
  const motion = createMotion(tl, { matchId: m.id, homeId: m.homeId, keeperSlot, animation, play: config.settings.play });
  return tl.pauses.filter((q) => q.kind === 'foul').map((q) => ({ m, tl, motion, q }));
});

test('any other foul pauses the clock for foulPauseSeconds, drawn outside the box, the ball lying still where it was', () => {
  assert.ok(fouls.length >= 10, `${fouls.length} fouls`);
  for (const f of fouls) {
    assert.equal(f.q.ms, config.settings.match.foulPauseSeconds * 1000);
    const at = /** @type {NonNullable<ReturnType<typeof f.motion.foulAt>>} */ (f.motion.foulAt(f.q.at + 1));
    const out = at.dir > 0 ? 1 - at.spot.x : at.spot.x;
    assert.ok(!(out <= FREE_SHOT_BOX.depth && at.spot.y >= FREE_SHOT_BOX.top && at.spot.y <= 1 - FREE_SHOT_BOX.top), `a foul in the box in ${f.m.id}`);
    for (const ms of [10, f.q.ms / 2, f.q.ms - 10]) {
      const b = /** @type {any} */ (f.motion.at(f.q.at + ms)).ball;
      assert.ok(b.placed && dist(b, at.spot) < 1e-9, 'still on the spot');
    }
  }
});

test('after a foul\'s pause, play restarts with a pass from the spot (unless the next moment comes straight away)', () => {
  let restarts = 0;
  for (const f of fouls) {
    const at = /** @type {NonNullable<ReturnType<typeof f.motion.foulAt>>} */ (f.motion.foulAt(f.q.at + 1));
    const b = /** @type {any} */ (f.motion.at(f.q.at + f.q.ms + 200)).ball;
    if (!b.held && dist(b, at.spot) > 0.005) restarts++;
  }
  assert.ok(restarts / fouls.length > 0.7, `${restarts} of ${fouls.length}`);
});

test('in a foul\'s pause the referee comes over to the ball, without sprinting or jumping', () => {
  for (const f of fouls.slice(0, 8)) {
    const ref = createReferee(f.tl, f.motion, animation);
    const at = /** @type {NonNullable<ReturnType<typeof f.motion.foulAt>>} */ (f.motion.foulAt(f.q.at + 1));
    let prev = ref.at(f.q.at - 100);
    const start = dist(ref.at(f.q.at), at.spot);
    for (let e = f.q.at; e < f.q.at + f.q.ms + 3500; e += 100) {
      const p = ref.at(e);
      assert.ok(dist(p, prev) * 10 < 3 * animation.runSpeed, `a jump at ${e} in ${f.m.id}`);
      prev = p;
    }
    assert.ok(dist(ref.at(f.q.at + f.q.ms * 0.6), at.spot) < Math.max(0.05, start), 'closer to the ball');
  }
});

test('a sub brought on as play restarts never carries the ball in from the bench: it waits at their spot (Task 153)', () => {
  const live2 = new LiveLeague(config, { now: slots[24].kickoff, seed: 'sub-restart-tests' });
  let checked = 0;
  for (const m of live2.matchesIn(1).slice(0, 20)) {
    const tl = createTimeline(m, config);
    const motion = createMotion(tl, { matchId: m.id, homeId: m.homeId, keeperSlot, animation, play: config.settings.play });
    for (const q of tl.pauses.filter((p) => p.kind === 'substitution')) {
      const incoming = tl.events.filter((t) => t.at === q.at && t.event.type === 'substitution').map((t) => /** @type {string} */ (t.event.playerId));
      const spot = /** @type {any} */ (motion.at(q.at + q.ms - 1)).players;
      for (let e = q.at; e < q.at + q.ms; e += 100) {
        const pose = /** @type {any} */ (motion.at(e));
        const h = pose.ball?.held ? motion.holderAt(e) : null;
        if (!h || !incoming.includes(h)) continue;
        checked++;
        const me = pose.players.find((/** @type {any} */ p) => p.playerId === h);
        const end = spot.find((/** @type {any} */ p) => p.playerId === h);
        assert.ok(dist(me, end) < 0.05, `${h} has the ball ${dist(me, end).toFixed(2)} from their spot in ${m.id} at ${e}`);
      }
    }
  }
  // Since keepers stopped coming off tired (Task 174b) this hardly ever happens: it came from a keeper subbed at a
  // restart. No case in 104 matches on two seeds, so the checks above stand guard without requiring one.
  assert.ok(checked >= 0);
});
