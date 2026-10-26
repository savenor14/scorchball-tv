// The off-season: retirements, development, the reserves' call-ups, deals ending, draft, releases, free agency, injury recovery.
// See docs/simulation.md §6–9. Changes the league in place and advances `league.season` by one.
// Events are logged with the finished season's number and stage "offseason".
import { withoutComments } from '../util.js';
import { createDraftClass, draftOrder, positionCounts, runDraft, shortPositions, statNeeds, styleFit } from './draft.js';
import { capRoom, contractSeasons, marketWage, offerFor, offerScore, outlooks, rookieWage } from './finances.js';
import { addPlayer, freeAgentLevel, veteranRatings } from './league.js';
import { isRookie, motiveOf, overall, playerValue } from './players.js';
import { exp } from './fmath.js';
import { streamsOf } from './streams.js';
import { seasonConfig } from './rules.js';

/**
 * @typedef {object} OffseasonReport
 * @property {string[]} retired
 * @property {{ teamId: string, playerId: string, round: number, pick: number }[]} draft
 * @property {string[]} released
 * @property {{ teamId: string, playerId: string }[]} calledUp  From the reserves (Task 194b).
 * @property {{ teamId: string, playerId: string }[]} reserved  This draft's picks sent to the reserves.
 * @property {{ teamId: string, playerId: string }[]} signed
 * @property {string[]} draftOrder
 */

/**
 * @param {import('./league.js').League} league
 * @param {import('../config.js').Config} config
 * @param {import('../chronicle/eventLog.js').EventLog} log
 * @param {import('./season.js').SeasonRecord} record  The season just finished.
 * @returns {OffseasonReport}
 */
export function runOffseason(league, config, log, record) {
  const season = league.season;
  if (record.season !== season) throw new Error(`Off-season for season ${season} given the record for season ${record.season}`);
  // The off-season runs under the coming season's rules: that's when a change lands (Task 229b).
  config = seasonConfig(config, season + 1);
  const emit = log.scoped({ season, stage: 'offseason' });
  const stream = (/** @type {string} */ key) => streamsOf(league).rng(season, key);

  /** @type {OffseasonReport} */
  const report = { retired: [], draft: [], released: [], calledUp: [], reserved: [], signed: [], draftOrder: [] };

  // 1. Retirements happen at the end of the season just played.
  report.retired = retirements(league, config, stream('retirement'), emit);

  // From here on, ages count from the coming season.
  league.season = season + 1;

  // 2. Everyone a year older: growth, plateau or decline.
  develop(league, config, stream('development'), emit, record);

  // 2a. The reserves (the Kindling League, Task 194b): the ones now better than a roster player are called up; the
  //     ones whose rights have run out are released.
  const reserves = reserveMoves(league, config, emit);
  report.calledUp = reserves.calledUp;
  report.released.push(...reserves.released);

  // 2b. Deals that have run out (Task 231): the re-signing window, then free agency for the rest.
  const ended = reSigningWindow(league, config, stream('re-signing'), emit);
  report.released.push(...ended.keys());

  // 3. Draft.
  const draftRng = stream('draft');
  report.draftOrder = draftOrder(draftRng, record, config.rules);
  // The later rounds (Tom's note, 2026-10-25): the table in reverse once laterRounds is table; logged only then, so the
  // seasons played before it log as they did.
  const laterOrder = config.rules.draft.laterRounds === 'table' ? record.table.map((r) => r.teamId).reverse() : report.draftOrder;
  emit('draft_lottery', { data: laterOrder === report.draftOrder ? { order: report.draftOrder } : { order: report.draftOrder, laterOrder } });
  const prospects = createDraftClass(league, config, draftRng, emit);
  report.draft = runDraft(league, config, draftRng, emit, report.draftOrder, prospects, statNeeds(record, config.rules), laterOrder);
  // Rookie deals (Task 231): paid by pick, for rookieSeasons, kept in the reserves.
  const picks = report.draft.length;
  report.draft.forEach(({ teamId, playerId }, i) => {
    const p = league.players[playerId];
    p.contract = { wage: rookieWage(i + 1, picks, config.rules), until: league.season + config.rules.finances.rookieSeasons - 1 };
    emit('contract', { teamId, playerId, data: { kind: 'rookie', ...p.contract } });
  });

  // 4. Trim rosters that are over the limit (this draft's picks go to the reserves), 5. then fill gaps: from the
  //    reserves first, then free agency.
  const trimmed = releaseExtras(league, config, emit);
  report.released.push(...trimmed.released);
  report.reserved = trimmed.reserved;
  report.signed = freeAgency(league, config, stream('free-agency'), emit, record, report.calledUp, ended);

  for (const id of league.freeAgents) league.players[id].seasonsUnsigned++;
  report.retired.push(...trimFreeAgentPool(league, config, emit));

  // 6. A full off-season heals every injury.
  for (const p of Object.values(league.players)) {
    if (p.status === 'active' && p.injury) {
      p.injury = null;
      emit('injury_return', { teamId: p.teamId, playerId: p.id });
    }
  }

  return report;
}

/**
 * The chance a player retires at the end of a season (rules.retirement): by age (a keeper's centred later), plus a push
 * once past their peak for being below replacement level or going unsigned (young players keep trying). Pure, so the
 * chronicle's facts can tell a likely last match from the same odds (Task 243).
 * @param {any} r  rules.retirement
 * @param {{ age: number, keeper: boolean, rating: number, peakAge: number, unsigned: boolean }} p
 */
export function retirementChance(r, { age, keeper, rating, peakAge, unsigned }) {
  const center = keeper ? r.keeperCenterAge : r.centerAge;
  let chance = age >= r.maxAge ? 1 : 1 / (1 + exp(-r.steepness * (age - center)));
  if (age >= peakAge && rating < r.replacementOverall) chance += r.belowReplacementBoost;
  if (age >= peakAge && unsigned) chance += r.freeAgentBoost;
  return Math.min(1, chance);
}

/**
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {import('./rng.js').Rng} rng @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @returns {string[]} Retired player ids.
 */
function retirements(league, config, rng, emit) {
  const { rules, positions } = config;
  const r = rules.retirement;
  /** @type {string[]} */
  const retired = [];
  for (const p of Object.values(league.players)) {
    if (p.status !== 'active') continue;
    const rating = overall(p, positions);
    const chance = retirementChance(r, {
      age: league.season - p.birthSeason, keeper: p.position === positions.keeper, rating, peakAge: p.peakAge,
      unsigned: p.teamId === null && p.seasonsUnsigned >= r.freeAgentSeasons,
    });
    if (!rng.chance(chance)) continue;

    const teamId = p.teamId;
    if (teamId) {
      league.teams[teamId].roster = league.teams[teamId].roster.filter((/** @type {string} */ id) => id !== p.id);
      league.teams[teamId].reserves = league.teams[teamId].reserves.filter((/** @type {string} */ id) => id !== p.id);
    }
    else league.freeAgents = league.freeAgents.filter((id) => id !== p.id);
    retire(p, teamId, 'retired', rating, league.season, emit);
    retired.push(p.id);
  }
  return retired;
}

/**
 * Mark a player retired and log it. `reason` is "retired" (age and form) or "unsigned" (left the league
 * after going unsigned). The caller removes them from their roster or the pool.
 * @param {import('./players.js').Player} p
 * @param {string | null} teamId  Their team when they retired, if any.
 * @param {'retired' | 'unsigned'} reason @param {number} rating
 * @param {number} lastSeason  The season just finished (their final season in the league).
 * @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 */
function retire(p, teamId, reason, rating, lastSeason, emit) {
  p.status = 'retired';
  p.teamId = null;
  p.reserveUntil = null;
  p.contract = null;
  p.injury = null;
  emit('retirement', {
    teamId,
    playerId: p.id,
    data: {
      reason, age: lastSeason - p.birthSeason, overall: Math.round(rating), position: p.position,
      seasonsPlayed: lastSeason - p.joinedSeason + 1,
    },
  });
}

/**
 * If the free-agent pool is over its cap, the least valuable players leave the league (logged as a
 * retirement with reason "unsigned"). Keeps the pool from growing without limit.
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @returns {string[]}
 */
function trimFreeAgentPool(league, { rules, positions }, emit) {
  const excess = league.freeAgents.length - rules.league.freeAgentPoolMax;
  if (excess <= 0) return [];
  const leaving = league.freeAgents
    .map((id) => league.players[id])
    .sort((a, b) => playerValue(a, league.season, positions) - playerValue(b, league.season, positions))
    .slice(0, excess);
  const ids = new Set(leaving.map((p) => p.id));
  league.freeAgents = league.freeAgents.filter((id) => !ids.has(id));
  for (const p of leaving) retire(p, null, 'unsigned', overall(p, positions), league.season - 1, emit);
  return [...ids];
}

/**
 * Age every active player one year. `league.season` must already be the coming season.
 * - Up to peakAge: attributes the position uses close `growthFraction` of the gap to potential each year,
 *   plus `playingTimeBonus` more for a full season of minutes. Other attributes grow at half that rate. A reserve (the
 *   Kindling League) counts as having played `reserves.playingTimeShare` of a season.
 * - Plateau (peakAge+1 … peakAge+plateauYears): small random wobble.
 * - Decline after that, accelerating each year: physical attributes fall faster, mental ones slower.
 * Specialist attributes (keeping, for non-keepers) never develop.
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {import('./rng.js').Rng} rng @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @param {import('./season.js').SeasonRecord} record
 */
function develop(league, config, rng, emit, record) {
  const { rules, positions } = config;
  const dev = rules.development;
  const specialists = withoutComments(rules.generation.specialists);
  const physical = new Set(dev.attributeGroups.physical);
  const mental = new Set(dev.attributeGroups.mental);
  const maxMinutes = record.schedule.length * 2 * rules.match.halfMinutes;

  for (const p of Object.values(league.players)) {
    if (p.status !== 'active') continue;
    const age = league.season - p.birthSeason;
    const weights = withoutComments(positions.overallWeights[p.position]);
    const before = overall(p, positions);
    const share = p.reserveUntil !== null ? rules.reserves.playingTimeShare : Math.min(1, (record.stats.regular[p.id]?.minutes ?? 0) / maxMinutes);

    /** @type {(attr: string) => number} */
    let change;
    if (age <= p.peakAge) {
      // Close a fraction of the gap to potential; playing time closes more of it, but never overshoots.
      const fraction = Math.min(1, dev.growthFraction + dev.playingTimeBonus * share);
      const growth = fraction * Math.max(0, p.potential - before);
      change = (a) => (weights[a] > 0 ? growth + rng.normal(0, dev.noise) : growth / 2 + rng.normal(0, dev.noise / 2));
    } else if (age <= p.peakAge + dev.plateauYears) {
      change = () => rng.normal(0, dev.noise / 2);
    } else {
      const yearsPast = age - p.peakAge - dev.plateauYears;
      const decline = dev.decline.base + dev.decline.perYear * (yearsPast - 1);
      change = (a) => {
        const mult = physical.has(a) ? dev.decline.physicalMultiplier : mental.has(a) ? dev.decline.mentalMultiplier : 1;
        return -decline * mult + rng.normal(0, dev.noise / 2);
      };
    }

    for (const a of positions.attributes) {
      const locked = specialists[a] && specialists[a].position !== p.position;
      if (locked) continue;
      p.attributes[a] = Math.round(Math.min(99, Math.max(1, p.attributes[a] + change(a))));
    }
    emit('player_development', {
      teamId: p.teamId,
      playerId: p.id,
      data: { age, before: Math.round(before), after: Math.round(overall(p, positions)) },
    });
  }
}

/**
 * Teams over the roster limit let their least valuable player go, never going below a position minimum: one of this
 * draft's picks goes to the reserves (Task 194b), anyone else is released.
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @returns {{ released: string[], reserved: { teamId: string, playerId: string }[] }}
 */
function releaseExtras(league, config, emit) {
  const { rules, positions } = config;
  /** @type {string[]} */
  const released = [];
  /** @type {{ teamId: string, playerId: string }[]} */
  const reserved = [];
  for (const teamId of Object.keys(league.teams)) {
    const team = league.teams[teamId];
    while (team.roster.length > rules.roster.size) {
      const id = leastValuableSurplus(league, config, teamId);
      if (!id) break;
      const p = league.players[id];
      if (p.draft?.season === league.season - 1 && p.draft.teamId === teamId) {
        team.roster = team.roster.filter((/** @type {string} */ r) => r !== id);
        team.reserves.push(id);
        p.reserveUntil = p.draft.season + rules.reserves.rightsSeasons;
        reserved.push({ teamId, playerId: id });
        emit('reserve', { teamId, playerId: id, data: { position: p.position, overall: Math.round(overall(p, positions)), until: p.reserveUntil } });
      } else {
        release(league, teamId, id, emit, 'roster');
        released.push(id);
      }
    }
  }
  return { released, reserved };
}

/**
 * The reserves after development (Task 194b): each team calls up a reserve who's now more valuable than its weakest
 * roster player at the same position (best reserve first; that player is released), then releases the reserves whose
 * rights have run out.
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 */
function reserveMoves(league, config, emit) {
  const { positions } = config;
  const value = (/** @type {import('./players.js').Player} */ p) => playerValue(p, league.season, positions);
  /** @type {{ teamId: string, playerId: string }[]} */
  const calledUp = [];
  /** @type {string[]} */
  const released = [];
  for (const teamId of Object.keys(league.teams)) {
    const team = league.teams[teamId];
    const best = team.reserves.map((/** @type {string} */ id) => league.players[id]).sort((/** @type {any} */ a, /** @type {any} */ b) => value(b) - value(a));
    for (const r of best) {
      const weakest = team.roster.map((/** @type {string} */ id) => league.players[id]).filter((/** @type {any} */ p) => p.position === r.position)
        .sort((/** @type {any} */ a, /** @type {any} */ b) => value(a) - value(b))[0];
      if (!weakest || value(r) <= value(weakest) + config.rules.reserves.callUpMargin) continue;
      // The rookie rule (Task 230): a non-rookie call-up never pushes out the roster's last rookie.
      if (keepsForRookieRule(league, config, teamId, weakest.id) && !isRookie(r, league.season)) continue;
      release(league, teamId, weakest.id, emit, 'call_up');
      released.push(weakest.id);
      callUp(league, config, teamId, r.id, emit, 'better');
      calledUp.push({ teamId, playerId: r.id });
    }
    for (const id of [...team.reserves]) {
      const p = league.players[id];
      if (/** @type {number} */ (p.reserveUntil) >= league.season) continue;
      team.reserves = team.reserves.filter((/** @type {string} */ r) => r !== id);
      p.reserveUntil = null;
      team.roster.push(id);
      release(league, teamId, id, emit, 'rights_expired');
      released.push(id);
    }
  }
  return { calledUp, released };
}

/**
 * A reserve joins the roster.
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config @param {string} teamId
 * @param {string} playerId @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @param {'better' | 'short'} reason  Better than the weakest at their position; to fill a gap.
 */
function callUp(league, config, teamId, playerId, emit, reason) {
  const team = league.teams[teamId];
  const p = league.players[playerId];
  team.reserves = team.reserves.filter((/** @type {string} */ id) => id !== playerId);
  team.roster.push(playerId);
  p.reserveUntil = null;
  emit('call_up', { teamId, playerId, data: { position: p.position, overall: Math.round(overall(p, config.positions)), reason } });
}

/**
 * The least valuable player at a position where the team is above its minimum.
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config @param {string} teamId
 */
function leastValuableSurplus(league, config, teamId) {
  const { rules, positions } = config;
  const counts = positionCounts(league, teamId);
  const minimums = withoutComments(rules.roster.minimums);
  const above = league.teams[teamId].roster
    .map((/** @type {string} */ id) => league.players[id])
    .filter((/** @type {import('./players.js').Player} */ p) => (counts.get(p.position) ?? 0) > (minimums[p.position] ?? 0));
  // The rookie rule (Task 230): the rookies the rule needs stay, unless nobody else can go.
  const kept = above.filter((/** @type {import('./players.js').Player} */ p) => !keepsForRookieRule(league, config, teamId, p.id));
  const surplus = kept.length > 0 ? kept : above;
  surplus.sort((/** @type {any} */ a, /** @type {any} */ b) => playerValue(a, league.season, positions) - playerValue(b, league.season, positions));
  return surplus[0]?.id ?? null;
}

/**
 * The re-signing window (Task 231): each team looks at its players whose deals have run out, most valuable first. With
 * their old wages off its books, it re-signs one at the market wage (contractSeasons by age) if that fits its room
 * under the cap and no free agent already on the market at his position is worth more for a wage it could afford.
 * The rest are released to free agency (`contract_end`), where any team, theirs included, can sign them. The cap is
 * what breaks a strong side up: stars who've grown cost more than their old deals, and not all of them fit.
 * The player has a say (Task 232): offered a new deal, he takes it unless what he wants lies elsewhere (testsMarket).
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {import('./rng.js').Rng} rng @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @returns {Map<string, string>} Released: player → the team they left.
 */
function reSigningWindow(league, config, rng, emit) {
  const { rules, positions } = config;
  const value = (/** @type {import('./players.js').Player} */ p) => playerValue(p, league.season, positions);
  const wageOf = (/** @type {import('./players.js').Player} */ p) => marketWage(p, league.season, config);
  /** @type {Map<string, string>} */
  const ended = new Map();
  for (const teamId of Object.keys(league.teams)) {
    const team = league.teams[teamId];
    const expiring = team.roster.map((/** @type {string} */ id) => league.players[id])
      .filter((/** @type {import('./players.js').Player} */ p) => p.contract && p.contract.until < league.season)
      .sort((/** @type {any} */ a, /** @type {any} */ b) => value(b) - value(a) || a.id.localeCompare(b.id));
    if (expiring.length === 0) continue;
    for (const p of expiring) p.contract = null;
    const outlook = outlooks(league, positions);
    for (const p of expiring) {
      const wage = wageOf(p);
      const room = capRoom(league, teamId, rules);
      const better = league.freeAgents.map((id) => league.players[id])
        .some((fa) => fa.position === p.position && value(fa) > value(p) && wageOf(fa) <= room);
      const wanted = wage <= room && !better;
      const leaves = wanted && testsMarket(league, config, p, teamId, outlook);
      if (wanted && !leaves) {
        p.contract = { wage, until: league.season - 1 + contractSeasons(rng, league.season - p.birthSeason, rules) };
        emit('contract', { teamId, playerId: p.id, data: { kind: 're_sign', ...p.contract } });
      } else {
        // byPlayer (Task 243): the club wanted to keep them and they went to the market anyway (the facts can say they
        // chose to leave; the motive itself never goes on screen).
        release(league, teamId, p.id, emit, 'contract_end', leaves);
        ended.set(p.id, teamId);
      }
    }
  }
  return ended;
}

/**
 * Does a player his club wants to keep go to the market instead (Task 232)? By what he wants: money, if another team
 * could offer more than the market wage (overMarket: it has the room); winning, if his club is in the league's bottom half
 * by how far it's going and a team going further could afford him; home, if he isn't at his region's team and that team
 * could afford him. At the market his club can still sign him, with the familiarity plus.
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {import('./players.js').Player} p @param {string} teamId @param {Map<string, number>} outlook
 */
function testsMarket(league, config, p, teamId, outlook) {
  const { rules } = config;
  const market = marketWage(p, league.season, config);
  const others = Object.keys(league.teams).filter((id) => id !== teamId);
  const affords = (/** @type {string} */ id) => offerFor(market, capRoom(league, id, rules), rules);
  switch (motiveOf(p, league.season, rules)) {
    case 'money':
      return others.some((id) => (affords(id) ?? 0) > market);
    case 'winning': {
      const mine = outlook.get(teamId) ?? 0;
      return mine < 0.5 && others.some((id) => (outlook.get(id) ?? 0) > mine && affords(id) !== null);
    }
    default:
      return league.teams[teamId].region !== p.region
        && others.some((id) => league.teams[id].region === p.region && affords(id) !== null);
  }
}

/**
 * The rookie rule (Task 230): is this player one of the rookies the team needs for the coming season? With the rule in
 * force, a team keeps `rules.roster.rookieStarters` rookies on its roster through the off-season (a pick it would send
 * to the reserves, or a player it would release), so the rule rarely lapses. Off-seasons run under the coming season's
 * rules and `league.season` is already the coming season, so the rule arrives with the draft before season 2.
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config @param {string} teamId
 * @param {string} playerId
 */
function keepsForRookieRule(league, config, teamId, playerId) {
  const need = config.rules.roster.rookieStarters;
  if (need <= 0 || !isRookie(league.players[playerId], league.season)) return false;
  const others = league.teams[teamId].roster.filter((/** @type {string} */ id) => id !== playerId && isRookie(league.players[id], league.season)).length;
  return others < need;
}

/**
 * @param {import('./league.js').League} league @param {string} teamId @param {string} playerId
 * @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @param {'roster' | 'call_up' | 'rights_expired' | 'position' | 'contract_end' | 'upgrade'} reason  Over the roster limit; making way for
 *   a call-up; a reserve whose rights ran out; making room for a position the team is short of; their deal ran out (Task 231);
 *   a better free agent signed in their place (upgrade, Tom's note 2026-10-25).
 * @param {boolean} [byPlayer]  contract_end: the club wanted to keep them and they chose the market (Task 243).
 */
function release(league, teamId, playerId, emit, reason, byPlayer = false) {
  league.teams[teamId].roster = league.teams[teamId].roster.filter((/** @type {string} */ id) => id !== playerId);
  league.players[playerId].teamId = null;
  league.players[playerId].contract = null;
  league.freeAgents.push(playerId);
  emit('release', { teamId, playerId, data: reason === 'contract_end' ? { reason, byPlayer } : { reason } });
}

/**
 * Teams below the roster size or a position minimum fill the gap, one player per pass, worst-finishing team first:
 * their best reserve who fits (Task 194b), otherwise a free agent.
 * If no free agent fits a needed position, a replacement-level player is generated so rosters are always valid.
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {import('./rng.js').Rng} rng @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @param {import('./season.js').SeasonRecord} record
 * @param {{ teamId: string, playerId: string }[]} calledUp  Call-ups from the reserves are added here.
 * @param {Map<string, string>} ended  This off-season's ended deals: player → the team they left (a re-signing, Task 231).
 * @returns {{ teamId: string, playerId: string }[]}  The free agents signed.
 *
 * Money (Task 231): a team signs only a player whose market wage fits its room under the cap, at that wage, for
 * contractSeasons by age. With no room, it signs one worth no more than the minimum wage, at the minimum, which may
 * take it over the cap (so a roster can always be filled); failing that, a made-up replacement-level player.
 */
function freeAgency(league, config, rng, emit, record, calledUp, ended) {
  const { rules, positions } = config;
  const order = record.table.map((r) => r.teamId).reverse();
  // A statistical need in the filling pass too, when statNeed.freeAgency (Tom's note 7).
  const needs = rules.draft.statNeed.freeAgency ? statNeeds(record, rules) : new Map();
  const positionOrder = /** @type {string[]} */ (positions.positions);
  /** @type {{ teamId: string, playerId: string }[]} */
  const signed = [];
  const shortOf = (/** @type {string} */ teamId) => [...shortPositions(league, teamId, rules)].sort((a, b) => positionOrder.indexOf(a) - positionOrder.indexOf(b));

  // Teams short of a position call up a reserve who plays it first (Task 194b).
  for (const teamId of order) {
    const team = league.teams[teamId];
    for (let need = shortOf(teamId)[0]; need && team.roster.length < rules.roster.size; need = shortOf(teamId)[0]) {
      const reserve = team.reserves.map((/** @type {string} */ id) => league.players[id]).filter((/** @type {any} */ p) => p.position === need)
        .sort((/** @type {any} */ a, /** @type {any} */ b) => playerValue(b, league.season, positions) - playerValue(a, league.season, positions))[0];
      if (!reserve) break;
      callUp(league, config, teamId, reserve.id, emit, 'short');
      calledUp.push({ teamId, playerId: reserve.id });
    }
  }

  // The market (Task 232): the best free agent first. Every team with a place for him (and a need at his position, if it
  // has one) and the room makes an offer (finances.offerFor); he signs where it scores best for what he wants
  // (finances.offerScore). A free agent nobody can afford waits; the market closes when nobody can sign anybody.
  // Upgrades (Tom's note, 2026-10-25: a 20-year-old record-holding keeper went unsigned because every roster was full):
  // with upgradeMargin above 0, a full team bids too when the free agent is worth at least that much more than its
  // weakest player at his position, counting that player's wage as room; signing him releases that player (`upgrade`),
  // or, one of its own draft picks whose rights it still holds, sends him down to the reserves (off the cap) instead.
  // As in the draft and the filling pass, a local player counts localBonus more (Task 176); the rookies the rookie rule
  // needs are never the ones let go.
  const margin = rules.finances.upgradeMargin;
  const worth = (/** @type {import('./players.js').Player} */ p, /** @type {string} */ teamId) => playerValue(p, league.season, positions)
    + (p.region === league.teams[teamId].region ? rules.roster.localBonus : 0);
  const ownPick = (/** @type {import('./players.js').Player} */ q, /** @type {string} */ teamId) => q.draft?.teamId === teamId
    && q.draft.season + rules.reserves.rightsSeasons >= league.season;
  const weakestAt = (/** @type {string} */ teamId, /** @type {import('./players.js').Player} */ p) => league.teams[teamId].roster
    .map((/** @type {string} */ id) => league.players[id])
    .filter((/** @type {import('./players.js').Player} */ q) => q.position === p.position && !keepsForRookieRule(league, config, teamId, q.id))
    .reduce((/** @type {any} */ a, /** @type {import('./players.js').Player} */ b) => (!a || worth(b, teamId) < worth(a, teamId)
      || (worth(b, teamId) === worth(a, teamId) && b.id > a.id) ? b : a), null);
  for (let signing = 0; signing < 1000; signing++) {
    const outlook = outlooks(league, positions);
    const open = order.filter((id) => league.teams[id].roster.length < rules.roster.size);
    if (open.length === 0 && !(margin > 0)) break;
    const candidates = league.freeAgents.map((id) => league.players[id])
      .sort((a, b) => playerValue(b, league.season, positions) - playerValue(a, league.season, positions) || a.id.localeCompare(b.id));
    let done = false;
    for (const p of candidates) {
      const market = marketWage(p, league.season, config);
      /** @type {{ teamId: string, region: string, wage: number, score: number }[]} */
      const offers = [];
      /** @type {Map<string, import('./players.js').Player>} */
      const outgoing = new Map();
      for (const teamId of order) {
        let room = capRoom(league, teamId, rules);
        if (!open.includes(teamId)) {
          const weakest = margin > 0 ? weakestAt(teamId, p) : null;
          if (!weakest || worth(p, teamId) < worth(weakest, teamId) + margin) continue;
          outgoing.set(teamId, weakest);
          room += weakest.contract?.wage ?? 0;
        }
        const need = shortOf(teamId)[0];
        if (need && p.position !== need) continue;
        const wage = offerFor(market, room, rules);
        if (wage === null) continue;
        const offer = { teamId, region: league.teams[teamId].region, wage };
        offers.push({ ...offer, score: offerScore(p, offer, { season: league.season, outlook, formerTeamId: ended.get(p.id), rules }) });
      }
      if (offers.length === 0) continue;
      // Ties go to the worse team (the order's first).
      const best = offers.reduce((a, b) => (b.score > a.score ? b : a));
      const turnedDown = offers.filter((o) => o !== best).map((o) => ({ teamId: o.teamId, wage: o.wage }));
      const out = outgoing.get(best.teamId);
      if (out && ownPick(out, best.teamId)) {
        const team = league.teams[best.teamId];
        team.roster = team.roster.filter((/** @type {string} */ r) => r !== out.id);
        team.reserves.push(out.id);
        out.reserveUntil = /** @type {any} */ (out.draft).season + rules.reserves.rightsSeasons;
        emit('reserve', { teamId: best.teamId, playerId: out.id, data: { position: out.position, overall: Math.round(overall(out, positions)), until: out.reserveUntil } });
      } else if (out) release(league, best.teamId, out.id, emit, 'upgrade');
      signFreeAgent(league, config, rng, emit, best.teamId, p, best.wage, ended, turnedDown);
      signed.push({ teamId: best.teamId, playerId: p.id });
      done = true;
      break;
    }
    if (!done) break;
  }

  for (let pass = 0; pass < 100; pass++) {
    let anySigned = false;
    for (const teamId of order) {
      const team = league.teams[teamId];
      const short = [...shortPositions(league, teamId, rules)].sort((a, b) => positionOrder.indexOf(a) - positionOrder.indexOf(b));
      if (team.roster.length >= rules.roster.size && short.length === 0) continue;
      if (team.roster.length >= rules.roster.size) {
        // Full but missing a position: make room first.
        const id = leastValuableSurplus(league, config, teamId);
        if (!id) continue;
        release(league, teamId, id, emit, 'position');
      }

      const need = short[0] ?? null;
      const reserve = team.reserves.map((/** @type {string} */ id) => league.players[id]).filter((/** @type {any} */ p) => !need || p.position === need)
        .sort((/** @type {any} */ a, /** @type {any} */ b) => playerValue(b, league.season, positions) - playerValue(a, league.season, positions))[0];
      if (reserve) {
        callUp(league, config, teamId, reserve.id, emit, 'short');
        calledUp.push({ teamId, playerId: reserve.id });
        anySigned = true;
        continue;
      }
      const fits = league.freeAgents.map((id) => league.players[id]).filter((p) => !need || p.position === need);
      const wageOf = (/** @type {import('./players.js').Player} */ p) => marketWage(p, league.season, config);
      const room = capRoom(league, teamId, rules);
      const minWage = rules.finances.minWage;
      let pool = fits.filter((p) => wageOf(p) <= room);
      let atMinimum = false;
      if (pool.length === 0) {
        pool = fits.filter((p) => wageOf(p) <= minWage);
        atMinimum = true;
      }
      if (pool.length === 0) {
        const position = need ?? rng.weightedKey(withoutComments(rules.roster.minimums));
        const age = rng.int(rules.league.initialAge.min, rules.league.initialAge.max);
        pool = [addPlayer(league, config, rng, emit, {
          position, age, teamId: null, homeRegion: null, ratings: veteranRatings(rng, config, freeAgentLevel(config), age),
        })];
        atMinimum = true;
      }
      // Teams lean towards players from their own region (Task 176), as in the draft.
      // ...and towards players who suit their style (Task 177).
      const signValue = (/** @type {import('./players.js').Player} */ p) => playerValue(p, league.season, positions) + (p.region === team.region ? rules.roster.localBonus : 0)
        + rules.roster.styleWeight * styleFit(p, team, positions) + (needs.get(teamId)?.[p.position] ?? 0);
      const best = pool.reduce((a, b) => (signValue(b) > signValue(a) ? b : a));
      signFreeAgent(league, config, rng, emit, teamId, best, atMinimum ? minWage : wageOf(best), ended, []);
      signed.push({ teamId, playerId: best.id });
      anySigned = true;
    }
    if (!anySigned) return signed;
  }
  throw new Error('Free agency did not settle');
}

/**
 * A free agent signs: on the roster, a deal at `wage` for contractSeasons by age, `signing` and `contract` logged
 * (`re_sign` for the club he left this off-season; `turnedDown`, the other offers, Task 232).
 * @param {import('./league.js').League} league @param {import('../config.js').Config} config
 * @param {import('./rng.js').Rng} rng @param {ReturnType<import('../chronicle/eventLog.js').EventLog['scoped']>} emit
 * @param {string} teamId @param {import('./players.js').Player} p @param {number} wage @param {Map<string, string>} ended
 * @param {{ teamId: string, wage: number }[]} turnedDown
 */
function signFreeAgent(league, config, rng, emit, teamId, p, wage, ended, turnedDown) {
  league.freeAgents = league.freeAgents.filter((id) => id !== p.id);
  p.teamId = teamId;
  p.seasonsUnsigned = 0;
  league.teams[teamId].roster.push(p.id);
  emit('signing', { teamId, playerId: p.id, data: { position: p.position, overall: Math.round(overall(p, config.positions)) } });
  p.contract = { wage, until: league.season - 1 + contractSeasons(rng, league.season - p.birthSeason, config.rules) };
  emit('contract', { teamId, playerId: p.id, data: { kind: ended.get(p.id) === teamId ? 're_sign' : 'free_agent', ...p.contract, turnedDown } });
}
