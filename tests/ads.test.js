// The ads (Task 105; docs/channel.md §16.11): data/spots.json, which ad each break plays (each gap's own seeded order,
// 1-3, 4-6, …, Task 158), the stills' order, the facts the ads show, and that every ad has its drawing and a jingle that plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AD_SCENES } from '../src/channel/spotArt.js';
import { adFacts, adIndex, adOrder, adsFor, playoffTimes, promoStage, PROMO_ID, shopWith, stillAt, stillOrder } from '../src/channel/spots.js';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createProgramme } from '../src/channel/programme.js';
import { recipe } from '../src/channel/soundRecipes.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const { ads } = config.ads;
const calendar = createCalendar(config);
const slots = calendar.slots(1);
/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const formatTime = (/** @type {number} */ t) => new Intl.DateTimeFormat('en-US', { timeZone: config.settings.live.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(t).toUpperCase().replace(',', '');

test('every ad in data/spots.json has its drawing, and a jingle that Web Audio can play', () => {
  assert.equal(new Set(ads.map((/** @type {any} */ a) => a.id)).size, ads.length);
  for (const ad of ads) {
    assert.equal(typeof AD_SCENES[ad.scene], 'function', ad.id);
    const r = recipe('jingle', ad.id, { jingle: ad.jingle });
    assert.ok(r.layers.length >= ad.jingle.notes.length);
    // It ends inside the ad.
    assert.ok(ad.jingle.at + r.duration <= config.settings.ads.adSeconds, `${ad.id}'s jingle fits`);
  }
});

test('breaks carry on through the ads, wrapping round (Tom: 1-3, 4-6, ...)', () => {
  const per = config.settings.ads.perBreak;
  const order = [0, 1, 2].map((brk) => [0, 1, 2].map((ad) => adIndex(brk, ad, per, ads.length)));
  assert.deepEqual(order.flat(), [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => i % ads.length));
});

test('the gap\'s order (Task 158): every ad once, seeded, the same on every screen, new each gap; the promo only in its window', () => {
  const ids = (/** @type {any[]} */ list) => list.map((a) => a.id);
  const a = adOrder(ads, 'seed-a', 's1-r3-m2', 'playoffs');
  assert.deepEqual([...ids(a)].sort(), [...ids(ads)].sort());
  assert.deepEqual(ids(adOrder(ads, 'seed-a', 's1-r3-m2', 'playoffs')), ids(a));
  // Other gaps, and another league, shuffle differently.
  const others = ['s1-r3-m3', 's1-r3-m4', 's1-r4-m1', 's1-r4-m2'].map((g) => ids(adOrder(ads, 'seed-a', g, 'playoffs')).join());
  assert.ok(others.some((o) => o !== ids(a).join()));
  assert.ok(new Set(others).size > 1);
  assert.notEqual(ids(adOrder(ads, 'seed-b', 's1-r3-m2', 'playoffs')).join(), ids(a).join());
  // Outside the window the promo drops out and the others keep their order.
  const off = adOrder(ads, 'seed-a', 's1-r3-m2', 'off');
  assert.deepEqual(ids(off), ids(a).filter((id) => id !== PROMO_ID));
  // A gap's first breaks play every ad once before any repeats.
  const per = config.settings.ads.perBreak;
  const played = Array.from({ length: off.length }, (_, k) => off[adIndex(Math.floor(k / per), k % per, per, off.length)].id);
  assert.equal(new Set(played).size, off.length);
});

test('each break in a slot is numbered from 0, so the next carries on, and knows its gap', () => {
  const live = new LiveLeague(config, { now: slots[3].kickoff, seed: 'ads-tests' });
  const programme = createProgramme(live, timelineOf);
  /** @type {Map<string, number[]>} */
  const bySlot = new Map();
  let slot = '';
  for (let t = slots[3].kickoff; t < slots[5].kickoff;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = programme.at(Math.max(p.from, t));
    if (seg.kind === 'full_time') slot = seg.match.id;
    if (seg.kind === 'ads' && seg.part === 'bumper_in' && slot) {
      assert.equal(seg.gap, slot);
      bySlot.set(slot, [...(bySlot.get(slot) ?? []), seg.brk]);
    }
    t = p.until > t ? p.until : t + 1000;
  }
  assert.ok(bySlot.size >= 2);
  for (const brks of bySlot.values()) assert.deepEqual(brks, brks.map((_, i) => i));
});

test('the stills\' order never opens a pass with the ad the last one ended on', () => {
  for (let pass = 1; pass < 200; pass++) {
    const [before, now] = [stillOrder(ads, 'seed-a', pass - 1, 'off'), stillOrder(ads, 'seed-a', pass, 'off')];
    assert.notEqual(now[0], before[before.length - 1], `pass ${pass}`);
  }
});

test('the facts: this season\'s scorchers so far, and when the playoffs are', () => {
  const t = slots[30].kickoff - 1000;
  const live = new LiveLeague(config, { now: t, seed: 'ads-tests' });
  const facts = adFacts(live, t, { timelineOf, formatTime });
  const finished = live.matchesIn(1).filter((m) => t >= m.kickoff + timelineOf(m).duration);
  const total = finished.reduce((n, m) => n + m.summary.teamStats.home.scorchers + m.summary.teamStats.away.scorchers, 0);
  assert.equal(facts.scorchers, total);
  assert.ok(total > 0);
  // Both semifinals on one day: the day named once.
  const p = playoffTimes(slots, calendar.regularCount, formatTime);
  assert.match(p.semis, /^Semis [A-Z][a-z]{2} \d\d:\d\d and \d\d:\d\d$/);
  assert.match(p.final, /^Finals [A-Z][a-z]{2} \d\d:\d\d$/);
});

test('the league\'s own facts (Task 161): every team\'s goals and burns so far this season, the playoffs\' too; the shop\'s shirt: the next live match\'s home team, or the one on screen for the still', () => {
  const n = calendar.regularCount;
  const final = slots[n + 2];
  // Between the semifinals' end and the final: the playoffs count too.
  const t = final.kickoff - 60_000;
  const live = new LiveLeague(config, { now: t, seed: 'ads-tests' });
  const facts = adFacts(live, t, { timelineOf, formatTime });
  const finished = live.matchesIn(1).filter((m) => t >= m.kickoff + timelineOf(m).duration);
  assert.ok(finished.some((m) => m.stage === 'semifinal'));
  assert.equal(facts.goals, finished.reduce((s, m) => s + m.summary.result.homeGoals + m.summary.result.awayGoals, 0));
  assert.equal(facts.burns, finished.reduce((s, m) => s + m.summary.teamStats.home.burns + m.summary.teamStats.away.burns, 0));
  assert.ok(facts.goals > 0 && facts.burns > 0);
  assert.equal(facts.season, 1);
  // The shop: all eight kits; before the final, the final's home team (the next live match); another screen agrees.
  assert.equal(facts.shop.kits.length, Object.keys(live.league.teams).length);
  // The final's home team is the better seed, the first of the finalists.
  assert.equal(facts.shop.name, facts.playoffs.finalists?.[0].name);
  // Another screen, its league built a moment later (before the final kicks off), agrees.
  const other = new LiveLeague(config, { now: t + 30_000, seed: 'ads-tests' });
  assert.deepEqual(adFacts(other, t, { timelineOf, formatTime }).shop, facts.shop);
  // And it is the final as played (the upcoming final at the better seed's ground, as the sim plays it).
  const played = new LiveLeague(config, { now: t + 3_600_000, seed: 'ads-tests' });
  const theFinal = /** @type {any} */ (played.matchesIn(1).find((m) => m.slot === final.index));
  assert.equal(facts.shop.kits[facts.shop.pick].id, theFinal.homeId);
  // Early in the season, each break's shirt is its next live match's home team (as played, from a league built after).
  const after = new LiveLeague(config, { now: slots[12].kickoff, seed: 'ads-tests' });
  for (const k of [2, 5, 9]) {
    const at = slots[k].kickoff - 600_000;
    const shop = adFacts(new LiveLeague(config, { now: at, seed: 'ads-tests' }), at, { timelineOf, formatTime }).shop;
    const nextUp = /** @type {any} */ (after.matchesIn(1).find((m) => m.slot === k));
    assert.equal(shop.kits[shop.pick].id, nextUp.homeId, `slot ${k}`);
  }
  // The still: the home team of the match on screen, whatever the break's facts say; nothing on screen, unchanged.
  const away = facts.shop.kits.find((kit) => kit.id !== theFinal.homeId);
  const onScreen = shopWith(facts, away?.id);
  assert.equal(onScreen.shop.kits[onScreen.shop.pick].id, away?.id);
  assert.equal(onScreen.shop.name, away?.name);
  assert.equal(shopWith(facts, null), facts);
});

test('the playoffs promo runs from midway through the regular season until the final kicks off (Task 111)', () => {
  const share = config.settings.ads.promoFromShare;
  const n = calendar.regularCount;
  const from = slots[Math.floor(n * share)].kickoff;
  const semi = slots[n].kickoff;
  const final = slots[n + 2].kickoff;
  assert.equal(promoStage(calendar, slots[0].kickoff, share), 'off');
  assert.equal(promoStage(calendar, from - 1, share), 'off');
  assert.equal(promoStage(calendar, from, share), 'playoffs');
  assert.equal(promoStage(calendar, semi - 1, share), 'playoffs');
  assert.equal(promoStage(calendar, semi, share), 'final');
  assert.equal(promoStage(calendar, final - 1, share), 'final');
  assert.equal(promoStage(calendar, final, share), 'off');
  // The off-season, and the start of the next season.
  assert.equal(promoStage(calendar, calendar.seasonStart(2) - 1, share), 'off');
  assert.equal(promoStage(calendar, calendar.slots(2)[0].kickoff, share), 'off');
  // Outside the window the breaks carry on with the other ads.
  assert.ok(adsFor(ads, 'off').every((/** @type {any} */ a) => a.id !== PROMO_ID));
  assert.equal(adsFor(ads, 'off').length, ads.length - 1);
  assert.equal(adsFor(ads, 'playoffs'), ads);
});

test('the final\'s promo names the finalists, better seed first, only once both semifinals have finished on screen', () => {
  const n = calendar.regularCount;
  const semi2 = slots[n + 1];
  const final = slots[n + 2];
  const live = new LiveLeague(config, { now: final.kickoff, seed: 'ads-tests' });
  const sf2 = /** @type {any} */ (live.matchesIn(1).find((m) => m.slot === semi2.index));
  const ends = sf2.kickoff + timelineOf(sf2).duration;
  const during = adFacts(live, ends - 1000, { timelineOf, formatTime });
  assert.equal(during.playoffs.stage, 'final');
  assert.equal(during.playoffs.finalists, null);
  const after = adFacts(live, ends, { timelineOf, formatTime });
  const f = /** @type {any} */ (live.matchesIn(1).find((m) => m.slot === final.index));
  const name = (/** @type {string} */ id) => live.league.teams[id].shortName;
  assert.deepEqual(after.playoffs.finalists?.map((x) => x.name), [name(f.homeId), name(f.awayId)]);
  assert.match(after.playoffs.finalAt, /^[A-Z][a-z]{2} \d\d:\d\d$/);
  // Every screen agrees: a league built later gives the same facts for the same moment.
  const later = new LiveLeague(config, { now: final.kickoff + 3_600_000, seed: 'ads-tests' });
  assert.deepEqual(adFacts(later, ends, { timelineOf, formatTime }), after);
});

test('the ad stills (Task 113): the next every stillMinutes, each ad once a pass (Task 158), the promo only in its window, the same on every screen', () => {
  const minutes = config.settings.ads.stillMinutes;
  const every = minutes * 60_000;
  // Early in the season: no promo; each pass (from a multiple of the count) every other ad once, never the same twice running.
  const brands = ads.filter((/** @type {any} */ a) => a.id !== PROMO_ID).map((/** @type {any} */ a) => a.id);
  const n = brands.length;
  const early = Math.ceil(slots[2].kickoff / (every * n)) * every * n;
  const live = new LiveLeague(config, { now: early + 3 * n * every, seed: 'ads-tests' });
  const ids = Array.from({ length: 3 * n }, (_, k) => stillAt(ads, live, early + k * every, minutes, { timelineOf, formatTime }).ad.id);
  assert.ok(!ids.includes(PROMO_ID));
  for (let pass = 0; pass < 3; pass++) assert.deepEqual([...ids.slice(pass * n, (pass + 1) * n)].sort(), [...brands].sort());
  for (let k = 1; k < ids.length; k++) assert.notEqual(ids[k], ids[k - 1]);
  // Passes are shuffled afresh.
  assert.notDeepEqual(ids.slice(0, n), ids.slice(n, 2 * n));
  // It holds for its whole turn, and another screen built later picks the same.
  const a = stillAt(ads, live, early + 3 * every + 1000, minutes, { timelineOf, formatTime });
  const b = stillAt(ads, new LiveLeague(config, { now: early + 20 * every, seed: 'ads-tests' }), early + 4 * every - 1000, minutes, { timelineOf, formatTime });
  assert.equal(a.ad.id, b.ad.id);
  assert.equal(a.key, b.key);
  // Past midway the promo comes round too: once in a whole pass (from a pass's start, every ad counted).
  const pass = every * ads.length;
  const mid = Math.ceil(slots[Math.ceil(calendar.regularCount * config.settings.ads.promoFromShare) + 1].kickoff / pass) * pass;
  const late = new LiveLeague(config, { now: mid + 2 * pass, seed: 'ads-tests' });
  const later = Array.from({ length: ads.length }, (_, k) => stillAt(ads, late, mid + k * every, minutes, { timelineOf, formatTime }).ad.id);
  assert.ok(later.includes(PROMO_ID));
});

test('the league\'s own ads (Task 146): Tickets shows the next live match; Season tickets a team and this season, then next season from the playoffs', async () => {
  const { adFacts } = await import('../src/channel/spots.js');
  const formatTime = (/** @type {number} */ t) => String(t);
  const before = slots[3].kickoff - 60_000;
  const live = new LiveLeague(config, { now: before, seed: 'ads-tests' });
  const f = adFacts(live, before, { timelineOf, formatTime });
  assert.equal(f.tickets?.when, String(slots[3].kickoff), 'the next kick-off');
  assert.ok(f.tickets?.home && f.tickets.away, 'its teams, known in the regular season');
  assert.equal(f.seasonTickets.season, 1);
  assert.ok(Object.values(live.league.teams).some((t) => t.name === f.seasonTickets.name && t.colours.primary === f.seasonTickets.primary));
  // The same moment, the same team (every screen agrees); the playoffs on, next season on sale.
  assert.deepEqual(adFacts(live, before, { timelineOf, formatTime }).seasonTickets, f.seasonTickets);
  const semi = slots.find((s) => s.stage === 'semifinal');
  if (!semi) return;
  const during = new LiveLeague(config, { now: semi.kickoff + 60_000, seed: 'ads-tests' });
  assert.equal(adFacts(during, semi.kickoff + 60_000, { timelineOf, formatTime }).seasonTickets.season, 2);
});

test('Task 205: every ad has its sound effects, each one the sound board knows, inside the ad', async () => {
  const { EFFECTS, effectLayers } = await import('../src/channel/musicRecipes.js');
  for (const ad of config.ads.ads) {
    assert.ok(ad.effects?.length, `${ad.id} has effects`);
    for (const e of ad.effects) {
      assert.ok(EFFECTS.includes(e.effect), `${ad.id}: ${e.effect} is an effect`);
      assert.ok(effectLayers(e.effect).length > 0, `${e.effect} has layers`);
      assert.ok(e.at >= 0 && e.at < config.settings.ads.adSeconds, `${ad.id}: ${e.effect} at ${e.at} s`);
    }
  }
});

test('until a new season\'s first match has finished, the ads quote the season just finished (Task 277b)', () => {
  const t = calendar.seasonStart(2) + 10 * 60_000;
  const live = new LiveLeague(config, { now: t, seed: 'ads-tests' });
  const f = adFacts(live, t, { timelineOf, formatTime });
  assert.equal(f.season, 2);
  assert.ok(f.lastSeason);
  assert.equal(f.numbersSeason, 1);
  assert.ok(f.goals > 0 && f.burns > 0 && f.scorchers > 0);
  const first = calendar.slots(2)[0].kickoff;
  live.advanceTo(first + 60 * 60_000);
  const after = adFacts(live, first + 60 * 60_000, { timelineOf, formatTime });
  assert.equal(after.lastSeason, false);
  assert.equal(after.numbersSeason, 2);
});
