import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { EventLog } from '../src/chronicle/eventLog.js';
import { clipUrl, commentaryCalls, commentatorFor, dealt, holdCall, holdJump, holdState, linesFor, passBreaks, passCall, passJump, passState, roundShape } from '../src/channel/commentary.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { tidyClip, wav16 } from '../src/cli/voices.js';
import { createLeague } from '../src/sim/league.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const data = config.commentary;
const settings = config.settings.commentary;
const shape = roundShape(config);

/** @type {Map<string, any[]>} */
const byMatch = new Map();
const log = new EventLog({ sinks: [(e) => { if (e.matchId) (byMatch.get(e.matchId) ?? byMatch.set(e.matchId, []).get(e.matchId))?.push(e); }] });
runSeason(createLeague(config, 'commentary-tests', log), config, log);
const matches = [...byMatch].slice(0, 12).map(([id, events]) => {
  const r = events.at(-1).data;
  const timeline = createTimeline({ id, events, homeId: r.homeId, awayId: r.awayId }, config);
  const who = commentatorFor({ id, season: events[0].season, stage: events[0].stage, round: events[0].round, slot: 0 }, data, shape);
  return { id, homeId: r.homeId, who, timeline, calls: commentaryCalls(timeline, { matchId: id, homeId: r.homeId, commentatorId: who.id, data, settings }) };
});

test('the same match always gets the same calls (a re-air sounds like the live match)', () => {
  for (const { id, homeId, who, timeline, calls } of matches) assert.deepEqual(commentaryCalls(timeline, { matchId: id, homeId, commentatorId: who.id, data, settings }), calls);
});

test('every goal is called, a scorcher with a scorcher line, louder for the home side, just after the ball goes in', () => {
  for (const { homeId, timeline, calls } of matches) {
    for (const { event: e, at } of timeline.events) {
      if (e.type !== 'goal') continue;
      const call = calls.find((c) => c.seed.endsWith(`|${e.seq}`));
      assert.ok(call, `goal at ${at} called`);
      assert.ok(call.at >= at + settings.delayMs && call.at < at + settings.delayMs + settings.followGapSeconds * 1000);
      const scorcher = /** @type {any} */ (e.data).scorcher;
      assert.equal(call.moment, scorcher ? 'scorcher' : 'goal');
      assert.ok(data.moments[call.moment].lines.includes(call.line));
      assert.equal(call.level, e.teamId === homeId ? settings.goalLevels.home : settings.goalLevels.away);
    }
  }
  assert.ok(matches.flatMap((m) => m.calls).filter((c) => c.moment !== 'goal' && c.moment !== 'scorcher').every((c) => c.level === null));
});

test("a breakaway's one-two: when the player who broke away shoots, the outcome is always called right after", () => {
  let twos = 0;
  for (const { timeline, calls } of matches) {
    const evs = timeline.events;
    evs.forEach(({ event: e }, i) => {
      if (e.type !== 'shot' || !(/** @type {any} */ (e.data)?.breakaway)) return;
      const outcome = evs.slice(i + 1).find(({ event: o }) => ['goal', 'save', 'block', 'miss'].includes(o.type));
      if (!outcome) return;
      const call = calls.find((c) => c.seed.endsWith(`|${outcome.event.seq}`));
      assert.ok(call?.follow, `the outcome of the breakaway shot ${e.seq} is called`);
      const before = calls[calls.indexOf(call) - 1];
      if (before) assert.ok(call.at - before.at >= settings.followGapSeconds * 1000 - 1e-6);
      twos++;
    });
  }
  assert.ok(twos > 5, `enough breakaway shots seen (${twos})`);
});

test('calls never crowd each other: never closer than followGapSeconds (one clip never steps on another), in time order', () => {
  let total = 0;
  for (const { calls } of matches) {
    total += calls.length;
    for (let i = 1; i < calls.length; i++) {
      const least = settings.followGapSeconds;
      assert.ok(calls[i].at - calls[i - 1].at >= least * 1000 - 1e-6, `gap before call ${i}`);
    }
  }
  assert.ok(total / matches.length > 5, `enough calls a match (${(total / matches.length).toFixed(1)})`);
});

test('a moment on its own is always called (but those called only at a rate); chances only thin out moments that come close together', () => {
  const gap = settings.minGapSeconds * 1000;
  let alone = 0;
  for (const { timeline, calls } of matches) {
    let kickoffs = 0;
    const isMoment = (/** @type {any} */ e) => ['goal', 'save', 'block', 'miss', 'burn', 'half_time', 'match_result'].includes(e.type)
      || (e.type === 'advance' && e.data?.breakaway) || (e.type === 'kickoff' && kickoffs++ < 2);
    // Tackles, steals and fouls are moments too (Task 149), but called only at a rate: neighbours, not checked.
    const isRated = (/** @type {any} */ e) => e.type === 'foul' || (e.type === 'possession_change' && e.data?.reason === 'tackle');
    const all = timeline.events.filter(({ event }) => isMoment(event) || isRated(event));
    const times = all.map(({ at }) => at);
    times.forEach((at, i) => {
      if (isRated(all[i].event)) return;
      if ((i > 0 && at - times[i - 1] < gap) || (i < times.length - 1 && times[i + 1] - at < gap)) return;
      alone++;
      assert.ok(calls.some((c) => c.at >= at + settings.delayMs && c.at < at + settings.delayMs + settings.minGapSeconds * 1000), `a lone moment at ${at} is called`);
    });
  }
  assert.ok(alone > 50);
});

test('the whistles: kick-off, the second half, half-time and full time, called after the whistle, level or not', () => {
  for (const { homeId, timeline, calls } of matches) {
    const goals = { home: 0, away: 0 };
    let kickoffs = 0;
    for (const { event: e, at } of timeline.events) {
      if (e.type === 'goal') goals[e.teamId === homeId ? 'home' : 'away']++;
      /** @type {string | null} */
      let want = null;
      if (e.type === 'kickoff') want = [/** @type {string | null} */ ('kickoff'), 'second_half'][kickoffs++] ?? null;
      if (e.type === 'half_time') want = goals.home === goals.away ? 'half_time_level' : 'half_time';
      if (e.type === 'match_result') {
        const d = /** @type {any} */ (e.data);
        want = d.homeGoals === d.awayGoals && !d.shootout ? 'full_time_level' : 'full_time';
      }
      if (!want) continue;
      const call = calls.find((c) => c.seed.endsWith(`|${e.seq}`));
      assert.ok(call, `${e.type} at ${at} called`);
      assert.equal(call.moment, want);
      assert.ok(call.at >= at + settings.afterWhistleMs && call.at < at + settings.afterWhistleMs + settings.minGapSeconds * 1000);
      assert.ok(data.moments[want].lines.includes(call.line));
    }
  }
});

test('passes in a row: called at the passRun-th pass of a run seen from its start, once a run, never near another call', () => {
  const o = { matchId: 'm', commentatorId: 'c', data, settings };
  const n = settings.passRun;
  const breaks = [0, 20_000, 40_000];
  const kicks = (/** @type {number} */ from, /** @type {number} */ count) => Array.from({ length: count }, (_, i) => from + 100 + i * 900);
  // The first run isn't seen from its start (no break between two passes yet); the second is.
  let state = passState();
  const said = [...kicks(0, n + 2), ...kicks(20_000, n + 2)].map((k) => passCall(state, k, breaks, [], o)).filter(Boolean);
  assert.equal(said.length, 1);
  assert.equal(said[0]?.at, kicks(20_000, n)[n - 1] + settings.delayMs);
  assert.ok(data.moments.passing.lines.includes(/** @type {any} */ (said[0]).line));
  // Another call close by: no pass call.
  state = passState();
  for (const k of kicks(0, 2)) passCall(state, k, breaks, [], o);
  const near = [{ at: kicks(20_000, n)[n - 1] + 1000 }];
  assert.equal(kicks(20_000, n).map((k) => passCall(state, k, breaks, /** @type {any} */ (near), o)).filter(Boolean).length, 0);
  // After a jump, the run under way isn't called; the next one is.
  state = passState();
  for (const k of kicks(0, 2)) passCall(state, k, breaks, [], o);
  passCall(state, 20_100, breaks, [], o);
  passJump(state);
  const after = [...kicks(20_000, n + 2).slice(1), ...kicks(40_000, n)].map((k) => passCall(state, k, breaks, [], o)).filter(Boolean);
  assert.equal(after.length, 1);
  assert.ok(/** @type {any} */ (after[0]).at > 40_000);
  // A match's breaks: every change of possession and shot ends a run.
  for (const { timeline } of matches) {
    const b = passBreaks(timeline);
    assert.ok(b.length > 100 && b.every((t, i) => i === 0 || t >= b[i - 1]));
  }
});

test('each moment deals its lines in turn: they come round evenly, and never twice running', () => {
  for (const { calls } of matches) {
    for (const [moment, spec] of Object.entries(data.moments)) {
      const said = calls.filter((c) => c.moment === moment).map((c) => c.line);
      // Evenly (a line skipped so as not to repeat the call before goes round next time, so at most one apart).
      const lines = dealt(data, /** @type {any} */ (moment));
      const counts = lines.map((/** @type {string} */ l) => said.filter((x) => x === l).length);
      if (said.length >= lines.length) assert.ok(Math.max(...counts) - Math.min(...counts) <= 2, `${moment}: evenly (${counts})`);
      for (let i = 1; i < said.length; i++) assert.notEqual(said[i], said[i - 1], `${moment}: never the same line twice running`);
    }
  }
});

test('Task 257: a line off air (its clips not made yet) is never called, nor its clip loaded', () => {
  const off = new Set(data.lines.filter((/** @type {any} */ l) => l.onAir === false).map((/** @type {any} */ l) => l.id));
  for (const { calls } of matches) for (const c of calls) assert.ok(!off.has(c.line), `${c.line} is off air`);
  for (const c of data.commentators) assert.ok(!linesFor(data, c.id).some((l) => off.has(l.id)));
  // The voices tool still makes them.
  assert.ok(linesFor(data, data.commentators[0].id, { all: true }).some((l) => off.has(l.id)) || off.size === 0);
});

test('one commentator a match, only those on air; the final round all different; the playoffs the Announcer; a clip for every call', () => {
  const onAir = data.commentators.filter((/** @type {any} */ c) => c.onAir);
  for (const { who, calls } of matches) {
    assert.ok(who.onAir, `${who.id} is on air`);
    for (const c of calls) assert.equal(c.url, clipUrl(who.id, c.line));
  }
  // Regular matches: the seed picks, and every commentator gets matches.
  const regular = Array.from({ length: 40 }, (_, i) => commentatorFor({ id: `s1-r1-m${i}`, season: 1, stage: 'regular', round: 1, slot: i }, data, shape).id);
  assert.equal(new Set(regular).size, onAir.length);
  // The final round's simultaneous matches: each a different commentator, every season.
  assert.ok(shape.finalRound);
  for (let season = 1; season <= 5; season++) {
    const four = Array.from({ length: shape.perRound }, (_, i) => commentatorFor({ id: `f${i}`, season, stage: 'regular', round: shape.finalRound, slot: (Number(shape.finalRound) - 1) * shape.perRound + i }, data, shape).id);
    assert.equal(new Set(four).size, Math.min(shape.perRound, onAir.length), `season ${season}: ${four}`);
  }
  // The semifinals and the final: always the Announcer.
  for (const stage of /** @type {const} */ (['semifinal', 'final'])) {
    assert.equal(commentatorFor({ id: `s2-${stage}`, season: 2, stage, round: null, slot: 60 }, data, shape).id, data.playoffs);
  }
  // The lines they speak in moments on air (Task 149: new moments wait for their clips, the playoffs' are the Announcer's).
  // The public copy has no clips at all (they're ElevenLabs'), so only a checkout with clips is held to it.
  const clips = onAir.flatMap((c) => linesFor(data, c.id).map((l) => ({ name: `${c.id}/${l.id}`, there: existsSync(new URL(`../${clipUrl(c.id, l.id)}`, import.meta.url)) })));
  if (clips.some((c) => c.there)) for (const c of clips) assert.ok(c.there, c.name);
});

test('a soft last sound is kept, not trimmed as silence (Hedrek\'s "Great stuff there.")', () => {
  const rate = 1000;
  const samples = new Float32Array(1200);
  for (let i = 300; i < 500; i++) samples[i] = i % 2 ? 0.5 : -0.5;
  // An "ff": a fiftieth as loud, 200 ms long, under the old 2%-of-the-peak line all through.
  for (let i = 500; i < 700; i++) samples[i] = i % 2 ? 0.009 : -0.009;
  const out = tidyClip(samples, rate);
  assert.equal(out.length, 30 + 200 + 200 + 150);
});

test('a clip is trimmed of silence, evened out, and written as 16-bit WAV', () => {
  const rate = 1000;
  const samples = new Float32Array(1000);
  for (let i = 400; i < 600; i++) samples[i] = i % 2 ? 0.5 : -0.5;
  const out = tidyClip(samples, rate);
  // 30 ms before the sound and 150 ms after it are kept, the rest goes.
  assert.equal(out.length, 200 + 30 + 150);
  assert.ok(Math.abs(Math.max(...out.map(Math.abs)) - 0.9) < 1e-6);
  assert.equal(out.at(-1), 0);
  const file = wav16(out, rate);
  assert.equal(file.toString('ascii', 0, 4), 'RIFF');
  assert.equal(file.length, 44 + out.length * 2);
});

// Task 149: the new moments, here with every moment on air (in the real data they wait for their clips).
const allOn = { ...data, moments: Object.fromEntries(Object.entries(data.moments).map(([k, m]) => [k, { ...m, onAir: true }])) };
const playoffMatches = [...byMatch].filter(([, events]) => events[0].stage !== 'regular').map(([id, events]) => {
  const r = events.at(-1).data;
  return { id, stage: events[0].stage, homeId: r.homeId, timeline: createTimeline({ id, events, homeId: r.homeId, awayId: r.awayId }, config) };
});

test('new moments off air are never called; the golden goal and the playoffs\' full times stand in with today\'s lines (Task 149)', () => {
  const off = new Set(Object.entries(data.moments).filter(([, m]) => m.onAir === false).map(([k]) => k));
  for (const { calls } of matches) for (const c of calls) assert.ok(!off.has(c.moment), c.moment);
  for (const p of playoffMatches) {
    const calls = commentaryCalls(p.timeline, { matchId: p.id, homeId: p.homeId, commentatorId: data.playoffs, data, settings, stage: p.stage });
    for (const c of calls) assert.ok(!off.has(c.moment), c.moment);
    assert.ok(calls.some((c) => ['full_time', 'full_time_level', 'full_time_semi', 'full_time_final'].includes(c.moment)), 'full time still called');
  }
});

test('tackles and steals: called, never within turnoverGapSeconds of the ball last being won, mixed with the either lines (Task 149)', () => {
  let n = 0;
  for (const { id, homeId, timeline } of matches) {
    const calls = commentaryCalls(timeline, { matchId: id, homeId, commentatorId: 'el_george', data: allOn, settings });
    const won = timeline.events.filter(({ event: e }) => e.type === 'possession_change' && /** @type {any} */ (e.data)?.reason === 'tackle').map((t) => t.at);
    for (const c of calls.filter((x) => x.moment === 'tackle' || x.moment === 'steal')) {
      n++;
      const at = c.at - settings.delayMs;
      assert.ok(!won.some((w) => w < at && at - w < settings.turnoverGapSeconds * 1000), `a call ${at - Math.max(...won.filter((w) => w < at))} ms after the last`);
      assert.ok(allOn.moments[c.moment].lines.includes(c.line));
    }
    assert.ok(calls.some((c) => c.moment === 'foul') || !timeline.events.some((t) => t.event.type === 'foul'), 'fouls called');
  }
  assert.ok(n > 20, `${n} tackles and steals called`);
});

test('the playoffs: their own full-time lines, and a golden goal with overtime\'s start called (Task 149)', () => {
  for (const p of playoffMatches) {
    const calls = commentaryCalls(p.timeline, { matchId: p.id, homeId: p.homeId, commentatorId: data.playoffs, data: allOn, settings, stage: p.stage });
    assert.ok(calls.some((c) => c.moment === (p.stage === 'final' ? 'full_time_final' : 'full_time_semi')), `${p.id} full time`);
    if (p.timeline.goldenAt >= 0) {
      assert.ok(calls.some((c) => c.moment === 'golden_goal' && Math.abs(c.at - settings.delayMs - p.timeline.goldenAt) < 2000), 'the golden goal');
      assert.ok(calls.some((c) => c.moment === 'overtime'), 'overtime starting');
    }
  }
});

test('holding the ball: one call after holdSeconds with one outfield player on it, never a keeper, not after a jump (Task 149)', () => {
  // Every spell long enough called (rate 1), to test the counting.
  const o = { matchId: 'm', commentatorId: 'el_george', data: { ...allOn, moments: { ...allOn.moments, holding: { ...allOn.moments.holding, rate: 1 } } }, settings };
  const run = (/** @type {(at: number) => [string | null, boolean, boolean?]} */ who, /** @type {(s: any) => void} */ before = () => {}) => {
    const s = holdState();
    holdCall(s, -100, null, { keeper: false, stopped: false }, [], o); // the ball seen travelling first, so the next spell is watched from its start
    before(s);
    const out = [];
    for (let at = 0; at <= 12_000; at += 100) {
      const [id, keeper, stopped = false] = who(at);
      const c = holdCall(s, at, id, { keeper, stopped }, [], o);
      if (c) out.push(c);
    }
    return out;
  };
  const one = run(() => ['p1', false]);
  assert.equal(one.length, 1);
  assert.equal(one[0].at, settings.holdSeconds * 1000 + settings.delayMs);
  assert.equal(run(() => ['k1', true]).length, 0, 'never a keeper');
  // A pass every 3 s: never long enough.
  assert.equal(run((at) => [Math.floor(at / 3000) % 2 ? 'p1' : 'p2', false]).length, 0);
  assert.equal(run(() => ['p1', false], (s) => holdJump(s)).length, 0, 'not the spell under way after a jump');
  // Task 179: never while play is stopped (a substitution, a free shot being set); the count starts again at the restart.
  assert.equal(run(() => ['p1', false, true]).length, 0, 'not while play waits');
  const restart = run((at) => ['p1', false, at >= 2000 && at < 6000]);
  assert.equal(restart.length, 1);
  assert.equal(restart[0].at, 6000 + settings.holdSeconds * 1000 + settings.delayMs);
});

test('holding the ball: "getting warm" only once the heat meter is Warm or Hot (Tom, 2026-10-18)', () => {
  const o = { matchId: 'm', commentatorId: 'el_george', data: { ...allOn, moments: { ...allOn.moments, holding: { ...allOn.moments.holding, rate: 1 } } }, settings, said: /** @type {any[]} */ ([]) };
  const lines = (/** @type {boolean} */ warm) => {
    const s = holdState();
    holdCall(s, -100, null, { keeper: false, stopped: false }, [], o);
    const out = [];
    // A new holder every 10 s, so each spell is called once; far enough apart that none is crowded out.
    for (let at = 0; at < 400_000; at += 100) {
      const c = holdCall(s, at, `p${Math.floor(at / 10_000)}`, { keeper: false, stopped: false, warm }, [], { ...o, said: [] });
      if (c) out.push(c.line);
    }
    return out;
  };
  const cool = lines(false);
  assert.ok(cool.length > 20 && !cool.includes('getting_warm'), 'never while the meter is cool');
  assert.ok(new Set(cool).size >= 3, 'the other holding lines still dealt');
  assert.ok(lines(true).includes('getting_warm'), 'said once it is warm');
});

test('passes in a row and holding the ball keep their distance from each other as well (Task 179)', () => {
  const o = { matchId: 'm', commentatorId: 'el_george', data: { ...allOn, moments: { ...allOn.moments, holding: { ...allOn.moments.holding, rate: 1 } } }, settings, said: /** @type {any[]} */ ([]) };
  // A holding call, then a run of passes whose call would come under minGapSeconds after it.
  const hs = holdState();
  holdCall(hs, -100, null, { keeper: false, stopped: false }, [], o);
  let held = null;
  for (let at = 0; !held; at += 100) held = holdCall(hs, at, 'p1', { keeper: false, stopped: false }, [], o);
  const ps = passState();
  passCall(ps, 0, [500], [], o);
  const n = settings.passRun;
  const kicks = Array.from({ length: n }, (_, i) => held.at - settings.delayMs - (n - 1) * 300 + 1000 + i * 300);
  assert.equal(kicks.map((k) => passCall(ps, k, [500], [], o)).filter(Boolean).length, 0, 'the pass call is left out');
  // Without the shared list it would have come.
  const alone = passState();
  passCall(alone, 0, [500], [], { ...o, said: [] });
  assert.equal(kicks.map((k) => passCall(alone, k, [500], [], { ...o, said: [] })).filter(Boolean).length, 1);
});

test('full time is called after the match\'s playback ends, so the handshakes or the trophy lift must play it (Task 208)', () => {
  for (const { timeline, calls } of matches) {
    const ft = calls.filter((c) => c.moment.startsWith('full_time'));
    assert.equal(ft.length, 1);
    assert.ok(ft[0].at >= timeline.duration + settings.afterWhistleMs);
  }
});

test('calls naming the scorer (Task 247b): only on air, only by the commentators who say names, the rest dealt as before', () => {
  const surnameOf = (/** @type {string} */ id) => `S${id.replace(/\W/g, '')}`;
  const on = { ...data, names: { ...data.names, onAir: true } };
  // Off air (as it shipped until the clips were made, Task 248), whatever data/commentary.json says now.
  const off = { ...data, names: { ...data.names, onAir: false } };
  let named = 0;
  let goals = 0;
  for (const { id, homeId, timeline, calls } of matches) {
    // Off air (as shipped until the clips are made): no change at all, surnames or not.
    for (const who of ['el_george', 'el_daniel']) {
      const plain = commentaryCalls(timeline, { matchId: id, homeId, commentatorId: who, data: off, settings });
      assert.deepEqual(commentaryCalls(timeline, { matchId: id, homeId, commentatorId: who, data: off, settings, surnameOf }), plain);
    }
    // A commentator who doesn't say names: unchanged with them on.
    assert.deepEqual(commentaryCalls(timeline, { matchId: id, homeId, commentatorId: 'el_daniel', data: on, settings, surnameOf }), commentaryCalls(timeline, { matchId: id, homeId, commentatorId: 'el_daniel', data: off, settings }));
    const before = commentaryCalls(timeline, { matchId: id, homeId, commentatorId: 'el_george', data: off, settings });
    const after = commentaryCalls(timeline, { matchId: id, homeId, commentatorId: 'el_george', data: on, settings, surnameOf });
    assert.equal(after.length, before.length);
    after.forEach((c, i) => {
      assert.equal(c.at, before[i].at);
      if (c.moment !== 'goal' && c.moment !== 'scorcher' && c.moment !== 'save') return assert.deepEqual(c, before[i]);
      goals++;
      if (!c.url.includes('/names/')) return;
      named++;
      assert.match(c.url, /^assets\/voices\/el_george\/names\/[a-z_]+-s[a-z0-9]+\.mp3$/);
      if (c.moment === 'scorcher') {
        assert.equal(c.then, clipUrl('el_george', 'scorcher_what'));
        assert.match(c.url, /\/names\/name-/);
      } else assert.equal(c.then, undefined);
      if (c.moment === 'save') assert.match(c.url, /\/names\/save_from_name-/);
    });
    void calls;
  }
  assert.ok(goals > 20 && Math.abs(named / goals - data.names.share) < 0.15, `${named} of ${goals} named`);
});

test('no line twice running (Tom): a tackle then a steal, which share lines, never say the same one back to back', () => {
  let shared = 0;
  for (const [id, events] of [...byMatch].slice(0, 60)) {
    const r = events.at(-1).data;
    const timeline = createTimeline({ id, events, homeId: r.homeId, awayId: r.awayId }, config);
    for (const who of ['el_george', 'el_daniel']) {
      const calls = commentaryCalls(timeline, { matchId: id, homeId: r.homeId, commentatorId: who, data, settings });
      for (let i = 1; i < calls.length; i++) {
        assert.notEqual(calls[i].line, calls[i - 1].line, `${id} ${who}: ${calls[i].line} twice at ${calls[i].at}`);
        if (calls[i].moment !== calls[i - 1].moment && ['tackle', 'steal'].includes(calls[i].moment) && ['tackle', 'steal'].includes(calls[i - 1].moment)) shared++;
      }
    }
  }
  assert.ok(shared > 0, 'tackles and steals do follow each other');
});
