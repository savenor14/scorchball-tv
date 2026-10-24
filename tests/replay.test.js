import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { createMotion } from '../src/channel/motion.js';
import { replayAt, replayFocus } from '../src/channel/replay.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { animation, replays } = config.settings;
const PITCH = { w: 358, h: 179 };

/** @type {Map<string, any[]>} */
const byMatch = new Map();
const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId))?.push(e); }] });
const league = createLeague(config, 'replay-tests', log);
runSeason(league, config, log);
const [id, events] = [...byMatch][0];
const r0 = events.at(-1).data;
const timeline = createTimeline({ id, events, homeId: r0.homeId, awayId: r0.awayId }, config);
const motion = createMotion(timeline, { matchId: id, homeId: r0.homeId, keeperSlot: config.positions.keeper, animation, play: config.settings.play });

test('a replay shows in every goal pause, after the beat, from before the goal to just after it, and never into play', () => {
  const goals = timeline.pauses.filter((p) => p.kind === 'goal');
  assert.ok(goals.length > 0);
  for (const p of goals) {
    assert.equal(replayAt(timeline, p.at + replays.delayMs - 1, replays), null, 'not before the beat');
    const first = replayAt(timeline, p.at + replays.delayMs, replays);
    assert.ok(first && first.goalAt === p.at && first.show === p.at - replays.leadMs && first.f === 0);
    // Played at replays.speed: the same few seconds take longer on screen when slowed.
    const length = (replays.leadMs + replays.tailMs) / replays.speed;
    const last = replayAt(timeline, p.at + replays.delayMs + length - 1, replays);
    assert.ok(last && Math.abs(last.show - (p.at + replays.tailMs - replays.speed)) < 1e-6);
    assert.equal(replayAt(timeline, p.at + replays.delayMs + length, replays), null, 'over');
    assert.ok(replays.delayMs + length <= p.ms, 'done inside the pause');
  }
  // Nothing outside goal pauses.
  for (let e = 0; e < timeline.duration; e += 997) {
    if (!timeline.pauses.some((p) => p.kind === 'goal' && e >= p.at && e < p.at + p.ms)) assert.equal(replayAt(timeline, e, replays), null);
  }
});

test('the camera follows the ball: on the pitch, the right size for the zoom, the ball in shot, and never jerking', () => {
  // Task 88: with wide play, a cross from the touchline can fly across most of the pitch in one pass (Task 169: up to
  // passMaxMs), faster than a smooth camera can pan. So during a fast cross the camera may pan quickly (up to PAN per
  // 50 ms) and the ball may leave the shot briefly (OUT_MS at most in a row); otherwise it's in shot.
  const PAN = 0.06;
  const OUT_MS = 300;
  for (const p of timeline.pauses.filter((q) => q.kind === 'goal')) {
    let prev = null;
    let out = 0;
    for (let show = p.at - replays.leadMs; show <= p.at + replays.tailMs; show += 50) {
      const f = replayFocus(motion, p.at, show, replays, PITCH);
      assert.ok(Math.abs(f.w * PITCH.w * replays.zoom - replays.w) < 1e-6 && Math.abs(f.h * PITCH.h * replays.zoom - replays.h) < 1e-6);
      assert.ok(f.y - f.h / 2 >= -1e-9 && f.y + f.h / 2 <= 1 + 1e-9, 'within the pitch top to bottom');
      const ball = /** @type {any} */ (motion.at(Math.min(show, p.at))).ball;
      const inShot = Math.abs(ball.x - f.x) <= f.w / 2 + 0.05 && Math.abs(ball.y - f.y) <= f.h / 2 + 0.02;
      out = inShot ? 0 : out + 50;
      assert.ok(out <= OUT_MS, `the ball out of shot for ${out} ms at ${show}`);
      if (prev) assert.ok(Math.hypot(f.x - prev.x, f.y - prev.y) < PAN, `the camera jerked at ${show}`);
      prev = f;
    }
  }
});
