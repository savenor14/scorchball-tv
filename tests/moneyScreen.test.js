// Money on screen (Task 234): the chronicle's contracts (only what has aired), the moves board's deals, the studio cards
// PAYROLLS and BIGGEST SIGNINGS, the pre-match card's rookie, and the Rulebook's new facts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Chronicle } from '../src/chronicle/chronicle.js';
import { EventLog, memorySink } from '../src/chronicle/eventLog.js';
import { createCalendar } from '../src/channel/calendar.js';
import { studioCard } from '../src/channel/cards.js';
import { LiveLeague } from '../src/channel/liveLeague.js';
import { payrolls, teamContracts } from '../src/channel/money.js';
import { movesView } from '../src/channel/offseasonShow.js';
import { rulebook } from '../src/channel/rulebook.js';
import { createTimeline } from '../src/channel/timeline.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { payroll } from '../src/sim/finances.js';
import { createLeague } from '../src/sim/league.js';
import { runOffseason } from '../src/sim/offseason.js';
import { runSeason } from '../src/sim/season.js';

const config = await loadConfigFromDisk();
const { events, sink } = memorySink();
const chronicle = new Chronicle(config.chronicle);
const log = new EventLog({ sinks: [sink, chronicle.add] });
const league = createLeague(config, 'money-screen', log);
for (let s = 0; s < 4; s++) runOffseason(league, config, log, runSeason(league, config, log));
const teamIds = Object.keys(league.teams);

test('the chronicle keeps every player\'s deal: its payrolls are the sim\'s, biggest first, and a released player has none', () => {
  const pays = payrolls(chronicle, teamIds);
  for (const { teamId, payroll: p } of pays) assert.equal(p, payroll(league, teamId), teamId);
  assert.ok(pays.every((x, i) => i === 0 || pays[i - 1].payroll >= x.payroll));
  const deals = teamContracts(chronicle, teamIds[0]);
  assert.equal(deals.length, league.teams[teamIds[0]].roster.length);
  for (const p of chronicle.players.values()) if (p.status === 'free' || p.status === 'retired') assert.equal(p.contract, null, p.id);
});

test('each off-season\'s deals: kind, wage, until, and the team a free agent left', () => {
  const deals = chronicle.season(4).deals;
  assert.ok(deals.some((d) => d.kind === 'rookie') && deals.some((d) => d.kind === 'free_agent'));
  const moved = deals.filter((d) => d.kind === 'free_agent' && d.fromId);
  assert.ok(moved.length > 0);
  for (const d of moved) {
    const left = events.find((e) => e.season === 4 && e.type === 'release' && e.playerId === d.playerId);
    assert.equal(d.fromId, left?.teamId);
    assert.ok(d.offers >= 1);
  }
});

test('the moves board: signings with their deals, the biggest first; RE-SIGNED back home; DEAL ENDED for nobody\'s', () => {
  const moves = movesView(events, 4, league.history, league.players, league.teams, config.rules.awards, { maxLines: 99 }, config.settings.farewells.awardWeight, config);
  const signings = moves.filter((m) => m.kind === 'signed' || m.kind === 're_signed');
  assert.ok(signings.length > 0 && signings.every((m) => m.deal && m.deal.wage > 0 && m.deal.seasons >= 1));
  assert.ok(signings.every((m, i) => i === 0 || (signings[i - 1].deal?.wage ?? 0) >= (m.deal?.wage ?? 0)));
  for (const m of moves.filter((x) => x.kind === 're_signed')) assert.equal(m.fromId, m.teamId);
  for (const m of moves.filter((x) => x.kind === 'signed')) assert.notEqual(m.fromId, m.teamId);
  const ended = new Set(events.filter((e) => e.season === 4 && e.type === 'release' && /** @type {any} */ (e.data).reason === 'contract_end').map((e) => e.playerId));
  for (const m of moves.filter((x) => x.kind === 'deal_ended')) assert.ok(ended.has(m.playerId));
  for (const m of moves.filter((x) => x.kind === 'released' || x.kind === 'called_up')) assert.equal(m.deal, null);
});

test('the studio cards PAYROLLS and BIGGEST SIGNINGS, and the pre-match card\'s rookie, from a live league', () => {
  const calendar = createCalendar(config);
  const slot = calendar.slots(3).filter((s) => s.stage === 'regular')[4];
  const live = new LiveLeague(config, { now: slot.kickoff - 60_000, seed: 'money-screen-live' });
  const timelines = new Map();
  const ctx = { timelineOf: (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id), playerName: (/** @type {string} */ id) => id };
  const pay = /** @type {any} */ (studioCard(/** @type {any} */ ('payrolls'), live, slot.kickoff, 0, ctx));
  assert.equal(pay.kind, 'payrolls');
  assert.equal(pay.cap, config.rules.finances.cap);
  assert.equal(pay.rows.length, Object.keys(live.league.teams).length);
  const sig = /** @type {any} */ (studioCard(/** @type {any} */ ('signings'), live, slot.kickoff, 0, ctx));
  assert.match(sig.title, /BIGGEST SIGNINGS · OFF-SEASON 2/);
  assert.ok(sig.rows.length > 0 && sig.rows.length <= 7);
  assert.ok(sig.rows.every((/** @type {any} */ r, /** @type {number} */ i) => i === 0 || sig.rows[i - 1].wage >= r.wage));
});

test('BIGGEST SIGNINGS after the final: the off-season just aired, as on the moves board, before the chronicle has it (Tom, 2026-10-18)', () => {
  const calendar = createCalendar(config);
  const final = calendar.slots(1).find((s) => s.stage === 'final');
  const t = /** @type {any} */ (final).kickoff + 57 * 60_000; // the first studio block after the off-season show
  assert.ok(t < /** @type {any} */ (final).kickoff + config.settings.chronicle.offseasonAiredMinutes * 60_000, 'before the chronicle takes the off-season in');
  const live = new LiveLeague(config, { now: t, seed: 'money-screen-live' });
  const timelines = new Map();
  const ctx = { timelineOf: (/** @type {any} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id), playerName: (/** @type {string} */ id) => id };
  const sig = /** @type {any} */ (studioCard(/** @type {any} */ ('signings'), live, t, 0, ctx));
  assert.equal(sig.title, 'BIGGEST SIGNINGS · OFF-SEASON 1');
  const board = movesView(live.leagueEvents, 1, live.league.history, live.league.players, live.league.teams, config.rules.awards, { maxLines: Infinity }, config.settings.farewells.awardWeight)
    .filter((m) => (m.kind === 'signed' || m.kind === 're_signed') && m.deal);
  assert.ok(board.length > 0);
  assert.deepEqual(sig.rows.map((/** @type {any} */ r) => r.playerId), board.slice(0, 7).map((m) => m.playerId));
});

test('the Rulebook: the rookie rule in GAME, Finances in LEAGUE, its facts from the rules', () => {
  const book = rulebook(config);
  const game = book.sections.find((s) => s.id === 'game');
  assert.match(/** @type {any} */ (game).rules.at(-1), /^Every team must start a rookie\./);
  const money = /** @type {any} */ (book.sections.find((s) => s.id === 'contracts'));
  assert.equal(money.tab, 'LEAGUE');
  assert.match(money.rules[0], /rookie deals for three seasons/);
  assert.match(money.rules[1], /salary cap, ƒ20\.0M a season\. The max contract is ƒ5\.0M a season and may be signed for up to four seasons/);
});
