import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { preMatchCard } from '../src/channel/cards.js';
import { benchWalkOn, handshakeCaption, handshakeLength, handshakeParts, handshakePose, kickoffSpots, lineUp, walkOutCaption, walkOutParts, walkOutPose } from '../src/channel/ceremonies.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createMotion } from '../src/channel/motion.js';
import { createProgramme } from '../src/channel/programme.js';
import { createTimeline } from '../src/channel/timeline.js';
import { TUNNEL, tunnelFade } from '../src/channel/sidelines.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const { animation, ceremonies, segments } = config.settings;
const keeperSlot = config.positions.keeper;
const slots = createCalendar(config).slots(1);
const MIN = 60_000;
const starters = (/** @type {string} */ team) => ['K', 'D', 'D', 'M', 'S'].map((slot, i) => ({ playerId: `${team}${i}`, slot }));

/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const ctx = { timelineOf, playerName: (/** @type {string} */ id) => id };
const motionOf = (/** @type {any} */ m) => createMotion(timelineOf(m), { matchId: m.id, homeId: m.homeId, keeperSlot, animation, play: config.settings.play });

test('the line: both teams across halfway, home on the left, keepers at the outer ends', () => {
  const line = lineUp(starters('h'), starters('a'), 'K');
  assert.equal(line.length, 10);
  for (const p of line) {
    assert.equal(p.y, 0.5);
    assert.ok(p.side === 'home' ? p.x < 0.5 : p.x > 0.5);
  }
  const xs = line.map((p) => p.x);
  assert.equal(new Set(xs).size, 10, 'nobody stands on anyone');
  const keepers = line.filter((p) => p.slot === 'K');
  assert.deepEqual(keepers.map((p) => p.x), [Math.min(...xs), Math.max(...xs)]);
});

test('the walk-out ends exactly where the match starts, so kick-off has no jump', () => {
  for (const i of [0, 5, 30]) {
    const before = slots[i].kickoff - segments.walkOutMinutes * MIN;
    const live = new LiveLeague(config, { now: before, seed: 'ceremony-tests' });
    const seg = createProgramme(live, timelineOf).at(before);
    assert.equal(seg.kind, 'walk_out');
    if (seg.kind !== 'walk_out') return;
    const f = seg.fixture;
    const card = preMatchCard(f, live, before, ctx);
    const spots = kickoffSpots({ matchId: f.id, homeId: f.homeId, home: card.home.lineup, away: card.away.lineup, keeperSlot });
    const line = lineUp(card.home.lineup, card.away.lineup, keeperSlot);
    const last = walkOutPose(line, spots, segments.walkOutMinutes * MIN, 0, { ceremonies, jogSpeed: animation.jogSpeed, matchId: f.id, keeperSlot });

    live.advanceTo(f.kickoff);
    const m = /** @type {any} */ (live.matchesIn(1)[i]);
    assert.equal(m.id, f.id);
    const first = new Map(/** @type {any} */ (motionOf(m).at(0)).players.map((/** @type {any} */ p) => [p.playerId, p]));
    assert.equal(last.length, first.size);
    for (const p of last) {
      const q = first.get(p.playerId);
      assert.ok(q && Math.abs(q.x - p.x) < 1e-9 && Math.abs(q.y - p.y) < 1e-9, `${p.playerId} ends the walk-out at the kick-off spot`);
    }
  }
});

const total = segments.walkOutMinutes * MIN;
const opts = { ceremonies, jogSpeed: animation.jogSpeed, matchId: 'm1', keeperSlot: 'K' };
const line = lineUp(starters('h'), starters('a'), 'K');
const spots = line.map((p) => ({ ...p, x: p.side === 'home' ? 0.3 : 0.7, y: 0.3 }));
const walkAt = (/** @type {number} */ since) => walkOutPose(line, spots, since, total - since, opts);
/** No jumps between frames 50 ms apart. @param {(t: number) => { playerId: string, x: number, y: number }[]} at @param {number} until */
function smooth(at, until) {
  let prev = new Map(at(0).map((p) => [p.playerId, p]));
  for (let t = 50; t <= until; t += 50) {
    const now = at(t);
    for (const p of now) {
      const q = prev.get(p.playerId);
      if (q) assert.ok(Math.hypot(p.x - q.x, p.y - q.y) < 0.02, `${p.playerId} jumped at ${t}`);
    }
    prev = new Map(now.map((p) => [p.playerId, p]));
  }
}

test('the walk-out: on from the tunnel in pairs, the line still through both anthems, a warm-up in their own half, then their spots', () => {
  const parts = walkOutParts(total, ceremonies);
  assert.ok(walkAt(0).every((p) => tunnelFade(p) === 0), 'everyone starts out of sight in the tunnel');
  const early = walkAt(ceremonies.walkOnGapMs * 6); // the managers and the referee come out first
  assert.ok(early[0].y > TUNNEL.mouth.y && tunnelFade(early.at(-1)) === 0, 'they come on a pair at a time');
  // Side by side (Task 63): each home player level with the away player at the same place in the other line, home on the left.
  const half = line.length / 2;
  for (const t of [ceremonies.walkOnGapMs * 4.5, ceremonies.walkOnGapMs * 6.5]) {
    const now = walkAt(t);
    for (let i = 0; i < half; i++) {
      const [h, a] = [now[i], now[half + i]];
      if (h.y < TUNNEL.mouth.y) assert.ok(Math.abs(h.y - a.y) < 1e-9 && h.x < a.x, `pair ${i} side by side at ${t}`);
    }
  }
  // Standing in the line through the anthems.
  for (const t of [parts.anthemsFrom, parts.awayAnthemFrom, parts.anthemsUntil - 1]) assert.deepEqual(walkAt(t).map((p) => [p.x, p.y]), line.map((p) => [p.x, p.y]));
  // Warming up in their own half (home defends the left goal at kick-off), keepers in goal.
  const warm = walkAt(parts.breakFrom - 1000);
  for (const p of warm) {
    assert.ok(p.side === 'home' ? p.x < 0.5 : p.x > 0.5, `${p.playerId} warms up in their own half`);
    if (p.slot === 'K') assert.ok(Math.min(p.x, 1 - p.x) < 0.1, 'keepers warm up in goal');
  }
  // On their spots before kick-off.
  assert.deepEqual(walkAt(total - 1000).map((p) => [p.x, p.y]), spots.map((p) => [p.x, p.y]));
  smooth(walkAt, total);
});

test('a re-air\'s line-up goes straight from the line to the kick-off spots', () => {
  const lineUpMs = 20_000;
  const at = (/** @type {number} */ since) => walkOutPose(line, spots, since, lineUpMs - since, { ...opts, trimmed: true });
  assert.deepEqual(at(0).map((p) => [p.x, p.y]), line.map((p) => [p.x, p.y]));
  assert.deepEqual(at(lineUpMs - 500).map((p) => [p.x, p.y]), spots.map((p) => [p.x, p.y]));
  smooth(at, lineUpMs);
});

const end = [...starters('h').map((p, i) => ({ ...p, side: /** @type {const} */ ('home'), x: 0.1 + i * 0.1, y: 0.2 })),
  ...starters('a').map((p, i) => ({ ...p, side: /** @type {const} */ ('away'), x: 0.9 - i * 0.1, y: 0.8 }))];
const hTotal = segments.handshakeMinutes * MIN;
/** Without a home win the handshakes are shorter (Task 74). */
const lostTotal = handshakeLength(hTotal, ceremonies, false);
const shake = (/** @type {number} */ since, /** @type {boolean} */ homeWon, t = homeWon ? hTotal : lostTotal) => handshakePose(end, since, t, { ceremonies, jogSpeed: animation.jogSpeed, keeperSlot: 'K', homeWon });

test('handshakes: each team huddles off its end of the lines, files through, then off down the tunnel and out of sight', () => {
  const p = handshakeParts(hTotal, ceremonies);
  const start = shake(0, false);
  for (const q of start) {
    const e = /** @type {any} */ (end.find((x) => x.playerId === q.playerId));
    assert.deepEqual([q.x, q.y], [e.x, e.y], 'from where the match ended');
  }
  // Huddled: each team bunched together, home left of halfway (above the lines), away right (below).
  const huddled = shake(p.huddleAt - 1, false);
  for (const side of ['home', 'away']) {
    const team = huddled.filter((q) => q.side === side);
    const cx = team.reduce((t, q) => t + q.x, 0) / team.length;
    const cy = team.reduce((t, q) => t + q.y, 0) / team.length;
    assert.ok(side === 'home' ? cx < 0.5 && cy < 0.475 : cx > 0.5 && cy > 0.525, `${side} huddle at ${cx.toFixed(2)}, ${cy.toFixed(2)}`);
    for (const q of team) assert.ok(Math.hypot(q.x - cx, (q.y - cy) / 2) < 0.05, `${q.playerId} not in the huddle`);
  }
  // Gone by the end, and nobody jumps, live or in a re-air's short version.
  assert.equal(shake(hTotal - 1, false).length, 0);
  smooth((t) => shake(t, false), hTotal - 1);
  smooth((t) => shake(t, true, 30_000), 29_999);
});

test('the handshake line is a continuous procession, and every pair of opponents passes on it', () => {
  const p = handshakeParts(hTotal, ceremonies);
  /** @type {Map<string, number>} Closest approach of each home–away pair while both are on their lines. */
  const closest = new Map();
  const onLine = (/** @type {any} */ q) => Math.abs(q.y - (q.side === 'home' ? 0.48 : 0.52)) < 1e-9;
  let prev = shake(p.huddleAt, false);
  let fastest = 0;
  for (let t = p.huddleAt; t < p.passAt; t += 100) {
    const now = shake(t, false);
    for (const h of now.filter((q) => q.side === 'home' && onLine(q))) {
      for (const a of now.filter((q) => q.side === 'away' && onLine(q))) {
        const key = `${h.playerId}|${a.playerId}`;
        closest.set(key, Math.min(closest.get(key) ?? Infinity, Math.abs(h.x - a.x)));
      }
    }
    for (const q of now.filter(onLine)) {
      const b = prev.find((x) => x.playerId === q.playerId);
      if (b && onLine(b)) fastest = Math.max(fastest, Math.abs(q.x - b.x) / 0.1);
    }
    prev = now;
  }
  const homeIds = end.filter((q) => q.side === 'home').map((q) => q.playerId);
  const awayIds = end.filter((q) => q.side === 'away').map((q) => q.playerId);
  for (const h of homeIds) for (const a of awayIds) assert.ok((closest.get(`${h}|${a}`) ?? Infinity) < 0.01, `${h} and ${a} never met`);
  // Along the line at the procession's pace (pitch lengths per second), never faster.
  assert.ok(fastest <= ceremonies.handshakeLineSpeed * 1.01 && fastest > ceremonies.handshakeLineSpeed * 0.9, `line speed ${fastest.toFixed(3)}`);
});

test('the handshake lines just touch, and everyone holds for a beat as each opposing pair meets', () => {
  const p = handshakeParts(hTotal, ceremonies);
  const onLine = (/** @type {any} */ q) => Math.abs(q.y - (q.side === 'home' ? 0.48 : 0.52)) < 1e-9;
  let beats = 0;
  for (let t = p.huddleAt; t < p.passAt; t += 10) {
    const now = shake(t, true).filter(onLine);
    const met = now.some((h) => h.side === 'home' && now.some((a) => a.side === 'away' && Math.abs(h.x - a.x) < 1e-6));
    if (!met) continue;
    // A meeting: everyone on the line holds still through most of the beat.
    const later = shake(t + ceremonies.handshakePauseMs * 0.8, true);
    for (const q of now) {
      const b = /** @type {any} */ (later.find((x) => x.playerId === q.playerId));
      assert.ok(Math.abs(b.x - q.x) < 1e-9, `${q.playerId} kept walking through the beat at ${t}`);
    }
    beats++;
    t += ceremonies.handshakePauseMs;
  }
  assert.ok(beats >= 5, `only ${beats} beats`);
});

test('after a home win the home team salutes the fans along the bottom touchline; otherwise both go to their benches', () => {
  const p = handshakeParts(hTotal, ceremonies);
  const mid = p.passAt + 0.9 * (p.leaveAt - p.passAt);
  const won = shake(mid, true);
  assert.ok(won.filter((q) => q.side === 'home').every((q) => q.y > 0.85), 'home along the bottom');
  assert.ok(won.filter((q) => q.side === 'away').every((q) => q.y < 0.15), 'away by their bench');
});

test('without a home win both teams head straight off after the procession, and the handshakes are shorter', () => {
  assert.ok(lostTotal < hTotal * 0.8);
  const p = handshakeParts(lostTotal, ceremonies, false);
  const full = handshakeParts(hTotal, ceremonies);
  assert.ok(Math.abs(p.huddleAt - full.huddleAt) < 1e-6 && Math.abs(p.passAt - full.passAt) < 1e-6 && p.leaveAt === p.passAt, 'the same huddle and procession, no salute');
  // Nobody waits by the dugouts (where the benches' players gather, 0.09 down): anyone there is on the move.
  for (let t = p.huddleAt; t < lostTotal; t += 500) {
    const later = shake(t + 1000, false);
    for (const q of shake(t, false)) {
      const b = later.find((x) => x.playerId === q.playerId);
      if (b && Math.abs(q.y - 0.09) < 0.03) assert.ok(Math.hypot(b.x - q.x, b.y - q.y) > 1e-4, `${q.playerId} waiting by the dugout at ${t}`);
    }
  }
  assert.equal(shake(lostTotal - 1, false).length, 0, 'gone by the end');
  smooth((t) => shake(t, false), lostTotal - 1);
});

test('captions: the walk-out\'s parts, then the handshakes\' parts', () => {
  const name = (/** @type {string} */ id) => id.toUpperCase();
  const parts = walkOutParts(total, ceremonies);
  const title = (/** @type {number} */ since) => walkOutCaption(since, total - since, { homeId: 'a', awayId: 'b' }, name, ceremonies).title;
  assert.deepEqual([title(0), title(parts.anthemsFrom), title(parts.awayAnthemFrom), title(parts.warmFrom), title(total - 1)],
    ['THE TEAMS WALK OUT', 'HOME ANTHEM', 'AWAY ANTHEM', 'WARMING UP', 'TAKING POSITIONS']);
  assert.equal(walkOutCaption(parts.anthemsFrom, total - parts.anthemsFrom, { homeId: 'a', awayId: 'b' }, name, ceremonies).teamId, 'a');
  const p = handshakeParts(hTotal, ceremonies);
  const m = { homeId: 'a', awayId: 'b', score: /** @type {[number, number]} */ ([3, 2]) };
  assert.equal(handshakeCaption(0, hTotal, m, name, true, ceremonies).detail, 'A 3-2 B');
  assert.equal(handshakeCaption(p.passAt + 0.01 * hTotal, hTotal, m, name, true, ceremonies).title, 'A SALUTE THE FANS');
  assert.equal(handshakeCaption(hTotal - 1, hTotal, m, name, false, ceremonies).title, 'THE TEAMS HEAD OFF');
});

test('the substitutes follow the starters out of the tunnel to their seats', () => {
  const bench = { home: ['hb0', 'hb1', 'hb2', 'hb3'], away: ['ab0', 'ab1', 'ab2', 'ab3'] };
  const subs = (/** @type {number} */ since) => benchWalkOn(bench, since, { ceremonies, jogSpeed: animation.jogSpeed, slotOf: () => '', after: 10 });
  assert.ok(subs(ceremonies.walkOnGapMs * 9).every((p) => tunnelFade(p) === 0), 'still in the tunnel while the starters come out');
  const seated = subs(60_000);
  assert.ok(seated.every((p) => !p.walking && p.y < 0));
  smooth(subs, 60_000);
});

test('the tunnel: everyone comes out of it and goes back into it, between its walls, and fades out of sight inside', () => {
  // Fully seen just inside the mouth (Task 63: no fading while still above it), fading further in, gone at the back.
  assert.equal(tunnelFade({ x: 0.5, y: TUNNEL.mouth.y - 0.01 }), 1);
  assert.ok(tunnelFade({ x: 0.5, y: (TUNNEL.fadeFrom + TUNNEL.back.y) / 2 }) < 1);
  assert.equal(tunnelFade(TUNNEL.back), 0);
  // Above the boards, nobody is outside the tunnel's walls except at the dugouts (whose feet line is at BENCH_Y).
  const inWalls = (/** @type {{ x: number, y: number }} */ p) => p.y > -0.05 || Math.abs(p.x - TUNNEL.mouth.x) <= TUNNEL.halfW + 1e-9;
  const bench = { home: ['hb0', 'hb1', 'hb2', 'hb3'], away: ['ab0', 'ab1', 'ab2', 'ab3'] };
  const subs = (/** @type {number} */ since) => benchWalkOn(bench, since, { ceremonies, jogSpeed: animation.jogSpeed, slotOf: () => '', after: line.length / 2 });
  for (let t = 0; t < total; t += 100) for (const p of [...walkAt(t), ...subs(t)]) assert.ok(inWalls(p), `${p.playerId} through a tunnel wall at ${t}`);
  // Off at the end: live and in a re-air's short handshakes, everyone walks in through the mouth and is gone.
  const benchEnd = [...end, { playerId: 'hb0', slot: 'D', side: /** @type {const} */ ('home'), x: 0.34, y: -0.04 }];
  for (const t of [hTotal, 30_000]) {
    const at = (/** @type {number} */ since) => handshakePose(benchEnd, since, t, { ceremonies, jogSpeed: animation.jogSpeed, keeperSlot: 'K', homeWon: true });
    let fading = 0;
    for (let s = 0; s < t; s += 50) {
      for (const p of at(s)) {
        assert.ok(inWalls(p), `${p.playerId} through a tunnel wall at ${s} of ${t}`);
        if (tunnelFade(p) < 1) fading++;
      }
    }
    assert.ok(fading > 0, 'they walk into the dark');
    // In pairs: whenever two are in the tunnel at the same depth, one is from each team.
    for (let s = 0; s < t; s += 250) {
      const inside = at(s).filter((p) => p.y < TUNNEL.mouth.y && Math.abs(p.x - TUNNEL.mouth.x) <= TUNNEL.halfW);
      for (const p of inside) assert.ok(Math.abs(p.x - TUNNEL.mouth.x) > 0.005, `${p.playerId} in a lane at ${s}`);
    }
    assert.equal(at(t - 1).length, 0, 'gone by the end');
  }
});

test('after a home win the losers stand about by their bench, not in a row (Tom), the same every viewing', () => {
  const p = handshakeParts(hTotal, ceremonies);
  const at = p.leaveAt - 600;
  const losers = shake(at, true).filter((q) => q.side === 'away');
  assert.ok(losers.length >= 4);
  const ys = losers.map((q) => q.y);
  assert.ok(Math.max(...ys) - Math.min(...ys) > 0.02, 'spread up and down, not one row');
  for (const q of losers) assert.ok(q.y > 0.03 && q.y < 0.16, `${q.playerId} by the bench`);
  assert.deepEqual(shake(at, true), shake(at, true));
});
