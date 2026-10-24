// The big matches promoted (Tom, 2026-10-17; docs/channel.md §30): the promo card leading every studio block before the
// final round, the semifinals and the final, with the matches as known on screen, and the ticker's big-match items on
// the same timing in place of those matches' ordinary upcoming lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { promoCard, promotedAt, studioCard } from '../src/channel/cards.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { tableAt, upcomingAt } from '../src/channel/onScreen.js';
import { createProgramme } from '../src/channel/programme.js';
import { tickerItems } from '../src/channel/ticker.js';
import { buildDay, studioJingle } from '../src/channel/guide.js';
import { analystCast, analystSaid } from '../src/channel/analystTalk.js';
import { deskClipKey } from '../src/channel/speech.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const calendar = createCalendar(config);
const slots = calendar.slots(1);
const SEED = 'big-matches-tests';
/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const durationOf = (/** @type {any} */ m) => timelineOf(m).duration;
const ctx = { timelineOf, playerName: (/** @type {string} */ id) => id };
const MIN = 60_000;
const round = slots[calendar.regularCount - 1].kickoff;
const [sf1, sf2, final] = slots.slice(calendar.regularCount).map((s) => s.kickoff);

/** The league, its promo card and its ticker at a moment. @param {number} t */
function at(t) {
  const live = new LiveLeague(config, { now: t, seed: SEED });
  const items = tickerItems(live, t, { ...ctx, featuredId: null, formatTime: (ms) => new Date(ms).toISOString().slice(5, 16), settings: config.settings.ticker });
  return { live, promo: /** @type {any} */ (promoCard(live, t, ctx)), items };
}

test('every studio block leads with the promo card in the gaps before the final round, the semifinals and the final, and in no other', () => {
  const from = slots[calendar.regularCount - 6].kickoff;
  const live = new LiveLeague(config, { now: from, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  /** @type {{ first: string, at: number, cards: string[] }[]} */
  const runs = [];
  /** @type {{ first: string, at: number, cards: string[] } | null} */
  let run = null;
  for (let t = from; t < final;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = programme.at(Math.max(p.from, t));
    // The PLAYOFF PREVIEW show's own cards are its own, not a block's.
    if (seg.kind === 'studio' && !('preview' in seg && seg.preview)) {
      if (!run) runs.push((run = { first: seg.card, at: p.from, cards: [] }));
      run.cards.push(seg.card);
    } else run = null;
    t = p.until > t ? p.until : t + 1000;
  }
  const events = new Set();
  for (const r of runs) {
    const event = promotedAt(live, r.at, durationOf);
    assert.equal(r.first === 'promo', event !== null, `${new Date(r.at).toISOString()}: ${r.cards.join(' ')}`);
    if (!event) continue;
    events.add(event);
    // In a long block (the show's last), it comes round again every cardsPerBlock cards.
    r.cards.forEach((c, i) => assert.equal(c === 'promo', i % config.settings.segments.cardsPerBlock === 0, r.cards.join(' ')));
    // Its event by when the block is: the final round, then the semifinals, then the final.
    assert.equal(event, r.at < round ? 'final_round' : r.at < sf2 ? 'semifinals' : 'final');
  }
  assert.deepEqual([...events].sort(), ['final', 'final_round', 'semifinals']);
});

test('the promo card: the matches as known on screen, the first semifinal\'s result once in, the finalists face to face', () => {
  // The evening before the final round: its four matches, in the channel's order, and their places.
  const before = at(round - 60 * MIN);
  assert.equal(before.promo.event, 'final_round');
  assert.equal(before.promo.kickoff, round);
  const group = upcomingAt(before.live, round - 60 * MIN, durationOf, 8).filter((f) => f.kickoff === round);
  assert.equal(before.promo.rows.length, group.length);
  assert.deepEqual(new Set(before.promo.rows.flatMap((/** @type {any} */ r) => [r.homeId, r.awayId])), new Set(group.flatMap((f) => [f.homeId, f.awayId])));

  // The night before the semifinals: first against fourth and second against third, by the final table, no results.
  const night = at(sf1 - 6 * 60 * MIN);
  const table = tableAt(night.live, 1, sf1 - 6 * 60 * MIN, durationOf).map((r) => r.teamId);
  assert.equal(night.promo.event, 'semifinals');
  assert.deepEqual(night.promo.rows.map((/** @type {any} */ r) => [r.homeId, r.awayId]), [[table[0], table[3]], [table[1], table[2]]]);
  assert.ok(night.promo.rows.every((/** @type {any} */ r) => r.result === null && (r.sub.includes('THIS SEASON') || r.sub.includes("HAVEN'T MET"))));
  assert.equal(night.promo.kickoff, sf1);

  // Between them: the first's result and who's through; the countdown to the second.
  const between = at(sf2 - 60 * MIN);
  const first = between.live.matchesIn(1).find((m) => m.stage === 'semifinal');
  assert.ok(first);
  const winner = between.live.state.playoffs.find((p) => p.stage === 'semifinal')?.winnerId;
  assert.equal(between.promo.rows[0].result.winnerId, winner);
  assert.match(between.promo.rows[0].sub, /THROUGH TO THE FINAL/);
  assert.equal(between.promo.rows[1].result, null);
  assert.equal(between.promo.kickoff, sf2);

  // Before the final: the finalists, the better seed at home, and how they got there.
  const eve = at(final - 60 * MIN);
  const winners = eve.live.state.playoffs.filter((p) => p.stage === 'semifinal').map((p) => p.winnerId);
  assert.equal(eve.promo.event, 'final');
  assert.deepEqual(new Set([eve.promo.face.homeId, eve.promo.face.awayId]), new Set(winners));
  assert.match(eve.promo.lines[1], /^SEMIS: .+ BEAT .+ · .+ BEAT /);

  // Earlier in the week, nothing to promote.
  assert.equal(at(slots[10].kickoff - 30 * MIN).promo, null);
});

test('the ticker: a big-match item leads on the same timing, in place of those matches\' ordinary lines; none while one is live', () => {
  const before = at(round - 60 * MIN);
  const big = before.items.filter((i) => i.kind === 'big');
  assert.equal(big.length, 1);
  assert.equal(big[0].tag, 'FINAL ROUND');
  assert.equal(before.items[0], big[0]);
  const group = upcomingAt(before.live, round - 60 * MIN, durationOf, 8).filter((f) => f.kickoff === round);
  assert.ok(group.every((f) => !before.items.some((i) => i.key === `next-${f.key}`)));

  // While the final round is live: its scores, no promotion of the semifinals yet.
  assert.equal(at(round + 10 * MIN).items.filter((i) => i.kind === 'big').length, 0);

  const night = at(sf1 - 6 * 60 * MIN);
  assert.deepEqual(night.items.filter((i) => i.kind === 'big').map((i) => i.tag), ['SEMIFINAL 1', 'SEMIFINAL 2']);
  assert.ok(!night.items.some((i) => i.kind === 'next' && /SEMI/.test(i.text)));
  assert.ok(night.items.some((i) => i.kind === 'next' && /FINAL TBC/.test(i.text)), 'the final, still TBC, stays an ordinary line');

  assert.deepEqual(at(sf2 - 60 * MIN).items.filter((i) => i.kind === 'big').map((i) => i.tag), ['SEMIFINAL 2']);
  assert.deepEqual(at(final - 60 * MIN).items.filter((i) => i.kind === 'big').map((i) => i.tag), ['THE FINAL']);
  assert.equal(at(slots[10].kickoff - 30 * MIN).items.filter((i) => i.kind === 'big').length, 0);
});

test('the PLAYOFF PREVIEW show: right after the final round\'s show, then every everyMinutes or more until lastStart, its pieces in order', () => {
  const { preview } = config.settings;
  const live = new LiveLeague(config, { now: round, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  /** @type {{ label: string, from: number, until: number }[]} */
  const pieces = [];
  for (let t = round; t < sf1;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    if (p.label.startsWith('preview')) pieces.push(p);
    t = p.until > t ? p.until : t + 1000;
  }
  const starts = pieces.filter((p) => p.label === 'preview · preview_open');
  assert.ok(starts.length >= 4, `${starts.length} showings`);
  // The first straight after the final round's show (which ends within about 40 minutes of its kick-off).
  assert.ok(starts[0].from - round < 60 * MIN);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i].from - starts[i - 1].from >= preview.everyMinutes * MIN);
  // None starting after lastStart on the semifinals' day.
  const [hh, mm] = preview.lastStart.split(':').map(Number);
  const day = calendar.instant(1, Math.floor((sf1 - calendar.seasonStart(1)) / 86_400_000) * 1440);
  assert.ok(starts.at(-1).from <= day + (hh * 60 + mm) * MIN + 2 * 3_600_000, 'within an hour or two of lastStart, allowing for daylight saving');
  const order = pieces.slice(0, pieces.indexOf(starts[1])).map((p) => p.label.replace('preview · ', ''));
  assert.deepEqual(order, ['preview_open', 'talk · standings', 'table_story', 'talk · analyst · four', 'reel · season', 'season_numbers', 'talk · analyst · semi1', 'tape_1', 'reel · meetings1', 'watch_1', 'talk · analyst · semi2', 'tape_2', 'reel · meetings2', 'watch_2', 'promo'].filter((x) => order.includes(x) || !x.startsWith('reel · meetings')));
  // Back to back, a single run.
  for (let i = 1; i < order.length; i++) assert.equal(pieces[i].from, pieces[i - 1].until);
});

test('the PLAYOFF PREVIEW show\'s cards: the table round by round ending in the final table, numberTiles tiles, both sides\' numbers and players', () => {
  const t = sf1 - 6 * 60 * MIN;
  const live = new LiveLeague(config, { now: t, seed: SEED });
  const table = tableAt(live, 1, t, durationOf);
  const story = /** @type {any} */ (studioCard('table_story', live, t, 0, ctx));
  assert.deepEqual(story.rows.map((/** @type {any} */ r) => r.teamId), table.map((r) => r.teamId));
  for (const [i, r] of story.rows.entries()) assert.equal(r.places.at(-1), i + 1, 'each line ends at its final place');
  assert.equal(story.rows[0].places.length, calendar.regularCount / (table.length / 2));
  const numbers = /** @type {any} */ (studioCard('season_numbers', live, t, 0, ctx));
  assert.equal(numbers.tiles.length, config.settings.preview.numberTiles);
  const tape = /** @type {any} */ (studioCard('tape_1', live, t, 0, ctx));
  assert.deepEqual([tape.home.teamId, tape.away.teamId], [table[0].teamId, table[3].teamId]);
  assert.equal(tape.home.goalsFor, table[0].goalsFor);
  const watch = /** @type {any} */ (studioCard('watch_2', live, t, 0, ctx));
  assert.deepEqual([watch.home.teamId, watch.away.teamId], [table[1].teamId, table[2].teamId]);
  assert.ok(watch.home.scorer.goals > 0 && watch.home.keeper.saves > 0);
});

test('SCHEDULE lists each PLAYOFF PREVIEW as one line of its own, and the studio jingle plays only as it begins', () => {
  const day = buildDay(config, sf1 - 4 * 60 * MIN, SEED, timelineOf);
  const shows = day.entries.filter((e) => e.kind === 'preview');
  assert.ok(shows.length >= 3, `${shows.length} PLAYOFF PREVIEW lines`);
  // Each a whole show: about its length, never split into STUDIO and HL lines around it.
  for (const e of shows) assert.ok(e.until - e.from > 5 * MIN && e.until - e.from < 30 * MIN, `${(e.until - e.from) / MIN} min`);
  assert.ok(day.entries.every((e, i) => i === 0 || !(e.kind === 'preview' && day.entries[i - 1].kind === 'preview')));
  assert.equal(studioJingle({ kind: 'studio', preview: true }, 'reair'), true);
  assert.equal(studioJingle({ kind: 'studio', preview: true }, 'preview'), false);
});

test('the playoff analyst: his lines from the left seat, the host\'s from the right, every one with its recorded clip, over several leagues', () => {
  const cast = analystCast(config);
  assert.equal(cast[1].id, config.analyst.host);
  const ctxT = { ...ctx, formatTime: (/** @type {number} */ ms) => new Date(ms).toISOString().slice(11, 16) };
  for (const seed of [SEED, 'analyst-a', 'analyst-b', 'analyst-c']) {
    const t = sf1 - 6 * 60 * MIN;
    const live = new LiveLeague(config, { now: t, seed });
    for (const bit of /** @type {const} */ (['four', 'semi1', 'semi2'])) {
      const said = analystSaid(bit, live, t, ctxT, `${seed}|${bit}`);
      assert.ok(said && said.length >= 4, `${seed} ${bit}`);
      for (const l of said) {
        const who = config.analyst.lines[l.clip.kind].who;
        assert.equal(l.who, who === 'analyst' ? 0 : 1, l.clip.kind);
        assert.ok(!/[{}]/.test(l.text) && !/[{}]/.test(l.show ?? ''), l.text);
        const key = deskClipKey(cast[/** @type {0 | 1} */ (l.who)].id, l.clip);
        assert.ok(config.voiceLengths[key] > 0, `a clip for ${key}`);
      }
    }
    // Before the regular season has finished on screen, nothing to say.
    assert.equal(analystSaid('four', new LiveLeague(config, { now: round - MIN, seed }), round - MIN, ctxT, 'x'), null);
  }
});

test('FINALS PREVIEW: right after the second semifinal\'s show, again finalsEveryMinutes or more later, its pieces in order, SCHEDULE naming it (2026-10-18)', () => {
  const { preview } = config.settings;
  const live = new LiveLeague(config, { now: sf2, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  /** @type {{ label: string, from: number, until: number, seg: any }[]} */
  const pieces = [];
  /** Matches re-aired or in highlights after the second semifinal. @type {Set<string>} */
  const replays = new Set();
  for (let t = sf2; t < final;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    if (p.label.startsWith('finals preview')) pieces.push({ ...p, seg: programme.at(Math.max(p.from, t)) });
    const shown = /^(re-air|highlights) · (\S+)/.exec(p.label)?.[2];
    if (shown) replays.add(shown);
    t = p.until > t ? p.until : t + 1000;
  }
  const starts = pieces.filter((p) => p.label === 'finals preview · finals_open');
  assert.ok(starts.length >= 2, `${starts.length} showings`);
  assert.ok(starts[0].from - sf2 < 60 * MIN, 'straight after the second semifinal\'s show');
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i].from - starts[i - 1].from >= preview.finalsEveryMinutes * MIN);
  assert.ok(pieces.at(-1).until < final - 4 * MIN, 'over before the final\'s run-in');
  // Re-airs and highlights: the two semifinals alone (Tom, 2026-10-18), FINALS PREVIEW about hourly between them.
  const semiIds = live.matchesIn(1).filter((m) => m.stage === 'semifinal').map((m) => m.id);
  assert.ok(replays.size > 0 && [...replays].every((id) => semiIds.includes(id)), [...replays].join(', '));  const order = pieces.slice(0, pieces.indexOf(starts[1])).map((p) => p.label.replace('finals preview · ', ''));
  assert.deepEqual(order, ['finals_open', 'talk · standings', 'road', 'talk · analyst · road', 'reel · semis', 'talk · analyst · final', 'tape_final', 'reel · meetings_final', 'watch_final', 'promo'].filter((x) => x !== 'reel · meetings_final' || order.includes(x)));
  assert.ok(pieces.every((p) => p.seg.preview && p.seg.finals));
  // The desk: the final set, never the race lines.
  const talk = pieces.find((p) => p.label.endsWith('talk · standings'));
  assert.ok(talk?.seg.script.some((/** @type {any} */ l) => l.clip.kind === 'playoffsFinalSet'));
  // SCHEDULE: each its own FINALS PREVIEW line.
  const day = buildDay(config, starts[0].from + MIN, SEED, timelineOf);
  const lines = day.entries.filter((e) => e.kind === 'preview' && e.title === 'FINALS PREVIEW');
  assert.equal(lines.length, starts.length);
});

test('FINALS PREVIEW\'s cards: the finalists (the better seed at home), both semifinals, each side\'s semifinal, its players\' (2026-10-18)', () => {
  const t = final - 60 * MIN;
  const live = new LiveLeague(config, { now: t, seed: SEED });
  const semis = live.matchesIn(1).filter((m) => m.stage === 'semifinal').sort((a, b) => a.slot - b.slot);
  const table = tableAt(live, 1, t, durationOf);
  const place = (/** @type {string} */ id) => table.findIndex((r) => r.teamId === id);
  const winners = semis.map((m) => { const r = m.summary.result; return r.homeGoals > r.awayGoals || (r.shootout && r.shootout.home > r.shootout.away) ? m.homeId : m.awayId; }).sort((a, b) => place(a) - place(b));
  const open = /** @type {any} */ (studioCard('finals_open', live, t, 0, ctx));
  assert.deepEqual([open.kind, open.homeId, open.awayId, open.kickoff], ['finals_open', winners[0], winners[1], final]);
  const road = /** @type {any} */ (studioCard('road', live, t, 0, ctx));
  assert.deepEqual(road.semis.map((/** @type {any} */ x) => x.winnerId).sort(), [...winners].sort());
  assert.deepEqual(road.semis.map((/** @type {any} */ x) => [x.homeGoals, x.awayGoals]), semis.map((m) => [m.summary.result.homeGoals, m.summary.result.awayGoals]));
  const tape = /** @type {any} */ (studioCard('tape_final', live, t, 0, ctx));
  assert.deepEqual([tape.label, tape.home.teamId, tape.away.teamId], ['THE FINAL', winners[0], winners[1]]);
  assert.match(tape.home.semi, /^\d+-\d+ v [A-Z]{3}$/);
  const watch = /** @type {any} */ (studioCard('watch_final', live, t, 0, ctx));
  assert.equal(watch.label, 'THE FINAL');
  assert.ok(Number.isInteger(watch.home.scorer.semi) && Number.isInteger(watch.away.keeper.semi));
  // Before both semifinals are over, or once the final has kicked off: not its cards.
  assert.notEqual(/** @type {any} */ (studioCard('road', new LiveLeague(config, { now: sf2 + MIN, seed: SEED }), sf2 + MIN, 0, ctx)).kind, 'road');
  assert.notEqual(/** @type {any} */ (studioCard('road', new LiveLeague(config, { now: final + MIN, seed: SEED }), final + MIN, 0, ctx)).kind, 'road');
  // PLAYOFF PREVIEW's tape and watch carry no semifinal.
  const early = sf1 - 6 * 60 * MIN;
  const tape1 = /** @type {any} */ (studioCard('tape_1', new LiveLeague(config, { now: early, seed: SEED }), early, 0, ctx));
  assert.equal(tape1.home.semi, null);
});

test('FINALS PREVIEW\'s analyst: each finalist\'s road and the final, every line with its clip from the right seat; a road said twice in its other way (2026-10-18)', () => {
  const cast = analystCast(config);
  const ctxT = { ...ctx, formatTime: (/** @type {number} */ ms) => new Date(ms).toISOString().slice(11, 16) };
  const ROADS = ['roadShootout', 'roadGoldenGoal', 'roadUpset', 'roadBig', 'roadNarrow'];
  for (const seed of [SEED, 'analyst-a', 'analyst-b', 'analyst-c', 'analyst-d', 'analyst-e']) {
    const t = final - 60 * MIN;
    const live = new LiveLeague(config, { now: t, seed });
    for (const bit of /** @type {const} */ (['road', 'final'])) {
      const said = analystSaid(bit, live, t, ctxT, `${seed}|${bit}`);
      assert.ok(said && said.length >= 4, `${seed} ${bit}`);
      for (const l of said) {
        assert.equal(l.who, config.analyst.lines[l.clip.kind].who === 'analyst' ? 0 : 1, l.clip.kind);
        assert.ok(!/[{}]/.test(l.text) && !/[{}]/.test(l.show ?? ''), l.text);
        const key = deskClipKey(cast[/** @type {0 | 1} */ (l.who)].id, l.clip);
        assert.ok(config.voiceLengths[key] > 0, `a clip for ${key}`);
      }
      if (bit === 'road') {
        const roads = said.filter((l) => ROADS.includes(l.clip.kind));
        assert.equal(roads.length, 2, 'one road a finalist');
        if (roads[0].clip.kind === roads[1].clip.kind) assert.notEqual(roads[0].clip.way, roads[1].clip.way, 'the same road in its other way (Tom)');
      } else assert.equal(said[0].clip.kind, 'hostFinal');
    }
    // Before both semifinals have finished on screen, nothing to say.
    assert.equal(analystSaid('road', new LiveLeague(config, { now: sf2 + MIN, seed }), sf2 + MIN, ctxT, 'x'), null);
  }
});
