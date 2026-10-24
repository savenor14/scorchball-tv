import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { handshakeParts, managerHandshakes, managerWalkOut, refereeHandshakes, refereeWalkOut, walkOutParts } from '../src/channel/ceremonies.js';
import { CREASE_RADIUS } from '../src/channel/formation.js';
import { colourDistance, matchKits } from '../src/channel/kits.js';
import { createMotion } from '../src/channel/motion.js';
import { PALETTE } from '../src/channel/palette.js';
import { createManagers, createReferee, managerArea, managerRest, REF_KICKOFF, refereeKit } from '../src/channel/pitchside.js';
import { TUNNEL, tunnelFade } from '../src/channel/sidelines.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { animation, ceremonies, segments, kits } = config.settings;
const keeperSlot = config.positions.keeper;
const dist = (/** @type {{ x: number, y: number }} */ a, /** @type {{ x: number, y: number }} */ b) => Math.hypot(b.x - a.x, (b.y - a.y) / 2);

/** @type {Map<string, any[]>} */
const byMatch = new Map();
const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId))?.push(e); }] });
const league = createLeague(config, 'pitchside-tests', log);
runSeason(league, config, log);
const matches = [...byMatch].slice(0, 3).map(([id, events]) => {
  const r = events.at(-1).data;
  const m = { id, events, homeId: r.homeId, awayId: r.awayId };
  const timeline = createTimeline(m, config);
  const motion = createMotion(timeline, { matchId: id, homeId: m.homeId, keeperSlot, animation, play: config.settings.play });
  return { m, timeline, motion, referee: createReferee(timeline, motion, animation) };
});

test('the referee\'s kit never clashes with either team, either keeper or the turf, in any matchup', () => {
  const teams = Object.values(league.teams);
  for (const h of teams) {
    for (const a of teams) {
      if (h === a) continue;
      const worn = matchKits(h.colours, a.colours, kits.clashDistance);
      const ref = refereeKit(worn, kits.clashDistance);
      for (const c of [worn.home.primary, worn.away.primary, PALETTE.keeperHome, PALETTE.keeperAway, PALETTE.turf]) {
        assert.ok(colourDistance(ref.primary, c) >= kits.clashDistance, `${h.abbr} v ${a.abbr}: referee ${ref.primary} too close to ${c}`);
      }
    }
  }
});

test('the referee follows play smoothly, never in a crease, rarely on top of a player, and starts at the kick-off spot', () => {
  for (const { timeline, motion, referee } of matches) {
    assert.deepEqual(referee.at(0), { ...REF_KICKOFF, arm: false }, 'at the kick-off spot as the match starts');
    let prev = referee.at(0);
    let near = 0;
    let n = 0;
    /** @type {number[]} */
    const speeds = [];
    for (let e = 100; e < timeline.duration; e += 100) {
      const p = referee.at(e);
      speeds.push(dist(p, prev) * 10);
      prev = p;
      for (const gx of [0, 1]) assert.ok(Math.hypot(p.x - gx, (p.y - 0.5) / 2) >= CREASE_RADIUS, `in a crease at ${e}`);
      assert.ok(p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1, `off the pitch at ${e}`);
      const pose = motion.at(e);
      if (!pose?.ball) continue;
      n++;
      if (pose.players.some((q) => dist(p, q) < 0.02)) near++;
    }
    speeds.sort((a, b) => a - b);
    // Pitch lengths per second: a jog is 0.06 and a sprint 0.11; brief bursts a little faster, never a jump.
    assert.ok(speeds[Math.floor(speeds.length * 0.99)] < 2 * animation.runSpeed, `p99 speed ${speeds[Math.floor(speeds.length * 0.99)]}`);
    assert.ok(speeds.at(-1) < 3 * animation.runSpeed, `top speed ${speeds.at(-1)}`);
    assert.ok(near / n < 0.02, `on top of a player ${(100 * near / n).toFixed(1)}% of the time`);
  }
});

test('the referee raises an arm after a goal and after a foul', () => {
  const { timeline, referee } = matches[0];
  for (const { event, at } of timeline.events) {
    if (event.type !== 'goal' && event.type !== 'foul') continue;
    assert.equal(referee.at(at + 100).arm, true, `${event.type} at ${at}`);
  }
  const quiet = timeline.events.find(({ at }) => !timeline.events.some((t) => (t.event.type === 'goal' || t.event.type === 'foul') && at >= t.at && at < t.at + animation.refereeSignalMs));
  if (quiet) assert.equal(referee.at(quiet.at).arm, false);
});

test('the walk-out: the referee leads the teams out of the tunnel, stands between them for the anthems, and ends at the kick-off spot', () => {
  const total = segments.walkOutMinutes * 60_000;
  const at = (/** @type {number} */ since) => refereeWalkOut(since, total - since, { ceremonies, jogSpeed: animation.jogSpeed });
  assert.equal(tunnelFade(at(0)), 0, 'starts out of sight in the tunnel');
  assert.ok(at(ceremonies.walkOnGapMs * 3).y > at(0).y, 'already on the way out as the first player sets off');
  const parts = walkOutParts(total, ceremonies);
  assert.deepEqual(at(parts.anthemsFrom), { x: 0.5, y: 0.5 }, 'between the lines for the anthems');
  assert.deepEqual(at(total - 500), REF_KICKOFF);
  let prev = at(0);
  for (let t = 50; t < total; t += 50) {
    const p = at(t);
    assert.ok(dist(p, prev) < 0.02, `jumped at ${t}`);
    assert.ok(p.y > -0.05 || Math.abs(p.x - TUNNEL.mouth.x) <= TUNNEL.halfW, 'through the tunnel, not its walls');
    prev = p;
  }
  // A re-air's line-up: straight from the line to the kick-off spot.
  const trimmed = (/** @type {number} */ since) => refereeWalkOut(since, 20_000 - since, { ceremonies, jogSpeed: animation.jogSpeed, trimmed: true });
  assert.deepEqual(trimmed(0), { x: 0.5, y: 0.5 });
  assert.deepEqual(trimmed(19_500), REF_KICKOFF);
});

test('the handshakes: the referee watches from above the lines, then leaves ahead of the teams and is gone by the end', () => {
  for (const total of [segments.handshakeMinutes * 60_000, 30_000]) {
    const p = handshakeParts(total, ceremonies);
    const at = (/** @type {number} */ since) => refereeHandshakes({ x: 0.3, y: 0.6 }, since, total, { ceremonies, jogSpeed: animation.jogSpeed });
    const watching = at(p.passAt - 1);
    assert.ok(watching && watching.y < 0.45, 'above the lines while they pass');
    assert.ok(at(p.leaveAt) !== null);
    assert.equal(at(total - 1), null, 'gone by the end');
    let prev = /** @type {{ x: number, y: number }} */ (at(0));
    for (let t = 50; t < total; t += 50) {
      const q = at(t);
      if (!q) break;
      assert.ok(dist(q, prev) < 0.02, `jumped at ${t}`);
      prev = q;
    }
  }
});

test('managers pace their own stretch of touchline slowly with the ball, and react to goals', () => {
  for (const { timeline, motion } of matches) {
    const managers = createManagers(timeline, motion, animation);
    assert.deepEqual(managers.at(0).map((g) => [g.x, g.y]), [managerRest('home'), managerRest('away')].map((p) => [p.x, p.y]), 'where the walk-out leaves them');
    let prev = managers.at(0);
    let travelled = 0;
    for (let e = 100; e < timeline.duration; e += 100) {
      const now = managers.at(e);
      now.forEach((g, i) => {
        const { lo, hi } = managerArea(g.side);
        assert.ok(g.x >= lo - 1e-9 && g.x <= hi + 1e-9, `${g.side} manager off their stretch at ${e}`);
        const v = Math.abs(g.x - prev[i].x) * 10;
        assert.ok(v <= animation.jogSpeed, `${g.side} manager too quick at ${e}: ${v}`);
        travelled += Math.abs(g.x - prev[i].x);
      });
      prev = now;
    }
    assert.ok(travelled > 0.2, 'they do pace');
    for (const { event, at } of timeline.events.filter((t) => t.event.type === 'goal')) {
      for (const g of managers.at(at + 100)) {
        const teamId = g.side === 'home' ? timeline.homeId : timeline.awayId;
        assert.equal(g.mood, teamId === event.teamId ? 'cheer' : 'despair');
      }
    }
  }
});

test('managers come out of the tunnel first, shake hands at halfway during the huddles, and leave early', () => {
  const total = segments.walkOutMinutes * 60_000;
  const opts = { ceremonies, jogSpeed: animation.jogSpeed };
  for (const side of /** @type {const} */ (['home', 'away'])) {
    assert.equal(tunnelFade(managerWalkOut(side, 0, opts)), 0, 'out of sight at first');
    assert.ok(managerWalkOut(side, ceremonies.walkOnGapMs * 2, opts).y > TUNNEL.back.y, 'out before the referee sets off');
    assert.deepEqual(managerWalkOut(side, total - 1, opts), managerRest(side));
    assert.deepEqual(managerWalkOut(side, 0, { ...opts, trimmed: true }), managerRest(side));
  }
  for (const hTotal of [segments.handshakeMinutes * 60_000, 30_000]) {
    const p = handshakeParts(hTotal, ceremonies);
    const at = (/** @type {'home' | 'away'} */ side, /** @type {number} */ since) => managerHandshakes(side, managerRest(side), since, hTotal, opts);
    const [h, a] = [at('home', p.huddleAt - 1), at('away', p.huddleAt - 1)];
    assert.ok(h && a && Math.abs(h.x - a.x) < 0.03 && Math.abs(h.x - 0.5) < 0.02, 'shaking hands at halfway');
    assert.equal(at('home', p.leaveAt), null, 'gone before the teams head off');
    assert.equal(at('away', p.leaveAt), null);
    assert.ok(refereeHandshakes(REF_KICKOFF, p.leaveAt, hTotal, opts) !== null, 'the referee leaves after them');
  }
});

test('at half-time each manager walks out to talk to their players by the bench, and is back on their stretch by the restart', () => {
  const breakLineMs = ceremonies.breakLineSeconds * 1000;
  for (const { timeline, motion } of matches) {
    const managers = createManagers(timeline, motion, animation, { breakLineMs });
    for (const brk of timeline.breaks) {
      const mid = managers.at(brk.to - breakLineMs - 1000);
      for (const g of mid) {
        assert.ok(g.y > 0.1, `${g.side} manager out with their players (y ${g.y.toFixed(2)})`);
        assert.ok(g.side === 'home' ? g.x < 0.5 : g.x > 0.5, 'by their own bench');
      }
      assert.ok(mid.some((g) => g.mood === 'talk') || managers.at(brk.to - breakLineMs - 2000).some((g) => g.mood === 'talk'), 'talking');
      for (const g of managers.at(brk.to - 1)) {
        const { lo, hi } = managerArea(g.side);
        assert.ok(Math.abs(g.y - managerRest(g.side).y) < 1e-9 && g.x >= lo - 1e-9 && g.x <= hi + 1e-9, `${g.side} manager back on their stretch`);
      }
      // Never a jump.
      let prev = managers.at(brk.from - 100);
      for (let e = brk.from; e <= brk.to + 1000; e += 100) {
        const now = managers.at(e);
        now.forEach((g, i) => assert.ok(dist(g, prev[i]) < 0.02, `${g.side} manager jumped at ${e}`));
        prev = now;
      }
    }
  }
});
