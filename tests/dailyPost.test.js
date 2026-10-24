// The league's daily post (the Director's TODAY tab; src/director/dailyPost.js, src/cli/directorDesk.js todayPosts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayPost, postLength, POST_MAX } from '../src/director/dailyPost.js';
import { deskPaths, todayPosts } from '../src/cli/directorDesk.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { createCalendar } from '../src/channel/calendar.js';

const config = await loadConfigFromDisk();
const S = 1000;
const abbr = (/** @type {string} */ id) => id.toUpperCase();
const playerName = (/** @type {string} */ id) => `P. ${id}`;

/** A finished match: its goals as [ms after kick-off, scorer, scorcher?], its result. */
function match(/** @type {string} */ id, /** @type {string} */ h, /** @type {string} */ a, /** @type {number} */ hg, /** @type {number} */ ag, /** @type {any[]} */ goals = [], /** @type {any} */ extra = {}) {
  return {
    m: /** @type {any} */ ({ id, season: 2, stage: 'regular', round: 4, kickoff: 0, homeId: h, awayId: a, summary: { result: { homeGoals: hg, awayGoals: ag, decidedBy: 'regulation', shootout: null, ...(extra.result ?? {}) } }, ...(extra.match ?? {}) }),
    tl: /** @type {any} */ ({ duration: 40 * 60 * S, goldenAt: extra.goldenAt ?? -1, events: goals.map(([at, who, scorcher]) => ({ at, event: { type: 'goal', playerId: who, clock: at / 1000, data: { scorcher: Boolean(scorcher), score: [1, 0] } } })) }),
  };
}
const post = (/** @type {ReturnType<typeof match>[]} */ ms, /** @type {any} */ o = {}) => {
  const tls = new Map(ms.map((x) => [x.m.id, x.tl]));
  return dayPost({ heading: 'Scorchball · Season 2, Thursday', matches: ms.map((x) => x.m), timelineOf: (m) => tls.get(m.id), playerName, abbr, clipSettings: config.settings.clips, table: o.table ?? [], fullTable: o.fullTable ?? [], potm: o.potm, dayKey: 's2d3', link: 'scorchball.tv/?from=bsky', max: o.max ?? POST_MAX });
};

test('a day\'s post: the day in a line, one standout, the link; the picture\'s alt text the whole day (results, table)', () => {
  const table = [{ teamId: 'pcg', points: 19, won: 6, drawn: 1, lost: 2 }, { teamId: 'qsh', points: 18, won: 6, drawn: 0, lost: 3 }];
  const p = post([match('m1', 'pcg', 'var', 5, 2, [[60 * S, 'x', true]]), match('m2', 'lis', 'ska', 2, 1)], { table, fullTable: table });
  assert.equal(p.text, 'Scorchball · Season 2, Thursday: 2 matches, 10 goals.\nBiggest win: PCG 5-2 VAR.\nscorchball.tv/?from=bsky');
  assert.equal(p.chars, postLength(p.text));
  assert.equal(p.alt, 'Scorchball · Season 2, Thursday\nResults: PCG 5-2 VAR, LIS 2-1 SKA.\nThe table: 1 PCG 19, 2 QSH 18.\nBiggest win: PCG 5-2 VAR.');
  assert.equal(p.clip?.kind, 'scorcher', 'the day\'s best moment for a clip');
  assert.equal(p.card.table.length, 2, 'the whole table on the card');
});

test('the standout, best first: a five-goal haul (the final score, not the score at the time), a golden goal, the champions; else the scorchers', () => {
  const haul = match('m1', 'var', 'lis', 13, 2, [1, 2, 3, 4, 5].map((k) => [k * 100 * S, 'b']));
  assert.match(post([haul]).text, /\nFive goals for P\. b in VAR 13-2 LIS\.\n/);
  const golden = match('m2', 'kes', 'wrs', 4, 3, [[2000 * S, 'g']], { goldenAt: 2000 * S, result: { decidedBy: 'overtime' } });
  const p = post([haul, golden]);
  assert.match(p.alt, /KES 4-3 WRS \(golden goal\)/);
  assert.match(p.text, /\nA golden goal: P\. g, 34', KES 4-3 WRS\.\n/);
  const final = match('m3', 'ska', 'pcg', 8, 6, [[300 * S, 'j']], { match: { stage: 'final' } });
  const f = post([final], { fullTable: [{ teamId: 'ska', points: 30, won: 10, drawn: 0, lost: 4 }] });
  assert.match(f.text, /\nSKA are champions, 8-6 over PCG, the last goal P\. j's \(6'\)\.\n/);
  assert.match(f.alt, /The final table: 1 SKA 30\./);
  assert.equal(f.card.champions, 'ska');
  assert.match(post([match('m4', 'a', 'b', 2, 1, [[60 * S, 'x', true], [90 * S, 'y', true]])]).text, /\n2 scorchers on the day\.\n/);
  const pens = match('m5', 'a', 'b', 3, 3, [], { result: { decidedBy: 'shootout', shootout: { home: 4, away: 3 } } });
  assert.match(post([pens]).alt, /A 3-3 B \(4-3 pens\)/);
});

test('the player of the day in the post; the standout left out when it\'s their own haul, or when the post is too long', () => {
  const st = (/** @type {string} */ teamId, /** @type {object} */ x) => ({ teamId, started: true, secondsPlayed: 1200, goals: 0, assists: 0, scorchers: 0, shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0, fouls: 0, burns: 0, blocks: 0, conceded: 0, ...x });
  const haul = match('m1', 'var', 'lis', 13, 2, [1, 2, 3, 4, 5].map((k) => [k * 100 * S, 'b']));
  haul.m.summary.playerStats = { b: st('var', { goals: 5, assists: 2 }), c: st('lis', { goals: 2 }) };
  const p = post([haul], { potm: config.interviews.potm });
  assert.equal(p.text, 'Scorchball · Season 2, Thursday: 1 match, 15 goals.\nPlayer of the day: P. b (VAR), 5 goals and 2 assists in 1 match.\nscorchball.tv/?from=bsky');
  assert.deepEqual([p.card.playerOfDay?.who, p.card.playerOfDay?.line], ['P. b', '5 GOALS, 2 ASSISTS IN 1 MATCH']);
  assert.match(p.alt, /Five goals for P\. b in VAR 13-2 LIS\./, 'the alt text keeps it');
  const golden = match('m2', 'kes', 'wrs', 4, 3, [[2000 * S, 'g']], { goldenAt: 2000 * S, result: { decidedBy: 'overtime' } });
  golden.m.summary.playerStats = { g: st('kes', { goals: 1 }) };
  const short = post([haul, golden], { potm: config.interviews.potm, max: 160 });
  assert.ok(short.chars <= 160, String(short.chars));
  assert.match(post([haul, golden], { potm: config.interviews.potm }).text, /golden goal/, 'with room, it stays');
  assert.ok(!/golden goal/.test(short.text), 'too long: the standout goes');
  assert.match(short.text, /scorchball\.tv\/\?from=bsky$/);
});

test('TODAY offers a day only once its last match is over by the real clock (no spoilers); newest first', async () => {
  const cal = createCalendar(config);
  // The dev league's season 1, its second day: when its last match ends.
  const late = await todayPosts(deskPaths(), cal.instant(1, 3 * 1440), 'flareball');
  const d1 = late.days.find((d) => d.key === 's1d1');
  assert.ok(d1, 'offered the next day');
  const ended = Date.parse(d1.endedAt);
  const before = await todayPosts(deskPaths(), ended - 60 * S, 'flareball');
  assert.ok(!before.days.some((d) => d.key === 's1d1'), 'not a minute before its last match ends');
  assert.ok(before.days.every((d) => Date.parse(d.endedAt) <= ended - 60 * S), 'nothing that has not finished');
  const after = await todayPosts(deskPaths(), ended + 60 * S, 'flareball');
  assert.equal(after.days[0].key, 's1d1', 'a minute after, and first');
  assert.ok(late.days.every((d) => d.chars <= POST_MAX));
});

test('the player of the day: their player-of-the-match scores added up over the day\'s matches, the stats summed; seeded ties', async () => {
  const { playerOfTheDay } = await import('../src/sim/potm.js');
  const potm = config.interviews.potm;
  const st = (/** @type {string} */ teamId, /** @type {object} */ s) => ({ teamId, started: true, secondsPlayed: 1200, goals: 0, assists: 0, scorchers: 0, shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0, fouls: 0, burns: 0, blocks: 0, conceded: 0, ...s });
  const m = (/** @type {string} */ id, /** @type {any} */ stats, hg = 1, ag = 0) => /** @type {any} */ ({ id, homeId: 'h', awayId: 'a', summary: { result: { homeGoals: hg, awayGoals: ag, decidedBy: 'regulation', shootout: null }, playerStats: stats } });
  // One big match beats nothing; two good matches beat one big one.
  const day = [m('m1', { x: st('h', { goals: 3 }), y: st('a', { goals: 1 }) }), m('m2', { x: st('h', { goals: 2 }), z: st('a', { goals: 4 }) }, 2, 4)];
  const p = /** @type {any} */ (playerOfTheDay(day, potm, 's2d3'));
  assert.equal(p.playerId, 'x', 'five over two matches beat four in one');
  assert.deepEqual([p.matches, p.stats.goals], [2, 5]);
  // A tie is settled the same way every time, by the day.
  const tied = [m('m3', { x: st('h', { goals: 1 }), y: st('h', { goals: 1 }) })];
  assert.equal(playerOfTheDay(tied, potm, 's2d4')?.playerId, playerOfTheDay(tied, potm, 's2d4')?.playerId);
  assert.equal(playerOfTheDay([], potm, 'x'), null);
  // On the card: the player, the team, the line.
  const card = post([]).card;
  assert.equal(card.playerOfDay, null, 'no potm settings given: none');
});
