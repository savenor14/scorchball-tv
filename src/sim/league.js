// League state and season-1 setup. See docs/simulation.md §3 and §10.
import { clamp, withoutComments } from '../util.js';
import { generateAttributes, overall, pickName } from './players.js';
import { contractSeasons, fitToCap, marketWage } from './finances.js';
import { attachStreams, seedStreams, streamsOf } from './streams.js';

/**
 * The whole league. Plain JSON-safe data so it can be saved, sent to a browser, or diffed.
 * @typedef {object} League
 * @property {string} seed  The seed's name (dev and the tools), or "keys" for a league played from day keys (Task 271).
 * @property {number} season
 * @property {number} nextPlayerId
 * @property {Record<string, any>} teams       Team data from data/teams.json plus `roster: string[]` and `reserves: string[]`
 *   (Task 194b: the Kindling League, draft picks whose rights the team holds; not on the roster, never play).
 * @property {Record<string, import('./players.js').Player>} players  Every player ever, including retired.
 * @property {string[]} freeAgents
 * @property {SeasonSummary[]} history  One compact entry per completed season.
 */

/**
 * @typedef {object} SeasonSummary
 * @property {number} season
 * @property {string} championId
 * @property {string} runnerUpId
 * @property {string} shieldId
 * @property {import('./standings.js').TableRow[]} table  Final regular-season table.
 * @property {{ playerId: string, teamId: string, goals: number }[]} topScorers  Regular season, top 5.
 * @property {import('./awards.js').Award[]} awards  The season's awards (Task 188), in rules.awards.list's order.
 * @property {string[]} ruleChanges  The rule changes it was played under (Task 229b), by id, oldest first; none: data/rules.json's.
 */

/**
 * Build the season-1 league: every team's roster and a small free-agent pool. Emits `player_created`
 * for each player (stage "preseason"), including hidden values, so the log alone can rebuild the league.
 * @param {import('../config.js').Config} config
 * @param {string | import('./streams.js').Streams} seed  A seed, or where the randomness comes from (Task 271: the live
 *   channel's day keys).
 * @param {import('../chronicle/eventLog.js').EventLog} log
 * @returns {League}
 */
/**
 * A team's data as the league keeps it: everything in data/teams.json but what only the channel shows (CHANNEL_ONLY),
 * so adding such a field never changes the league's state or its snapshots, which are published history (Tom's note 14:
 * the grounds' names broke the daily job's history check; docs/live.md).
 * @param {Record<string, any>} team
 */
function leagueTeam(team) {
  return Object.fromEntries(Object.entries(structuredClone(team)).filter(([k]) => !CHANNEL_ONLY.includes(k)));
}
/** Team fields the channel reads from the data, never the league (the ground's name, groundsTour.js and main.js). */
const CHANNEL_ONLY = Object.freeze(['ground']);

export function createLeague(config, seed, log) {
  const { rules, positions } = config;
  const streams = typeof seed === 'string' ? seedStreams(seed) : seed;
  const rng = streams.rng(1, 'league-setup');
  const emit = log.scoped({ season: 1, stage: 'preseason' });

  /** @type {League} */
  const league = { seed: typeof seed === 'string' ? seed : 'keys', season: 1, nextPlayerId: 1, teams: {}, players: {}, freeAgents: [], history: [] };
  attachStreams(league, streams);

  for (const team of config.teams.teams) {
    const level = rules.league.initialPotentialMean + rng.normal(0, rules.league.teamStrengthSpread);
    league.teams[team.id] = { ...leagueTeam(team), roster: [], reserves: [] };
    const rosterSlots = rosterPositions(rng, rules, positions);
    const ages = balancedAges(rng, rules.league.initialAge, rosterSlots.length);
    rosterSlots.forEach((position, i) => addPlayer(league, config, rng, emit, {
      position, age: ages[i], teamId: team.id, homeRegion: team.region, ratings: veteranRatings(rng, config, level, ages[i]),
    }));
  }

  // The founding squads' deals (Task 231): the market wage, staggered so they don't all end together. Their own stream,
  // so adding contracts left every player as they were. A squad whose market wages come to more than the cap has them
  // cut by the same share to fit (Task 251): the founding season starts under the cap like every other.
  const contracts = streams.rng(1, 'founding-contracts');
  for (const team of Object.values(league.teams)) {
    const wages = fitToCap(team.roster.map((/** @type {string} */ id) => marketWage(league.players[id], league.season, config)), rules);
    team.roster.forEach((/** @type {string} */ id, /** @type {number} */ i) => {
      const p = league.players[id];
      const length = contractSeasons(contracts, league.season - p.birthSeason, rules);
      p.contract = { wage: wages[i], until: league.season - 1 + contracts.int(1, length) };
      emit('contract', { teamId: team.id, playerId: id, data: { kind: 'founding', ...p.contract } });
    });
  }

  // Free agents: a little below league level, always including a keeper for emergencies.
  const { min: minAge, max: maxAge } = rules.league.initialAge;
  for (let i = 0; i < rules.league.initialFreeAgents; i++) {
    const position = i === 0 ? positions.keeper : rng.weightedKey(withoutComments(rules.roster.minimums));
    const age = rng.int(minAge, maxAge);
    addPlayer(league, config, rng, emit, {
      position, age, teamId: null, homeRegion: null, ratings: veteranRatings(rng, config, freeAgentLevel(config), age),
    });
  }

  return league;
}

/**
 * Average peak overall for generated free agents: a little below league level.
 * @param {import('../config.js').Config} config
 */
export function freeAgentLevel({ rules }) {
  return rules.draft.potential.mean - rules.generation.freeAgentGap;
}

/**
 * Ratings for an established player: a peak (potential) drawn around `level`, and a current overall that
 * falls short of it for young players and past-their-prime veterans.
 * @param {import('./rng.js').Rng} rng @param {import('../config.js').Config} config @param {number} level @param {number} age
 * @returns {(peakAge: number) => { potential: number, current: number }}
 */
export function veteranRatings(rng, { rules }, level, age) {
  const pot = rules.draft.potential;
  const g = rules.generation;
  const dev = rules.development;
  return (peakAge) => {
    const potential = Math.round(clamp(rng.normal(level, g.playerSpread), pot.min, pot.max));
    let current = potential;
    if (age < peakAge) current -= (peakAge - age) * g.youthGapPerYear;
    else if (age > peakAge + dev.plateauYears) current -= (age - peakAge - dev.plateauYears) * g.initialDeclinePerYear;
    return { potential, current };
  };
}

/**
 * Create a player, add them to a team's roster (or the free-agent pool) and log `player_created`.
 * The name is unique among active players. Age is relative to `league.season`.
 * @param {League} league
 * @param {import('../config.js').Config} config
 * @param {import('./rng.js').Rng} rng
 * @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @param {{
 *   position: string, age: number, teamId: string | null, homeRegion: string | null,
 *   ratings: (peakAge: number) => { potential: number, current: number },
 * }} opts  `homeRegion`: most players come from it (otherwise regions are weighted). `ratings` gets the
 *          player's peak age and returns their potential and current overall.
 * @returns {import('./players.js').Player}
 */
export function addPlayer(league, config, rng, emit, { position, age, teamId, homeRegion, ratings }) {
  const { rules, positions } = config;
  const regionList = /** @type {any[]} */ (config.regions.regions);
  const region = homeRegion !== null && rng.chance(rules.league.homeRegionChance)
    ? regionList.find((r) => r.id === homeRegion)
    : rng.weighted(regionList, (r) => r.weight);
  const { firstName, lastName } = pickName(rng, region, activeNames(league), activeSurnames(league));
  const peakRange = position === positions.keeper ? rules.development.peakAge.keeper : rules.development.peakAge.outfield;
  const peakAge = rng.int(peakRange.min, peakRange.max);
  const { potential, current } = ratings(peakAge);

  const id = `p-${String(league.nextPlayerId++).padStart(6, '0')}`;
  // The hidden personality (Task 232), from the player's own stream: adding it left every other draw as it was.
  const m = streamsOf(league).rng(0, `motives|${id}`);
  const motives = { money: round3(m.normal()), winning: round3(m.normal()), home: round3(m.normal()) };
  /** @type {import('./players.js').Player} */
  const player = {
    id, firstName, lastName, region: region.id, birthSeason: league.season - age, position,
    attributes: generateAttributes(rng, position, clamp(current, rules.generation.minOverall, potential), config),
    potential, peakAge, teamId, injury: null, draft: null, status: 'active',
    joinedSeason: league.season, seasonsUnsigned: 0, reserveUntil: null, debutSeason: null, contract: null, motives,
  };
  league.players[id] = player;
  if (teamId) league.teams[teamId].roster.push(id);
  else league.freeAgents.push(id);

  emit('player_created', {
    teamId,
    playerId: id,
    data: {
      firstName, lastName, region: player.region, position, age, birthSeason: player.birthSeason,
      peakAge, potential, attributes: { ...player.attributes }, overall: Math.round(overall(player, positions)),
      motives: { ...motives },
    },
  });
  return player;
}

/** @param {number} x */
const round3 = (x) => Math.round(x * 1000) / 1000;

/** Surnames of every active player (Task 201: kept apart). @param {League} league */
function activeSurnames(league) {
  const names = new Set();
  for (const p of Object.values(league.players)) if (p.status === 'active') names.add(p.lastName);
  return names;
}

/** Full names of every active player. @param {League} league */
function activeNames(league) {
  const names = new Set();
  for (const p of Object.values(league.players)) if (p.status === 'active') names.add(`${p.firstName} ${p.lastName}`);
  return names;
}

/**
 * Positions for a full roster: every position's minimum, then outfield extras weighted by those minimums.
 * Sorted in position order (K, D, P, S).
 * @param {import('./rng.js').Rng} rng @param {any} rules @param {any} positions
 */
function rosterPositions(rng, rules, positions) {
  const minimums = withoutComments(rules.roster.minimums);
  const outfield = Object.fromEntries(Object.entries(minimums).filter(([p]) => p !== positions.keeper));
  /** @type {string[]} */
  const list = [];
  for (const [position, count] of Object.entries(minimums)) for (let i = 0; i < count; i++) list.push(position);
  while (list.length < rules.roster.size) list.push(rng.weightedKey(outfield));
  const order = /** @type {string[]} */ (positions.positions);
  return list.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

/**
 * Ages spread evenly across the range (one per equal slice, randomly placed within it), then shuffled,
 * so no team starts with an accidentally young or old squad.
 * @param {import('./rng.js').Rng} rng @param {{ min: number, max: number }} range @param {number} count
 */
function balancedAges(rng, { min, max }, count) {
  const width = (max - min + 1) / count;
  const ages = Array.from({ length: count }, (_, i) => Math.min(max, min + Math.floor((i + rng.next()) * width)));
  return rng.shuffle(ages);
}

/**
 * A player's age in the league's current season.
 * @param {import('./players.js').Player} player @param {number} season
 */
export function ageOf(player, season) {
  return season - player.birthSeason;
}
