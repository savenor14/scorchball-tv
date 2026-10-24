import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { chantOf, createEarner, emptyData, normalizeData, picturesOf, showing } from '../src/channel/fanCoins.js';

const config = await loadConfigFromDisk();
const s = config.settings.fanCoins;
const MIN = 60_000;
/** A match 50 minutes long on screen, its half-time from 20 to 25 minutes. */
const tl = /** @type {any} */ ({ duration: 50 * MIN, breaks: [{ from: 20 * MIN, to: 25 * MIN }], pauses: [] });
const timelineOf = () => tl;
const match = /** @type {any} */ ({ id: 'm1', kickoff: 0, homeId: 'a', awayId: 'b' });
const live = /** @type {any} */ ({ kind: 'live', match, elapsed: 0, group: [match] });
const talk = (/** @type {number} */ from) => /** @type {any} */ ({ kind: 'talk', topic: 'clip', from, until: from + 20_000 });
const ads = /** @type {any} */ ({ kind: 'ads', part: 'ad', from: 0, until: 1 });
/** A day in the viewer's own time, at noon. */
const NOON = new Date(2026, 9, 15, 12).getTime();

/** Watch `seg(t)` from `from` for `ms`, a frame every `step` ms, the tab showing; returns the coins earned. */
function watch(earner, seg, from, ms, step = 1000, now = NOON) {
  let n = 0;
  for (let x = 0; x <= ms; x += step) n += earner.frame({ t: from + x, wall: from + x, now: now + x, visible: true, seg: seg(from + x) });
  return n;
}

test('a live minute earns a coin, the studio (ads too) one every studioMinutes', () => {
  const data = emptyData();
  const e = createEarner({ config, data, timelineOf });
  assert.equal(watch(e, () => live, 0, 10 * MIN), 10 / s.liveMinutes);
  const d2 = emptyData();
  const e2 = createEarner({ config, data: d2, timelineOf });
  assert.equal(watch(e2, () => talk(0), 0, 20 * MIN), Math.floor(20 / s.studioMinutes));
  const d3 = emptyData();
  assert.equal(watch(createEarner({ config, data: d3, timelineOf }), () => ads, 0, 20 * MIN), Math.floor(20 / s.studioMinutes));
});

test('a hidden tab or a gap between frames counts nothing', () => {
  const data = emptyData();
  const e = createEarner({ config, data, timelineOf });
  // A frame every 10 s: each a gap, so nothing adds up.
  assert.equal(watch(e, () => live, 0, 10 * MIN, 10_000), 0);
  assert.equal(e.frame({ t: 0, wall: 0, now: NOON, visible: false, seg: live }), 0);
});

test('at most dailyCap a day, and a new day in the viewer\'s own time starts again', () => {
  const data = emptyData();
  const e = createEarner({ config, data, timelineOf });
  assert.equal(watch(e, () => live, 0, (s.dailyCap + 30) * s.liveMinutes * MIN), s.dailyCap);
  assert.equal(data.balance, s.dailyCap);
  const tomorrow = new Date(2026, 9, 16, 12).getTime();
  assert.equal(watch(e, () => live, 0, 3 * s.liveMinutes * MIN, 1000, tomorrow), 3);
  assert.equal(data.today, 3);
  assert.equal(data.balance, s.dailyCap + 3);
});

test("re-airs earn by the minute at the studio's rate; a highlights package one, watched whole", () => {
  const reair = (/** @type {number} */ t) => /** @type {any} */ ({ kind: 'reair', part: 'match', match, from: 0, until: 45 * MIN, elapsed: t < 20 * MIN ? t : t + 5 * MIN });
  assert.equal(watch(createEarner({ config, data: emptyData(), timelineOf }), reair, 5 * MIN, 20 * MIN), Math.floor(20 / s.studioMinutes));
  const hl = (/** @type {number} */ t) => (t < 3 * MIN ? /** @type {any} */ ({ kind: 'highlights', match, from: 0, until: 3 * MIN, elapsed: 0 }) : talk(3 * MIN));
  assert.equal(watch(createEarner({ config, data: emptyData(), timelineOf }), hl, 0, 3 * MIN + 2000), 1);
  // Joined part-way: nothing for it.
  assert.equal(watch(createEarner({ config, data: emptyData(), timelineOf }), hl, MIN, 2 * MIN + 2000), 0);
});

test('the off-season show earns a coin a minute as it airs, its repeats as replays', () => {
  const show = (/** @type {boolean} */ repeat) => () => /** @type {any} */ ({ kind: 'draft', season: 1, index: 0, next: null, from: 0, until: 60 * MIN, ...(repeat ? { repeat: true } : {}) });
  assert.equal(watch(createEarner({ config, data: emptyData(), timelineOf }), show(false), 0, 10 * MIN), 10 / s.offseasonMinutes);
  assert.equal(watch(createEarner({ config, data: emptyData(), timelineOf }), show(true), 0, 10 * MIN), Math.floor(10 / s.studioMinutes));
  const lift = () => /** @type {any} */ ({ kind: 'handshakes', match, group: [match], until: 60 * MIN, lift: true });
  assert.equal(watch(createEarner({ config, data: emptyData(), timelineOf }), lift, 0, 3 * MIN), 3 / s.offseasonMinutes);
});

/** A spend as the service's feed gives it (Fan Coins version 2 spends through the audience service; showing() draws them). */
const chantAt = (/** @type {number} */ t, choice = 'ole', side = 'home') => /** @type {any} */ ({ kind: 'chant', at: t, choice, side, instance: 'live:m1', until: t < 20 * MIN ? 20 * MIN : 50 * MIN });
const flagAt = (/** @type {number} */ t, side = 'home') => /** @type {any} */ ({ kind: 'flag', at: t, choice: side, instance: 'live:m1', until: t < 20 * MIN ? 20 * MIN : 50 * MIN });

test('a chant comes round every chantEverySeconds for the rest of its half; a flag stays up to the half\'s end', () => {
  const data = emptyData();
  const at = (/** @type {number} */ t) => ({ t, seg: { ...live, elapsed: t }, timelineOf });
  data.active = [chantAt(MIN, 'on_fire', 'away'), flagAt(MIN)];
  const c = /** @type {NonNullable<ReturnType<typeof chantOf>>} */ (chantOf(config, 'on_fire'));
  const sung = showing(config, data, at(MIN + 500));
  assert.equal(sung.chant?.side, 'away');
  assert.equal(sung.chant?.line, 0);
  assert.equal(showing(config, data, at(MIN + c.length + 1000)).chant, null);
  assert.equal(showing(config, data, at(MIN + s.chantEverySeconds * 1000 + 200)).chant?.round, 1);
  assert.deepEqual(showing(config, data, at(19 * MIN)).flag, { side: 'home' });
  assert.equal(showing(config, data, at(21 * MIN)).flag, null);
});

test('FAN BOARD is up beside the scorebug for screenMinutes, whatever is on, then goes (Tom, 2026-10-21)', () => {
  const data = emptyData();
  data.active = [/** @type {any} */ ({ kind: 'screen', at: MIN, choice: 'hello', until: MIN + s.screenMinutes * MIN })];
  const e = createEarner({ config, data, timelineOf });
  e.frame({ t: 2 * MIN, wall: 0, now: NOON, visible: true, seg: live });
  assert.equal(showing(config, data, { t: 2 * MIN, seg: live, timelineOf }).screen, 'hello');
  e.frame({ t: 3 * MIN, wall: 100, now: NOON, visible: true, seg: talk(3 * MIN) });
  assert.equal(showing(config, data, { t: 3 * MIN, seg: talk(3 * MIN), timelineOf }).screen, 'hello');
  const end = MIN + s.screenMinutes * MIN;
  e.frame({ t: end, wall: 200, now: NOON, visible: true, seg: ads });
  assert.equal(showing(config, data, { t: end, seg: ads, timelineOf }).screen, null);
  assert.equal(data.active.length, 0);
});

test('the chants\' lines cover their tunes; the pictures are the general ones and one a team', () => {
  for (const ch of config.fanCoins.chants) {
    const c = /** @type {NonNullable<ReturnType<typeof chantOf>>} */ (chantOf(config, ch.id));
    assert.equal(c.lines.at(-1)?.to, c.length);
    assert.ok(c.length > 3000 && c.length < 10_000, `${ch.id} is ${c.length} ms`);
  }
  assert.equal(picturesOf(config).length, config.fanCoins.pictures.length + config.teams.teams.length);
  assert.deepEqual(normalizeData({ v: 1, balance: -3 }).balance, 0);
});

test("a chant round and a flag keep out of a goal's celebration", () => {
  // A goal at 1:47 celebrated for 30 s: the round due at 1:45 (the chant spent at 1:00) would run into it, so it waits until 2:17.
  const goalTl = /** @type {any} */ ({ ...tl, pauses: [{ at: 107_000, ms: 30_000, kind: 'goal' }] });
  const at = (/** @type {number} */ t) => ({ t, seg: { ...live, elapsed: t }, timelineOf: () => goalTl });
  const data = emptyData();
  data.active = [chantAt(MIN), flagAt(MIN, 'away')];
  assert.equal(showing(config, data, at(106_000)).chant, null);
  assert.equal(showing(config, data, at(138_000)).chant?.start, 137_000);
  assert.equal(showing(config, data, at(110_000)).flag, null);
  assert.deepEqual(showing(config, data, at(140_000)).flag, { side: 'away' });
});

test('a fan shout is on screen for shoutSeconds over its end', () => {
  const at = (/** @type {number} */ t) => ({ t, seg: { ...live, elapsed: t }, timelineOf });
  const data = emptyData();
  data.active = [/** @type {any} */ ({ kind: 'shout', at: MIN, choice: 'COME ON!', side: 'away', instance: 'live:m1', until: MIN + s.shoutSeconds * 1000 })];
  assert.deepEqual(showing(config, data, at(MIN + 1000)).shout, { words: 'COME ON!', side: 'away' });
  assert.equal(showing(config, data, at(MIN + s.shoutSeconds * 1000 + 1)).shout, null);
});

test('a re-air shows the match\'s spends again at the moment of the match they had live (2026-10-18)', () => {
  const chantId = config.fanCoins.chants[0].id;
  const replays = /** @type {any[]} */ ([
    { id: 1, kind: 'chant', at: 2 * MIN, until: 20 * MIN, choice: chantId, side: 'away', instance: 'live:m1' },
    { id: 2, kind: 'flag', at: 26 * MIN, until: 50 * MIN, choice: 'home', instance: 'live:m1' },
    { id: 3, kind: 'shout', at: 5 * MIN, until: 5 * MIN + 30_000, choice: 'GO ANVILS!', side: 'home', instance: 'live:m1' },
  ]);
  const later = 10 * 60 * MIN;
  const reair = (/** @type {number} */ elapsed, part = 'match') => /** @type {any} */ ({ kind: 'reair', match, part, elapsed, from: later, until: later + 60 * MIN });
  const at = (/** @type {number} */ elapsed, part = 'match') => showing(config, emptyData(), { t: later + 7 * MIN + elapsed, seg: reair(elapsed, part), timelineOf }, replays);
  // The chant as it was sung live, the same round and the same moment of it.
  const liveData = emptyData();
  liveData.active = replays;
  const sungLive = showing(config, liveData, { t: 2 * MIN + 1000, seg: live, timelineOf });
  const sungAgain = at(2 * MIN + 1000);
  assert.ok(sungLive.chant && sungAgain.chant);
  assert.deepEqual([sungAgain.chant.side, sungAgain.chant.into, sungAgain.chant.start], [sungLive.chant.side, sungLive.chant.into, sungLive.chant.start]);
  assert.deepEqual(at(5 * MIN + 10_000).shout, { words: 'GO ANVILS!', side: 'home' });
  assert.equal(at(6 * MIN).shout, null, 'the shout over, as it was live');
  assert.deepEqual(at(30 * MIN).flag, { side: 'home' }, 'the second half\'s flag');
  assert.equal(at(30 * MIN).chant, null, 'the first half\'s chant done');
  // Only in the match itself, and only this match's.
  assert.equal(at(0, 'intro').chant, null);
  const other = /** @type {any} */ ({ ...reair(3 * MIN), match: { ...match, id: 'm2' } });
  assert.equal(showing(config, emptyData(), { t: later, seg: other, timelineOf }, replays).chant, null);
});
