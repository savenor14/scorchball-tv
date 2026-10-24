import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventLog } from '../src/chronicle/eventLog.js';
import { SMALL_CHEER, ceremonyCues, ceremonyMood, crowdCues, crowdLevel, liveliness, murmurShare, quietShare, standsFullness, standsMood } from '../src/channel/crowd.js';
import { awayCorner, awaySteps, bowlAreas, crowdLayout, presentFans } from '../src/channel/stands.js';
import { walkOutParts } from '../src/channel/ceremonies.js';
import { homeAttacksRight } from '../src/channel/formation.js';
import { createMotion } from '../src/channel/motion.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createLeague } from '../src/sim/league.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { animation, crowd, ceremonies, segments } = config.settings;

/** @type {Map<string, any[]>} */
const byMatch = new Map();
const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId))?.push(e); }] });
const league = createLeague(config, 'crowd-tests', log);
runSeason(league, config, log);
const matches = [...byMatch].slice(0, 10).map(([id, events]) => {
  const r = events.at(-1).data;
  const timeline = createTimeline({ id, events, homeId: r.homeId, awayId: r.awayId }, config);
  return { id, homeId: r.homeId, result: r, timeline };
});
const goalPauseMs = config.settings.match.goalPauseSeconds * 1000;
const cuesOf = (/** @type {typeof matches[number]} */ m) => crowdCues(m.timeline, { matchId: m.id, homeId: m.homeId, bigStage: false, halfMinutes: config.rules.match.halfMinutes, goalPauseMs });

test('the murmur: louder as the home side nears goal than the away side, quiet at the breaks, quieter in re-airs, always 0–1', () => {
  const { id, homeId, timeline } = matches[0];
  const motion = createMotion(timeline, { matchId: id, homeId, keeperSlot: config.positions.keeper, animation, play: config.settings.play });
  const o = { homeId, bigStage: false, reair: false, settings: crowd };
  /** @type {Record<string, number[]>} */
  const byWho = { home: [], away: [] };
  for (let e = 0; e < timeline.duration; e += 500) {
    const pose = motion.at(e);
    const level = crowdLevel(timeline, pose, e, o);
    assert.ok(level >= 0 && level <= 1);
    const s = timeline.stateAt(e);
    if (s.phase === 'half_time') assert.equal(level, crowd.breaks);
    // Like with like: the ball close to the goal its team is attacking.
    if (s.possession && !s.paused && pose?.ball && s.phase !== 'half_time') {
      const right = (s.possession === homeId) === (homeAttacksRight(s.phase) === 1);
      if ((right ? pose.ball.x : 1 - pose.ball.x) > 0.8) byWho[s.possession === homeId ? 'home' : 'away'].push(level);
    }
    assert.ok(crowdLevel(timeline, pose, e, { ...o, reair: true }) <= level + 1e-9);
    assert.ok(crowdLevel(timeline, pose, e, { ...o, bigStage: true }) >= level - 1e-9);
  }
  const mean = (/** @type {number[]} */ xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  assert.ok(mean(byWho.home) > mean(byWho.away), `home attacks ${mean(byWho.home).toFixed(2)}, away ${mean(byWho.away).toFixed(2)}`);
  assert.ok(mean(byWho.home) > crowd.base + 0.6 * crowd.attack, 'a home attack near goal lifts the crowd well above midfield play');
});

test('reactions: a roar at every goal (bigger for the home side), groans at misses, oohs at saves, tackles, steals and blocks, boos only at away fouls', () => {
  for (const m of matches) {
    const cues = cuesOf(m);
    for (const { event: e, at } of m.timeline.events) {
      const here = cues.filter((c) => c.at === at);
      if (e.type === 'goal') {
        const roar = here.find((c) => c.kind === 'roar');
        assert.ok(roar, `roar at ${at}`);
        // The cheer carries on through the celebration, smaller each time, and has died away before the restart.
        const cheer = cues.filter((c) => c.kind === 'roar' && c.at >= at && c.at < at + goalPauseMs);
        assert.ok(cheer.length >= 3, `a long cheer after the goal at ${at}`);
        for (let i = 1; i < cheer.length; i++) assert.ok((cheer[i].gain ?? 1) < (cheer[i - 1].gain ?? 1));
        assert.ok(cheer.every((c) => c.at - at + 3800 <= goalPauseMs), 'done before the restart');
        const boos = cues.filter((c) => c.kind === 'jeer' && c.at > at && c.at < at + goalPauseMs);
        if (e.teamId === m.homeId) assert.ok((roar.power ?? 0) >= 0.55 && boos.length === 0);
        // An away goal: the away end, smaller, with the home crowd booing under it.
        else assert.ok((roar.power ?? 1) <= 0.3 && (roar.gain ?? 1) < 1 && boos.length >= 1, `an away goal at ${at}`);
      }
      if (e.type === 'miss') assert.ok(here.some((c) => c.kind === 'groan'));
      if (e.type === 'save') assert.ok(here.some((c) => c.kind === 'ooh'));
      // Tackles and blocks a soft ooh, steals a bigger one, saves bigger still.
      const ooh = here.find((c) => c.kind === 'ooh')?.gain ?? 0;
      const data = /** @type {any} */ (e.data) ?? {};
      if (e.type === 'possession_change' && data.reason === 'tackle') assert.ok(data.steal ? ooh > 0.45 && ooh < 0.65 : ooh > 0 && ooh < 0.45, `ooh at a ${data.steal ? 'steal' : 'tackle'}`);
      if (e.type === 'block') assert.ok(ooh > 0 && ooh < 0.65);
      if (e.type === 'foul') assert.equal(here.some((c) => c.kind === 'jeer'), e.teamId !== m.homeId, `boos only for the away side's foul at ${at}`);
    }
  }
});

test('the final whistle: a roar after a home win, a small cheer otherwise (Tom, 2026-10-20: no applause)', () => {
  let roars = 0;
  let claps = 0;
  for (const m of matches) {
    const end = /** @type {any} */ (m.timeline.events.find((t) => t.event.type === 'match_result'));
    const after = cuesOf(m).filter((c) => c.at > end.at && c.at <= end.at + 1000);
    const { homeGoals, awayGoals, shootout } = m.result;
    const homeWon = homeGoals !== awayGoals ? homeGoals > awayGoals : Boolean(shootout && shootout.home > shootout.away);
    assert.deepEqual(after.map((c) => c.kind), ['roar']);
    assert.equal(after[0].power === SMALL_CHEER, !homeWon);
    if (homeWon) roars++;
    else claps++;
  }
  assert.ok(roars > 0 && claps > 0, 'both kinds seen');
});

test('ceremonies: a small cheer as the teams come out, each anthem in its caption then a cheer, a cheer as the handshakes begin', () => {
  const total = segments.walkOutMinutes * 60_000;
  const teams = { homeId: 'h', awayId: 'a' };
  const walk = ceremonyCues('walk_out', total, ceremonies, 'm', teams);
  const p = walkOutParts(total, ceremonies);
  assert.deepEqual(walk.map((c) => c.kind), ['roar', 'anthem', 'roar', 'anthem', 'roar']);
  assert.ok(walk.filter((c) => c.kind === 'roar').every((c) => c.power === SMALL_CHEER));
  assert.equal(walk[0].at, ceremonies.walkOnGapMs * 3);
  const [home, away] = walk.filter((c) => c.kind === 'anthem');
  assert.ok(home.team === 'h' && home.at >= p.anthemsFrom && away.team === 'a' && away.at >= p.awayAnthemFrom);
  // Each anthem's applause comes as it ends, inside its own caption.
  assert.ok(walk[2].at > home.at && walk[2].at <= p.awayAnthemFrom, 'home applause within the home anthem');
  assert.ok(walk[4].at > away.at && walk[4].at <= p.anthemsUntil, 'away applause within the away anthem');
  assert.equal(ceremonyCues('handshakes', 120_000, ceremonies, 'm', teams).length, 1);
  // After a home win the home end cheers the salute as it cheers a home goal (Tom): a run of roars, no chant.
  const won = ceremonyCues('handshakes', 120_000, ceremonies, 'm', teams, (id) => id, true);
  assert.ok(won[0].kind === 'roar' && won[0].power === SMALL_CHEER);
  assert.ok(won.length >= 3 && won.slice(1).every((c) => c.kind === 'roar'));
  assert.ok(won.slice(1).every((c, i, r) => i === 0 || (c.power ?? 0) < (r[i - 1].power ?? 0)), 'each a little smaller');
  assert.ok(won.every((c) => c.at < 120_000));
});


test('the murmur dips at every stoppage, stays down through the pause and into play, then comes back', () => {
  for (const m of matches) {
    const tl = m.timeline;
    const share = (/** @type {number} */ e) => murmurShare(tl, e, crowd);
    let full = 0;
    let n = 0;
    for (const { event: e, at } of tl.events) {
      if (!['goal', 'substitution', 'miss', 'foul', 'burn'].includes(e.type)) continue;
      const restart = at + (tl.pauses.find((p) => p.at === at)?.ms ?? 0);
      assert.equal(share(at + 1), crowd.dipLevel, `down at the ${e.type} at ${at}`);
      assert.equal(share(restart + crowd.dipHoldSeconds * 1000 - 1), crowd.dipLevel, 'still down just into play');
    }
    for (let e = 0; e < tl.duration; e += 500) {
      const v = share(e);
      assert.ok(v >= crowd.dipLevel && v <= 1);
      n++;
      if (v === 1) full++;
    }
    // Variety: neither always down nor always up.
    assert.ok(full / n > 0.1 && full / n < 0.9, `full murmur ${(100 * full / n).toFixed(0)}% of the time`);
  }
});

test('quiet spells: the murmur eases down after a few seconds with no reaction, comes back with the next, never below its floors', () => {
  const r = [10_000, 30_000];
  const q = (/** @type {number} */ e) => quietShare(r, e, crowd);
  const after = crowd.quietAfterSeconds * 1000;
  const fade = crowd.quietFadeSeconds * 1000;
  assert.equal(q(10_000 + after), 1, 'full until the spell starts');
  assert.ok(q(10_000 + after + fade / 2) < 1 && q(10_000 + after + fade / 2) > crowd.quietLevel, 'easing down');
  assert.equal(q(29_999), crowd.quietLevel, 'down by the end of a long spell');
  // From the next reaction it comes back smoothly, without a jump.
  assert.equal(q(30_000), crowd.quietLevel);
  assert.ok(q(30_000 + crowd.quietReturnSeconds * 500) > crowd.quietLevel);
  assert.equal(q(30_000 + crowd.quietReturnSeconds * 1000), 1);
  for (let e = 0; e < 60_000; e += 50) assert.ok(Math.abs(q(e + 50) - q(e)) < 0.1, `no jump at ${e}`);
  // A real match: quiet sometimes, never below the lower floor.
  for (const m of matches) {
    const times = cuesOf(m).map((c) => c.at);
    let quiet = 0;
    let n = 0;
    for (let e = 0; e < m.timeline.duration; e += 500) {
      const v = liveliness(m.timeline, times, e, crowd);
      assert.ok(v >= Math.min(crowd.dipLevel, crowd.quietLevel) && v <= 1);
      assert.ok(v <= murmurShare(m.timeline, e, crowd) && v <= quietShare(times, e, crowd));
      n++;
      if (quietShare(times, e, crowd) < 1) quiet++;
    }
    assert.ok(quiet / n > 0.02 && quiet / n < 0.8, `quiet ${(100 * quiet / n).toFixed(0)}% of the time`);
  }
});

test('the stands: the scoring side jumps through the goal cheer, the shooting side gasps after a miss or save, waving at the anthems and handshakes', () => {
  for (const m of matches) {
    const tl = m.timeline;
    const mood = (/** @type {number} */ e) => standsMood(tl, e, 0.4, { homeId: m.homeId, goalPauseMs });
    for (const { event: e, at } of tl.events) {
      const side = e.teamId === m.homeId ? 'home' : 'away';
      if (e.type === 'goal') {
        assert.equal(mood(at + 100).jump, side, `${side} fans jump after their goal at ${at}`);
        assert.equal(mood(at + goalPauseMs - 100).jump, side, 'until the restart');
      }
      if (e.type === 'miss' && !tl.events.some((t) => t.event.type === 'goal' && t.at <= at && t.at > at - goalPauseMs)) assert.equal(mood(at + 100).gasp, side, `gasp after a miss at ${at}`);
    }
    // Calm moments carry the level through.
    assert.equal(standsMood(tl, 1000, 0.33, { homeId: m.homeId, goalPauseMs }).level, 0.33);
  }
  const total = segments.walkOutMinutes * 60_000;
  const p = walkOutParts(total, ceremonies);
  assert.equal(ceremonyMood('walk_out', p.anthemsFrom + 1000, total, ceremonies, 0.4).wave, 'home');
  assert.equal(ceremonyMood('walk_out', p.awayAnthemFrom + 1000, total, ceremonies, 0.4).wave, 'away');
  assert.equal(ceremonyMood('walk_out', 1000, total, ceremonies, 0.4).wave, null);
  assert.equal(ceremonyMood('handshakes', 1000, 120_000, ceremonies, 0.4).wave, 'both');
});

test('the stands fill and empty round each match (Task 84)', () => {
  const o = { fill: crowd.fill, segments };
  const min = 60_000;
  const at = (/** @type {any} */ seg, /** @type {number} */ t, /** @type {'home' | 'away' | null} */ loser = null) => standsFullness(seg, t, o, loser);
  // Arriving through the pre-match (3 min) and the walk-out, full by the anthems.
  const pre = { kind: 'pre_match', until: 10 * min };
  assert.ok(Math.abs(at(pre, 10 * min - segments.preMatchMinutes * min).home - crowd.fill.preMatchFrom) < 1e-9);
  assert.ok(Math.abs(at(pre, 10 * min).home - crowd.fill.preMatchTo) < 1e-9);
  const walk = { kind: 'walk_out', until: 20 * min };
  const walkMs = segments.walkOutMinutes * min;
  assert.ok(at(walk, 20 * min - walkMs * 0.75).home < 1);
  assert.equal(at(walk, 20 * min - walkMs * (1 - crowd.fill.walkOutFull)).home, 1);
  for (const kind of ['live', 'highlights']) assert.deepEqual(at({ kind }, 0), { home: 1, away: 1, leaving: false });
  // Leaving from the final whistle (Task 89): through the handshakes, the losing side's fans first...
  const hs = { kind: 'handshakes', until: 25 * min };
  const whistle = at(hs, 25 * min - segments.handshakeMinutes * min, 'away');
  assert.ok(whistle.home === 1 && whistle.away === 1);
  const handshakesOver = at(hs, 25 * min, 'away');
  assert.ok(handshakesOver.leaving && Math.abs(handshakesOver.away - crowd.fill.handshakeLosers) < 1e-9 && Math.abs(handshakesOver.home - crowd.fill.handshakeOthers) < 1e-9);
  // Shorter handshakes (no home win): leaving runs from the whistle over their own length.
  const short = { kind: 'handshakes', from: 24 * min, until: 25 * min };
  assert.equal(at(short, 24 * min, 'home').home, 1);
  assert.ok(Math.abs(at(short, 25 * min, 'home').home - crowd.fill.handshakeLosers) < 1e-9);
  // ...and all gone by the end of the full-time card, the losers' end first.
  const ft = { kind: 'full_time', until: 30 * min };
  const ftMs = segments.fullTimeMinutes * min;
  const mid = at(ft, 30 * min - ftMs * 0.5, 'away');
  assert.ok(mid.leaving && mid.away < mid.home && mid.home < 1);
  assert.equal(at(ft, 30 * min - ftMs * (1 - crowd.fill.losersGoneAt), 'away').away, 0);
  assert.deepEqual(at(ft, 30 * min, 'home'), { home: 0, away: 0, leaving: true });
  const draw = at(ft, 30 * min - ftMs * 0.5, null);
  assert.equal(draw.home, draw.away);
  // Empty from player of the match on, and on cards.
  for (const kind of ['potm', 'studio', 'champion', 'moves']) assert.equal(at({ kind, from: 0, until: 1 }, 0).home, 0);
  // A re-air fills over its intro and line-up, and drains like a live match (Task 95): through its handshakes to the
  // handshake levels, then to nobody by the end of its full-time card; its interview is in its own set.
  assert.equal(at({ kind: 'reair', part: 'intro', from: 0, until: 20_000 }, 0).home, 0);
  assert.equal(at({ kind: 'reair', part: 'lineup', from: 0, until: 20_000 }, 20_000).home, 1);
  assert.equal(at({ kind: 'reair', part: 'match', from: 0, until: 1 }, 0).home, 1);
  const reairShake = at({ kind: 'reair', part: 'handshakes', from: 0, until: 30_000 }, 30_000, 'away');
  assert.ok(Math.abs(reairShake.away - crowd.fill.handshakeLosers) < 1e-9 && Math.abs(reairShake.home - crowd.fill.handshakeOthers) < 1e-9);
  const reairFt = at({ kind: 'reair', part: 'full_time', from: 0, until: 30_000 }, 30_000, 'away');
  assert.equal(reairFt.home + reairFt.away, 0);
  assert.equal(at({ kind: 'reair', part: 'interview', from: 0, until: 45_000 }, 1000).home, 0);
});

test('fans come and go a block at a time, the away end arriving later; the same at every ground visit', () => {
  const areas = bowlAreas(config.settings.broadcast.shiftPx);
  const colours = { home: { primary: '#c00', secondary: '#fff' }, away: { primary: '#00c', secondary: '#ff0' } };
  const fans = crowdLayout(areas, colours, 't-home', { away: awayCorner(config.settings.broadcast.shiftPx, 300) });
  assert.deepEqual(crowdLayout(areas, colours, 't-home', { away: awayCorner(config.settings.broadcast.shiftPx, 300) }), fans);
  for (const f of fans) assert.ok(f.arrive >= 0 && f.arrive < 1 && f.leave >= 0 && f.leave < 1);
  const away = fans.filter((f) => f.side === 'away');
  assert.ok(away.length > 0 && away.every((f) => f.arrive >= 0.15), 'the away end arrives later');
  // More fans as it fills; all of them when full, none when empty.
  let last = -1;
  for (let v = 0; v <= 1.0001; v += 0.1) {
    const n = presentFans(fans, { home: v, away: v, leaving: false }).length;
    assert.ok(n >= last);
    last = n;
  }
  assert.equal(presentFans(fans, { home: 1, away: 1, leaving: true }), fans);
  assert.equal(presentFans(fans, { home: 0, away: 0, leaving: true }).length, 0);
  // Neighbours come together: at half full, most fans share their arrival with the fan beside them.
  const half = new Set(presentFans(fans, { home: 0.5, away: 0.5, leaving: false }));
  let same = 0;
  for (let i = 1; i < fans.length; i++) if (fans[i].y === fans[i - 1].y && half.has(fans[i]) === half.has(fans[i - 1])) same++;
  assert.ok(same / fans.length > 0.65, `${same} of ${fans.length} beside a fan doing the same`);
});

test('the away end by the match: a step for a short trip, a step for the leaders, each spreading it out from its corner', () => {
  const end = config.settings.broadcast.awayEnd;
  const teams = league.teams;
  const ids = Object.keys(teams);
  const home = teams[ids[0]];
  const neighbour = Object.values(teams).find((t) => t.id !== home.id && t.region === home.region);
  const stranger = Object.values(teams).find((t) => t.region !== home.region);
  assert.ok(neighbour && stranger, 'two teams share a region');
  const table = (/** @type {string} */ top, /** @type {number} */ played) => [{ teamId: top, played }, { teamId: home.id, played }];
  assert.equal(awaySteps(home, stranger, table(home.id, 6), end), 0);
  assert.equal(awaySteps(home, neighbour, table(home.id, 6), end), 1);
  assert.equal(awaySteps(home, stranger, table(stranger.id, end.leaderAfterPlayed), end), 1);
  assert.equal(awaySteps(home, stranger, table(stranger.id, end.leaderAfterPlayed - 1), end), 0, 'not this early in the season');
  assert.equal(awaySteps(home, neighbour, table(neighbour.id, 9), end), 2);
  // Bigger, from the same corner: further left along the top stand, further down the right-hand stand.
  const shift = config.settings.broadcast.shiftPx;
  const [top0, side0] = awayCorner(shift, 300);
  const [top1, side1] = awayCorner(shift, 300, 1, end);
  const [top2, side2] = awayCorner(shift, 300, 2, end);
  assert.equal(top1.x + top1.w, top0.x + top0.w);
  assert.ok(top0.x > top1.x && top1.x > top2.x && top2.x >= 0);
  assert.ok(side0.h < side1.h && side1.h < side2.h && side1.y === side0.y);
  const areas = bowlAreas(shift);
  const colours = { home: { primary: '#c00', secondary: '#fff' }, away: { primary: '#00c', secondary: '#ff0' } };
  const awayFans = (/** @type {number} */ n) => crowdLayout(areas, colours, 't-home', { away: awayCorner(shift, 300, n, end) }).filter((f) => f.side === 'away').length;
  assert.ok(awayFans(0) < awayFans(1) && awayFans(1) < awayFans(2));
});
