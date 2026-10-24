import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { bracketCard, championCard, newSeasonCard, studioCard } from '../src/channel/cards.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { createProgramme } from '../src/channel/programme.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const cal = createCalendar(config);
const slots = cal.slots(1);
const MIN = 60_000;
const SEED = 'day7-tests';

/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
const ctx = { timelineOf, playerName: (/** @type {string} */ id) => id };

test('after the final: full time, the talk and interview, champions, off-season summary, then highlights and studio cards until Monday', () => {
  const finalKickoff = slots[58].kickoff;
  const live = new LiveLeague(config, { now: finalKickoff, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  const final = live.matchesIn(1)[58];
  const end = final.kickoff + timelineOf(final).duration;
  const monday = cal.slots(2)[0].kickoff;

  /** @type {string[]} */
  const kinds = [];
  const studioCards = new Set();
  // Piece by piece (the talks and the interview can be a few seconds long since Task 187), ending exactly on Monday's
  // kick-off.
  for (let t = end; t <= monday; ) {
    live.advanceTo(t);
    const s = programme.at(t);
    if (kinds.at(-1) !== s.kind) kinds.push(s.kind);
    if (s.kind === 'studio' && t < cal.seasonStart(2)) studioCards.add(s.card); // from Monday 00:00 it's season 2's "Coming up"
    if (t === monday) break;
    const p = programme.pieceAt(t);
    t = Math.min(monday, p.until > t ? p.until : t + 1000);
  }
  // The talk round the interview (Task 95): the match talk and tee-up, then the wrap-up leading into the final's
  // highlights, then the champions' cards (Tom, after Task 258: no champions' talk). Then the awards (Task 191): their
  // talk, each award; the farewells and the lottery (Task 192); the draft (Task 193); the moves and the sign-off
  // (Task 194); then the night (Task 195): OFF THE BALL's SEASON REVIEW (its talks, the day's goals and its break), AROUND
  // THE GROUNDS (Tom's note 14), then the filler highlights.
  assert.deepEqual(kinds.slice(0, 14), ['handshakes', 'full_time', 'talk', 'potm', 'talk', 'highlights', 'champion', 'talk', 'award', 'farewell', 'lottery', 'draft', 'moves', 'talk']);
  assert.ok(kinds.slice(14, 24).includes('grounds'), kinds.slice(14, 24).join(' '));
  assert.ok(kinds.slice(15).includes('highlights'));
  assert.ok(kinds.includes('reair') && kinds.includes('studio') && !kinds.includes('offseason'), 'no off-season cards after the show');
  assert.deepEqual(kinds.slice(-3), ['pre_match', 'walk_out', 'live']);
  assert.ok(studioCards.has('new_season') && !studioCards.has('upcoming'), 'coming-up becomes the new-season card');

  const champTime = end + (config.settings.segments.handshakeMinutes + config.settings.segments.fullTimeMinutes) * MIN + config.settings.segments.potmSeconds * 1000 + MIN;
  const c = championCard(final, live, champTime, ctx);
  assert.equal(c.championId, live.league.history[0].championId);
  assert.equal(c.runnerUpId, live.league.history[0].runnerUpId);
  assert.equal(c.titles, 1);
});

test('the bracket fills in only as the playoffs finish on screen', () => {
  const sf1 = slots[56].kickoff;
  const live = new LiveLeague(config, { now: sf1 - 60 * MIN, seed: SEED });
  const programme = createProgramme(live, timelineOf);
  // On Sunday afternoon, before the semis, "Coming up" shows the bracket.
  let sawBracket = false;
  for (let t = sf1 - 60 * MIN; t < sf1 - 10 * MIN; t += 20_000) {
    const s = programme.at(t);
    if (s.kind === 'studio' && s.card === 'bracket') sawBracket = true;
    assert.ok(!(s.kind === 'studio' && s.card === 'upcoming'));
  }
  assert.ok(sawBracket);

  const before = bracketCard(live, sf1 - MIN, ctx);
  assert.deepEqual(before.rows.map((r) => r.label), ['SEMI 1', 'SEMI 2', 'FINAL']);
  assert.deepEqual([before.rows[0].homeId, before.rows[0].awayId], [live.state.seeds[0], live.state.seeds[3]]);
  assert.ok(before.rows.every((r) => r.result === null));
  assert.equal(before.rows[2].homeId, null, 'finalists unknown');

  const afterSf1 = slots[56].kickoff + 90 * MIN; // past the longest knockout (overtime and a shootout)
  live.advanceTo(afterSf1);
  const mid = bracketCard(live, afterSf1, ctx);
  assert.ok(mid.rows[0].result, 'semi 1 result shown once it has finished on screen');
  assert.equal(mid.rows[1].result, null);
  assert.equal(mid.rows[2].homeId, null);
});


test('after midnight, until the new season\'s first kick-off, the studio cards are still about the season just finished (Task 277b)', () => {
  const t = cal.seasonStart(2) + 10 * MIN;
  const live = new LiveLeague(config, { now: t, seed: SEED });
  const countdown = /** @type {any} */ (studioCard('new_season', live, t, 0, ctx));
  assert.equal(countdown.title, 'SEASON 2');
  assert.equal(countdown.kickoff, cal.slots(2)[0].kickoff);
  const scorers = /** @type {any} */ (studioCard('playoff_scorers', live, t, 0, ctx));
  assert.match(scorers.title, /SEASON 1$/);
  assert.ok(scorers.rows.length > 0);
});
