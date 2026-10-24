// Celebrations that cheer (Task 278l): on a real goal, the scorer and teammates gather and cheer without anyone
// jumping, and hand back to the motion as the celebration ends; at full time the winners cheer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createTimeline } from '../src/channel/timeline.js';
import { createMotion } from '../src/channel/motion.js';
import { celebrationAt } from '../src/channel/sidelines.js';
import { goalCheer, winnerCheer } from '../src/channel/cheers.js';

const config = await loadConfigFromDisk();
const cal = createCalendar(config);
const live = new LiveLeague(config, { now: cal.instant(2, 1440), seed: 'cheers-tests' });
const match = [...live.matchesIn(2)][0];
const tl = createTimeline(match, config);
const keeperSlot = config.positions.keeper;
const motion = createMotion(tl, { matchId: match.id, homeId: match.homeId, keeperSlot, animation: config.settings.animation, play: config.settings.play });
const celebrateMs = config.settings.animation.goalCelebrateMs;
const goal = tl.events.find((x) => x.event.type === 'goal' && x.event.clock > 200);

for (const variant of /** @type {const} */ (['pair', 'group'])) {
  test(`a goal's ${variant} cheer: they gather round the scorer, arms up on the beat, and nobody jumps`, () => {
    assert.ok(goal, 'a goal to cheer');
    const scorerId = /** @type {string} */ (goal.event.playerId);
    /** @type {Map<string, { x: number, y: number }>} */
    let prev = new Map();
    let biggest = 0;
    let armsUp = 0;
    let nearest = Infinity;
    for (let at = goal.at - 200; at <= goal.at + celebrateMs + 400; at += 50) {
      const pose = motion.at(at);
      const cheer = celebrationAt(tl, at, celebrateMs);
      const players = cheer ? goalCheer(pose.players, cheer, { variant, scorerId, keeperSlot, celebrateMs, runSpeed: config.settings.animation.runSpeed, atGoal: motion.at(goal.at).players }) : pose.players;
      for (const p of players) {
        const q = prev.get(p.playerId);
        // A hop is a pixel or two; anything bigger than a sprint's step is a jump.
        if (q) biggest = Math.max(biggest, Math.hypot(p.x - q.x, (p.y - q.y) / 2));
        if (cheer && /** @type {any} */ (p).arms === 'both' && p.slot !== keeperSlot) armsUp++;
      }
      if (cheer && cheer.since > celebrateMs / 3 && cheer.since < celebrateMs / 2) {
        const s = players.find((p) => p.playerId === scorerId);
        const mates = players.filter((p) => s && p.side === s.side && p !== s && p.slot !== keeperSlot);
        if (s) nearest = Math.min(nearest, ...mates.map((p) => Math.hypot(p.x - s.x, (p.y - s.y) / 2)));
      }
      prev = new Map(players.map((p) => [p.playerId, { x: p.x, y: p.y }]));
    }
    assert.ok(biggest < 0.03, `the biggest step in 50 ms was ${biggest.toFixed(3)} pitch lengths`);
    assert.ok(armsUp > 10, 'arms up on the beat');
    assert.ok(nearest < 0.06, `a teammate beside the scorer (${nearest.toFixed(3)})`);
  });
}

test('none leaves a goal as it was', () => {
  const pose = motion.at(goal.at + 1000);
  const cheer = /** @type {any} */ (celebrationAt(tl, goal.at + 1000, celebrateMs));
  assert.equal(goalCheer(pose.players, cheer, { variant: 'none', scorerId: goal.event.playerId, keeperSlot, celebrateMs }), pose.players);
});

test('the winners cheer on the beat once the huddle has settled, and not before', () => {
  assert.deepEqual(winnerCheer(0, 0, 0.2), { arms: 'none', dy: 0 });
  const beats = Array.from({ length: 10 }, (_, k) => winnerCheer(k * 300, 0, 1));
  assert.ok(beats.some((b) => b.arms === 'both' && b.dy < 0) && beats.some((b) => b.arms !== 'both' && b.dy === 0));
});
