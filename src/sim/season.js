// Season runner: regular season, then the playoffs. See docs/sport.md §12–13 and docs/vision.md §6.
// Changes the league in place (injuries, history); everything that happens is also in the event log.
//
// A season is played in steps so the live channel can advance one match at a time (docs/channel.md §3):
//   startSeason → playNextMatch … (until isSeasonOver) → seasonRecord
// The end of a round (injuries, standings), the playoff seeding and the end of the season happen inside
// the playNextMatch call that completes them. runSeason is the same loop, used by fast-forward.
// The step state is plain data (no league, config or log inside), so it can be saved later.
import { seasonAwards } from './awards.js';
import { simulateMatch, winnerOf } from './match.js';
import { changesAt, changesInEffect, ruleChangeData, seasonConfig } from './rules.js';
import { createSchedule } from './schedule.js';
import { streamsOf } from './streams.js';
import { addMatchStats, computeStandings, leaders } from './standings.js';

/**
 * @typedef {import('./match.js').MatchSummary} MatchSummary
 * @typedef {object} PlayoffMatch
 * @property {string} id
 * @property {'semifinal' | 'final'} stage
 * @property {string} homeId   Higher seed in semifinals.
 * @property {string} awayId
 * @property {boolean} neutral
 * @property {MatchSummary['result']} result
 * @property {string} winnerId
 *
 * @typedef {object} SeasonRecord
 * @property {number} season
 * @property {import('./schedule.js').Round[]} schedule  With every result filled in.
 * @property {import('./standings.js').TableRow[]} table  Final regular-season table.
 * @property {string[]} seeds                              Playoff seeds, best first.
 * @property {PlayoffMatch[]} playoffs
 * @property {string} championId
 * @property {string} runnerUpId
 * @property {string} shieldId
 * @property {{ regular: Record<string, import('./standings.js').SeasonPlayerStats>, playoffs: Record<string, import('./standings.js').SeasonPlayerStats> }} stats
 *
 * @typedef {object} Fixture  A match that is ready to be played.
 * @property {string} id
 * @property {number} season
 * @property {'regular' | 'semifinal' | 'final'} stage
 * @property {number | null} round
 * @property {string} homeId
 * @property {string} awayId
 * @property {boolean} neutral
 *
 * @typedef {object} SeasonState
 * @property {number} season
 * @property {'regular' | 'playoffs' | 'done'} phase
 * @property {string[]} teamIds
 * @property {string} lotsSeed
 * @property {import('./schedule.js').Round[]} schedule
 * @property {number} roundIndex       Index into `schedule` of the round being played.
 * @property {MatchSummary[]} results  Every regular-season match played so far.
 * @property {MatchSummary[]} roundPlayed  Matches played so far in the current round.
 * @property {import('./standings.js').TableRow[]} table  Table after the last completed round.
 * @property {string[]} seeds
 * @property {PlayoffMatch[]} playoffs  Knockout matches played so far.
 * @property {SeasonRecord['stats']} stats
 * @property {Omit<SeasonRecord, 'schedule' | 'table' | 'seeds' | 'playoffs' | 'stats' | 'season'> | null} outcome  Set once the final is played.
 */

/**
 * The season's seed for drawing lots between tied teams (standings.js): the same for the table however often it's worked
 * out, the sim's and the screen's alike. A published value (Task 271), so a day key carries the seed, not a stream.
 * @param {import('./league.js').League} league @param {number} season
 */
export function lotsSeedFor(league, season) {
  return lotsSeedOf(streamsOf(league), season);
}

/** The same from a league's streams. @param {import('./streams.js').Streams} streams @param {number} season */
export function lotsSeedOf(streams, season) {
  return streams.value(season, 'lots', (s) => `lots|${s.rng(season, 'lots').next()}`);
}

/**
 * Begin the league's current season: log its rule changes (`rule_change`, Task 229b), `season_start`, and build the schedule.
 * @param {import('./league.js').League} league
 * @param {import('../config.js').Config} config
 * @param {import('../chronicle/eventLog.js').EventLog} log
 * @returns {SeasonState}
 */
export function startSeason(league, config, log) {
  const season = league.season;
  const teamIds = Object.keys(league.teams);
  const lotsSeed = lotsSeedFor(league, season);
  for (const change of changesAt(config, season)) {
    log.append({ season, stage: 'regular', type: 'rule_change', data: ruleChangeData(seasonConfig(config, season - 1).rules, change) });
  }
  // The Director's inductions (Task 262; data/decisions.json): logged with the rule changes, changing nothing played.
  for (const d of /** @type {any[]} */ (config.decisions?.decisions ?? [])) {
    if (d.kind === 'induction' && d.season === season) log.append({ season, stage: 'regular', type: 'induction', playerId: d.playerId, data: { id: d.id, reason: d.reason } });
  }
  log.append({ season, stage: 'regular', type: 'season_start', data: { teamIds } });
  const schedule = createSchedule(teamIds, season, streamsOf(league).rng(season, 'schedule'));
  return {
    season,
    phase: 'regular',
    teamIds,
    lotsSeed,
    schedule,
    roundIndex: 0,
    results: [],
    roundPlayed: [],
    table: computeStandings(teamIds, [], seasonConfig(config, season).rules, lotsSeed),
    seeds: [],
    playoffs: [],
    stats: { regular: {}, playoffs: {} },
    outcome: null,
  };
}

/**
 * The next match to be played, or null once the season is over. Regular-season fixtures come in
 * round order. Playoff fixtures appear once they are known: the semifinals after the last round,
 * the final after both semifinals.
 * @param {SeasonState} state
 * @returns {Fixture | null}
 */
export function nextFixture(state) {
  if (state.phase === 'regular') {
    const round = state.schedule[state.roundIndex];
    return /** @type {Fixture} */ (round.matches[state.roundPlayed.length]);
  }
  if (state.phase === 'done') return null;

  const { season, seeds, playoffs } = state;
  if (seeds.length === 4 && playoffs.length < 2) {
    const sf = playoffs.length === 0
      ? { id: `s${season}-sf1`, homeId: seeds[0], awayId: seeds[3] }
      : { id: `s${season}-sf2`, homeId: seeds[1], awayId: seeds[2] };
    return { ...sf, season, stage: 'semifinal', round: null, neutral: false };
  }
  const finalists = seeds.length === 4 ? playoffs.map((p) => p.winnerId) : seeds;
  // At the better seed's ground, with home advantage, like the semifinals (Tom, 2026-10-05: it was on neutral ground,
  // the only ground that wasn't a team's).
  const [f1, f2] = [...finalists].sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
  return { id: `s${season}-f`, season, stage: 'final', round: null, homeId: f1, awayId: f2, neutral: false };
}

/** @param {SeasonState} state */
export function isSeasonOver(state) {
  return state.phase === 'done';
}

/**
 * Play the next match (see nextFixture). If it completes a round, the round is closed (injuries, standings);
 * after the last round the playoffs are seeded; after the final the season ends (`season_end`, league history).
 * @param {import('./league.js').League} league
 * @param {import('../config.js').Config} config
 * @param {import('../chronicle/eventLog.js').EventLog} log
 * @param {SeasonState} state  Updated in place.
 * @returns {MatchSummary}
 */
export function playNextMatch(league, config, log, state) {
  config = seasonConfig(config, state.season);
  const fixture = nextFixture(state);
  if (!fixture) throw new Error(`Season ${state.season} is over: no match left to play`);
  if (fixture.stage === 'regular') return playRegular(league, config, log, state, /** @type {import('./schedule.js').Match} */ (/** @type {unknown} */ (fixture)));
  return playKnockout(league, config, log, state, fixture);
}

/**
 * The finished season's record, for the off-season and reports.
 * @param {SeasonState} state
 * @returns {SeasonRecord}
 */
export function seasonRecord(state) {
  if (!state.outcome) throw new Error(`Season ${state.season} isn't over yet`);
  const { season, schedule, table, seeds, playoffs, stats } = state;
  return { season, schedule, table, seeds, playoffs, ...state.outcome, stats };
}

/**
 * Play the league's current season from round 1 to the final. Adds a summary to `league.history`.
 * The off-season (aging, draft, ...) is separate: see offseason.js.
 * @param {import('./league.js').League} league
 * @param {import('../config.js').Config} config
 * @param {import('../chronicle/eventLog.js').EventLog} log
 * @returns {SeasonRecord}
 */
export function runSeason(league, config, log) {
  const state = startSeason(league, config, log);
  while (!isSeasonOver(state)) playNextMatch(league, config, log, state);
  return seasonRecord(state);
}

/**
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {import('../chronicle/eventLog.js').EventLog} log @param {SeasonState} state
 * @param {import('./schedule.js').Match} match
 */
function playRegular(league, config, log, state, match) {
  const { season } = state;
  const { rules } = config;
  const summary = simulateMatch({ match, league, config, log });
  stampDebuts(league, summary, season);
  match.result = summary.result;
  state.roundPlayed.push(summary);
  addMatchStats(state.stats.regular, summary);

  const round = state.schedule[state.roundIndex];
  if (state.roundPlayed.length < round.matches.length) return summary;

  // The round is complete.
  state.results.push(...state.roundPlayed);
  applyInjuries(league, state.roundPlayed, log.scoped({ season, stage: 'regular', round: round.round }));
  state.roundPlayed = [];
  state.table = computeStandings(state.teamIds, state.results, rules, state.lotsSeed);
  log.append({
    season, stage: 'regular', round: round.round, type: 'standings',
    data: { rows: state.table.map(({ form, ...row }) => row) },
  });
  state.roundIndex++;

  if (state.roundIndex === state.schedule.length) {
    state.phase = 'playoffs';
    state.seeds = state.table.slice(0, rules.playoffs.teams).map((r) => r.teamId);
    log.append({ season, stage: rules.playoffs.teams > 2 ? 'semifinal' : 'final', type: 'playoff_seeding', data: { seeds: state.seeds } });
  }
  return summary;
}

/**
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {import('../chronicle/eventLog.js').EventLog} log @param {SeasonState} state
 * @param {Fixture} fixture
 */
function playKnockout(league, config, log, state, fixture) {
  const { id, season, stage, homeId, awayId, neutral } = fixture;
  const summary = simulateMatch({ match: fixture, league, config, log, knockout: true });
  stampDebuts(league, summary, season);
  addMatchStats(state.stats.playoffs, summary);
  applyInjuries(league, [summary], log.scoped({ season, stage }));
  const winnerId = /** @type {string} */ (winnerOf(summary));
  state.playoffs.push({ id, stage: /** @type {'semifinal' | 'final'} */ (stage), homeId, awayId, neutral, result: summary.result, winnerId });
  if (stage === 'final') endSeason(league, config, log, state, fixture, winnerId);
  return summary;
}

/**
 * The season's end: its summary in `league.history`, `season_end`, then one `award` event per award (Task 188).
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {import('../chronicle/eventLog.js').EventLog} log
 * @param {SeasonState} state @param {Fixture} final @param {string} championId
 */
function endSeason(league, config, log, state, final, championId) {
  const { season, table } = state;
  const runnerUpId = championId === final.homeId ? final.awayId : final.homeId;
  const shieldId = table[0].teamId;
  const topScorers = leaders(state.stats.regular, 'goals', 5).map((t) => ({ playerId: t.playerId, teamId: t.teamId, goals: t.goals }));
  const awards = seasonAwards(state.stats.regular, league.players, config.rules.awards, streamsOf(league).rng(season, 'awards'), season);
  const ruleChanges = changesInEffect(config, season).map((c) => c.id);
  league.history.push({ season, championId, runnerUpId, shieldId, table, topScorers, awards, ruleChanges });
  log.append({
    season, stage: 'final', type: 'season_end',
    teamId: championId,
    data: { championId, runnerUpId, shieldId, finalOrder: table.map((r) => r.teamId), topScorers },
  });
  for (const { award, playerId, teamId, ...data } of awards) {
    log.append({ season, stage: 'final', type: 'award', teamId, playerId, data: { award, ...data } });
  }
  state.outcome = { championId, runnerUpId, shieldId };
  state.phase = 'done';
}

/**
 * Everyone who played (started or came on) has made their League debut, if they hadn't (Task 230: the rookie rule).
 * @param {import('./league.js').League} league @param {MatchSummary} summary @param {number} season
 */
function stampDebuts(league, summary, season) {
  for (const id of Object.keys(summary.playerStats)) league.players[id].debutSeason ??= season;
}

/**
 * After a round: injured players on teams that just played count down one match (and return when it
 * reaches zero), then this round's new injuries are applied. Season-ending injuries wait for the off-season.
 * @param {import('./league.js').League} league
 * @param {MatchSummary[]} played
 * @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 */
function applyInjuries(league, played, emit) {
  const teamsPlayed = new Set(played.flatMap((s) => [s.homeId, s.awayId]));
  for (const p of Object.values(league.players)) {
    if (p.status !== 'active' || !p.injury || p.injury.seasonEnding || !p.teamId || !teamsPlayed.has(p.teamId)) continue;
    p.injury.matchesOut--;
    if (p.injury.matchesOut <= 0) {
      p.injury = null;
      emit('injury_return', { teamId: p.teamId, playerId: p.id });
    }
  }
  for (const s of played) {
    for (const inj of s.injuries) {
      league.players[inj.playerId].injury = { matchesOut: inj.matchesOut, seasonEnding: inj.seasonEnding };
    }
  }
}
