// Livelier players (Task 120; docs/channel.md §17.4): the run's pace by speed, the ball's foot, and the kicks and dives
// the motion reports (visual only: the motion's own positions are untouched, as the motion tests check).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createMotion } from '../src/channel/motion.js';
import { footSide, stepPhase } from '../src/channel/poses.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = structuredClone(await loadConfigFromDisk());
// Pinned: the dates below are the dev league's; the live start moves (the dress rehearsal, the launch).
config.settings.live.firstSeasonStarts = '2026-10-05';
const P = config.settings.poses;
const opts = { walk: P.walkSpeed, sprint: P.sprintSpeed, stepMs: P.stepMs };

test('the run: both feet down standing still, quicker steps the faster, sprinting from sprintSpeed', () => {
  assert.equal(stepPhase(0, 1234, 0, opts).step, 'stand');
  /** Steps taken in 3 s at a speed. @param {number} speed */
  const steps = (speed) => stepPhase(speed, 3000, 0, opts).index;
  assert.ok(steps(P.walkSpeed) < steps(0.06) && steps(0.06) < steps(P.sprintSpeed));
  assert.equal(steps(P.sprintSpeed), steps(P.sprintSpeed * 2), 'no quicker than a sprint');
  const kinds = new Set(Array.from({ length: 40 }, (_, i) => stepPhase(P.sprintSpeed, i * 37, 0, opts).step));
  assert.ok(kinds.has('sprintLeft') && kinds.has('sprintRight') && !kinds.has('left'));
});

test('the ball goes to the side the carrier heads, ignoring small drifts', () => {
  assert.equal(footSide(0.05, 0, 1, P.footSpeed), 1);
  assert.equal(footSide(-0.05, 0.05, 1, P.footSpeed), -1, 'a clear turn wins');
  assert.equal(footSide(0.01, -0.05, 1, P.footSpeed), -1, 'a slow drift: the longer look back');
  assert.equal(footSide(0.01, 0.01, -1, P.footSpeed), -1, 'standing about: toward the goal they attack');
});

test("every shot is a kick by its shooter toward the goal; every save a dive by that keeper; passes kick too", () => {
  const live = new LiveLeague(config, { now: Date.parse('2026-10-07T12:00Z'), seed: 'poses-tests' });
  const m = live.matchesIn(1)[5];
  const tl = createTimeline(m, config);
  const motion = createMotion(tl, { matchId: m.id, homeId: m.homeId, keeperSlot: config.positions.keeper, animation: config.settings.animation, play: config.settings.play });
  const { shotMs } = config.settings.animation;
  const shots = tl.events.filter((t) => t.event.type === 'shot');
  assert.ok(shots.length > 5);
  for (const s of shots) {
    const a = motion.actionAt(s.at - shotMs + 20, P);
    if (!['first_half', 'second_half', 'overtime'].includes(tl.stateAt(s.at).phase)) continue;
    assert.equal(a.kick?.playerId, s.event.playerId);
    assert.equal(a.kick?.shot, true);
    // Toward the goal they attack: the shot's own direction.
    const pose = motion.at(s.at - shotMs);
    const shooter = pose?.players.find((p) => p.playerId === s.event.playerId);
    if (shooter && Math.abs(shooter.x - 0.5) > 0.2) assert.equal(a.kick?.dir, shooter.x > 0.5 ? 1 : -1);
  }
  const saves = tl.events.filter((t) => t.event.type === 'save');
  assert.ok(saves.length > 0);
  for (const s of saves) assert.equal(motion.actionAt(s.at, P).dive?.playerId, s.event.playerId);
  // Passes: a kick by someone other than a shooter, now and then through the match.
  let passes = 0;
  for (let e = 60_000; e < 600_000; e += 50) { const k = motion.actionAt(e, P).kick; if (k && !k.shot) passes++; }
  assert.ok(passes > 20, `${passes} frames of pass kicks`);
});
