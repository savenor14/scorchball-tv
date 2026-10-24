import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blend, formation, homeAttacksRight } from '../src/channel/formation.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createCalendar } from '../src/channel/calendar.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const keeperSlot = config.positions.keeper;
const slots = createCalendar(config).slots(1);
const live = new LiveLeague(config, { now: slots[0].kickoff, seed: 'formation-tests' });
const match = /** @type {import('../src/channel/liveLeague.js').LiveMatch} */ (live.matchesIn(1)[0]);
const tl = createTimeline(match, config);
const ctxFor = (/** @type {number} */ elapsed) => ({ matchId: match.id, homeId: match.homeId, keeperSlot, elapsed });
const at = (/** @type {number} */ elapsed) => formation(tl.stateAt(elapsed), ctxFor(elapsed));

/** Average x of a side's outfield players, measured toward the goal they attack (0 own goal, 1 their target). */
function forwardness(/** @type {ReturnType<typeof formation>} */ f, /** @type {'home' | 'away'} */ side, /** @type {1 | -1} */ homeDir) {
  const dir = side === 'home' ? homeDir : -homeDir;
  const xs = f.players.filter((p) => p.side === side && p.slot !== keeperSlot).map((p) => (dir === 1 ? p.x : 1 - p.x));
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

test('everyone stays on the pitch, ten players at kick-off, ball on the centre spot', () => {
  const f = at(0);
  assert.equal(f.players.length, 10);
  assert.deepEqual(f.ball, { x: 0.5, y: 0.5 });
  for (const { event, at: t } of tl.events) {
    for (const p of formation(tl.stateAt(t), ctxFor(t)).players) {
      assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1, `${p.playerId} off the pitch after ${event.type}`);
    }
  }
});

test('the same moment always gives the same picture', () => {
  const t = tl.duration / 3;
  assert.deepEqual(at(t), at(t));
});

test('keepers stay near their own goal; ends swap at half-time', () => {
  for (const t of [tl.duration * 0.2, tl.duration * 0.8]) {
    const s = tl.stateAt(t);
    const dir = homeAttacksRight(s.phase);
    const f = formation(s, ctxFor(t));
    for (const p of f.players.filter((q) => q.slot === keeperSlot && q.playerId !== f.carrierId)) {
      const ownGoalX = (p.side === 'home') === (dir === 1) ? 0 : 1;
      assert.ok(Math.abs(p.x - ownGoalX) < 0.2, `${p.side} keeper at x=${p.x.toFixed(2)} in ${s.phase}`);
    }
  }
  assert.equal(homeAttacksRight('first_half'), 1);
  assert.equal(homeAttacksRight('second_half'), -1);
  assert.equal(homeAttacksRight('overtime'), 1);
});

test('the team with the ball pushes up as the ball advances, and the carrier is at the ball', () => {
  let checked = 0;
  for (const { event: e, at: t } of tl.events) {
    if (e.type !== 'advance' || e.data.to !== 'attacking') continue;
    const s = tl.stateAt(t);
    if (s.last?.event !== e) continue;
    const dir = homeAttacksRight(s.phase);
    const side = s.possession === match.homeId ? 'home' : 'away';
    const other = side === 'home' ? 'away' : 'home';
    const f = formation(s, ctxFor(t));
    assert.ok(forwardness(f, side, dir) > forwardness(f, other, dir), 'attackers further forward than defenders');
    const carrier = f.players.find((p) => p.playerId === e.playerId);
    assert.deepEqual([carrier?.x, carrier?.y], [f.ball.x, f.ball.y]);
    checked++;
  }
  assert.ok(checked > 5);
});

test('blend moves players smoothly from one formation to the next', () => {
  const a = at(tl.duration * 0.3).players;
  const b = at(tl.duration * 0.31).players;
  assert.deepEqual(blend(a, b, 0).map((p) => [p.x, p.y]), b.map((p) => [a.find((q) => q.playerId === p.playerId)?.x ?? p.x, a.find((q) => q.playerId === p.playerId)?.y ?? p.y]));
  assert.deepEqual(blend(a, b, 1), b);
  const mid = blend(a, b, 0.5);
  for (const p of mid) {
    const from = a.find((q) => q.playerId === p.playerId);
    const to = /** @type {any} */ (b.find((q) => q.playerId === p.playerId));
    if (from) assert.ok(Math.abs(p.x - (from.x + to.x) / 2) < 1e-9);
  }
});

test('teammates keep their distance: no two stand on top of each other', () => {
  for (const { at: t } of tl.events) {
    const f = formation(tl.stateAt(t), ctxFor(t));
    for (const p of f.players) {
      for (const q of f.players) {
        if (p === q || p.side !== q.side) continue;
        assert.ok(Math.hypot(p.x - q.x, (p.y - q.y) / 2) > 0.02, `${p.playerId} and ${q.playerId} overlap at ${t}`);
      }
    }
  }
});

test('in a probe phase the ball is closed down: its marker stands closer under pressure', () => {
  let checked = 0;
  for (const { event: e, at: t } of tl.events) {
    if (e.type !== 'advance') continue;
    const s = tl.stateAt(t);
    const calm = formation(s, { ...ctxFor(t), elapsed: null, probe: 1, press: 0 });
    const pressed = formation(s, { ...ctxFor(t), elapsed: null, probe: 1, press: 1 });
    const nearest = (/** @type {ReturnType<typeof formation>} */ f) => Math.min(...f.players
      .filter((p) => p.side !== (s.possession === match.homeId ? 'home' : 'away') && p.slot !== keeperSlot)
      .map((p) => Math.hypot(p.x - f.ball.x, (p.y - f.ball.y) / 2)));
    // Closer under pressure, unless already tight (within about 11 stage px): a second defender already at the ball
    // can be nudged out a little as the marker closes in, since teammates keep their space (Task 79's wider shape: by
    // up to NUDGE, about 2 px, when that defender was already within about 25 px).
    const NUDGE = 0.005;
    assert.ok(nearest(pressed) <= Math.max(nearest(calm), 0.03) + (nearest(calm) < 0.07 ? NUDGE : 1e-9), `no closer under pressure at ${t}`);
    checked++;
  }
  assert.ok(checked > 5);
});
