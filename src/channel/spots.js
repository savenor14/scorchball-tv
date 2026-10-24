// Ad breaks (Task 105; docs/channel.md §16.11): which ad is on, and the facts the ads show. Pure and DOM-free. Each
// gap between live matches shuffles the ads into its own order (Task 158, seeded, so every screen agrees), and its
// breaks take them ads.perBreak at a time, each break carrying on from the last (1-3, 4-6, …, counted within the gap).
// The stills take a fresh shuffle each time round. The playoffs promo (the channel's own) is only in the order from
// midway through the regular season until the final kicks off (Task 111). The drawing is spotArt.js.
import { winnerOf } from '../sim/match.js';
import { createRng } from '../sim/rng.js';
import { isFinished, leadersAt, upcomingAt } from './onScreen.js';

/** The channel's own promo in data/spots.json, which only runs in its window. */
export const PROMO_ID = 'playoffs_promo';

/**
 * Which place in the gap's order (adOrder) an ad of a break takes: break `brk` of its gap, ad `ad` of the break.
 * @param {number} brk @param {number} ad @param {number} perBreak @param {number} count  How many ads there are.
 */
export function adIndex(brk, ad, perBreak, count) {
  return (brk * perBreak + ad) % count;
}

/**
 * The ads a break plays from: all of them, less the playoffs promo outside its window.
 * @template {{ id: string }} A @param {A[]} ads @param {PromoStage} stage
 */
export function adsFor(ads, stage) {
  return stage === 'off' ? ads.filter((a) => a.id !== PROMO_ID) : ads;
}

/**
 * The order a gap's breaks take the ads in (Task 158, Tom: so the same ads don't always sit together): all of them
 * shuffled, seeded by the league and the gap (the match it follows), so every screen agrees; then the promo left out
 * outside its window, which keeps the others' order if the window opens or closes in the gap.
 * @template {{ id: string }} A @param {A[]} ads @param {string} seed  The league's. @param {string} gap  The id of
 *   the match the gap follows. @param {PromoStage} stage
 */
export function adOrder(ads, seed, gap, stage) {
  return adsFor(createRng(`ads|${seed}|${gap}`).shuffle(ads), stage);
}

/**
 * The stills' order on their `pass`-th time round (Task 158): a fresh shuffle each pass, seeded, the promo only in
 * its window. If it would open with the ad the last pass ended on, its first two swap (the last stays put, so each
 * pass only needs the one before).
 * @template {{ id: string }} A @param {A[]} ads @param {string} seed @param {number} pass @param {PromoStage} stage
 */
export function stillOrder(ads, seed, pass, stage) {
  const raw = (/** @type {number} */ n) => adsFor(createRng(`stills|${seed}|${n}`).shuffle(ads), stage);
  const order = raw(pass);
  const before = raw(pass - 1);
  if (order.length > 2 && order[0] === before[before.length - 1]) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

/**
 * @typedef {'off' | 'playoffs' | 'final'} PromoStage  The playoffs promo at a moment: not on; the playoffs (from
 *   `fromShare` of the way through the regular season until the first semifinal kicks off); the final (from then until
 *   the final kicks off). Without semifinals (two playoff teams) it's the final's version all through.
 */

/**
 * Which version of the playoffs promo runs at `t`, if any.
 * @param {import('./calendar.js').Calendar} calendar @param {number} t @param {number} fromShare
 * @returns {PromoStage}
 */
export function promoStage(calendar, t, fromShare) {
  const slots = calendar.slots(calendar.seasonAt(t));
  const { regularCount } = calendar;
  const from = slots[Math.min(regularCount - 1, Math.floor(regularCount * fromShare))].kickoff;
  const final = slots.find((s) => s.stage === 'final');
  if (!final || t < from || t >= final.kickoff) return 'off';
  const semi = slots[regularCount];
  return semi.stage === 'semifinal' && t < semi.kickoff ? 'playoffs' : 'final';
}

/**
 * When a season's playoffs are, for the promo: "Semis Sun 14:00 and 17:00", "Finals Sun 20:00" (the day
 * named once when both semifinals share it).
 * @param {import('./calendar.js').Slot[]} slots  The season's slots. @param {number} regularCount
 * @param {(t: number) => string} formatTime  e.g. "SUN 14:00".
 */
export function playoffTimes(slots, regularCount, formatTime) {
  const said = (/** @type {number} */ t) => formatTime(t).replace(/^([A-Z])([A-Z]+)/, (_, a, b) => a + b.toLowerCase());
  const [s1, s2] = slots.slice(regularCount, regularCount + 2).map((s) => said(s.kickoff));
  const final = slots[regularCount + 2] ? said(slots[regularCount + 2].kickoff) : '';
  const day = (/** @type {string} */ s) => s.split(' ')[0];
  const semis = s1 && s2 ? (day(s1) === day(s2) ? `Semis ${s1} and ${s2.split(' ').slice(1).join(' ')}` : `Semis ${s1} and ${s2}`) : '';
  return { semis, final: final ? `Finals ${final}` : '' };
}

/**
 * @typedef {{ name: string, abbr: string, colour: string }} Finalist
 * @typedef {{ stage: PromoStage, semis: string, final: string, finalAt: string, finalists: [Finalist, Finalist] | null }} PlayoffFacts
 *   The promo's facts: its version, the times ("Semis Sun 14:00 and 17:00", "Finals Sun 20:00", and the final's
 *   alone, "Sun 20:00"), and the finalists (home first, the better seed) once both semifinals have finished on screen.
 */

/**
 * @typedef {{ when: string, home: Finalist | null, away: Finalist | null } | null} TicketFacts  Tickets (Task 146): the
 *   next live match, "TUE 14:00", and its teams once they're known (a playoff's wait for the round before); none when the
 *   season has no more (the off-season).
 * @typedef {{ name: string, primary: string, secondary: string, season: number }} SeasonTicketFacts  Season tickets
 *   (Task 146): a team, seeded by the moment (so each break and each still has its own, the same on every screen), and
 *   the season on sale: this one until the playoffs begin, then the next (Tom).
 * @typedef {{ id: string, name: string, primary: string, secondary: string, abbr: string }} Kit  A team's shirt.
 * @typedef {{ kits: Kit[], pick: number, name: string }} ShopFacts  The League Shop (Task 161): the eight teams' kits, in
 *   a fixed order, and which one the rack stops on, with its team's name: the next live match's home team (Tom), or a
 *   team seeded by the moment while that isn't known (a playoff waiting on the round before, the off-season). The
 *   still takes the home team of the match on screen instead (shopWith).
 */

/**
 * The facts the ads show at a moment: the season's scorchers so far (Foundry Fuel), this season's playoffs (the
 * promo), the next live match (Tickets), a team and season (Season tickets), this season's burns (Ember & Co.) and goals
 * (the Almanac) so far, every team's, the playoffs' too (Task 161; until a new season's first match has finished,
 * the last season's, `lastSeason`, from `numbersSeason`: Task 277b), and the shirt the League Shop's rack stops on.
 * Worked out at a break's start, so the whole break agrees, on every screen.
 * @param {import('./liveLeague.js').LiveLeague} live @param {number} t
 * @param {{ timelineOf: (m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline, formatTime: (t: number) => string }} ctx
 * @returns {{ season: number, numbersSeason: number, lastSeason: boolean, scorchers: number, burns: number, goals: number, playoffs: PlayoffFacts, tickets: TicketFacts, seasonTickets: SeasonTicketFacts, shop: ShopFacts }}
 */
export function adFacts(live, t, ctx) {
  const durationOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const { calendar } = live;
  const season = calendar.seasonAt(t);
  // The season the numbers are from (Task 277b, Tom): until a new season's first match has finished, the one just
  // finished, not a row of noughts.
  const quoted = season > 1 && !live.matchesIn(season).some((m) => isFinished(m, t, durationOf)) ? season - 1 : season;
  const scorchers = leadersAt(live, quoted, t, durationOf, 'scorchers', Infinity, 'all').reduce((n, s) => n + s.scorchers, 0);
  const stage = promoStage(calendar, t, live.config.settings.ads.promoFromShare);
  const times = playoffTimes(calendar.slots(season), calendar.regularCount, ctx.formatTime);
  /** @type {[Finalist, Finalist] | null} */
  let finalists = null;
  const semis = live.matchesIn(season).filter((m) => m.stage === 'semifinal' && isFinished(m, t, durationOf)).sort((a, b) => a.slot - b.slot);
  if (stage === 'final' && semis.length === 2) {
    // The seeds by the semifinals (season.js nextFixture: 1 v 4, then 2 v 3), so the better seed is at home.
    const seeds = [semis[0].homeId, semis[1].homeId, semis[1].awayId, semis[0].awayId];
    const winners = semis.map((m) => /** @type {string} */ (winnerOf({ homeId: m.homeId, awayId: m.awayId, result: m.summary.result })));
    const [home, away] = winners.sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b)).map((id) => live.league.teams[id]);
    finalists = /** @type {[Finalist, Finalist]} */ ([home, away].map((tm) => ({ name: tm.shortName, abbr: tm.abbr, colour: tm.colours.primary })));
  }
  const team = (/** @type {string | null} */ id) => (id ? { name: live.league.teams[id].shortName, abbr: live.league.teams[id].abbr, colour: live.league.teams[id].colours.primary } : null);
  const [next] = upcomingAt(live, t, durationOf, 1);
  const tickets = next ? { when: ctx.formatTime(next.kickoff), home: team(next.homeId), away: team(next.awayId) } : null;
  const all = Object.values(live.league.teams).sort((a, b) => (a.id < b.id ? -1 : 1));
  const pick = all[createRng(`season-tickets|${t}`).int(0, all.length - 1)];
  const seasonTickets = { name: pick.name, primary: pick.colours.primary, secondary: pick.colours.secondary, season: calendar.at(t).phase === 'playoffs' ? season + 1 : season };
  // Every finished match of that season, every stage: its goals (the score, not a shootout's) and both teams' burns.
  const finished = live.matchesIn(quoted).filter((m) => isFinished(m, t, durationOf));
  const goals = finished.reduce((n, m) => n + m.summary.result.homeGoals + m.summary.result.awayGoals, 0);
  const burns = finished.reduce((n, m) => n + m.summary.teamStats.home.burns + m.summary.teamStats.away.burns, 0);
  const nextHome = next?.homeId ? all.findIndex((tm) => tm.id === next.homeId) : -1;
  const shopPick = nextHome >= 0 ? nextHome : createRng(`shop|${t}`).int(0, all.length - 1);
  const shop = { kits: all.map((tm) => ({ id: tm.id, name: tm.shortName, primary: tm.colours.primary, secondary: tm.colours.secondary, abbr: tm.abbr })), pick: shopPick, name: all[shopPick].shortName };
  return { season, numbersSeason: quoted, lastSeason: quoted !== season, scorchers, burns, goals, playoffs: { stage, ...times, finalAt: times.final.replace(/^Finals /, ''), finalists }, tickets, seasonTickets, shop };
}

/**
 * The facts with the League Shop showing `homeId`'s shirt (Task 161, Tom: the still shows the home team of the match on
 * screen); unchanged without one.
 * @template {{ shop?: ShopFacts }} F @param {F} facts @param {string | null | undefined} homeId @returns {F}
 */
export function shopWith(facts, homeId) {
  const i = homeId && facts.shop ? facts.shop.kits.findIndex((k) => k.id === homeId) : -1;
  if (i < 0 || !facts.shop) return facts;
  return { ...facts, shop: { ...facts.shop, pick: i, name: facts.shop.kits[i].name } };
}

/**
 * The ad still up at `t` (Task 113; Full's strip above the ground in match pictures): one ad at a time, the next every
 * `minutes` of the league's clock, each ad once a pass in a fresh seeded order (stillOrder, Task 158; the promo only in
 * its window), with the facts of when it went up, so it doesn't change while it's up and every screen shows the same one.
 * @template {{ id: string }} A @param {A[]} ads @param {import('./liveLeague.js').LiveLeague} live @param {number} t
 * @param {number} minutes  settings.ads.stillMinutes. @param {Parameters<typeof adFacts>[2]} ctx
 * @returns {{ key: number, ad: A, facts: ReturnType<typeof adFacts> }}  `key`: which turn of the rotation it is.
 */
export function stillAt(ads, live, t, minutes, ctx) {
  const every = minutes * 60_000;
  const key = Math.floor(t / every);
  const facts = adFacts(live, key * every, ctx);
  const { stage } = facts.playoffs;
  const n = adsFor(ads, stage).length;
  return { key, ad: stillOrder(ads, live.looks, Math.floor(key / n), stage)[key % n], facts };
}
