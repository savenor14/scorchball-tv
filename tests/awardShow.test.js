// The awards on air (the off-season show, Task 191; src/channel/awardShow.js, docs/channel.md §19.2): after the
// champions, the desk's intro and each award the sim gave, in order, a minute each; what each shows comes from the
// sim's award events; the guide lists them as AWARDS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardBeats, awardEvents, awardOrder, awardView, statText } from '../src/channel/awardShow.js';
import { createCalendar } from '../src/channel/calendar.js';
import { groupEntries, guideKind } from '../src/channel/guide.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createProgramme } from '../src/channel/programme.js';
import { talkScript } from '../src/channel/talk.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const aw = config.settings.awards;
const cal = createCalendar(config);
const slots = cal.slots(1);
/** @type {Map<string, any>} */
const tls = new Map();
const timelineOf = (/** @type {any} */ m) => tls.get(m.id) ?? tls.set(m.id, createTimeline(m, config)).get(m.id);
const live = new LiveLeague(config, { now: slots[58].kickoff, seed: 'award-show-tests' });
const final = live.matchesIn(1)[58];
const end = final.kickoff + timelineOf(final).duration;
live.advanceTo(end + 60 * 60_000);
// Season 1 is the founding season: no rookies, so no Spark (Task 252); the five others air.
const given1 = awardOrder(aw, awardEvents(live.leagueEvents, 1));

test('after the champions: the awards\' talk, then each award a minute, in order, the Ember Boot last', () => {
  const programme = createProgramme(live, timelineOf);
  /** @type {any[]} */
  const segs = [];
  for (let t = end; t < end + 40 * 60_000;) {
    const p = programme.pieceAt(t);
    segs.push({ ...p, seg: programme.at(Math.max(p.from, t)) });
    t = p.until > t ? p.until : t + 1000;
  }
  const i = segs.findIndex((x) => x.seg.kind === 'talk' && x.seg.topic === 'awards');
  assert.ok(i > 0 && segs[i - 1].seg.kind === 'champion', 'right after the champions');
  assert.deepEqual(given1, aw.order.filter((id) => id !== 'spark'));
  const awards = segs.slice(i + 1, i + 1 + given1.length);
  assert.deepEqual(awards.map((x) => x.seg.kind === 'award' && x.seg.award), given1);
  assert.equal(aw.order[0], 'spark');
  assert.equal(aw.order.at(-1), 'ember_boot');
  for (const x of awards) assert.equal(x.until - x.from, aw.awardSeconds * 1000);
  assert.ok(['farewell', 'lottery'].includes(segs[i + 1 + given1.length].seg.kind), 'then the off-season (the farewells or the lottery, Task 192)');
  // The desk's intro names them all, in order.
  const script = /** @type {any[]} */ (talkScript(segs[i].seg, live, segs[i].from, { timelineOf, playerName: (id) => id, formatTime: () => '' }));
  assert.equal(script.length, 2);
  assert.match(String(script[1].show), /BLAZE · COMPASS · QUELL · IRONCLAD · EMBER BOOT/);
  // The guide: one AWARDS entry, the intro talk with them.
  assert.equal(guideKind(segs[i].seg), 'awards');
  const entries = groupEntries(segs.map((x) => ({ from: x.from, until: x.until, seg: x.seg })));
  const a = entries.filter((e) => e.kind === 'awards');
  assert.equal(a.length, 1);
  assert.equal(a[0].until - a[0].from, segs[i].until - segs[i].from + given1.length * aw.awardSeconds * 1000);
});

test('each award shows what the sim decided: the winner, their stat, the next two', () => {
  const given = awardEvents(live.leagueEvents, 1);
  assert.deepEqual([...given.keys()].sort(), [...given1].sort());
  const name = (/** @type {string} */ id) => `${live.league.players[id].firstName} ${live.league.players[id].lastName}`;
  const plural = (/** @type {string} */ p) => ({ K: 'KEEPERS', D: 'DEFENDERS' })[p] ?? p;
  for (const id of awardOrder(aw, given)) {
    const e = /** @type {any} */ (given.get(id));
    const v = awardView(e, config.rules.awards, name, plural);
    assert.equal(v.winner.playerId, e.playerId);
    assert.equal(v.winner.name, name(e.playerId));
    assert.equal(v.shortlist.length, 2);
    assert.ok(v.shortlist.every((s) => s.playerId !== e.playerId));
    if (id === 'quell') assert.match(v.forWhat, /MOST STOPS · DEFENDERS/);
    if (id === 'ironclad') assert.match(v.winner.stat, /^\d+\.\d% SAVED · \d+ OF \d+$/);
    if (id === 'ember_boot') assert.equal(v.winner.stat, `${e.data.value} GOALS`);
  }
  assert.equal(statText('savePct', 0.7762), '77.6% SAVED');
});

test('the beats: the third named, then the second, then the winner steps in and lifts it', () => {
  const at = (/** @type {number} */ s) => awardBeats(s * 1000, aw);
  assert.deepEqual(at(0), { named: 0, stepIn: 0, lifted: false });
  assert.equal(at(aw.shortlistAt).named, 1);
  assert.equal(at(aw.secondAt).named, 2);
  assert.ok(at(aw.winnerAt + 0.75).stepIn > 0 && at(aw.winnerAt + 0.75).stepIn < 1);
  assert.ok(at(aw.liftAt).lifted && at(aw.liftAt).stepIn === 1);
});
