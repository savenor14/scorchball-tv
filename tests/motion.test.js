import { test } from 'node:test';
import { formation, homeAttacksRight } from '../src/channel/formation.js';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { createMotion, PASS_CLEAR, PASS_ENDS, shotBendOf } from '../src/channel/motion.js';
import { firstMatches } from '../src/channel/pitchmap.js';
import { CREASE_RADIUS } from '../src/channel/formation.js';
import { seatOf } from '../src/channel/sidelines.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { animation } = config.settings;
const keeperSlot = config.positions.keeper;

/** A regular match and a shootout match from the test seasons. */
function findMatches() {
  /** @type {Map<string, any[]>} */
  const byMatch = new Map();
  const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId))?.push(e); }] });
  const league = createLeague(config, 'motion-tests', log);
  /** @type {Record<string, any>} */
  const found = { regulars: [] };
  for (let s = 0; s < 60 && !(found.shootout && found.overtime); s++) {
    runOffseason(league, config, log, runSeason(league, config, log));
    for (const [id, events] of byMatch) {
      const r = events.at(-1).data;
      found[r.decidedBy] ??= { id, events, homeId: r.homeId, awayId: r.awayId };
      if (r.decidedBy === 'regulation' && found.regulars.length < 4) found.regulars.push({ id, events, homeId: r.homeId, awayId: r.awayId });
      byMatch.delete(id);
    }
  }
  return found;
}
const found = findMatches();

/** @param {{ id: string, events: any[], homeId: string, awayId: string }} m */
function setup(m) {
  const timeline = createTimeline(m, config);
  const motion = createMotion(timeline, { matchId: m.id, homeId: m.homeId, keeperSlot, animation, play: config.settings.play });
  return { timeline, motion };
}
const regular = setup(found.regulation);

test('the same moment always gives the same pose; nothing before kick-off', () => {
  const t = regular.timeline.duration * 0.37;
  assert.deepEqual(regular.motion.at(t), regular.motion.at(t));
  assert.equal(regular.motion.at(-1), null);
});

test('movement is continuous: no player or ball jumps between frames, kick-offs and breaks included', () => {
  const { timeline, motion } = regular;
  const step = 1000 / 60; // one frame at 60 fps
  let prev = motion.at(0);
  let worstPlayer = 0;
  let worstBall = 0;
  for (let e = step; e < timeline.duration; e += step) {
    const pose = motion.at(e);
    if (!pose || !prev) { prev = pose; continue; }
    const before = new Map(prev.players.map((p) => [p.playerId, p]));
    for (const p of pose.players) {
      const b = before.get(p.playerId);
      if (b) worstPlayer = Math.max(worstPlayer, Math.hypot(p.x - b.x, p.y - b.y));
    }
    if (pose.ball && prev.ball) worstBall = Math.max(worstBall, Math.hypot(pose.ball.x - prev.ball.x, pose.ball.y - prev.ball.y));
    // On the pitch, or between the pitch and a bench (a sub running on, just above or below it).
    for (const p of pose.players) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= -0.1 && p.y <= 1.15, `player off the pitch at ${e}`);
    if (pose.ball) assert.ok(pose.ball.x > -0.05 && pose.ball.x < 1.05 && pose.ball.y >= 0 && pose.ball.y <= 1, `ball out at ${e}`);
    prev = pose;
  }
  // Per frame: players run at most 3% of the pitch (about 10 stage px), the ball at most 8% (a fast pass or shot).
  assert.ok(worstPlayer < 0.03, `a player jumped ${worstPlayer.toFixed(3)} in one frame`);
  assert.ok(worstBall < 0.08, `the ball jumped ${worstBall.toFixed(3)} in one frame`);
});

test('keepers never leave their crease (once on the pitch)', () => {
  const { timeline, motion } = regular;
  for (let e = 0; e < timeline.duration; e += 250) {
    const phase = timeline.stateAt(e).phase;
    if (phase !== 'first_half' && phase !== 'second_half') continue;
    for (const p of motion.at(e)?.players ?? []) {
      if (p.slot !== keeperSlot) continue;
      // A keeper coming on as a substitute runs in from the touchline first.
      if (timeline.events.some((t) => t.event.type === 'substitution' && t.event.playerId === p.playerId && e - t.at < 8000)) continue;
      assert.ok(fromGoal(p) <= CREASE_RADIUS, `keeper at ${p.x.toFixed(2)}, ${p.y.toFixed(2)} (${e} ms)`);
    }
  }
});

/** Distance from the nearer goal's centre, in pitch lengths. @param {{ x: number, y: number }} p */
const fromGoal = (p) => Math.hypot(Math.min(p.x, 1 - p.x), (p.y - 0.5) / 2);

test('outfield players never stand in a crease', () => {
  const { timeline, motion } = regular;
  for (let e = 0; e < timeline.duration; e += 100) {
    for (const p of motion.at(e)?.players ?? []) {
      if (p.slot !== keeperSlot) assert.ok(fromGoal(p) > CREASE_RADIUS, `${p.playerId} in a crease at ${e} ms`);
    }
  }
});

test('keepers track the ball: across with it after a delay, off their line when it is far away', () => {
  const { timeline, motion } = regular;
  const lag = animation.keeperTrackMs / 2;
  /** @type {number[][]} */
  const pairs = []; // [ball y now, ball y lag ago, keeper y]
  const out = { near: /** @type {number[]} */ ([]), far: /** @type {number[]} */ ([]) };
  for (let e = lag; e < timeline.duration; e += 100) {
    const s = timeline.stateAt(e);
    if (!['first_half', 'second_half'].includes(s.phase) || s.paused || timeline.stateAt(e - lag * 2).phase !== s.phase) continue;
    const pose = motion.at(e);
    const before = motion.at(e - lag)?.ball;
    if (!pose?.ball || !before) continue;
    for (const k of pose.players.filter((p) => p.slot === keeperSlot)) {
      if (k.playerId === s.carrierId) continue;
      const goalX = k.x < 0.5 ? 0 : 1;
      const away = Math.abs(pose.ball.x - goalX);
      if (away < 0.33) out.near.push(Math.abs(k.x - goalX));
      if (away > 0.5) out.far.push(Math.abs(k.x - goalX));
      pairs.push([pose.ball.y, before.y, k.y]);
    }
  }
  const mean = (/** @type {number[]} */ a) => a.reduce((s, v) => s + v, 0) / a.length;
  const corr = (/** @type {number} */ i) => {
    const [ma, mb] = [mean(pairs.map((p) => p[i])), mean(pairs.map((p) => p[2]))];
    let [c, va, vb] = [0, 0, 0];
    for (const p of pairs) [c, va, vb] = [c + (p[i] - ma) * (p[2] - mb), va + (p[i] - ma) ** 2, vb + (p[2] - mb) ** 2];
    return c / Math.sqrt(va * vb);
  };
  assert.ok(corr(1) > 0.7, `keepers follow the ball across (correlation ${corr(1).toFixed(2)})`);
  assert.ok(corr(1) > corr(0), 'keepers follow where the ball was a moment ago, not where it is now');
  assert.ok(mean(out.far) > mean(out.near) + 0.02, `off the line ${mean(out.far).toFixed(3)} far vs ${mean(out.near).toFixed(3)} near`);
});

test('long spells keep moving: someone is always running, and the ball changes feet', () => {
  const { timeline, motion } = regular;
  let stillFrames = 0;
  let frames = 0;
  let prev = null;
  for (let e = 0; e < timeline.duration; e += 100) {
    const pose = motion.at(e);
    const phase = timeline.stateAt(e).phase;
    if (pose && prev && (phase === 'first_half' || phase === 'second_half')) {
      const before = new Map(prev.players.map((p) => [p.playerId, p]));
      const fastest = Math.max(...pose.players.map((p) => { const b = before.get(p.playerId); return b ? Math.hypot(p.x - b.x, p.y - b.y) : 0; }));
      frames++;
      if (fastest < 0.002) stillFrames++; // under about 7 stage px per second
    }
    prev = pose;
  }
  assert.ok(stillFrames / frames < 0.25, `everyone still ${(100 * stillFrames / frames).toFixed(0)}% of the time`);
});

test('the ball arrives with each new carrier exactly as the advance happens', () => {
  const { timeline, motion } = regular;
  let checked = 0;
  for (const [i, { event, at }] of timeline.events.entries()) {
    if (event.type !== 'advance') continue;
    const pose = motion.at(at - 1);
    // Whoever is shown on the ball after it: the advancer, unless a run is on or the sim credited the keeper.
    const shown = motion.shownCarrier(i + 1) ?? event.playerId;
    const carrier = pose?.players.find((p) => p.playerId === shown);
    if (!pose?.ball || !carrier) continue;
    assert.ok(Math.hypot(pose.ball.x - carrier.x, pose.ball.y - carrier.y) < 0.03, `ball not with ${shown} at ${at}`);
    checked++;
  }
  assert.ok(checked > 20);
});

test('passes never travel through players: they go round, or are chipped over (and chips are rare)', () => {
  const { timeline, motion } = regular;
  let through = 0;
  const dist = (/** @type {{ x: number, y: number }} */ a, /** @type {{ x: number, y: number }} */ b) => Math.hypot(a.x - b.x, (a.y - b.y) / 2);
  let passes = 0;
  let chips = 0;
  /** @type {{ from: any, fixed: { x: number, y: number }, frames: any[], start: number } | null} */
  let pass = null;
  /** @type {any} */
  let last = null; // who had the ball last (kept through a burn, which is a turnover)
  for (let e = 0; e < timeline.duration; e += 1000 / 60) {
    const pose = motion.at(e);
    if (pose?.effects.burn) { pass = null; continue; }
    if (!pose?.ball || pose.effects.flight || pose.effects.goal) { pass = null; last = null; continue; }
    // A loose ball (Task 82) isn't a pass: players race for it, so it runs close to them on purpose.
    if (pose.ball.loose) { pass = null; last = null; continue; }
    // Nor is a free shot's dead ball (Task 143): the referee carries it to the mark.
    if (pose.ball.placed) { pass = null; last = null; continue; }
    const ball = pose.ball;
    if (!ball.held) {
      // A big kick (Task 240) that lands at a teammate who plays it straight on, first time: its landing is a touch, so
      // the pass on is from them.
      if (pass && pass.from?.slot === keeperSlot && pass.frames.at(-1)?.ball.lift && !ball.lift) {
        const to = pose.players.reduce((x, q) => (dist(q, ball) < dist(x, ball) ? q : x));
        if (to.side === pass.from.side) {
          passes++;
          [last, pass] = [to, null];
        }
      }
      // A loose ball travels from its passer, or a fixed point (the board after a miss, the net after a goal).
      pass ??= { from: last, fixed: { x: ball.x, y: ball.y }, frames: [], start: e };
      pass.frames.push(pose);
      continue;
    }
    const holder = pose.players.reduce((a, q) => (dist(q, ball) < dist(a, ball) ? q : a));
    // Between teammates only: a turnover goes to whoever won the ball. Passes around a substitution count too (Task 171:
    // they were left out since Task 143, for a keeper subbed at a restart; the ball now goes to where a sub is heading,
    // Task 153, and none of a season's 18,000 passes went through a player).
    if (pass && (!pass.from || pass.from.side === holder.side)) {
      passes++;
      // A keeper's lifted pass is the big kick (Task 240), meant to be common; chips round players stay rare.
      if (pass.frames.some((f) => f.ball.lift) && pass.from?.slot !== keeperSlot) chips++;
      for (const f of pass.frames) {
        if (f.ball.lift) continue;
        // The passer, or where the pass started if they've left the pitch (substituted as they passed).
        const a = (pass.from && f.players.find((/** @type {any} */ q) => q.playerId === pass?.from.playerId)) ?? pass.fixed;
        const b = f.players.find((/** @type {any} */ q) => q.playerId === holder.playerId);
        if ((a && dist(f.ball, a) < PASS_ENDS) || (b && dist(f.ball, b) < PASS_ENDS)) continue;
        if (f.players.some((/** @type {any} */ q) => q.playerId !== pass?.from?.playerId && q.playerId !== holder.playerId && dist(q, f.ball) < PASS_CLEAR)) {
          through++;
          break;
        }
      }
    }
    pass = null;
    last = holder;
  }
  assert.ok(passes > 200, `only ${passes} passes`);
  // Almost never (Task 271 measured a season's 18,000 passes, before and after its new draws: 3 to 11 skim a player,
  // about 1 in 2,000, a few after a blocked shot; the backlog has them). This match's old draws had none.
  assert.ok(through / passes < 1 / 200, `${through} of ${passes} passes go through a player`);
  assert.ok(chips / passes < 0.03, `${chips} of ${passes} passes chipped`);
});

test('a keeper\'s long ball lands with time for the pass on: never a blur of a pass straight after it', () => {
  // Tom: now and then a big kick landed so late that the pass on to the sim's next carrier went back at a blur.
  const STEP = 40;
  for (const m of found.regulars) {
    const { timeline, motion } = setup(m);
    let landed = -Infinity;
    let prev = null;
    for (let e = 0; e < timeline.duration; e += STEP) {
      const pose = motion.at(e);
      const b = pose?.ball;
      if (b && prev) {
        if ((prev.lift ?? 0) > 0 && !b.lift) landed = e;
        const speed = Math.hypot(b.x - prev.x, (b.y - prev.y) / 2) * (1000 / STEP);
        if (e - landed <= 1500 && !pose.effects.flight && !b.lift) assert.ok(speed < 1.6, `${m.id}: ${speed.toFixed(2)} pitch lengths a second at ${e}, ${e - landed} ms after a long ball landed`);
      }
      prev = b;
    }
  }
});

test('the ball spins only while it travels, and a bent pass spins the way it curls', () => {
  const { timeline, motion } = regular;
  let shots = 0;
  let curls = 0;
  let agree = 0;
  /** @type {any[]} */
  let curl = [];
  const settle = () => {
    if (curl.length >= 8) {
      // The heading turns clockwise on screen (y down) when the spin is positive. Measured over the body of the pass:
      // at either end the ball has barely left the passer or reached the receiver (passes ease in and out), so their
      // own steps decide its heading there (Task 88: with wider play, a receiver's run could flip it).
      const heading = (/** @type {any} */ p, /** @type {any} */ q) => Math.atan2(q.y - p.y, q.x - p.x);
      const [q1, q3] = [Math.floor(curl.length * 0.2), Math.floor(curl.length * 0.8)];
      let turn = heading(curl[q3 - 1], curl[q3]) - heading(curl[q1], curl[q1 + 1]);
      turn = Math.atan2(Math.sin(turn), Math.cos(turn));
      curls++;
      if (Math.sign(turn) === Math.sign(curl[0].spin)) agree++;
    }
    curl = [];
  };
  for (let e = 0; e < timeline.duration; e += 1000 / 60) {
    const ball = motion.at(e)?.ball;
    if (ball?.held) assert.ok(!ball.spin, `a held ball spins at ${Math.round(e)} ms`);
    if (ball?.spin && motion.at(e)?.effects.flight) shots++;
    if (ball?.curling) {
      assert.ok(ball.spin, 'a curling ball spins');
      if (curl.length && Math.sign(curl[0].spin) !== Math.sign(ball.spin)) settle();
      curl.push(ball);
    } else settle();
  }
  assert.ok(shots > 0, 'shots spin');
  assert.ok(curls > 20, `only ${curls} bent passes`);
  assert.ok(agree / curls > 0.9, `${agree} of ${curls} bent passes spin the way they curl`);
});

test('runs: now and then a carrier keeps the ball through the advances, sometimes a long way', () => {
  const { timeline, motion } = regular;
  let runs = 0;
  let starts = 0;
  /** @type {string | null} */
  let prev = null;
  for (let i = 1; i <= timeline.events.length; i++) {
    const run = motion.runAfter(i);
    if (['kickoff', 'possession_change', 'advance'].includes(timeline.events[i - 1].event.type) && !prev) starts++;
    if (run && run !== prev) runs++;
    // A runner is shown on the ball for the whole run.
    if (run) assert.equal(motion.shownCarrier(i), run);
    prev = run;
  }
  const share = runs / starts;
  assert.ok(share > animation.runChance / 3 && share < animation.runChance * 1.5, `${runs} runs from ${starts} chances`);
  // The longest stretch one player keeps the ball, along the pitch.
  let longest = 0;
  /** @type {string | null} */
  let holder = null;
  let x0 = 0;
  for (let e = 0; e < timeline.duration; e += 50) {
    const pose = motion.at(e);
    const ball = pose?.ball;
    if (!pose || !ball?.held) { holder = null; continue; }
    const h = pose.players.reduce((a, q) => (Math.hypot(q.x - ball.x, q.y - ball.y) < Math.hypot(a.x - ball.x, a.y - ball.y) ? q : a));
    if (h.playerId !== holder) [holder, x0] = [h.playerId, ball.x];
    longest = Math.max(longest, Math.abs(ball.x - x0));
  }
  assert.ok(longest > 0.4, `the longest carry is only ${longest.toFixed(2)} of the pitch`);
});

test('in the attacking zone a carrier works the ball at the edge of range and steps in to shoot', () => {
  // Over four matches (Task 271: one match's gap runs 0.05–0.12; the old draws' first match was 0.058, the new one's 0.049).
  const working = [];
  const shooting = [];
  for (const m of found.regulars) {
    const { timeline, motion } = setup(m);
    const strikes = timeline.events.filter((t) => t.event.type === 'shot' && !t.event.data.freeShot).map((t) => t.at - animation.shotMs);
    // Fouls that give a free shot: the player on the ball is fouled in the box (Task 143), close to goal on purpose.
    const fouls = timeline.pauses.filter((q) => q.kind === 'free_shot').map((q) => q.at);
    for (let e = 0; e < timeline.duration; e += 100) {
      const s = timeline.stateAt(e);
      const ball = motion.at(e)?.ball;
      if (s.zone !== 'attacking' || s.paused || !ball?.held || !['first_half', 'second_half'].includes(s.phase)) continue;
      // From the goal's centre, in pitch lengths (Task 79: working the ball includes runs to the corner area, close to the
      // goal line but far from the goal).
      const fromGoal = Math.hypot(ball.dir === 1 ? 1 - ball.x : ball.x, (ball.y - 0.5) / 2);
      const toStrike = Math.min(...strikes.filter((t) => t >= e).map((t) => t - e));
      if (Math.min(...fouls.filter((t) => t >= e).map((t) => t - e)) < toStrike) continue;
      if (toStrike <= 200) shooting.push(fromGoal);
      else if (toStrike > 2 * animation.probeMs) working.push(fromGoal);
    }
  }
  const mean = (/** @type {number[]} */ a) => a.reduce((t, v) => t + v, 0) / a.length;
  assert.ok(working.length > 50 && shooting.length > 10);
  // Task 170: a shooter who takes a touch first steps in from their spot as they get the ball, a little further out
  // than a first-time finish (this match: 0.064 apart before, 0.058 after; others 0.09–0.10), so 0.05 (it was 0.06).
  assert.ok(mean(working) > mean(shooting) + 0.05, `working ${mean(working).toFixed(2)} from goal, shooting ${mean(shooting).toFixed(2)}`);
});

test('a breakaway: the player who broke through shoots with the defence beaten behind them', () => {
  const { timeline, motion } = regular;
  let checked = 0;
  for (const { event, at } of timeline.events) {
    if (event.type !== 'shot' || !event.data.breakaway) continue;
    const pose = /** @type {any} */ (motion.at(at - animation.shotMs));
    const shooter = pose.players.find((/** @type {any} */ p) => p.playerId === event.playerId);
    assert.ok(Math.hypot(shooter.x - pose.ball.x, shooter.y - pose.ball.y) < 0.03, 'the breakaway player has the ball');
    // No outfield defender between the ball and goal (other shots usually have two).
    const goalSide = pose.players.filter((/** @type {any} */ p) => p.side !== shooter.side && p.slot !== keeperSlot && (p.x - pose.ball.x) * pose.ball.dir > 0);
    assert.ok(goalSide.length === 0, `${goalSide.length} defenders still goal-side at ${at}`);
    checked++;
  }
  assert.ok(checked > 0);
});

test('a breakaway is quick: the shot comes soon after the break, struck on the run', () => {
  const { timeline, motion } = regular;
  const ev = timeline.events;
  const msPerGameSecond = (config.settings.match.realMinutes * 60_000) / (2 * config.rules.match.halfMinutes * 60);
  const speeds = [];
  ev.forEach(({ event, at }, i) => {
    if (event.type !== 'advance' || !event.data.breakaway) return;
    const shot = ev.slice(i + 1).find((t) => ['shot', 'advance', 'possession_change'].includes(t.event.type));
    if (shot?.event.type !== 'shot' || !shot.event.data.breakaway) return;
    // No later than the sim's breakaway action time (plus a pause, if one fell in between).
    const paused = timeline.pauses.filter((q) => q.at >= at && q.at < shot.at).reduce((t, q) => t + q.ms, 0);
    assert.ok(shot.at - at <= config.rules.match.breakawaySeconds.max * msPerGameSecond + paused + 1, `breakaway shot ${shot.at - at} ms after the break`);
    const strike = shot.at - animation.shotMs;
    const p = (/** @type {number} */ e) => /** @type {any} */ (motion.at(e)).players.find((/** @type {any} */ q) => q.playerId === shot.event.playerId);
    const [a, b] = [p(strike - 300), p(strike - 1)];
    speeds.push(Math.hypot(b.x - a.x, (b.y - a.y) / 2) / 0.3);
  });
  assert.ok(speeds.length > 0);
  // Still running as they shoot (pitch lengths per second), not standing at the spot.
  const sorted = speeds.sort((x, y) => x - y);
  assert.ok(sorted[Math.floor(sorted.length / 2)] > animation.runSpeed * 0.5, `median speed at the shot ${sorted[Math.floor(sorted.length / 2)].toFixed(3)}`);
});

test('nobody passes back to their own keeper for an advance (the keeper playing it out keeps the ball moving forward)', () => {
  const { timeline, motion } = regular;
  for (const [i, { event }] of timeline.events.entries()) {
    if (event.type !== 'advance') continue;
    const s = timeline.stateThrough(i + 1);
    const keeper = [...s.onPitch.home, ...s.onPitch.away].find((p) => p.slot === keeperSlot && p.playerId === motion.shownCarrier(i + 1));
    assert.ok(!keeper, `keeper ${keeper?.playerId} shown on the ball after an advance (event ${i})`);
  }
});

test('shots are in flight just before their moment and land exactly as the score changes', () => {
  const { timeline, motion } = regular;
  for (const { event, at } of timeline.events) {
    if (event.type !== 'goal') continue;
    const flying = motion.at(at - animation.shotMs / 2);
    assert.ok(flying?.effects.flight, 'in flight before the goal');
    assert.notDeepEqual(timeline.stateAt(at - animation.shotMs / 2).score, timeline.stateAt(at).score, 'score not yet changed mid-flight');
    const landed = motion.at(at);
    assert.ok(landed?.ball && (landed.ball.x < 0 || landed.ball.x > 1), 'in the net at the moment of the goal');
  }
});

test('shots fly to the net for goals, wide of the goal for misses', () => {
  const { timeline, motion } = regular;
  for (const { event, at } of timeline.events) {
    if (event.type !== 'goal' && event.type !== 'miss') continue;
    const pose = motion.at(at + 1);
    assert.ok(pose?.ball);
    const ball = /** @type {NonNullable<typeof pose.ball>} */ (pose.ball);
    if (event.type === 'goal') {
      assert.ok(ball.x < 0 || ball.x > 1, `goal not in the net (x=${ball.x.toFixed(3)})`);
      assert.ok(Math.abs(ball.y - 0.5) < 0.1);
      assert.ok(pose.effects.goal);
    } else {
      assert.ok(ball.x === 0 || ball.x === 1);
      assert.ok(Math.abs(ball.y - 0.5) > 0.115, 'a miss goes wide of the mouth');
    }
  }
});

test('a burn flashes at the ball, then the other team has it', () => {
  const { timeline, motion } = regular;
  const burn = timeline.events.find((t) => t.event.type === 'burn');
  if (!burn) return;
  const flash = motion.at(burn.at + animation.burnFlashMs / 2);
  assert.ok(flash?.effects.burn);
  assert.equal(flash?.heat, 100);
  assert.equal(motion.at(burn.at + animation.burnFlashMs + animation.passMs + 1)?.effects.burn, null);
});

test('the ball is hidden during half-time; heat follows the timeline', () => {
  const { timeline, motion } = regular;
  const ht = /** @type {any} */ (timeline.events.find((t) => t.event.type === 'half_time'));
  assert.equal(motion.at(ht.at + 1000)?.ball, null);
  const t = timeline.duration * 0.25;
  const pose = motion.at(t);
  if (pose && !pose.effects.burn && !pose.effects.flight) assert.equal(pose.heat, timeline.stateAt(t).heat);
});

test('shootout: takers at the mark, keeper in goal, others waiting near halfway', { skip: !found.shootout }, () => {
  const { timeline, motion } = setup(found.shootout);
  const kick = /** @type {any} */ (timeline.events.find((t) => t.event.type === 'shootout_kick'));
  const pose = /** @type {NonNullable<ReturnType<typeof motion.at>>} */ (motion.at(kick.at - 1));
  const taker = pose.players.find((p) => p.playerId === kick.event.playerId);
  assert.ok(taker && taker.x > 0.75, 'taker at the mark');
  assert.ok(pose.players.some((p) => p.x > 0.95), 'a keeper in goal');
  assert.ok(pose.players.filter((p) => p.x < 0.75).length >= 7, 'the rest wait near halfway');
  assert.ok(pose.ball && pose.ball.x > 0.75);
});

test('fast enough for every frame, with trails', () => {
  const { timeline, motion } = regular;
  const started = performance.now();
  for (let i = 0; i < 300; i++) motion.at((i / 300) * timeline.duration);
  const perCall = (performance.now() - started) / 300;
  assert.ok(perCall < 2, `${perCall.toFixed(2)} ms per call`);
});

test('a goal pause: the scorer peels away to celebrate, then everyone is back for the restart; the conceding keeper collects the ball', () => {
  const { timeline, motion } = regular;
  const goals = timeline.pauses.filter((q) => q.kind === 'goal');
  assert.ok(goals.length > 0);
  for (const q of goals) {
    const goal = /** @type {any} */ (timeline.events.find((t) => t.at === q.at && t.event.type === 'goal')).event;
    const scorerAt = (/** @type {number} */ e) => /** @type {any} */ (motion.at(e)).players.find((/** @type {any} */ p) => p.playerId === goal.playerId);
    const endPos = scorerAt(q.at + animation.goalCelebrateMs - 1);
    // Above the centre circle, in line with the dugout on the side they scored (Task 65).
    const right = /** @type {any} */ (motion.at(q.at)).ball.x > 0.5;
    assert.ok(Math.abs(endPos.x - (right ? 0.73 : 0.27)) < 0.08 && endPos.y < 0.3, `scorer at ${endPos.x.toFixed(2)}, ${endPos.y.toFixed(2)}`);
    // Only the scoring side joins in: no opponent close by.
    const opp = /** @type {any} */ (motion.at(q.at + animation.goalCelebrateMs - 1)).players.filter((/** @type {any} */ p) => p.side !== endPos.side);
    for (const p of opp) assert.ok(Math.hypot(p.x - endPos.x, (p.y - endPos.y) / 2) > 0.06, `${p.playerId} in the celebration`);
    // Then everyone is back near their spot by the restart (Task 42): nobody still more than about 11 px away.
    const end = /** @type {any} */ (motion.at(q.at + q.ms - 1));
    const restart = /** @type {any} */ (motion.at(q.at + q.ms + 1));
    for (const p of end.players) {
      const r = restart.players.find((/** @type {any} */ x) => x.playerId === p.playerId);
      if (r) assert.ok(Math.hypot(p.x - r.x, (p.y - r.y) / 2) < 0.03, `${p.playerId} still on the way back as play restarts`);
    }
    // Once the ball is out of the net, the conceding keeper has it for the rest of the pause.
    const settled = q.at + animation.goalHoldMs + animation.passMs;
    for (let e = settled; e < q.at + q.ms; e += 250) {
      const pose = /** @type {any} */ (motion.at(e));
      const keeper = pose.players.find((/** @type {any} */ p) => p.slot === keeperSlot && p.side === (goal.teamId === timeline.homeId ? 'away' : 'home'));
      assert.ok(pose.ball.held && Math.hypot(pose.ball.x - keeper.x, pose.ball.y - keeper.y) < 1e-9, `ball with the keeper at ${e}`);
    }
  }
});

test('a substitution pause: the carrier keeps the ball, and the sub runs on from their seat on the bench', () => {
  const { timeline, motion } = regular;
  const subs = timeline.pauses.filter((q) => q.kind === 'substitution');
  assert.ok(subs.length > 0);
  for (const q of subs) {
    const pose = /** @type {any} */ (motion.at(q.at + animation.passMs + 1));
    const later = /** @type {any} */ (motion.at(q.at + q.ms - 1));
    if (pose.ball.held && later.ball.held) {
      const holderOf = (/** @type {any} */ p) => p.players.reduce((a, /** @type {any} */ b) => (Math.hypot(b.x - p.ball.x, b.y - p.ball.y) < Math.hypot(a.x - p.ball.x, a.y - p.ball.y) ? b : a));
      assert.equal(holderOf(pose).playerId, holderOf(later).playerId, 'no pass during the pause');
    }
    const sub = /** @type {any} */ (timeline.events.find((t) => t.at === q.at && t.event.type === 'substitution')).event;
    const on = /** @type {any} */ (motion.at(q.at)).players.find((/** @type {any} */ p) => p.playerId === sub.playerId);
    const seatAt = /** @type {any} */ (seatOf(timeline, sub.playerId));
    assert.ok(Math.abs(on.x - seatAt.x) < 0.02 && Math.abs(on.y - seatAt.y) < 0.02, `the sub starts on the bench (${on.x.toFixed(2)}, ${on.y.toFixed(2)})`);
  }
});

test('kick-offs: everyone in their own half, and only the side kicking off in the centre circle', () => {
  const { timeline, motion } = regular;
  for (const k of timeline.events.filter((t) => t.event.type === 'kickoff')) {
    const kicking = k.event.teamId === timeline.homeId ? 'home' : 'away';
    for (const e of [k.at, k.at + animation.kickoffHoldMs - 50]) {
      const pose = /** @type {any} */ (motion.at(e));
      // The kicking side attacks the way the ball goes from the centre spot; its own half is behind that.
      const kickingDir = homeAttacksRight(timeline.stateAt(k.at).phase) * (kicking === 'home' ? 1 : -1);
      for (const p of pose.players) {
        if (Math.hypot(p.x - pose.ball.x, p.y - pose.ball.y) < 1e-9) continue; // the kicker
        const own = p.side === kicking ? -kickingDir : kickingDir;
        assert.ok((p.x - 0.5) * own > 0, `${p.playerId} (${p.side}) out of their half at the kick-off at ${k.at}`);
        if (p.side === kicking) continue;
        const d = Math.hypot((p.x - 0.5) * 358, (p.y - 0.5) * 179);
        assert.ok(d > 22, `${p.playerId} in the centre circle at the kick-off at ${k.at} (${d.toFixed(1)} px)`);
      }
    }
  }
});

test('kick-offs: the ball on the centre spot, everyone holding still, then play starts', () => {
  const { timeline, motion } = regular;
  const kickoffs = timeline.events.filter((t) => t.event.type === 'kickoff');
  assert.ok(kickoffs.length >= 2);
  for (const k of kickoffs) {
    const a = /** @type {any} */ (motion.at(k.at));
    const b = /** @type {any} */ (motion.at(k.at + animation.kickoffHoldMs - 50));
    assert.ok(Math.hypot(a.ball.x - 0.5, a.ball.y - 0.5) < 0.03, `ball at the centre (${a.ball.x.toFixed(2)}, ${a.ball.y.toFixed(2)})`);
    const before = new Map(a.players.map((/** @type {any} */ p) => [p.playerId, p]));
    // Only the idle sway moves anyone during the hold.
    for (const p of b.players) assert.ok(Math.hypot(p.x - before.get(p.playerId).x, p.y - before.get(p.playerId).y) < 0.01, `${p.playerId} moved during the kick-off hold`);
  }
});

test('half-time: outfield players gather by their bench, keepers change ends, then everyone takes their spot', () => {
  const { timeline, motion } = regular;
  const ht = /** @type {any} */ (timeline.events.find((t) => t.event.type === 'half_time')).at;
  const ko = /** @type {any} */ (timeline.events.filter((t) => t.event.type === 'kickoff')[1]).at;
  const mid = /** @type {any} */ (motion.at(ko - 25_000));
  for (const p of mid.players) {
    if (p.slot === keeperSlot) assert.ok(p.side === 'home' ? p.x > 0.85 : p.x < 0.15, `${p.side} keeper has changed ends`);
    else assert.ok(p.y < 0.2, `${p.playerId} is by the bench (y ${p.y.toFixed(2)})`);
  }
  assert.ok(ko - ht > 25_000);
});

test('after a goal the two teammates nearest the scorer join the celebration', () => {
  const { timeline, motion } = regular;
  let checked = 0;
  for (const q of timeline.pauses.filter((x) => x.kind === 'goal')) {
    const goal = /** @type {any} */ (timeline.events.find((t) => t.at === q.at && t.event.type === 'goal')).event;
    const pose = /** @type {any} */ (motion.at(q.at + animation.goalCelebrateMs - 1));
    const scorer = pose.players.find((/** @type {any} */ p) => p.playerId === goal.playerId);
    const near = pose.players.filter((/** @type {any} */ p) => p.side === scorer.side && p.playerId !== scorer.playerId && Math.hypot(p.x - scorer.x, (p.y - scorer.y) / 2) < 0.1);
    if (near.length >= 1) checked++;
  }
  assert.ok(checked >= timeline.pauses.filter((x) => x.kind === 'goal').length * 0.7, `${checked} celebrations with teammates`);
});

/**
 * Moments of play in a match (not pauses or breaks), with the ball seen from the team on it, attacking left to right.
 * @param {{ timeline: any, motion: any }} m @param {string} homeId
 */
function playMoments({ timeline, motion }, homeId) {
  const out = [];
  for (let e = 0; e < timeline.duration; e += 100) {
    const s = timeline.stateAt(e);
    if (!['first_half', 'second_half', 'overtime'].includes(s.phase) || s.paused || !s.possession) continue;
    const pose = motion.at(e);
    if (!pose?.ball) continue;
    const dir = (s.possession === homeId ? 1 : -1) * homeAttacksRight(s.phase);
    out.push({ e, a: dir === 1 ? pose.ball.x : 1 - pose.ball.x, y: pose.ball.y });
  }
  return out;
}
const inAttackingCorner = (/** @type {{ a: number, y: number }} */ m) => m.a > 5 / 6 && (m.y < 0.25 || m.y > 0.75);

test('wide play (Task 79): the ball goes down the flanks and into the attacking corner areas, and shots come from there', () => {
  const moments = playMoments(regular, found.regulation.homeId);
  const wide = moments.filter((m) => m.y < 0.25 || m.y > 0.75).length / moments.length;
  assert.ok(wide > 0.3, `ball wide ${(100 * wide).toFixed(1)}% of play`);
  // Separate visits to an attacking corner area, and shots within 4 s after one (a cut-back or a cut-in).
  const visits = moments.filter((m, i) => inAttackingCorner(m) && !(i > 0 && inAttackingCorner(moments[i - 1]))).map((m) => m.e);
  assert.ok(visits.length >= 10, `${visits.length} corner area visits`);
  const shotsAfter = regular.timeline.events.filter((/** @type {any} */ t) => t.event.type === 'shot' && visits.some((v) => v <= t.at && v > t.at - 4000));
  assert.ok(shotsAfter.length >= 3, `${shotsAfter.length} shots after a corner area visit`);
});

test('wide play is the settings\' choice: with no flank play the attacking corner areas stay empty', () => {
  const m = found.regulation;
  const timeline = createTimeline(m, config);
  const play = { ...config.settings.play, flankChance: 0, wideOutletChance: 0 };
  const motion = createMotion(timeline, { matchId: m.id, homeId: m.homeId, keeperSlot, animation, play });
  const moments = playMoments({ timeline, motion }, m.homeId);
  const corner = moments.filter(inAttackingCorner).length / moments.length;
  assert.ok(corner < 0.01, `attacking corner areas ${(100 * corner).toFixed(1)}% of play`);
});

test('the keeper\'s outlet (Task 88): a turnover straight after a restart happens on an outfield player, never the keeper', async () => {
  const { firstMatches } = await import('../src/channel/pitchmap.js');
  let checked = 0;
  for (const m of firstMatches(config, 'motion-outlet', 10)) {
    const ev = m.timeline.events;
    for (let i = 1; i < ev.length; i++) {
      const e = /** @type {any} */ (ev[i].event);
      if (e.type !== 'possession_change' || e.data.reason !== 'tackle') continue;
      let j = i - 1;
      while (j > 0 && ['heat_stage', 'foul'].includes(ev[j].event.type)) j--;
      const before = /** @type {any} */ (ev[j].event);
      if (!(before.type === 'possession_change' && ['goal', 'miss', 'save'].includes(before.data.reason))) continue;
      const pose = /** @type {any} */ (m.motion.at(ev[i].at - 60));
      const losing = before.teamId === m.homeId ? 'home' : 'away';
      const near = pose.players.filter((/** @type {any} */ p) => p.side === losing)
        .reduce((/** @type {any} */ a, /** @type {any} */ p) => (Math.hypot(p.x - pose.ball.x, p.y - pose.ball.y) < Math.hypot(a.x - pose.ball.x, a.y - pose.ball.y) ? p : a));
      assert.notEqual(near.slot, keeperSlot, `the keeper is on the ball as it's lost at ${ev[i].at}`);
      checked++;
    }
  }
  assert.ok(checked >= 3, `${checked} turnovers after restarts checked`);
});

test('the soft offside (Task 80): attackers off the ball stay near the line, outside breakaways', async () => {
  const { addMatch, emptyMap, measures } = await import('../src/channel/pitchmap.js');
  // Pooled over the season's first eight matches (Task 175): one match alone runs anywhere from 0.5% to 2.5%.
  const byMatch = new Map();
  const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId))?.push(e); }] });
  runSeason(createLeague(config, 'motion-tests', log), config, log);
  let map = emptyMap();
  for (const [id, events] of [...byMatch].slice(0, 8)) {
    const r = events.at(-1).data;
    const tl = createTimeline({ id, events, homeId: r.homeId, awayId: r.awayId }, config);
    map = addMatch(map, tl, createMotion(tl, { matchId: id, homeId: r.homeId, keeperSlot, animation, play: config.settings.play }), { homeId: r.homeId, keeperSlot });
  }
  const m = measures(map, config.settings.play.tether);
  assert.ok(m.tetherBreach < 0.015, `an attacker off the ball past the tether in ${(100 * m.tetherBreach).toFixed(1)}% of play`);
});

test('the tether in the formation: nobody off the ball more than the tether beyond the line or the ball', () => {
  const { reach, drop } = { reach: config.settings.play.tether, drop: config.settings.play.lineDrop };
  let checked = 0;
  for (let i = 1; i <= regular.timeline.events.length; i += 3) {
    const s = regular.timeline.stateThrough(i);
    if (!s.possession || !['first_half', 'second_half'].includes(s.phase) || s.last?.event.type === 'kickoff') continue;
    for (const probe of [0, 2]) {
      const f = formation(s, { matchId: found.regulation.id, homeId: found.regulation.homeId, keeperSlot, elapsed: null, probe, press: 1, tether: { reach, drop } });
      const att = s.possession === found.regulation.homeId ? 'home' : 'away';
      const dir = (att === 'home' ? 1 : -1) * homeAttacksRight(s.phase);
      const along = (/** @type {{ x: number }} */ p) => (dir === 1 ? p.x : 1 - p.x);
      const line = Math.max(along(f.ball), ...f.players.filter((p) => p.side !== att && p.slot !== keeperSlot).map(along));
      for (const p of f.players) {
        if (p.side !== att || p.slot === keeperSlot || p.playerId === f.carrierId) continue;
        // Teammates nudging apart can move a player a hair past it.
        assert.ok(along(p) <= line + reach + 0.02, `${p.slot} ${(along(p) - line).toFixed(3)} beyond the line`);
        checked++;
      }
    }
  }
  assert.ok(checked > 100);
});

test('loose balls (Task 82): blocks and parried saves run loose, the nearest opponent chases, and the player the sim chose gets there first', () => {
  const { timeline, motion } = regular;
  const d = (/** @type {any} */ a, /** @type {any} */ b) => Math.hypot(a.x - b.x, (a.y - b.y) / 2);
  let fromShots = 0;
  let races = 0;
  let wasLoose = false;
  /** @type {any[]} */
  let beat = [];
  for (let e = 0; e < timeline.duration; e += 1000 / 60) {
    const pose = /** @type {any} */ (motion.at(e));
    const loose = Boolean(pose?.ball?.loose);
    if (loose && !wasLoose) {
      const last = timeline.events[timeline.countAt(e) - 1];
      beat = timeline.events.filter((/** @type {any} */ x) => x.at === last.at).map((/** @type {any} */ x) => x.event);
      if (beat.some((x) => x.type === 'block' || x.type === 'save')) fromShots++;
    }
    if (!loose && wasLoose && pose?.ball?.held) {
      // Who has it now: the sim's player when the defenders won it; one of the attackers when they kept it.
      const holder = pose.players.reduce((/** @type {any} */ a, /** @type {any} */ q) => (d(q, pose.ball) < d(a, pose.ball) ? q : a));
      const won = beat.find((x) => x.type === 'possession_change');
      const onBall = (won?.teamId ?? beat.find((x) => x.type === 'shot')?.teamId) === found.regulation.homeId ? 'home' : 'away';
      if (won) assert.equal(holder.playerId, won.playerId, `the sim's player wins the race at ${Math.round(e)}`);
      else assert.equal(holder.side, onBall, `the attackers keep it at ${Math.round(e)}`);
      // An opponent was racing for it, and pulled up close by.
      const chaser = pose.players.filter((/** @type {any} */ q) => q.side !== holder.side && q.slot !== keeperSlot).reduce((/** @type {any} */ a, /** @type {any} */ q) => (d(q, pose.ball) < d(a, pose.ball) ? q : a));
      if (d(chaser, pose.ball) < 0.1) races++;
    }
    wasLoose = loose;
  }
  const blocksAndParries = timeline.events.filter((/** @type {any} */ x) => x.event.type === 'block' || (x.event.type === 'save' && x.event.data.parried)).length;
  assert.ok(fromShots >= blocksAndParries * 0.8, `${fromShots} loose balls from ${blocksAndParries} blocks and parried saves`);
  assert.ok(races >= fromShots * 0.7, `${races} races`);
});

test('the bubble check (Task 83): TACKLE!, STEAL! and BLOCK! are over the player the picture shows doing it', async () => {
  const { firstMatches } = await import('../src/channel/pitchmap.js');
  const d = (/** @type {any} */ a, /** @type {any} */ b) => Math.hypot(a.x - b.x, (a.y - b.y) / 2);
  /** Distance from p to the segment a–b, in pitch lengths. @param {any} p @param {any} a @param {any} b */
  const toSegment = (p, a, b) => {
    const [ax, ay, bx, by, px, py] = [a.x, a.y / 2, b.x, b.y / 2, p.x, p.y / 2];
    const len = (bx - ax) ** 2 + (by - ay) ** 2;
    const t = len ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len)) : 0;
    return Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)));
  };
  const tally = { tackle: [0, 0], steal: [0, 0], block: [0, 0] };
  // 30 matches (Task 237): the steal rate runs 95–96%, right on the 95% bar, so 12 (Task 233; 6 before) still dipped
  // under it by chance (94.3% once momentum changed the matches; 95.4% over 30, 95.6% without momentum).
  for (const m of firstMatches(config, 'bubble-tests', 30)) {
    for (const t of m.timeline.events) {
      const e = /** @type {any} */ (t.event);
      if (e.type === 'possession_change' && e.data.reason === 'tackle') {
        const pose = /** @type {any} */ (m.motion.at(t.at - 1));
        const me = pose?.players.find((/** @type {any} */ p) => p.playerId === e.playerId);
        if (!me || !pose.ball) continue;
        let ok = d(me, pose.ball) <= 0.04;
        if (e.data.steal && !ok) {
          // In the lane from the ball to the passer's nearest teammate.
          const mates = pose.players.filter((/** @type {any} */ p) => p.side !== me.side && p.slot !== keeperSlot && d(p, pose.ball) > 0.02);
          const mate = mates.reduce((/** @type {any} */ a, /** @type {any} */ p) => (d(p, pose.ball) < d(a, pose.ball) ? p : a), mates[0]);
          ok = Boolean(mate) && toSegment(me, pose.ball, mate) <= 0.04;
        }
        const k = e.data.steal ? 'steal' : 'tackle';
        tally[k][0] += ok ? 1 : 0;
        tally[k][1]++;
      }
      if (e.type === 'block') {
        const pose = /** @type {any} */ (m.motion.at(t.at - animation.shotMs));
        const me = pose?.players.find((/** @type {any} */ p) => p.playerId === e.playerId);
        if (!me || !pose.ball) continue;
        tally.block[0] += toSegment(me, pose.ball, { x: pose.ball.dir === 1 ? 1 : 0, y: 0.5 }) <= 0.04 ? 1 : 0;
        tally.block[1]++;
      }
    }
  }
  for (const [k, [ok, all]] of Object.entries(tally)) assert.ok(all > 10 && ok / all >= 0.95, `${k}: ${ok} of ${all} bubbles over the right player`);
});

test('a golden goal (Task 147): struck in the attacking half, then a celebration with the ball in the net and the team round the scorer', { skip: !found.overtime }, () => {
  const { timeline, motion } = setup(found.overtime);
  const goal = /** @type {any} */ (timeline.events.find((t) => t.at === timeline.goldenAt && t.event.type === 'goal'));
  const pause = /** @type {any} */ (timeline.pauses.find((q) => q.at === timeline.goldenAt));
  assert.ok(goal && pause && pause.kind === 'goal', 'paused like any goal');
  // The shot leaves from the half the scorer attacks.
  const struck = /** @type {any} */ (motion.at(goal.at - animation.shotMs + 1));
  const net = /** @type {any} */ (motion.at(goal.at + 10)).ball;
  assert.ok(struck.effects.flight && Math.abs(struck.ball.x - net.x) < 0.5, `struck at ${struck.ball.x.toFixed(2)}, in at ${net.x.toFixed(2)}`);
  // The ball stays in the net, and the scorer's team gathers round them.
  const late = /** @type {any} */ (motion.at(goal.at + pause.ms - 100));
  assert.ok(Math.hypot(late.ball.x - net.x, late.ball.y - net.y) < 1e-9, 'still in the net');
  const scorer = late.players.find((/** @type {any} */ p) => p.playerId === goal.event.playerId);
  const mates = late.players.filter((/** @type {any} */ p) => p.side === scorer.side && p !== scorer);
  for (const p of mates) assert.ok(Math.hypot(p.x - scorer.x, (p.y - scorer.y) / 2) < 0.08, `${p.playerId} mobbing the scorer`);
  assert.equal(timeline.stateAt(goal.at + pause.ms).phase, 'finished');
});

test('a pass takes longer the further it goes (Task 169): short ones at passMs, a cross longer, none past passMaxMs', async () => {
  const { passDuration } = await import('../src/channel/motion.js');
  const a = config.settings.animation;
  assert.equal(passDuration(0.1, a), a.passMs);
  const cross = passDuration(0.5, a);
  assert.ok(cross > a.passMs && cross < a.passMaxMs, `a cross across the pitch: ${cross} ms`);
  assert.equal(passDuration(1.2, a), a.passMaxMs);
  assert.ok(passDuration(0.3, a) <= passDuration(0.4, a));
});

test('not every goal first time (Task 170): some shooters have the ball a moment before the strike', () => {
  let touched = 0;
  let shots = 0;
  for (const m of [regular]) {
    for (const t of m.timeline.events) {
      if (t.event.type !== 'shot' || t.event.data.freeShot || t.event.data.breakaway) continue;
      shots++;
      const strike = t.at - animation.shotMs;
      if (m.motion.holderAt(strike - 1) === t.event.playerId && m.motion.holderAt(strike - animation.touchMinMs + 50) === t.event.playerId) touched++;
    }
  }
  assert.ok(touched > shots * 0.1 && touched < shots * 0.9, `${touched} of ${shots} shots after a touch`);
});

test('Task 253: a breakaway is one burst (no standing on the ball first) and the runner is alone past the defence', () => {
  const { timeline, motion } = regular;
  const ev = timeline.events;
  let checked = 0;
  ev.forEach(({ event, at }, i) => {
    if (event.type !== 'advance' || !event.data.breakaway) return;
    const shot = ev.slice(i + 1).find((t) => ['shot', 'possession_change'].includes(t.event.type));
    if (shot?.event.type !== 'shot') return;
    const runner = shot.event.playerId;
    const p = (/** @type {number} */ e) => /** @type {any} */ (motion.at(e)).players.find((/** @type {any} */ q) => q.playerId === runner);
    // Moving in the half second before the break.
    const [a, b] = [p(at - 500), p(at)];
    assert.ok(Math.hypot(b.x - a.x, b.y - a.y) > 0.01, `the runner stood still before the breakaway at ${at}`);
    // Nobody else on their side past the last outfield defender as they strike it.
    const pose = /** @type {any} */ (motion.at(shot.at - animation.shotMs));
    const me = p(shot.at - animation.shotMs);
    const dir = pose.ball.dir;
    const defenders = pose.players.filter((/** @type {any} */ q) => q.side !== me.side && q.slot !== keeperSlot);
    const last = dir === 1 ? Math.max(...defenders.map((/** @type {any} */ q) => q.x)) : Math.min(...defenders.map((/** @type {any} */ q) => q.x));
    const alone = pose.players.filter((/** @type {any} */ q) => q.side === me.side && q.slot !== keeperSlot && q.playerId !== runner && (q.x - last) * dir > 0.02);
    assert.equal(alone.length, 0, `a second attacker past the defence at ${shot.at}`);
    checked++;
  });
  assert.ok(checked > 0);
});

test('Task 254: hardly a pass is played to a teammate standing offside (beyond the last defender, in their half)', () => {
  const limit = config.settings.play.tether + 0.02;
  let passes = 0;
  let offside = 0;
  for (const { timeline, motion } of firstMatches(config, 'tether', 8)) {
    /** @type {string | null} */
    let last = null;
    let lastAt = 0;
    for (let e = 0; e < timeline.duration; e += 50) {
      const h = motion.holderAt?.(e) ?? null;
      if (h && last && h !== last) {
        const s = timeline.stateAt(lastAt);
        const pose = /** @type {any} */ (motion.at(lastAt));
        const rec = pose?.players.find((/** @type {any} */ p) => p.playerId === h);
        const from = pose?.players.find((/** @type {any} */ p) => p.playerId === last);
        // A pass between teammates in play, not on a breakaway (the defence is beaten then).
        const breakaway = timeline.events.some((t) => t.event.type === 'advance' && /** @type {any} */ (t.event.data)?.breakaway && t.at <= lastAt && lastAt - t.at < 3000);
        if (rec && from && rec.side === from.side && s.possession && !breakaway) {
          const dir = (rec.side === 'home' ? 1 : -1) * homeAttacksRight(s.phase);
          const along = (/** @type {{ x: number }} */ p) => (dir === 1 ? p.x : 1 - p.x);
          const line = Math.max(...pose.players.filter((/** @type {any} */ p) => p.side !== rec.side && p.slot !== keeperSlot).map(along));
          passes++;
          if (along(rec) > 0.5 && along(rec) - Math.max(line, along(pose.ball)) > limit) offside++;
        }
      }
      if (h) [last, lastAt] = [h, e];
    }
  }
  // About 1 pass in 900 since Task 254 (60 matches); it was 1 in 130.
  assert.ok(passes > 1000);
  assert.ok(offside / passes < 0.004, `${offside} of ${passes} passes to a teammate offside`);
});

test('the shootout staged (Task 277b): each taker walks up and strikes from the mark, a keeper in goal, nobody jumps', { skip: !found.shootout }, () => {
  const timeline = createTimeline(found.shootout, config);
  const motion = createMotion(timeline, { matchId: found.shootout.id, homeId: found.shootout.homeId, keeperSlot, animation, play: config.settings.play });
  const kicks = timeline.events.filter((t) => t.event.type === 'shootout_kick');
  for (const kick of kicks) {
    const struck = kick.at - animation.shotMs;
    const pose = /** @type {NonNullable<ReturnType<typeof motion.at>>} */ (motion.at(struck));
    const taker = pose.players.find((p) => p.playerId === kick.event.playerId);
    assert.ok(taker && taker.x > 0.78 && Math.abs(taker.y - 0.5) < 0.03, 'the taker at the mark as they strike');
    assert.ok(pose.players.some((p) => p.slot === keeperSlot && p.x > 0.95), 'a keeper in goal');
    assert.equal(motion.actionAt(struck + 10, config.settings.poses).kick?.playerId, kick.event.playerId);
  }
  // From the first kick to the final whistle, every 50 ms: everyone on the pitch, nobody moving faster than a sprint.
  /** @type {Map<string, { x: number, y: number }>} */
  let before = new Map();
  for (let e = kicks[0].at - 20_000; e < timeline.duration; e += 50) {
    const pose = /** @type {NonNullable<ReturnType<typeof motion.at>>} */ (motion.at(e));
    for (const p of pose.players) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && p.x > 0 && p.x < 1 && p.y > 0 && p.y < 1, `${p.playerId} on the pitch at ${e}`);
      const b = before.get(p.playerId);
      if (b && timeline.stateAt(e - 50).phase.startsWith('shootout')) assert.ok(Math.hypot(p.x - b.x, (p.y - b.y) / 2) < 0.012, `${p.playerId} jumps at ${e}`);
    }
    before = new Map(pose.players.map((p) => [p.playerId, { x: p.x, y: p.y }]));
  }
});

test('bending shots (Tom; off for now, share 0): at a quarter, from their own stream, each ending where a straight one would', () => {
  assert.equal(animation.shotBend.share, 0, 'off until revisited (Tom)');
  const s = { ...animation.shotBend, share: 0.25 };
  const a = { x: 0.6, y: 0.4 };
  const b = { x: 1, y: 0.52 };
  const bends = Array.from({ length: 2000 }, (_, i) => shotBendOf(a, b, `m|shotbend|${i}`, s).bend);
  const share = bends.filter((x) => x !== 0).length / bends.length;
  assert.ok(Math.abs(share - s.share) < 0.04, `share ${share}`);
  assert.ok(bends.some((x) => x > 0) && bends.some((x) => x < 0), 'both ways');
  assert.ok(bends.every((x) => Math.abs(x) <= s.max + 1e-12));
  assert.deepEqual(shotBendOf(a, b, 'x', undefined), { nx: 0, ny: 0, bend: 0 });
  // In a real match: mid-flight a bent shot is off the straight line, and lands where the straight one would.
  const { timeline } = regular;
  const motion = createMotion(timeline, { matchId: found.regulation.id, homeId: found.regulation.homeId, keeperSlot, animation: { ...animation, shotBend: s }, play: config.settings.play });
  const straight = createMotion(timeline, { matchId: found.regulation.id, homeId: found.regulation.homeId, keeperSlot, animation: { ...animation, shotBend: { ...s, share: 0 } }, play: config.settings.play });
  const shots = timeline.events.filter((t) => t.event.type === 'shot' && !(/** @type {any} */ (t.event.data)?.freeShot));
  let bent = 0;
  for (const { at } of shots) {
    const mid = at - animation.shotMs / 2;
    const [m1, m0] = [motion.at(mid)?.ball, straight.at(mid)?.ball];
    if (m1 && m0 && Math.hypot(m1.x - m0.x, m1.y - m0.y) > 0.005) bent++;
    // Leaving the foot straight (Tom): early in the flight it's hardly off the line, two thirds along it's at its widest.
    const off = (/** @type {number} */ f) => { const [x, y] = [motion.at(at - animation.shotMs * (1 - f))?.ball, straight.at(at - animation.shotMs * (1 - f))?.ball]; return x && y ? Math.hypot(x.x - y.x, x.y - y.y) : 0; };
    if (off(2 / 3) > 0.01) assert.ok(off(0.15) < 0.15 * off(2 / 3), 'straight off the foot');
    const [e1, e0] = [motion.at(at - 1)?.ball, straight.at(at - 1)?.ball];
    if (e1 && e0) assert.ok(Math.hypot(e1.x - e0.x, e1.y - e0.y) < 0.01, 'lands where it would');
  }
  assert.ok(bent > 0 && bent < shots.length, `${bent} of ${shots.length} bent`);
});
