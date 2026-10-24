// The eleven studio cards from Tom's note 11 (2026-10-19, docs/studio-cards.md; mock-ups on newcards.html): LAST SEASON,
// ROLL OF HONOUR, BIGGEST WINS, SCORCHERS (STREAKS until 2026-10-20), AWARD RACE, RECORDS WATCH, ROOKIES, FINAL TABLE, PLAYOFF STATS, THE DRAFT and
// FAREWELLS. Pure and DOM-free, like cards.js: data in, plain objects out, from what has happened on screen at `t`.
// Each returns null when it has nothing to say, so the deck skips it (programme.js). They read only what is fixed by
// `t`: matches finished on screen by then, seasons already over (the chronicle up to the season before) and the sim's
// own events, so every screen deals the same cards whenever it was loaded.
import { records } from '../chronicle/records.js';
import { seasonAwards } from '../sim/awards.js';
import { isRookie } from '../sim/players.js';
import { createRng } from '../sim/rng.js';
import { draftPicks, notableRetirements } from './offseasonShow.js';
import { isFinished, seasonTotalsAt, tableAt } from './onScreen.js';

/**
 * @typedef {import('./liveLeague.js').LiveLeague} LiveLeague
 * @typedef {import('./liveLeague.js').LiveMatch} LiveMatch
 * @typedef {import('./cards.js').CardContext} CardContext
 * @typedef {{ teamId: string, position: number, won: number, drawn: number, lost: number, gd: number, points: number }} TableLine
 */

/** The new cards' ids, as settings.segments.studioDecks names them. */
export const MORE_CARDS = /** @type {const} */ (['last_season', 'roll_of_honour', 'biggest_wins', 'scorchers', 'award_race', 'records_watch', 'rookies', 'final_table', 'playoff_stats', 'the_draft', 'farewells']);

/** RECORDS WATCH: the stats with a season record, and a leader's share of it that makes it worth a card. */
const WATCH_STATS = /** @type {const} */ ([['goals', 'GOALS'], ['scorchers', 'SCORCHERS'], ['assists', 'ASSISTS'], ['stops', 'STOPS'], ['saves', 'SAVES']]);

/** @param {{ saves: number, conceded: number }} x */
const savePct = (x) => (x.saves + x.conceded > 0 ? Math.round((100 * x.saves) / (x.saves + x.conceded)) : null);

/** @param {import('../sim/standings.js').TableRow} r @param {number} i @returns {TableLine} */
const tableLine = (r, i) => ({ teamId: r.teamId, position: i + 1, won: r.won, drawn: r.drawn, lost: r.lost, gd: r.goalsFor - r.goalsAgainst, points: r.points });

/** This season's regular matches finished on screen by `t`, oldest first. @param {LiveLeague} live @param {number} season @param {number} t @param {(m: LiveMatch) => number} durationOf */
const finishedRegular = (live, season, t, durationOf) => live.matchesIn(season)
  .filter((m) => m.stage === 'regular' && isFinished(m, t, durationOf)).sort((a, b) => a.kickoff - b.kickoff || a.slot - b.slot);

/**
 * One of the eleven, or null when it has nothing to say.
 * @param {typeof MORE_CARDS[number]} card @param {LiveLeague} live @param {number} t  Already past wrapUpAt (cards.js).
 * @param {CardContext} ctx
 */
export function moreCard(card, live, t, ctx) {
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const season = live.calendar.seasonAt(t);
  const config = live.config;
  const final = live.matchesIn(season).find((m) => m.stage === 'final');
  // The final finished on screen: the season's honours and the off-season (the sim has them from the final's kick-off).
  const seasonDone = final !== undefined && isFinished(final, t, durationOf);
  const awardName = (/** @type {string} */ id) => /** @type {any[]} */ (config.rules.awards.list).find((a) => a.id === id)?.name.replace(/^The /, '').toUpperCase() ?? id;

  // LAST SEASON (Tom's rounds 2 and 3): last season's whole final table with the Cup, the runners-up and the Pennant
  // marked on it, and its award winners.
  if (card === 'last_season') {
    const h = live.league.history.find((x) => x.season === season - 1);
    if (!h) return null;
    const marks = (/** @type {string} */ id) => [id === h.championId ? 'CUP' : id === h.runnerUpId ? 'RUNNERS-UP' : '', id === h.shieldId ? 'PENNANT' : ''].filter(Boolean).join(' · ');
    return {
      kind: /** @type {const} */ ('last_season'),
      title: `LAST SEASON · SEASON ${h.season}`,
      cut: config.rules.playoffs.teams,
      championId: h.championId,
      rows: h.table.map((r, i) => ({ ...tableLine(r, i), marks: marks(r.teamId) })),
      awards: (h.awards ?? []).map((a) => ({ name: awardName(a.award), player: ctx.playerName(a.playerId), teamId: a.teamId })),
    };
  }

  // ROLL OF HONOUR: every season's Cup winners, runners-up and Pennant, the latest eight; the most Cups once a team has two.
  if (card === 'roll_of_honour') {
    const done = live.league.history.filter((h) => h.season < season || (h.season === season && seasonDone));
    if (!done.length) return null;
    const cups = new Map();
    for (const h of done) cups.set(h.championId, (cups.get(h.championId) ?? 0) + 1);
    const top = Math.max(...cups.values());
    return {
      kind: /** @type {const} */ ('roll_of_honour'),
      title: 'ROLL OF HONOUR',
      rows: [...done].sort((a, b) => b.season - a.season).slice(0, 8).map((h) => ({ season: h.season, championId: h.championId, runnerUpId: h.runnerUpId, shieldId: h.shieldId })),
      most: top > 1 ? { teamIds: [...cups.entries()].filter(([, n]) => n === top).map(([id]) => id), cups: top } : null,
    };
  }

  // BIGGEST WINS (Tom: no margin column, the teams' names): this season's biggest margins, then the most goals.
  if (card === 'biggest_wins') {
    const rows = finishedRegular(live, season, t, durationOf).filter((m) => m.summary.result.homeGoals !== m.summary.result.awayGoals)
      .map((m) => ({ m, r: m.summary.result }))
      .sort((a, b) => Math.abs(b.r.homeGoals - b.r.awayGoals) - Math.abs(a.r.homeGoals - a.r.awayGoals)
        || (b.r.homeGoals + b.r.awayGoals) - (a.r.homeGoals + a.r.awayGoals) || a.m.kickoff - b.m.kickoff)
      .slice(0, 6)
      .map(({ m, r }) => ({ round: /** @type {number} */ (m.round), homeId: m.homeId, awayId: m.awayId, homeGoals: r.homeGoals, awayGoals: r.awayGoals }));
    return rows.length ? { kind: /** @type {const} */ ('biggest_wins'), title: `BIGGEST WINS · SEASON ${season}`, rows } : null;
  }

  // SCORCHERS (Tom, 2026-10-20, in STREAKS' place): the regular season's top two scorcher-scorers, then every team's
  // scorchers for and against, the most for first (ties: fewer against, then the table).
  if (card === 'scorchers') {
    const totals = Object.values(seasonTotalsAt(live, season, t, durationOf));
    const players = totals.filter((x) => x.scorchers > 0)
      .sort((a, b) => b.scorchers - a.scorchers || b.goals - a.goals || a.playerId.localeCompare(b.playerId)).slice(0, 2)
      .map((x) => ({ name: ctx.playerName(x.playerId), teamId: x.teamId, scorchers: x.scorchers, goals: x.goals }));
    if (!players.length) return null;
    const order = tableAt(live, season, t, durationOf).map((r) => r.teamId);
    const teams = new Map(order.map((id) => [id, { teamId: id, scorchers: 0, against: 0 }]));
    for (const m of finishedRegular(live, season, t, durationOf)) {
      for (const s of Object.values(m.summary.playerStats)) {
        const mine = teams.get(s.teamId);
        const theirs = teams.get(s.teamId === m.homeId ? m.awayId : m.homeId);
        if (mine) mine.scorchers += s.scorchers;
        if (theirs) theirs.against += s.scorchers;
      }
    }
    const rows = [...teams.values()].sort((a, b) => b.scorchers - a.scorchers || a.against - b.against || order.indexOf(a.teamId) - order.indexOf(b.teamId));
    return { kind: /** @type {const} */ ('scorchers'), title: `SCORCHERS · SEASON ${season}`, players, teams: rows };
  }

  // AWARD RACE: each award's leader and runner-up so far, by the award's own rule, from the regular season on screen.
  if (card === 'award_race') {
    const totals = seasonTotalsAt(live, season, t, durationOf);
    const awards = seasonAwards(totals, live.league.players, config.rules.awards, createRng(`award-race|${season}`), season);
    if (!awards.length) return null;
    return {
      kind: /** @type {const} */ ('award_race'),
      title: `AWARD RACE · SEASON ${season}`,
      rows: awards.map((a) => ({ award: a.award, name: awardName(a.award), leader: { name: ctx.playerName(a.playerId), teamId: a.teamId, value: a.value },
        second: a.shortlist[0] ? { name: ctx.playerName(a.shortlist[0].playerId), teamId: a.shortlist[0].teamId, value: a.shortlist[0].value } : null })),
    };
  }

  // RECORDS WATCH (Tom: the chasers on the left, the record on the right): this season's leader in each stat against
  // the season record from the seasons before, shown when a leader has studioDecks.recordsWatchShare of it.
  if (card === 'records_watch') {
    if (season < 2) return null;
    const r = records(live.chronicle, config.chronicle.records, { upTo: season - 1 });
    const totals = Object.values(seasonTotalsAt(live, season, t, durationOf));
    const share = config.settings.segments.studioDecks.recordsWatchShare;
    const rows = WATCH_STATS.flatMap(([stat, words]) => {
      const rec = /** @type {import('../chronicle/records.js').PlayerEntry[]} */ (/** @type {any} */ (r.season)[stat])[0];
      const value = (/** @type {import('../sim/standings.js').SeasonPlayerStats} */ x) => (stat === 'stops' ? x.tackles + x.blocks : x[stat]);
      const lead = [...totals].sort((a, b) => value(b) - value(a) || a.playerId.localeCompare(b.playerId))[0];
      if (!rec || !lead || value(lead) < share * rec.value) return [];
      return [{ stat, words, leader: { name: ctx.playerName(lead.playerId), teamId: lead.teamId, value: value(lead) }, record: { value: rec.value, name: ctx.playerName(rec.playerId), teamId: rec.teamId, season: /** @type {number} */ (rec.season) } }];
    });
    return rows.length ? { kind: /** @type {const} */ ('records_watch'), title: 'RECORDS WATCH', rows } : null;
  }

  // ROOKIES (Tom: no pick; G, A and ST; the rookie keepers apart): the best five outfielders, then keepers who've
  // started studioDecks.rookieKeeperStarts or more.
  if (card === 'rookies') {
    const all = Object.values(seasonTotalsAt(live, season, t, durationOf))
      .filter((x) => x.appearances > 0 && live.league.players[x.playerId] && isRookie(live.league.players[x.playerId], season));
    const stops = (/** @type {import('../sim/standings.js').SeasonPlayerStats} */ x) => x.tackles + x.blocks;
    const rank = (/** @type {import('../sim/standings.js').SeasonPlayerStats} */ x) => x.goals + x.assists + stops(x) / 10;
    const outfield = all.filter((x) => live.league.players[x.playerId].position !== 'K')
      .sort((a, b) => rank(b) - rank(a) || a.playerId.localeCompare(b.playerId)).slice(0, 5)
      .map((x) => ({ name: ctx.playerName(x.playerId), teamId: x.teamId, position: live.league.players[x.playerId].position, goals: x.goals, assists: x.assists, stops: stops(x) }));
    const keepers = all.filter((x) => live.league.players[x.playerId].position === 'K' && x.starts >= config.settings.segments.studioDecks.rookieKeeperStarts)
      .sort((a, b) => b.saves - a.saves || a.playerId.localeCompare(b.playerId)).slice(0, 2)
      .map((x) => ({ name: ctx.playerName(x.playerId), teamId: x.teamId, saves: x.saves, pct: savePct(x) }));
    return outfield.length || keepers.length ? { kind: /** @type {const} */ ('rookies'), title: `ROOKIES · SEASON ${season}`, outfield, keepers } : null;
  }

  // FINAL TABLE: the regular season's final table, once it's over on screen.
  if (card === 'final_table') {
    if (finishedRegular(live, season, t, durationOf).length < live.calendar.regularCount) return null;
    return { kind: /** @type {const} */ ('final_table'), title: `FINAL TABLE · SEASON ${season}`, cut: config.rules.playoffs.teams, rows: tableAt(live, season, t, durationOf).map(tableLine) };
  }

  // PLAYOFF STATS: the regular season's TOP ASSISTS, TOP STOPS and TOP KEEPERS for the playoffs alone, and scorchers.
  if (card === 'playoff_stats') {
    const totals = Object.values(seasonTotalsAt(live, season, t, durationOf, 'playoffs'));
    const top = (/** @type {(x: import('../sim/standings.js').SeasonPlayerStats) => number} */ v, /** @type {boolean} */ keeper = false) => totals.filter((x) => v(x) > 0)
      .sort((a, b) => v(b) - v(a) || a.playerId.localeCompare(b.playerId)).slice(0, 3)
      .map((x) => ({ name: ctx.playerName(x.playerId), teamId: x.teamId, value: v(x), pct: keeper ? savePct(x) : null }));
    const blocks = [
      { title: 'ASSISTS', rows: top((x) => x.assists) },
      { title: 'STOPS', rows: top((x) => x.tackles + x.blocks) },
      { title: 'KEEPERS', rows: top((x) => x.saves, true) },
      { title: 'SCORCHERS', rows: top((x) => x.scorchers) },
    ];
    return blocks.some((b) => b.rows.length) ? { kind: /** @type {const} */ ('playoff_stats'), title: `PLAYOFF STATS · SEASON ${season}`, blocks } : null;
  }

  // THE DRAFT (Tom: with ages) and FAREWELLS: the off-season just aired, after the final (from the sim's events, as the
  // off-season show and BIGGEST SIGNINGS read them).
  if (card === 'the_draft') {
    if (!seasonDone) return null;
    const picks = draftPicks(live.leagueEvents, season, live.league.players, live.league.teams, config.regions.regions).filter((p) => p.round === 1);
    return picks.length ? {
      kind: /** @type {const} */ ('the_draft'),
      title: `THE DRAFT · ROUND 1 · SEASON ${season + 1}`,
      rows: picks.map((p) => ({ pick: p.pick, teamId: p.teamId, name: p.name, position: p.position, age: p.age, role: p.projection.role })),
    } : null;
  }
  if (card === 'farewells') {
    if (!seasonDone) return null;
    const rows = notableRetirements(live.leagueEvents, live.league.history, season, { ...config.settings.farewells, max: config.settings.segments.studioDecks.farewells }, config.rules.awards, ctx.playerName)
      .map((f) => ({ name: f.name, teamId: f.teamId, position: f.position, age: f.age, seasons: f.seasons, awards: f.awards.map((a) => a.replace('THE ', '')) }));
    return rows.length ? { kind: /** @type {const} */ ('farewells'), title: `FAREWELLS · SEASON ${season}`, rows } : null;
  }
  return null;
}
