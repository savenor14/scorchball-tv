// The studio cards dealt from decks by phase, and the eleven new cards (Tom's note 11, 2026-10-19; docs/studio-cards.md,
// docs/channel.md §16.9): each phase deals only its own deck, never the same card twice running, LATEST RESULTS first
// in the post-match show, a card with nothing to say skipped, and every screen deals the same whenever it was loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { moreCard } from '../src/channel/moreCards.js';
import { createProgramme } from '../src/channel/programme.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const calendar = createCalendar(config);
const slots = calendar.slots(1);
const SEED = 'decks-tests';
const decks = config.settings.segments.studioDecks;
/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const ctx = { timelineOf, playerName: (/** @type {string} */ id) => id };
const HOUR = 3600_000;

/**
 * Every studio card shown from `from` to `until`, in order: its card, when it started and whether it's the post-match show's.
 * @param {LiveLeague} live @param {number} from @param {number} until
 */
function cardsShown(live, from, until) {
  const programme = createProgramme(live, timelineOf);
  /** @type {{ card: string, at: number, until: number, show: boolean, label: string }[]} */
  const out = [];
  for (let t = from; t < until;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = programme.at(Math.max(p.from, t));
    if (seg.kind === 'studio' && out.at(-1)?.at !== p.from) out.push({ card: seg.card, at: p.from, until: p.until, show: Boolean(seg.show), label: p.label });
    t = p.until > t ? p.until : t + 1000;
  }
  return out;
}

test('the regular season deals from its decks: the early deck on days 1 and 2, the late one after; never the same card twice running', () => {
  const from = slots[0].kickoff;
  const until = slots.find((s) => s.kickoff >= calendar.instant(1, 4 * 1440))?.kickoff ?? slots[20].kickoff;
  const shown = cardsShown(new LiveLeague(config, { now: from, seed: SEED }), from, until);
  const earlyUntil = calendar.instant(1, decks.earlyDays * 1440);
  // (The promo cards: the big matches', OFF THE BALL's premiere's.)
  const allowed = (/** @type {string} */ c, /** @type {number} */ at) => c === 'promo' || c === 'podcast_promo' || (at < earlyUntil ? decks.early : decks.late).includes(c);
  for (const s of shown) assert.ok(allowed(s.card, s.at), `${s.card} at ${new Date(s.at).toISOString()}`);
  // Back to back (a match or a re-air between two cards doesn't count).
  for (let i = 1; i < shown.length; i++) if (shown[i].at === shown[i - 1].until) assert.notEqual(shown[i].card, shown[i - 1].card, `twice running at ${new Date(shown[i].at).toISOString()}`);
  // Season 1 has no last season, no roll of honour and no record to chase: skipped, never shown thin.
  assert.ok(!shown.some((s) => ['last_season', 'roll_of_honour', 'records_watch'].includes(s.card)));
  // Both decks deal widely: most of each pool comes round.
  const early = new Set(shown.filter((s) => s.at < earlyUntil).map((s) => s.card));
  const late = new Set(shown.filter((s) => s.at >= earlyUntil).map((s) => s.card));
  assert.ok(early.size >= decks.early.length - 3 && late.size >= decks.late.length - 5, `${[...early].join(' ')} | ${[...late].join(' ')}`);
});

test('LATEST RESULTS leads the post-match show\'s cards', () => {
  const from = slots[2].kickoff;
  const shown = cardsShown(new LiveLeague(config, { now: from, seed: SEED }), from, slots[8].kickoff);
  const firsts = shown.filter((s, i) => s.show && !shown[i - 1]?.show);
  assert.ok(firsts.length >= 4);
  for (const f of firsts) assert.equal(f.card, 'results');
});

test('every screen deals the same: a league loaded mid-gap shows the cards one loaded at its start does', () => {
  const start = slots[5].kickoff;
  const mid = start + 2 * HOUR;
  const until = mid + 2 * HOUR;
  const early = cardsShown(new LiveLeague(config, { now: start, seed: SEED }), start, until).filter((s) => s.at >= mid);
  // (The card already on air at `mid` started before it: compared from `mid` on, both ways.)
  const late = cardsShown(new LiveLeague(config, { now: mid, seed: SEED }), mid, until).filter((s) => s.at >= mid);
  assert.ok(late.length > 10);
  assert.deepEqual(late.map((s) => `${s.at} ${s.card}`), early.map((s) => `${s.at} ${s.card}`));
});

test('after the final: its own deck, THE DRAFT and FAREWELLS from the off-season just aired', () => {
  const final = slots.at(-1);
  const from = final.kickoff + 2 * HOUR;
  const live = new LiveLeague(config, { now: from, seed: SEED });
  const shown = cardsShown(live, from, calendar.seasonStart(2));
  for (const s of shown) assert.ok(decks.afterFinal.includes(s.card), s.card);
  assert.ok(shown.some((s) => s.card === 'the_draft'));
  const draft = /** @type {any} */ (moreCard('the_draft', live, from, ctx));
  assert.equal(draft.rows.length, config.teams.teams.length);
  assert.deepEqual(draft.rows.map((/** @type {any} */ r) => r.pick), draft.rows.map((/** @type {any} */ _, /** @type {number} */ i) => i + 1));
  assert.ok(draft.rows.every((/** @type {any} */ r) => r.age >= config.rules.draft.prospectAge.min && r.age <= config.rules.draft.prospectAge.max + 1));
  // Before the final, no off-season to show.
  assert.equal(moreCard('the_draft', live, final.kickoff - HOUR, ctx), null);
});

test('the new cards\' contents: FINAL TABLE once the regular season is over, BIGGEST WINS by margin, SCORCHERS for and against', () => {
  const end = slots[calendar.regularCount].kickoff + HOUR;
  const live = new LiveLeague(config, { now: end, seed: SEED });
  live.advanceTo(end);
  const table = /** @type {any} */ (moreCard('final_table', live, end, ctx));
  assert.equal(table.rows.length, config.teams.teams.length);
  assert.equal(table.cut, config.rules.playoffs.teams);
  assert.ok(table.rows.every((/** @type {any} */ r, /** @type {number} */ i) => i === 0 || table.rows[i - 1].points >= r.points));
  assert.equal(moreCard('final_table', live, slots[calendar.regularCount - 1].kickoff - HOUR, ctx), null, 'not before the last round is over');
  const wins = /** @type {any} */ (moreCard('biggest_wins', live, end, ctx));
  const margin = (/** @type {any} */ r) => Math.abs(r.homeGoals - r.awayGoals);
  assert.ok(wins.rows.length > 0 && wins.rows.every((/** @type {any} */ r, /** @type {number} */ i) => r.homeGoals !== r.awayGoals && (i === 0 || margin(wins.rows[i - 1]) >= margin(r))));
  const hot = /** @type {any} */ (moreCard('scorchers', live, end, ctx));
  assert.ok(hot.players.length >= 1 && hot.players.length <= 2 && hot.players.every((/** @type {any} */ p) => p.scorchers > 0));
  assert.equal(hot.teams.length, config.teams.teams.length);
  const sum = (/** @type {'scorchers' | 'against'} */ k) => hot.teams.reduce((/** @type {number} */ n, /** @type {any} */ r) => n + r[k], 0);
  assert.equal(sum('scorchers'), sum('against'), "every scorcher is one team's for and the other's against");
  assert.ok(hot.teams.every((/** @type {any} */ r, /** @type {number} */ i) => i === 0 || hot.teams[i - 1].scorchers >= r.scorchers));
  const race = /** @type {any} */ (moreCard('award_race', live, end, ctx));
  assert.ok(race.rows.some((/** @type {any} */ r) => r.award === 'ember_boot'));
});

test('season 2\'s early cards: LAST SEASON with the whole final table and its marks, ROLL OF HONOUR', () => {
  const t = calendar.slots(2)[3].kickoff;
  const live = new LiveLeague(config, { now: t, seed: SEED });
  const h = /** @type {any} */ (live.league.history.find((x) => x.season === 1));
  const last = /** @type {any} */ (moreCard('last_season', live, t, ctx));
  assert.equal(last.title, 'LAST SEASON · SEASON 1');
  assert.equal(last.rows.length, config.teams.teams.length);
  assert.match(/** @type {any} */ (last.rows.find((/** @type {any} */ r) => r.teamId === h.championId)).marks, /^CUP/);
  assert.match(/** @type {any} */ (last.rows.find((/** @type {any} */ r) => r.teamId === h.shieldId)).marks, /PENNANT$/);
  const roll = /** @type {any} */ (moreCard('roll_of_honour', live, t, ctx));
  assert.deepEqual(roll.rows.map((/** @type {any} */ r) => r.championId), [h.championId]);
  assert.equal(roll.most, null, 'the most Cups only once a team has two');
});
