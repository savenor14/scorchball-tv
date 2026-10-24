import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createMotion } from '../src/channel/motion.js';
import { benchCheer, benchesAtKickoff, BENCH_Y, celebrationAt, dugoutProps, gateOpen, PROP_W, seat, sidelinesAt } from '../src/channel/sidelines.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const { animation } = config.settings;
const keeperSlot = config.positions.keeper;
const slots = createCalendar(config).slots(1);
const live = new LiveLeague(config, { now: slots[slots.length - 1].kickoff, seed: 'sideline-tests' });
const matches = live.matchesIn(1).slice(0, 20).map((m) => {
  const timeline = createTimeline(m, config);
  const motion = createMotion(timeline, { matchId: m.id, homeId: m.homeId, keeperSlot, animation, play: config.settings.play });
  const posAt = (/** @type {string} */ id, /** @type {number} */ e) => motion.at(e)?.players.find((p) => p.playerId === id) ?? null;
  return { m, timeline, motion, posAt };
});

test('seats: both above the pitch, home out to the left, away out to the right, the middle open', () => {
  assert.ok(seat('home', 0).x < 0.5 && seat('home', 1).x < seat('home', 0).x);
  assert.ok(seat('away', 0).x > 0.5 && seat('away', 1).x > seat('away', 0).x);
  assert.equal(seat('home', 2).y, BENCH_Y.home);
  assert.ok(BENCH_Y.home < 0 && BENCH_Y.away < 0);
  assert.ok(seat('home', 0).x < 0.4 && seat('away', 0).x > 0.6, 'the middle of the touchline stays open');
});

test('at kick-off each bench holds the sim\'s substitutes, seated in order', () => {
  for (const { timeline, posAt } of matches) {
    const start = benchesAtKickoff(timeline);
    // Up to matchday − 5 each (fewer when a squad is short through injury).
    assert.ok(start.home.length > 0 && start.home.length <= config.rules.roster.matchday - 5);
    const s = sidelinesAt(timeline, 0, { posAt, jogSpeed: animation.jogSpeed });
    assert.deepEqual(s.filter((p) => p.side === 'home').map((p) => p.playerId), start.home);
    assert.ok(s.every((p) => !p.walking && p.y === BENCH_Y[p.side]));
  }
});

test('nobody is on the pitch and the bench at once; whoever comes off walks to the bench and sits', () => {
  let subs = 0;
  for (const { timeline, posAt } of matches) {
    const ctx = { posAt, jogSpeed: animation.jogSpeed };
    for (const { event: e, at } of timeline.events.filter((t) => t.event.type === 'substitution')) {
      subs++;
      const offId = /** @type {any} */ (e.data).offId;
      const during = sidelinesAt(timeline, at + 500, ctx);
      assert.ok(!during.some((p) => p.playerId === e.playerId), 'the incoming player has left the bench');
      const walker = during.find((p) => p.playerId === offId);
      assert.ok(walker, 'the outgoing player is on the sidelines');
      const later = /** @type {any} */ (sidelinesAt(timeline, at + 60_000, ctx).find((p) => p.playerId === offId));
      assert.equal(later.y, BENCH_Y[later.side], 'and is sitting on the bench a minute later');
      assert.ok(!later.walking);
    }
    for (const e of [0, timeline.duration / 3, timeline.duration / 2, timeline.duration - 1]) {
      const onPitch = new Set([...timeline.stateAt(e).onPitch.home, ...timeline.stateAt(e).onPitch.away].map((p) => p.playerId));
      for (const p of sidelinesAt(timeline, e, ctx)) assert.ok(!onPitch.has(p.playerId), `${p.playerId} on the pitch and the bench`);
    }
  }
  assert.ok(subs > 20, `${subs} substitutions checked`);
});

test('walking off is continuous: from the pitch to the seat without jumps', () => {
  const { timeline, posAt } = /** @type {any} */ (matches.find((x) => x.timeline.events.some((t) => t.event.type === 'substitution')));
  const sub = timeline.events.find((/** @type {any} */ t) => t.event.type === 'substitution');
  const offId = sub.event.data.offId;
  const ctx = { posAt, jogSpeed: animation.jogSpeed };
  const start = /** @type {any} */ (posAt(offId, sub.at - 1));
  const first = /** @type {any} */ (sidelinesAt(timeline, sub.at, ctx).find((p) => p.playerId === offId));
  assert.ok(Math.hypot(first.x - start.x, first.y - start.y) < 1e-9, 'starts where they were on the pitch');
  let prev = first;
  for (let e = sub.at + 50; e < sub.at + 20_000; e += 50) {
    const p = /** @type {any} */ (sidelinesAt(timeline, e, ctx).find((q) => q.playerId === offId));
    assert.ok(Math.hypot(p.x - prev.x, p.y - prev.y) < 0.01, `jump at ${e}`);
    prev = p;
  }
});

test('whoever comes off is seated before play restarts', () => {
  let checked = 0;
  for (const { timeline, posAt } of matches.slice(0, 6)) {
    for (const q of timeline.pauses.filter((p) => p.kind === 'substitution')) {
      const offIds = timeline.events.filter((t) => t.at === q.at && t.event.type === 'substitution').map((t) => /** @type {any} */ (t.event.data).offId);
      const people = sidelinesAt(timeline, q.at + q.ms - 1, { posAt, jogSpeed: animation.jogSpeed });
      for (const id of offIds) {
        const p = people.find((x) => x.playerId === id);
        assert.ok(p && !p.walking, `${id} still walking off as play restarts at ${q.at + q.ms}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 5);
});

test('dugout props: seeded per match, the two dugouts different, varied across matches, bottles only in the gaps between seats', () => {
  const ids = Array.from({ length: 40 }, (_, i) => `m-${i}`);
  const look = (/** @type {string} */ id, /** @type {'home' | 'away'} */ side) => JSON.stringify(dugoutProps(id, side, 4).map((p) => p.kind));
  assert.deepEqual(ids.map((id) => look(id, 'home')), ids.map((id) => look(id, 'home')), 'the same every time');
  const kinds = new Set();
  for (const id of ids) {
    // The two dugouts never share an arrangement: their outside props differ.
    const outsideKinds = (/** @type {'home' | 'away'} */ side) => [...new Set(dugoutProps(id, side, 4).filter((p) => p.at === 'outside').map((p) => p.kind))].join();
    assert.notEqual(outsideKinds('home'), outsideKinds('away'), `${id}: both dugouts alike`);
    for (const side of /** @type {const} */ (['home', 'away'])) {
      const props = dugoutProps(id, side, 4);
      for (const p of props) kinds.add(p.kind);
      const bottles = props.filter((p) => p.kind === 'bottle');
      assert.ok(bottles.length >= 1 && bottles.every((p) => p.at === 'front' && p.slot >= 0 && p.slot < 3), 'bottles between the seats');
      assert.equal(new Set(bottles.map((p) => p.slot)).size, bottles.length, 'one bottle per gap');
      // Outside props don't overlap each other.
      const outside = props.filter((p) => p.at === 'outside').map((p) => [p.slot, p.slot + PROP_W[p.kind]]).sort((x, y) => x[0] - y[0]);
      for (let i = 1; i < outside.length; i++) assert.ok(outside[i][0] >= outside[i - 1][1], `${id}: props overlap`);
    }
  }
  assert.ok(new Set(ids.map((id) => look(id, 'home'))).size > 5, 'varied from match to match');
  for (const k of ['ball', 'bottle', 'bag', 'cooler', 'cone', 'board']) assert.ok(kinds.has(k), `never a ${k}`);
});

test('the tunnel gate: shut in play, opening over its time at each window, shutting after it', () => {
  const ms = config.settings.ceremonies.gateMs;
  const windows = [{ from: 10_000, to: 20_000 }, { from: 50_000, to: Infinity }];
  const at = (/** @type {number} */ t) => gateOpen(windows, t, ms);
  assert.equal(at(5000), 0);
  assert.ok(at(10_000 + ms / 2) > 0 && at(10_000 + ms / 2) < 1, 'opening');
  assert.equal(at(15_000), 1);
  assert.ok(at(20_000 + ms / 2) > 0 && at(20_000 + ms / 2) < 1, 'shutting');
  assert.equal(at(30_000), 0);
  assert.equal(at(60_000), 1, 'open from the final whistle');
  // A real match's breaks: open at half-time, shut in play.
  const tl = matches[0].timeline;
  const [ht] = tl.breaks;
  assert.ok(ht && ht.to > ht.from);
  assert.equal(gateOpen(tl.breaks, (ht.from + ht.to) / 2, ms), 1);
  assert.equal(gateOpen(tl.breaks, ht.from - 1, ms), 0);
});

test('a goal celebration: the scoring side, for goalCelebrateMs; their bench on its feet, one or two pairs high-fiving', () => {
  const ms = animation.goalCelebrateMs;
  let goals = 0;
  for (const { timeline: tl } of matches.slice(0, 5)) {
    for (const { event, at } of tl.events) {
      if (event.type !== 'goal') continue;
      const c = celebrationAt(tl, at + 100, ms);
      // A later goal inside the window would take over; otherwise it's this one.
      if (c?.seq !== event.seq) continue;
      goals++;
      assert.equal(c.side, event.teamId === tl.homeId ? 'home' : 'away');
      const later = celebrationAt(tl, at + ms + 1, ms);
      assert.ok(!later || later.seq !== event.seq, 'over after goalCelebrateMs');
      // Over the cheer, every seat is up (arms raised) and at least one pair turns to high-five, facing each other.
      let fives = 0;
      for (let since = 0; since < ms; since += 100) {
        const poses = [0, 1, 2, 3, 4].map((i) => benchCheer(c.side, i, 5, { seq: c.seq, since }));
        for (let i = 0; i < 5; i++) {
          assert.notEqual(poses[i].arms, 'none');
          if (poses[i].arms !== 'both') fives++;
        }
        for (let i = 0; i < 5; i++) {
          if (poses[i].arms === 'both') continue;
          // Leaning toward the neighbour they high-five, who leans back (home seats run leftward from halfway).
          const right = c.side === 'home' ? i - 1 : i + 1;
          const other = poses[poses[i].dx > 0 ? right : c.side === 'home' ? i + 1 : i - 1];
          assert.ok(other && other.arms !== 'both' && other.dx * poses[i].dx < 0, `seat ${i} high-fives a neighbour`);
        }
      }
      assert.ok(fives > 0, 'a high five');
    }
  }
  assert.ok(goals > 5);
});

test('at half-time the substitutes step out in front of the dugout, and are back in their seats by the restart', () => {
  const breakLineMs = config.settings.ceremonies.breakLineSeconds * 1000;
  for (const { timeline: tl, posAt } of matches.slice(0, 3)) {
    const ctx = { posAt, jogSpeed: animation.jogSpeed, breakLineMs };
    for (const brk of tl.breaks) {
      const seated = sidelinesAt(tl, brk.from, ctx);
      const out = sidelinesAt(tl, brk.to - breakLineMs - 500, ctx);
      const back = sidelinesAt(tl, brk.to - 1, ctx);
      for (const p of out) {
        const was = /** @type {any} */ (seated.find((q) => q.playerId === p.playerId));
        if (!was || was.walking || was.injured) continue; // the injured stay seated (Task 185)
        assert.ok(p.y > 0 && Math.abs(p.x - was.x) < 1e-9, `${p.playerId} stepped out (y ${p.y.toFixed(3)})`);
        const b = /** @type {any} */ (back.find((q) => q.playerId === p.playerId));
        assert.ok(Math.abs(b.y - was.y) < 1e-9 && !b.walking, `${p.playerId} back in their seat`);
      }
    }
  }
});

test('an injured player who is replaced sits in the seat their substitute left, not past the dugout (Task 140)', () => {
  let checked = 0;
  for (const m of live.matchesIn(1)) {
    const timeline = createTimeline(m, config);
    const start = benchesAtKickoff(timeline);
    const injured = new Set(timeline.events.filter(({ event: e }) => e.type === 'injury').map(({ event: e }) => e.playerId));
    const people = sidelinesAt(timeline, timeline.duration - 1, { posAt: () => ({ x: 0.5, y: 0.5 }), jogSpeed: animation.jogSpeed });
    for (const { event: e } of timeline.events) {
      if (e.type !== 'substitution' || !injured.has(/** @type {any} */ (e.data).offId)) continue;
      const side = e.teamId === timeline.homeId ? 'home' : 'away';
      const p = /** @type {any} */ (people.find((q) => q.playerId === /** @type {any} */ (e.data).offId));
      assert.equal(p.seat, start[side].indexOf(/** @type {string} */ (e.playerId)), `${m.id}: the injured player's seat`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'some injured players were replaced');
});

test('the injured sit in the dugout too (Task 185): nearest the tunnel, the five who don\'t start in all, never stepping out', () => {
  const all = live.matchesIn(1).map((m) => ({ m, timeline: createTimeline(m, config) }));
  const outfield = Object.values(config.rules.roster.lineup).filter((v) => typeof v === 'number').reduce((a, b) => a + b, 0);
  let seen = 0;
  for (const { m, timeline } of all) {
    for (const e of m.events.filter((x) => x.type === 'lineup')) {
      const { starters, bench, injured } = /** @type {any} */ (e.data);
      // Every one of the roster is somewhere: starting, on the bench or injured (a full squad of ten, five starting).
      assert.equal(starters.length + bench.length + injured.length, config.rules.roster.size, m.id);
      assert.ok(injured.every((/** @type {string} */ id) => !bench.includes(id) && !starters.some((/** @type {any} */ s) => s.playerId === id)));
      assert.equal(bench.length + injured.length, config.rules.roster.size - outfield);
    }
    const start = benchesAtKickoff(timeline);
    if (start.injured.size === 0) continue;
    seen++;
    const people = sidelinesAt(timeline, 0, { posAt: () => null, jogSpeed: animation.jogSpeed });
    for (const side of /** @type {const} */ (['home', 'away'])) {
      const ours = people.filter((p) => p.side === side);
      const hurt = ours.filter((p) => p.injured);
      // The inner seats, nearest the tunnel: 0, 1, ...
      assert.deepEqual(hurt.map((p) => p.seat), hurt.map((_, i) => i));
      assert.ok(ours.filter((p) => !p.injured).every((p) => p.seat >= hurt.length));
    }
    // At half-time the substitutes step out; the injured stay seated.
    const brk = timeline.breaks[0];
    const mid = sidelinesAt(timeline, (brk.from + brk.to) / 2, { posAt: () => null, jogSpeed: animation.jogSpeed, breakLineMs: config.settings.ceremonies.breakLineSeconds * 1000 });
    for (const p of mid.filter((x) => x.injured)) assert.equal(p.y, BENCH_Y[p.side], `${m.id}: ${p.playerId} stays seated`);
  }
  assert.ok(seen > 5, `${seen} matches with someone injured at kick-off`);
});
