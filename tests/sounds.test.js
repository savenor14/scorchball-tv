import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { createMotion } from '../src/channel/motion.js';
import { cueKey, cuesBetween, eventCues, kickCues, leadWindow, resumeCues } from '../src/channel/sounds.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { animation } = config.settings;

/** @type {Map<string, any[]>} */
const byMatch = new Map();
const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId))?.push(e); }] });
const league = createLeague(config, 'sounds-tests', log);
runSeason(league, config, log);
const matches = [...byMatch].slice(0, 2).map(([id, events]) => {
  const r = events.at(-1).data;
  const timeline = createTimeline({ id, events, homeId: r.homeId, awayId: r.awayId }, config);
  const motion = createMotion(timeline, { matchId: id, homeId: r.homeId, keeperSlot: config.positions.keeper, animation, play: config.settings.play });
  return { id, timeline, motion, events: eventCues(timeline, { matchId: id, shotMs: animation.shotMs }) };
});

test('every whistle, shot, goal, save, block, foul, burn and substitution has its sound, at its moment', () => {
  for (const { timeline, events } of matches) {
    const at = (/** @type {string} */ kind, /** @type {number} */ t) => events.some((c) => c.kind === kind && c.at === t);
    for (const { event: e, at: t } of timeline.events) {
      if (e.type === 'kickoff' || e.type === 'foul') assert.ok(at('whistle', t), `${e.type} whistle at ${t}`);
      if (e.type === 'shot') assert.ok(at('shot', Math.max(0, t - animation.shotMs)), `shot struck before ${t}`);
      if (e.type === 'goal') assert.ok(at('net', t) && events.some((c) => c.kind === 'whistle' && c.at > t && c.at < t + 2000), `goal at ${t}`);
      if (e.type === 'save') assert.ok(events.some((c) => c.kind === 'save' && c.at === t && c.held === !(/** @type {any} */ (e.data).parried)), `save at ${t}`);
      for (const kind of /** @type {const} */ (['block', 'burn'])) if (e.type === kind) assert.ok(at(kind, t), `${kind} at ${t}`);
      if (e.type === 'substitution') assert.ok(events.some((c) => c.kind === 'whistle' && c.at === t && c.blast === 'short'), 'a whistle for a substitution');
    }
    // Play restarting after a substitution (Tom, 2026-10-20): a short whistle as its pause ends.
    const subPauses = timeline.pauses.filter((q) => q.kind === 'substitution');
    assert.ok(subPauses.length > 0, 'a substitution pause to check');
    for (const q of subPauses) assert.ok(events.some((c) => c.kind === 'whistle' && c.at === q.at + q.ms && c.blast === 'short'), `restart whistle at ${q.at + q.ms}`);
    // Full time: three blasts, exactly once, at the end; half-time a long one.
    const end = events.filter((c) => c.kind === 'whistle' && c.blast === 'full_time');
    assert.equal(end.length, 1);
    assert.ok(events.some((c) => c.kind === 'whistle' && c.blast === 'long'));
  }
});

test('the post rings only when a miss is seen to shave a post', () => {
  let misses = 0;
  let rings = 0;
  for (const { timeline, motion, events } of matches) {
    for (const { event: e, at } of timeline.events) {
      if (e.type !== 'miss') continue;
      misses++;
      const ring = events.some((c) => c.kind === 'post' && c.at === at);
      if (ring) rings++;
      const ball = motion.at(at)?.ball;
      if (ball) assert.equal(Math.abs(ball.y - 0.5) < 0.13, ring, `miss at ${at}, ${Math.abs(ball.y - 0.5).toFixed(3)} off the middle`);
    }
  }
  assert.ok(rings > 0 && rings / misses < 0.25, `${rings} of ${misses} misses ring`);
});

test('kicks: the ball leaving a player\'s feet makes a kick, often, never at a shot\'s flight', () => {
  for (const { id, timeline, motion, events } of matches) {
    const kicks = kickCues(motion, 0, timeline.duration, id);
    const perMinute = kicks.length / (timeline.duration / 60_000);
    assert.ok(perMinute > 8 && perMinute < 40, `${perMinute.toFixed(1)} kicks a minute`);
    for (const k of kicks) {
      assert.ok(k.power !== undefined && k.power >= 0 && k.power <= 1.2);
      const shot = events.find((c) => c.kind === 'shot' && Math.abs(c.at - k.at) < 20);
      assert.equal(shot, undefined, `a kick on a shot at ${k.at}`);
    }
  }
});

test('a foul\'s restart (not a free shot) is heard: a kick as the ball is rolled from the spot', () => {
  let fouls = 0;
  for (const { id, timeline, motion } of matches) {
    for (const p of timeline.pauses) {
      if (p.kind !== 'foul') continue;
      fouls++;
      const end = p.at + p.ms;
      const kicks = kickCues(motion, end - 500, end + 1500, id);
      assert.ok(kicks.length > 0, `no kick as play restarts after the foul at ${p.at} in ${id}`);
    }
  }
  assert.ok(fouls > 0, 'no fouls with a pause to check');
});

test('the same sounds play however the time is split into frames, and the same every time', () => {
  const { id, motion, events } = matches[0];
  const from = 120_000;
  const to = 150_000;
  const whole = cuesBetween(events, motion, from, to, id);
  /** @type {import('../src/channel/sounds.js').Cue[]} */
  const framed = [];
  for (let t = from; t < to;) {
    const next = Math.min(to, t + 16.7 + (t % 7));
    framed.push(...cuesBetween(events, motion, t, next, id));
    t = next;
  }
  assert.deepEqual(framed, whole);
  assert.ok(whole.length > 5, 'something happens in half a minute');
  assert.deepEqual(cuesBetween(events, motion, from, to, id), whole);
});

test('coming back to the tab (Task 154): one of each kind restarts, the latest, and nothing still ringing starts again', () => {
  // A goal's cheer: four staggered roars (3.9 s each); an anthem under way; a short ooh long over.
  const roars = [0, 2400, 4600, 6600].map((t) => ({ kind: /** @type {const} */ ('roar'), at: 10_000 + t, seed: `r${t}` }));
  const anthem = { kind: /** @type {const} */ ('anthem'), at: 5_000, seed: 'a' };
  const ooh = { kind: /** @type {const} */ ('ooh'), at: 1_000, seed: 'o' };
  const cues = [ooh, anthem, ...roars];
  const dur = (/** @type {any} */ c) => ({ roar: 3900, anthem: 9800, ooh: 1500 })[/** @type {'roar'} */ (c.kind)];
  const o = { lookbackMs: 90_000, minMs: 400 };
  // Back 4.8 s into the cheer, nothing ringing (away long enough): one roar (the latest under way) and the anthem's end.
  const back = resumeCues(cues, 14_800 - 400 - 1, dur, () => false, o);
  assert.deepEqual(back.map(cueKey).sort(), [cueKey(anthem), cueKey(roars[1])].sort());
  // The anthem still ringing from before the jump: not started again on top of itself.
  const ringing = resumeCues(cues, 14_000, dur, (c) => c === anthem, o);
  assert.ok(!ringing.includes(anthem) && ringing.some((c) => c.kind === 'roar'));
});

test('the lead moves the window ahead, but a hand-over keeps the cues at its very start (the kick-off whistle)', () => {
  assert.deepEqual(leadWindow([1000, 1016], 150), [1150, 1166]);
  const [from, to] = leadWindow([-1, 16], 150);
  assert.equal(from, -1);
  assert.equal(to, 166);
  // The kick-off whistle sits at 0: inside the hand-over's window, as it was before the lead.
  assert.ok(0 > from && 0 <= to);
});
