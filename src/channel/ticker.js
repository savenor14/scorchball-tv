// The score ticker's items at a moment. Pure and DOM-free. See docs/channel.md §8.
// The big matches first, once nothing is live before them (the final round, the semifinals, the final; Tom's wording 1,
// bigmatches.html: a fiery tag, the teams and when, in place of their ordinary upcoming lines), then the League's announcements, for announcementHours after each airs (Task 265, §24), then live scores of other
// matches (only when matches overlap: the final round), the latest results, the next fixtures, the leader and the top
// scorer. Everything comes from what has happened on screen (onScreen.js), so nothing spoils.
import { announcementsAt } from './announcements.js';
import { dayWords, promotedAt } from './cards.js';
import { podcastPremiere } from './podcastTalk.js';
import { isFinished, isLive, tableAt, topScorersAt, upcomingAt } from './onScreen.js';

/**
 * @typedef {object} TickerItem
 * @property {string} key   Stable while the item means the same thing, so the crawl can update it in place.
 * @property {'big' | 'show' | 'league' | 'live' | 'result' | 'next' | 'leader' | 'scorer' | 'fans' | 'watching'} kind  big: a big match promoted
 *   (show: OFF THE BALL's premiere, the show and its episode in amber after when; Tom, 2026-10-21)
 *   (its `tag` the event: FINAL ROUND, SEMIFINAL 1, THE FINAL); league: an announcement (Task 265);
 *   fans: a viewer's message (Fan Coins, docs/channel.md §29; shared, for everyone watching), its tag in a team's colours or gold; watching: how
 *   many are watching (watchingItem), last.
 * @property {{ bg: string, fg: string } | string} [tag]  fans: the FANS tag's colours; big: the event's tag.
 * @property {string} text
 * @property {boolean} flash  A live score that changed within the last goalFlashMs.
 * @property {[string | null, string | null]} [teams]  The two teams a live score, result or fixture names (home, away;
 *   null while unknown), so the crawl can put each one's kit before its abbreviation (Task 110); the leader's and top scorer's team too.
 *
 * @typedef {object} TickerContext
 * @property {(m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline} timelineOf
 * @property {string | null} featuredId   The match on air (not repeated in the ticker).
 * @property {string | null} [hideId]     A match being re-aired, whose result the ticker leaves out.
 * @property {(playerId: string) => string} playerName
 * @property {(t: number) => string} formatTime  e.g. "Wed 19:34" in the league's time zone.
 * @property {{ results: number, upcoming: number, goalFlashMs: number, announcementHours: number }} settings
 */

/**
 * @param {import('./liveLeague.js').LiveLeague} live
 * @param {number} t  Epoch ms.
 * @param {TickerContext} ctx
 * @returns {TickerItem[]}
 */
export function tickerItems(live, t, ctx) {
  const { league, calendar } = live;
  const abbr = (/** @type {string} */ id) => league.teams[id].abbr;
  const durationOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const pos = calendar.at(t);
  const played = live.matchesIn(pos.season);
  /** @type {TickerItem[]} */
  const items = [];

  // The big matches promoted (Tom, 2026-10-17), on the same timing as the promo card: once nothing is live before them.
  /** @type {Set<string>} The promoted fixtures, whose ordinary upcoming lines give way to them. */
  const promoted = new Set();
  const event = promotedAt(live, t, durationOf);
  if (event && played.every((m) => isFinished(m, t, durationOf))) {
    const when = dayWords(live.config.settings.live.timeZone);
    const next = upcomingAt(live, t, durationOf, 8);
    const pair = (/** @type {{ homeId: string | null, awayId: string | null }} */ f) => `${abbr(/** @type {string} */ (f.homeId))} v ${abbr(/** @type {string} */ (f.awayId))}`;
    if (event === 'final_round') {
      const group = next.filter((f) => f.kickoff === next[0].kickoff);
      group.forEach((f) => promoted.add(f.key));
      items.push({ key: `big-${next[0].key}`, kind: 'big', tag: 'FINAL ROUND', text: `${when(next[0].kickoff, t)} · ALL AT ONCE · ${group.map(pair).join(' · ')}`, flash: false, teams: /** @type {any} */ (group.flatMap((f) => [f.homeId, f.awayId])) });
    } else {
      const semis = calendar.slots(pos.season).filter((x) => x.stage === 'semifinal');
      for (const f of next.filter((x) => x.stage === (event === 'final' ? 'final' : 'semifinal') && x.homeId && x.awayId)) {
        promoted.add(f.key);
        const tag = f.stage === 'final' ? 'THE FINAL' : `SEMIFINAL ${semis.findIndex((x) => x.kickoff === f.kickoff) + 1}`;
        items.push({ key: `big-${f.key}`, kind: 'big', tag, text: `${pair(f)} · ${when(f.kickoff, t)}`, flash: false, teams: [f.homeId, f.awayId] });
      }
    }
  }

  // OFF THE BALL's premiere (Tom, 2026-10-21), on the promo card's timing.
  const premiere = podcastPremiere(live, t, { timelineOf: ctx.timelineOf, playerName: ctx.playerName, formatTime: ctx.formatTime });
  if (premiere) {
    const when = dayWords(live.config.settings.live.timeZone);
    // TONIGHT 18:00 · OFF THE BALL EP 3 (Tom, 2026-10-21): the episode's number is the day of the season (Wednesday's 3).
    items.push({ key: `podcast-${premiere.season}-${premiere.n}`, kind: 'show', text: `${when(premiere.at, t)} · ${live.config.podcast.show} EP ${premiere.n + 1}`, flash: false });
  }

  // The League's announcements, newest first, for a while after each airs.
  for (const a of announcementsAt(live.config, calendar, t)) {
    if (t - a.at < ctx.settings.announcementHours * 3_600_000) items.push({ key: `league-${a.id}`, kind: 'league', text: a.headline, flash: false });
  }

  // Live scores elsewhere.
  for (const m of played) {
    if (m.id === ctx.featuredId || !isLive(m, t, durationOf)) continue;
    const tl = ctx.timelineOf(m);
    const s = tl.stateAt(t - m.kickoff);
    const lastGoal = tl.events.findLast((e) => e.event.type === 'goal' && e.at <= t - m.kickoff);
    const flash = Boolean(lastGoal && t - m.kickoff - lastGoal.at < ctx.settings.goalFlashMs);
    const minute = s.phase === 'half_time' ? 'HT' : `${Math.floor(s.clock / 60)}'`;
    items.push({ key: `live-${m.id}`, kind: 'live', text: `LIVE ${minute} ${abbr(m.homeId)} ${s.score[0]}-${s.score[1]} ${abbr(m.awayId)}`, flash, teams: [m.homeId, m.awayId] });
  }

  // Latest results, newest first.
  const finished = played.filter((m) => isFinished(m, t, durationOf));
  for (const m of finished.filter((x) => x.id !== ctx.hideId).slice(-ctx.settings.results).reverse()) {
    const r = m.summary.result;
    const extra = r.decidedBy === 'overtime' ? ' (GG)' : r.shootout ? ` (SO ${r.shootout.home}-${r.shootout.away})` : '';
    items.push({ key: `ft-${m.id}`, kind: 'result', text: `FT ${abbr(m.homeId)} ${r.homeGoals}-${r.awayGoals} ${abbr(m.awayId)}${extra}`, flash: false, teams: [m.homeId, m.awayId] });
  }

  // Next fixtures. Playoff opponents stay TBC until the matches that decide them have finished on screen.
  if (pos.next) {
    for (const f of upcomingAt(live, t, durationOf, ctx.settings.upcoming).filter((x) => !promoted.has(x.key))) {
      const label = f.stage === 'final' ? 'FINAL ' : f.stage === 'semifinal' ? 'SEMI ' : '';
      const match = f.homeId && f.awayId ? `${label}${abbr(f.homeId)} v ${abbr(f.awayId)}` : `${label}TBC`;
      items.push({ key: `next-${f.key}`, kind: 'next', text: `${ctx.formatTime(f.kickoff)} ${match}`, flash: false, teams: [f.homeId, f.awayId] });
    }
  } else {
    items.push({ key: `next-season-${pos.season + 1}`, kind: 'next', text: `SEASON ${pos.season + 1} STARTS ${ctx.formatTime(pos.seasonEnd)}`, flash: false });
  }

  // Leader and top scorer, once anything has been played, each with its team's kit (Tom, 2026-10-18).
  const table = tableAt(live, pos.season, t, durationOf);
  if (table[0]?.played > 0) {
    items.push({ key: 'leader', kind: 'leader', text: `TOP ${abbr(table[0].teamId)} ${table[0].points} PTS`, flash: false, teams: [table[0].teamId, null] });
  }
  const [scorer] = topScorersAt(live, pos.season, t, durationOf);
  if (scorer?.goals > 0) {
    items.push({ key: 'scorer', kind: 'scorer', text: `TOP SCORER ${ctx.playerName(scorer.playerId)} (${abbr(scorer.teamId)}) ${scorer.goals}`, flash: false, teams: [scorer.teamId, null] });
  }
  return items;
}

/**
 * How many are watching, the tape's last item (Tom, 2026-10-16; settings.audience.watchingTicker): 14 FANS WATCHING.
 * None until the audience service has answered.
 * @param {number | null} n  Households heard from within watchingMinutes.
 * @returns {TickerItem | null}
 */
export function watchingItem(n) {
  if (n === null || n < 1) return null;
  return { key: 'watching', kind: 'watching', text: `${n} ${n === 1 ? 'FAN' : 'FANS'} WATCHING`, flash: false };
}
