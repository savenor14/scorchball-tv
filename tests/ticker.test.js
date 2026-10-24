import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCalendar } from '../src/channel/calendar.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { tableAt } from '../src/channel/onScreen.js';
import { tickerItems } from '../src/channel/ticker.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const cal = createCalendar(config);
const slots = cal.slots(1);
const MIN = 60_000;
const SEED = 'ticker-tests';

/** @type {Map<string, any>} */
const timelines = new Map();
const timelineOf = (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);

/**
 * The league and its ticker at a moment.
 * @param {number} t @param {number | null} [featuredSlot]  The slot of the match on air, if any.
 */
function at(t, featuredSlot = null) {
  const live = new LiveLeague(config, { now: t, seed: SEED });
  const items = tickerItems(live, t, {
    timelineOf,
    featuredId: featuredSlot === null ? null : live.matchesIn(1)[featuredSlot].id,
    playerName: (id) => id,
    formatTime: (ms) => new Date(ms).toISOString().slice(5, 16),
    settings: config.settings.ticker,
  });
  return { live, items };
}

test('mid-season: latest results, next fixtures, leader and top scorer; no live scores with one match at a time', () => {
  const t = slots[20].kickoff + 5 * MIN; // match 21 in progress, on air
  const { live, items } = at(t, 20);
  const kinds = items.map((i) => i.kind);
  assert.equal(kinds.filter((k) => k === 'result').length, config.settings.ticker.results);
  assert.equal(kinds.filter((k) => k === 'next').length, config.settings.ticker.upcoming);
  assert.ok(kinds.includes('leader') && kinds.includes('scorer'));
  assert.equal(kinds.filter((k) => k === 'live').length, 0);
  // The match in progress is not in the results; the newest result is the one before it.
  const inProgress = live.matchesIn(1)[20];
  assert.ok(!items.some((i) => i.key === `ft-${inProgress.id}`));
  assert.equal(items.find((i) => i.kind === 'result')?.key, `ft-${live.matchesIn(1)[19].id}`);
});

test('the leader comes from matches finished on screen, not the sim table that runs ahead', () => {
  // Slot 3 is the last match of round 1: the sim closes the round (and its table) at its kick-off.
  const t = slots[3].kickoff + MIN;
  const { live, items } = at(t);
  const onScreen = tableAt(live, 1, t, (m) => timelineOf(m).duration);
  assert.equal(onScreen.reduce((s, r) => s + r.played, 0), 6, 'three finished matches, six team results');
  assert.equal(live.state.table.reduce((s, r) => s + r.played, 0), 8, 'the sim already counts all four');
  const leader = items.find((i) => i.kind === 'leader');
  assert.equal(leader?.text, `TOP ${live.league.teams[onScreen[0].teamId].abbr} ${onScreen[0].points} PTS`);
  assert.deepEqual(leader?.teams, [onScreen[0].teamId, null], 'its kit on the crawl');
  const scorer = items.find((i) => i.kind === 'scorer');
  assert.ok(scorer?.teams?.[0] && scorer.text.includes(`(${live.league.teams[scorer.teams[0]].abbr})`), 'the top scorer with their team');
});

test('final round: the other three matches show live, and playoff opponents stay TBC until it ends on screen', () => {
  const during = slots[52].kickoff + 5 * MIN;
  const { items } = at(during);
  assert.equal(at(during, 52).items.filter((i) => i.kind === 'live').length, 3);
  assert.equal(items.filter((i) => i.kind === 'live').length, 4, 'with no featured match, all four');
  assert.ok(items.some((i) => i.text.endsWith('SEMI TBC')), 'semifinal opponents not revealed yet');

  const after = at(slots[52].kickoff + 80 * MIN); // the round has finished on screen
  // Revealed once the round has finished on screen, as the big matches promoted (bigMatches.test.js).
  assert.ok(after.items.some((i) => i.kind === 'big' && /^[A-Z]{3} v [A-Z]{3} · /.test(i.text)), 'revealed once the round has finished on screen');
});

test('after the final: the next season\'s start', () => {
  const { items } = at(slots[58].kickoff + 100 * MIN); // past the final, even with overtime and a shootout
  assert.ok(items.some((i) => i.text.startsWith('SEASON 2 STARTS')));
  assert.ok(items.some((i) => i.kind === 'result' && i.key.endsWith('-f')));
});

test('a match being re-aired is left out of the results', () => {
  const t = slots[6].kickoff - 30 * MIN;
  const live = new LiveLeague(config, { now: t, seed: SEED });
  const ctx = { timelineOf, featuredId: null, playerName: (/** @type {string} */ id) => id, formatTime: () => '', settings: config.settings.ticker };
  const hidden = live.matchesIn(1)[4];
  const all = tickerItems(live, t, ctx).filter((i) => i.kind === 'result').map((i) => i.key);
  const without = tickerItems(live, t, { ...ctx, hideId: hidden.id }).filter((i) => i.kind === 'result').map((i) => i.key);
  assert.ok(all.includes(`ft-${hidden.id}`));
  assert.ok(!without.includes(`ft-${hidden.id}`));
  assert.equal(without.length, all.length, 'an older result takes its place');
});
