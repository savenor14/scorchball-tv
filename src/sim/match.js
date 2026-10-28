// The match engine: possession phases resolved from ratings plus seeded rolls. See docs/simulation.md §4
// and docs/sport.md. A whole match is computed instantly; its events carry game-clock times so the
// channel can replay them in real time later.
//
// The engine is pure with respect to the league: it reads players and teams but never changes them.
// Injuries and stats are returned for the season runner to apply.
//
// Attribute meanings are engine knowledge: shooting, passing, dribbling, tackling, pace, composure,
// stamina and keeping each drive specific rolls below.
import { clamp, withoutComments } from '../util.js';
import { exp } from './fmath.js';
import { isRookie, overall } from './players.js';
import { playerOfTheMatch } from './potm.js';
import { streamsOf } from './streams.js';

/** Zones are named from the point of view of the team with the ball. */
const MIRROR = /** @type {const} */ ({ defensive: 'attacking', middle: 'middle', attacking: 'defensive' });
const NEXT_ZONE = /** @type {const} */ ({ defensive: 'middle', middle: 'attacking' });
/** Possession changes that stop play (a dead ball): a tired player may be substituted then (Task 41). */
const STOPPAGES = new Set(['goal', 'miss', 'save', 'burn']);
/** Changes of possession after which the keeper restarts play (Task 88). */
const RESTARTS = new Set(['goal', 'miss', 'save']);
const HEAT_STAGES = /** @type {const} */ (['cool', 'warm', 'hot']);

/**
 * @typedef {import('./players.js').Player} Player
 * @typedef {'defensive' | 'middle' | 'attacking'} Zone
 * @typedef {{ player: Player, slot: string, fatigue: number }} OnPitch
 * @typedef {{
 *   teamId: string, team: any, isHome: boolean, onPitch: OnPitch[], bench: Player[], injured: string[], subsUsed: number,
 *   goals: number,
 * }} Side
 * @typedef {{
 *   teamId: string, started: boolean, secondsPlayed: number, goals: number, assists: number, scorchers: number,
 *   shots: number, shotsOnTarget: number, saves: number, tackles: number, fouls: number, burns: number,
 *   blocks: number, conceded: number,
 * }} PlayerStats
 *   tackles count steals (a lost pass) too. conceded: goals let in while in goal (Task 188: the Ironclad's save
 *   percentage, saves over saves plus conceded).
 * @typedef {{ shots: number, burns: number, fouls: number, scorchers: number, possessionSeconds: number }} TeamStats
 * @typedef {{
 *   homeGoals: number, awayGoals: number, decidedBy: 'regulation' | 'overtime' | 'shootout',
 *   shootout: { home: number, away: number } | null,
 * }} MatchResult
 * @typedef {{
 *   matchId: string, homeId: string, awayId: string, result: MatchResult,
 *   playerStats: Record<string, PlayerStats>, teamStats: { home: TeamStats, away: TeamStats },
 *   injuries: { playerId: string, teamId: string, matchesOut: number, seasonEnding: boolean }[],
 * }} MatchSummary
 */

/**
 * Probability that the attacking side of a contest wins. See docs/simulation.md §4.6.
 * @param {{ scale: number, bias: number, pMin: number, pMax: number }} c
 * @param {number} attack @param {number} defend
 */
export function contest(c, attack, defend) {
  const x = (attack - defend) / c.scale + c.bias;
  return clamp(1 / (1 + exp(-x)), c.pMin, c.pMax);
}

/**
 * Pick a team's starting lineup and bench from fit, active players. Each slot takes the best natural
 * player for that position, or the best stand-in if none is available. The bench keeps one backup keeper.
 * `restKeeper` (Task 174b): the first-choice keeper rests on the bench and the next keeper starts, if one is fit.
 * `season` (Task 230, the rookie rule): with `rules.roster.rookieStarters` above 0, the five must include that many
 * rookies (players.isRookie); see startRookies. Without a season the rule isn't applied.
 * @param {any} team @param {Record<string, Player>} players @param {import('../config.js').Config} config
 * @param {{ restKeeper?: boolean, season?: number }} [opts]
 * Also the squad's injured (Task 185: they sit in the dugout too, so the channel shows them), in roster order.
 * @returns {{ starters: { player: Player, slot: string }[], bench: Player[], injured: string[] }}
 */
export function selectLineup(team, players, { rules, positions }, { restKeeper = false, season } = {}) {
  const order = /** @type {string[]} */ (positions.positions);
  const lineup = withoutComments(rules.roster.lineup);
  const slots = order.flatMap((pos) => Array.from({ length: lineup[pos] ?? 0 }, () => pos));
  let available = team.roster.map((/** @type {string} */ id) => players[id]).filter((/** @type {Player} */ p) => p.status === 'active' && !p.injury);

  /** @type {{ player: Player, slot: string }[]} */
  const starters = [];
  // The rested keeper sits out the choice of starters, but only if another natural keeper can start instead, and never
  // if resting would leave the team short (Task 271: a squad down to its last fit players).
  const keepers = available.filter((/** @type {Player} */ p) => p.position === positions.keeper);
  const rested = restKeeper && keepers.length > 1 && available.length > slots.length ? bestFor(keepers, positions.keeper, positions) : null;
  for (const slot of slots) {
    const player = bestFor(available.filter((/** @type {Player} */ p) => p !== rested), slot, positions);
    if (!player) break;
    starters.push({ player, slot });
    available = available.filter((/** @type {Player} */ p) => p !== player);
  }

  if (season !== undefined && rules.roster.rookieStarters > 0) {
    available = startRookies(starters, available, rules.roster.rookieStarters, season, positions, rested);
  }

  const benchSize = Math.max(0, rules.roster.matchday - starters.length);
  const rest = [...available].sort((a, b) => overall(b, positions) - overall(a, positions));
  const backupKeeper = rest.find((p) => p.position === positions.keeper);
  // One backup keeper, then outfield players; another keeper only if there aren't enough of them (Task 140, Tom: a
  // squad with three keepers put two on the bench).
  const outfield = rest.filter((p) => p.position !== positions.keeper);
  const spares = rest.filter((p) => p.position === positions.keeper && p !== backupKeeper);
  const bench = [...(backupKeeper ? [backupKeeper] : []), ...outfield, ...spares];
  const injured = team.roster.filter((/** @type {string} */ id) => players[id].status === 'active' && players[id].injury);
  return { starters, bench: bench.slice(0, benchSize), injured };
}

/**
 * The rookie rule (Task 230, Tom): until the five include `count` rookies, the fit rookie whose swap costs least takes
 * the place of a starter at the rookie's own position (a rookie keeper replaces the keeper): the one whose rating at that
 * slot is lowest above the rookie's. Without a fit rookie to swap in, the rule lapses for the match. The rested keeper
 * (Task 174b) is never swapped in. Changes `starters` in place.
 * @param {{ player: Player, slot: string }[]} starters @param {Player[]} available  The rest of the fit squad.
 * @param {number} count @param {number} season @param {any} positions @param {Player | null} rested
 * @returns {Player[]} The rest of the fit squad after the swaps.
 */
function startRookies(starters, available, count, season, positions, rested) {
  const at = (/** @type {Player} */ p, /** @type {string} */ slot) => overall({ position: slot, attributes: p.attributes }, positions);
  let rest = available;
  while (starters.filter((s) => isRookie(s.player, season)).length < count) {
    /** @type {{ rookie: Player, starter: { player: Player, slot: string }, loss: number } | null} */
    let best = null;
    for (const rookie of rest) {
      if (rookie === rested || !isRookie(rookie, season)) continue;
      for (const starter of starters) {
        if (starter.slot !== rookie.position || isRookie(starter.player, season)) continue;
        const loss = at(starter.player, starter.slot) - at(rookie, starter.slot);
        if (!best || loss < best.loss) best = { rookie, starter, loss };
      }
    }
    if (!best) break;
    rest = [...rest.filter((p) => p !== best.rookie), best.starter.player];
    best.starter.player = best.rookie;
  }
  return rest;
}

/**
 * Best player for a slot: natural position first, otherwise the best rating at that slot.
 * @param {Player[]} candidates @param {string} slot @param {any} positions
 */
function bestFor(candidates, slot, positions) {
  const natural = candidates.filter((p) => p.position === slot);
  const pool = natural.length > 0 ? natural : candidates;
  let best = null;
  let bestRating = -Infinity;
  for (const p of pool) {
    const rating = overall({ position: slot, attributes: p.attributes }, positions);
    if (rating > bestRating) {
      best = p;
      bestRating = rating;
    }
  }
  return best;
}

/**
 * The regular-season rounds in which a team's backup keeper starts (Task 174b, Tom): `rules.roster.backupKeeperStarts`
 * ({ min, max }) of them, drawn from every round but the last (the final round), from the team's own stream for the season.
 * @param {import('./streams.js').Streams} streams @param {number} season @param {string} teamId @param {number} teamCount @param {any} rules
 * @returns {Set<number>}
 */
export function keeperRestRounds(streams, season, teamId, teamCount, rules) {
  const rng = streams.rng(season, `keeper-rest|${teamId}`);
  const { min, max } = rules.roster.backupKeeperStarts;
  const rounds = Array.from({ length: 2 * (teamCount - 1) - 1 }, (_, i) => i + 1);
  return new Set(rng.shuffle(rounds).slice(0, rng.int(min, max)));
}

/**
 * Does a team rest its first-choice keeper in this match? Only in the regular season, in its keeperRestRounds.
 * The engine and the pre-match card both ask, so the card shows the five who start.
 * @param {import('./league.js').League} league @param {{ season: number, stage: string, round: number | null }} match
 * @param {string} teamId @param {any} rules
 */
export function restsKeeper(league, match, teamId, rules) {
  if (match.stage !== 'regular' || match.round === null) return false;
  // A published value (Task 271): a day's key says whether the team rests its keeper that round, not the season's shuffle.
  const round = match.round;
  return streamsOf(league).value(match.season, `keeper-rest|${teamId}|r${round}`, (s) => keeperRestRounds(s, match.season, teamId, Object.keys(league.teams).length, rules).has(round));
}

/**
 * Simulate one match from kick-off to result, emitting every event to the log.
 * @param {{
 *   match: import('./schedule.js').Match | { id: string, season: number, stage: string, round: number | null, homeId: string, awayId: string, neutral: boolean },
 *   league: import('./league.js').League,
 *   config: import('../config.js').Config,
 *   log: import('../chronicle/eventLog.js').EventLog,
 *   knockout?: boolean,
 * }} args  `knockout`: a draw goes to golden-goal overtime, then a shootout.
 * @returns {MatchSummary}
 */
export function simulateMatch(args) {
  return new MatchSim(args).run();
}

class MatchSim {
  /** @param {Parameters<typeof simulateMatch>[0]} args */
  constructor({ match, league, config, log, knockout = false }) {
    this.match = match;
    this.config = config;
    this.rules = config.rules;
    this.positions = config.positions;
    this.knockout = knockout;
    this.rng = streamsOf(league).rng(match.season, match.id);
    this.emit = log.scoped({
      season: match.season,
      stage: match.stage,
      round: match.stage === 'regular' ? match.round : null,
      matchId: match.id,
    });

    /** @type {Record<string, PlayerStats>} */
    this.playerStats = {};
    /** @type {MatchSummary['injuries']} */
    this.injuries = [];
    this.lineupTotal = Object.values(withoutComments(this.rules.roster.lineup)).reduce((a, b) => a + b, 0);
    this.injuryPerSecond = this.rules.injuries.chancePerMatch / (2 * this.rules.match.halfMinutes * 60);

    this.home = this.makeSide(match.homeId, true, league);
    this.away = this.makeSide(match.awayId, false, league);
    /** @type {Map<Side, TeamStats>} */
    this.teamStats = new Map([this.home, this.away].map((s) => [s, { shots: 0, burns: 0, fouls: 0, scorchers: 0, possessionSeconds: 0 }]));

    // Possession state.
    this.clock = 0;
    /** @type {Side} */
    this.poss = this.home;
    /** @type {Zone} */
    this.zone = 'middle';
    this.heat = 0;
    this.heatStage = 0;
    this.quality = 0;
    // In the attacking zone: the team has worked the ball at least once, so it's in range to shoot (Task 37).
    this.inRange = false;
    // The last advance was a breakaway: its player shoots next, unchallenged.
    this.breakaway = false;
    // The keeper has the ball after a goal, miss or held save, and the team hasn't got it out yet (Task 88): the
    // opponents rarely press it (tactics.restartPressFactor).
    this.restart = false;
    // This action ended in a stoppage (a goal, miss, held save, burn or foul): a tired player may come off.
    this.stopped = false;
    /** @type {OnPitch | null} */
    this.lastCarrier = null;
    /** @type {OnPitch | null} */
    this.lastAdvancer = null;
    /** The last teammate before lastAdvancer to move the ball on in this spell (rules.match.assists 'teammate'). @type {OnPitch | null} */
    this.priorAdvancer = null;
    this.goalThisPeriod = false;
    /** momentum (Task 236): the team that has it, from when (full) to when (gone), game seconds. @type {{ side: Side, from: number, until: number } | null} */
    this.momentum = null;
  }

  /** @param {string} teamId @param {boolean} isHome @param {import('./league.js').League} league @returns {Side} */
  makeSide(teamId, isHome, league) {
    const team = league.teams[teamId];
    const { starters, bench, injured } = selectLineup(team, league.players, this.config, { restKeeper: restsKeeper(league, this.match, teamId, this.rules), season: this.match.season });
    /** @type {Side} */
    const side = {
      teamId, team, isHome, bench, injured, subsUsed: 0, goals: 0,
      onPitch: starters.map(({ player, slot }) => ({ player, slot, fatigue: 0 })),
    };
    for (const e of side.onPitch) this.statsFor(e.player, side).started = true;
    return side;
  }

  /** @returns {MatchSummary} */
  run() {
    const half = this.rules.match.halfMinutes * 60;
    for (const side of [this.home, this.away]) {
      this.emitAt('lineup', {
        teamId: side.teamId,
        data: {
          starters: side.onPitch.map((e) => ({ playerId: e.player.id, slot: e.slot })),
          bench: side.bench.map((p) => p.id),
          injured: side.injured,
          // The rookie rule (Task 230): the rookie who started, or null when it lapsed; only while the rule is in force.
          ...(this.rules.roster.rookieStarters > 0 ? { rookieId: side.onPitch.find((e) => isRookie(e.player, this.match.season))?.player.id ?? null } : {}),
        },
      });
    }

    this.playPeriod(half, this.home, false);
    this.emitAt('half_time', { data: { score: this.score() } });
    this.breakSubs();
    this.playPeriod(2 * half, this.away, false);
    this.emitAt('full_time', { data: { score: this.score() } });

    /** @type {MatchResult['decidedBy']} */
    let decidedBy = 'regulation';
    let shootout = null;
    if (this.knockout && this.home.goals === this.away.goals) {
      this.emitAt('overtime_start', { data: { score: this.score() } });
      this.breakSubs();
      this.playPeriod(2 * half + this.rules.match.overtimeMinutes * 60, this.rng.pick([this.home, this.away]), true);
      if (this.home.goals !== this.away.goals) decidedBy = 'overtime';
      else {
        decidedBy = 'shootout';
        // No momentum into a shootout (a burn in overtime would have carried it).
        this.momentum = null;
        shootout = this.shootout();
      }
    }

    /** @type {MatchResult} */
    const result = { homeGoals: this.home.goals, awayGoals: this.away.goals, decidedBy, shootout };
    /** @type {MatchSummary} */
    const summary = {
      matchId: this.match.id,
      homeId: this.home.teamId,
      awayId: this.away.teamId,
      result,
      playerStats: this.playerStats,
      teamStats: { home: this.stat(this.home), away: this.stat(this.away) },
      injuries: this.injuries,
    };
    // Player of the match (Task 214), logged for the record books; its own seeded stream, so no result changes.
    // Just before match_result, which stays a match's last event (the channel's timeline ends there).
    const potm = playerOfTheMatch({ id: this.match.id, homeId: this.home.teamId, awayId: this.away.teamId, summary }, this.config.interviews.potm);
    this.emitAt('player_of_the_match', { teamId: potm.teamId, playerId: potm.playerId });
    this.emitAt('match_result', { data: { ...result, homeId: this.home.teamId, awayId: this.away.teamId } });
    return summary;
  }

  // ---------------------------------------------------------------- flow

  /** @param {number} endClock @param {Side} kickoffSide @param {boolean} goldenGoal */
  playPeriod(endClock, kickoffSide, goldenGoal) {
    this.goalThisPeriod = false;
    // momentum ends with the period (Task 236).
    this.momentum = null;
    this.setPossession(kickoffSide, 'middle');
    this.emitAt('kickoff', { teamId: kickoffSide.teamId });

    while (this.clock < endClock) {
      // A breakaway is over quickly: the run in and the shot come sooner than an ordinary action (Task 40).
      const { min, max } = this.breakaway ? this.rules.match.breakawaySeconds : this.rules.match.actionSeconds;
      const dt = Math.min(this.rng.float(min, max), endClock - this.clock);
      this.clock += dt;
      this.tick(dt);
      if (this.clock >= endClock) break;
      this.stopped = false;
      if (this.heat >= 100) this.burn();
      else this.act();
      // A golden goal ends the match there and then: no substitution after it (Task 176 found one).
      if (goldenGoal && this.goalThisPeriod) break;
      this.checkSubs(this.home);
      this.checkSubs(this.away);
    }
  }

  /** Time passes: fatigue, minutes, possession time, heat and injuries. @param {number} dt */
  tick(dt) {
    const f = this.rules.fatigue;
    this.stat(this.poss).possessionSeconds += dt;
    for (const side of [this.home, this.away]) {
      for (const e of [...side.onPitch]) {
        const stamina = e.player.attributes.stamina;
        // Pressing is tiring (Task 233, Tom): outfield players tire faster the more aggressive their side, slower the
        // less (a middling 0.5 as before), the price of the ball an aggressive side wins back.
        // A sitting-back side saves more than a pressing one spends (aggressionRelief below 0.5): a fresh player can only be
        // so fresh, so it takes more to make up the ball it doesn't win back.
        const lean = side.team.personality.aggression - 0.5;
        const press = e.slot === this.positions.keeper ? f.keeperRate : 1 + (lean > 0 ? f.aggressionRate : f.aggressionRelief) * lean;
        const rate = f.ratePerMinute * press;
        e.fatigue = Math.min(1, e.fatigue + rate * (dt / 60) * (1.5 - stamina / 99));
        this.statsFor(e.player, side).secondsPlayed += dt;
        const pInjury = this.injuryPerSecond * dt * (1 + this.rules.injuries.fatigueMultiplier * e.fatigue);
        if (this.rng.chance(pInjury)) this.injure(side, e);
      }
    }

    this.heat = Math.min(100, this.heat + (dt * 100) / this.rules.heat.burnSeconds);
    const stage = this.heat >= this.rules.heat.hotAt ? 2 : this.heat >= this.rules.heat.warmAt ? 1 : 0;
    if (stage > this.heatStage && this.heat < 100) {
      this.heatStage = stage;
      this.emitAt('heat_stage', { teamId: this.poss.teamId, data: { stage: HEAT_STAGES[stage], heat: Math.round(this.heat) } });
    }
  }

  /** One action by the team in possession, depending on the zone. */
  act() {
    const side = this.poss;
    const t = this.rules.tactics;
    // On a breakaway the player who broke through keeps the ball.
    const breakaway = this.breakaway && this.lastAdvancer ? this.lastAdvancer : null;
    this.breakaway = false;
    const carrier = breakaway ?? this.pickByZone(side, this.zone, false);
    this.lastCarrier = carrier;

    if (this.zone !== 'attacking') {
      // Recycle (keep the ball, heat still rising) only while it's cool; once warm, teams push forward.
      if (this.heatStage === 0 && this.rng.chance(t.recycleBase * (1 - side.team.personality.tempo))) return;
      const contested = this.rng.chance(this.contestChance());
      const outcome = contested ? this.challenge(carrier, true) : 'won';
      if (outcome === 'won') {
        this.restart = false;
        const from = this.zone;
        this.zone = NEXT_ZONE[from];
        this.advancedBy(carrier);
        // Through into the attacking zone with nobody challenging: if they also outrun the defence, a breakaway.
        const opp = this.other(side);
        const chaser = !contested && this.zone === 'attacking'
          ? opp.onPitch.filter((e) => e.slot !== this.positions.keeper).sort((a, b) => this.eff(opp, b, 'pace') - this.eff(opp, a, 'pace'))[0]
          : null;
        if (chaser && this.rng.chance(contest(this.rules.contests.breakaway, this.eff(side, carrier, 'pace'), this.eff(opp, chaser, 'pace')))) {
          this.breakaway = true;
          this.inRange = true;
        }
        this.emitAt('advance', { teamId: side.teamId, playerId: carrier.player.id, data: { from, to: this.zone, breakaway: this.breakaway } });
      }
      return;
    }

    // Is a defender close? A carrier with nobody close who is in range (the team has worked the ball here at least
    // once) almost always shoots; otherwise tempo and heat decide whether to shoot or work it (Task 37). On a
    // breakaway nobody is close and they're in range.
    const open = breakaway !== null || !this.rng.chance(this.contestChance());
    const pShoot = open && this.inRange
      ? t.openShotChance
      : clamp(t.shootBase + side.team.personality.tempo * t.shootTempo + this.heatStage * t.shootPerHeatStage, 0, 1);
    // A breakaway always ends in the runner's shot (Task 152, Tom: otherwise a teammate well behind could take the
    // next shot). The roll is still made, so other matches' randomness is untouched.
    if (this.rng.chance(pShoot) || breakaway !== null) {
      this.shoot(carrier, false, breakaway !== null);
      return;
    }
    // Work it: try to create a better chance, which also brings the ball into range.
    if (open || this.challenge(carrier, true) === 'won') {
      this.quality += t.workItQuality;
      this.inRange = true;
      this.advancedBy(carrier);
    }
  }

  /** The chance a defender contests the carrier in the current zone. */
  contestChance() {
    const t = this.rules.tactics;
    // Teams press less high up the pitch, and hardly at all while the keeper restarts play (Task 88).
    const press = this.zone !== 'defensive' ? 1 : this.restart ? t.restartPressFactor : t.pressFactor;
    return (t.contestBase + this.other(this.poss).team.personality.aggression * t.contestAggression) * press;
  }

  /**
   * A defender may contest the carrier. Handles fouls (and free shots) and lost balls itself.
   * @param {OnPitch} carrier
   * @param {boolean} [contested]  Already known to be contested (the caller rolled for it).
   * @returns {'won' | 'lost' | 'foul'}
   */
  challenge(carrier, contested = false) {
    const side = this.poss;
    const opp = this.other(side);
    const t = this.rules.tactics;
    const aggression = opp.team.personality.aggression;
    if (!contested && !this.rng.chance(this.contestChance())) return 'won';

    const defender = this.pickByZone(opp, MIRROR[this.zone], true);
    if (this.rng.chance(t.foulBase + aggression * t.foulAggression)) {
      this.statsFor(defender.player, opp).fouls++;
      this.stat(opp).fouls++;
      this.stopped = true;
      this.emitAt('foul', { teamId: opp.teamId, playerId: defender.player.id, data: { fouledId: carrier.player.id, zone: this.zone } });
      if (this.zone === 'attacking') this.freeShot(side);
      return 'foul';
    }

    // The carrier passes or carries, whichever they're better at; a lost pass is a steal (an interception).
    const passing = this.eff(side, carrier, 'passing');
    const dribbling = this.eff(side, carrier, 'dribbling');
    const attack = Math.max(passing, dribbling)
      - this.heatPenalty(carrier)
      + (this.eff(side, carrier, 'pace') - this.eff(opp, defender, 'pace')) * t.advancePaceWeight;
    const defend = this.eff(opp, defender, 'tackling');
    if (this.rng.chance(contest(this.rules.contests.advance, attack, defend))) return 'won';

    this.statsFor(defender.player, opp).tackles++;
    this.changePossession(opp, MIRROR[this.zone], 'tackle', defender.player.id, { steal: passing >= dribbling });
    return 'lost';
  }

  /** Burn: the ball reached full heat without a shot. */
  burn() {
    const side = this.poss;
    const carrier = this.lastCarrier;
    if (carrier) this.statsFor(carrier.player, side).burns++;
    this.stat(side).burns++;
    this.emitAt('burn', { teamId: side.teamId, playerId: carrier?.player.id ?? null, data: { zone: this.zone } });
    this.gainMomentum(this.other(side), 'burn');
    this.changePossession(this.other(side), MIRROR[this.zone], 'burn', null);
  }

  // ---------------------------------------------------------------- shooting

  /** @param {Side} side  The fouled team. */
  freeShot(side) {
    const shooter = [...side.onPitch].sort((a, b) => this.eff(side, b, 'shooting') - this.eff(side, a, 'shooting'))[0];
    this.emitAt('free_shot', { teamId: side.teamId, playerId: shooter.player.id });
    this.heat = 0;
    this.heatStage = 0;
    this.quality = 0;
    this.inRange = false;
    this.shoot(shooter, true);
  }

  /**
   * @param {OnPitch} shooter @param {boolean} free  Free shots have no block step and a cool ball.
   * @param {boolean} [breakaway]  Nobody is near enough to block it.
   */
  shoot(shooter, free, breakaway = false) {
    const side = this.poss;
    const opp = this.other(side);
    const h = this.rules.heat;
    const c = this.rules.contests;
    const hot = !free && this.heatStage === 2;
    const stats = this.statsFor(shooter.player, side);
    stats.shots++;
    this.stat(side).shots++;
    this.emitAt('shot', { teamId: side.teamId, playerId: shooter.player.id, data: { hot, freeShot: free, breakaway, quality: this.quality } });

    if (!free && !breakaway) {
      const blocker = this.pickByZone(opp, 'defensive', true);
      if (this.rng.chance(contest(c.block, this.eff(opp, blocker, 'tackling'), this.eff(side, shooter, 'shooting')))) {
        this.statsFor(blocker.player, opp).blocks++;
        this.emitAt('block', { teamId: opp.teamId, playerId: blocker.player.id, data: { shooterId: shooter.player.id } });
        this.looseBall();
        return;
      }
    }

    const composure = shooter.player.attributes.composure / 99;
    const aim = this.eff(side, shooter, 'shooting') + this.quality
      + (free ? this.rules.tactics.freeShotAccuracyBonus : 0)
      - (hot ? h.hotAccuracy * (1 - composure) : 0);
    if (!this.rng.chance(contest(c.onTarget, aim, c.onTarget.baseline))) {
      this.emitAt('miss', { teamId: side.teamId, playerId: shooter.player.id });
      this.changePossession(opp, 'defensive', 'miss', null);
      return;
    }
    stats.shotsOnTarget++;

    const keeper = this.keeperOf(opp);
    const power = this.eff(side, shooter, 'shooting') + (hot ? h.hotPower : 0);
    if (keeper && this.rng.chance(contest(c.save, this.eff(opp, keeper, 'keeping'), power))) {
      this.statsFor(keeper.player, opp).saves++;
      const parried = this.rng.chance(this.rules.tactics.parryChance);
      this.emitAt('save', { teamId: opp.teamId, playerId: keeper.player.id, data: { shooterId: shooter.player.id, parried } });
      if (parried) this.looseBall();
      else this.changePossession(opp, 'defensive', 'save', keeper.player.id);
      return;
    }

    // Goal.
    side.goals++;
    stats.goals++;
    if (keeper) this.statsFor(keeper.player, opp).conceded++;
    if (hot) {
      stats.scorchers++;
      this.stat(side).scorchers++;
    }
    const assister = this.assisterFor(shooter, free);
    if (assister) this.statsFor(assister.player, side).assists++;
    this.goalThisPeriod = true;
    this.emitAt('goal', {
      teamId: side.teamId,
      playerId: shooter.player.id,
      // keeperId (Task 214): who was in goal, a stand-in included (their move into goal isn't logged), or null.
      data: { assistId: assister?.player.id ?? null, scorcher: hot, freeShot: free, score: this.score(), keeperId: keeper?.player.id ?? null },
    });
    if (hot) this.gainMomentum(side, 'scorcher');
    this.changePossession(opp, 'defensive', 'goal', null);
  }

  /** A carrier moved the ball on (up a zone, or worked the chance). @param {OnPitch} carrier */
  advancedBy(carrier) {
    if (this.lastAdvancer && this.lastAdvancer.player !== carrier.player) this.priorAdvancer = this.lastAdvancer;
    this.lastAdvancer = carrier;
  }

  /**
   * Who gets a goal's assist (rules.match.assists, Tom 2026-10-28): the last to move the ball on, or under 'teammate'
   * the last teammate other than the scorer to, none on a free shot. Only who is credited: no randomness drawn.
   * @param {OnPitch} shooter @param {boolean} free
   * @returns {OnPitch | null}
   */
  assisterFor(shooter, free) {
    const last = this.lastAdvancer;
    if (this.rules.match.assists !== 'teammate') return last && last.player !== shooter.player ? last : null;
    if (free) return null;
    if (last && last.player !== shooter.player) return last;
    const prior = this.priorAdvancer;
    return prior && prior.player !== shooter.player ? prior : null;
  }

  /**
   * momentum (Tasks 236–237): a scorcher or the other team's burn gives `side` the bonus, full from now, fading over
   * rules.momentum.seconds. Never stacked: again in the window starts it again; the other team's takes it over.
   * @param {Side} side @param {'scorcher' | 'burn'} cause
   */
  gainMomentum(side, cause) {
    const m = this.rules.momentum;
    if (!(m.bonus > 0)) return;
    const extended = this.momentum?.side === side && this.clock < this.momentum.until;
    this.momentum = { side, from: this.clock, until: this.clock + m.seconds };
    this.emitAt('momentum', { teamId: side.teamId, data: { cause, extended, until: Math.round(this.momentum.until) } });
  }

  /** A loose ball after a block or parry, contested on pace. */
  looseBall() {
    const side = this.poss;
    const opp = this.other(side);
    const attacker = this.pickByZone(side, 'attacking', true);
    const defender = this.pickByZone(opp, 'defensive', true);
    const p = contest(this.rules.contests.looseBall, this.eff(side, attacker, 'pace'), this.eff(opp, defender, 'pace'));
    if (this.rng.chance(p)) {
      this.lastCarrier = attacker;
      this.quality = 0;
      this.inRange = false;
    } else {
      this.changePossession(opp, 'defensive', 'loose_ball', defender.player.id);
    }
  }

  /** Alternating Hot free shots: best of N, then sudden death. @returns {{ home: number, away: number }} */
  shootout() {
    const kicks = this.rules.playoffs.shootoutKicks;
    const order = (/** @type {Side} */ side) =>
      [...side.onPitch].sort((a, b) => this.eff(side, b, 'shooting') - this.eff(side, a, 'shooting'));
    const takers = new Map([this.home, this.away].map((s) => [s, order(s)]));
    const tally = new Map([[this.home, 0], [this.away, 0]]);
    const first = this.rng.pick([this.home, this.away]);
    const sides = [first, this.other(first)];

    for (let round = 0; round < 1000; round++) {
      for (const side of sides) {
        const list = /** @type {OnPitch[]} */ (takers.get(side));
        const shooter = list[round % list.length];
        const scored = this.shootoutKick(side, shooter);
        tally.set(side, /** @type {number} */ (tally.get(side)) + (scored ? 1 : 0));
        this.emitAt('shootout_kick', {
          teamId: side.teamId,
          playerId: shooter.player.id,
          data: { kick: round + 1, scored, shootout: [tally.get(this.home), tally.get(this.away)] },
        });
        const [a, b] = sides.map((s) => /** @type {number} */ (tally.get(s)));
        if (round < kicks) {
          // Stop early once one side can't catch up within the regulation kicks.
          const aLeft = kicks - (round + 1);
          const bLeft = kicks - (side === sides[0] ? round : round + 1);
          if (a > b + bLeft || b > a + aLeft) return this.shootoutScore(tally);
        }
      }
      const [a, b] = sides.map((s) => /** @type {number} */ (tally.get(s)));
      if (round + 1 >= kicks && a !== b) return this.shootoutScore(tally);
    }
    throw new Error('Shootout did not finish');
  }

  /** @param {Map<Side, number>} tally */
  shootoutScore(tally) {
    return { home: /** @type {number} */ (tally.get(this.home)), away: /** @type {number} */ (tally.get(this.away)) };
  }

  /** @param {Side} side @param {OnPitch} shooter */
  shootoutKick(side, shooter) {
    const opp = this.other(side);
    const h = this.rules.heat;
    const c = this.rules.contests;
    const composure = shooter.player.attributes.composure / 99;
    const shooting = this.eff(side, shooter, 'shooting');
    const aim = shooting + this.rules.tactics.shootoutAccuracyBonus - h.hotAccuracy * (1 - composure);
    if (!this.rng.chance(contest(c.onTarget, aim, c.onTarget.baseline))) return false;
    const keeper = this.keeperOf(opp);
    return !(keeper && this.rng.chance(contest(c.save, this.eff(opp, keeper, 'keeping'), shooting + h.hotPower)));
  }

  // ---------------------------------------------------------------- people

  /** @param {Side} side @param {OnPitch} entry */
  injure(side, entry) {
    const severity = this.rng.weighted(this.rules.injuries.severity, (/** @type {any} */ s) => s.weight);
    const matchesOut = this.rng.int(severity.minMatches, severity.maxMatches);
    this.injuries.push({ playerId: entry.player.id, teamId: side.teamId, matchesOut, seasonEnding: severity.seasonEnding });
    // With nobody to come on, the team plays a player short; but the last player on the pitch plays on hurt (Task 271:
    // a side with nobody on would leave the match nobody to play), and the injury says so (`playsOn`).
    const canSub = side.subsUsed < this.rules.match.maxSubstitutions && side.bench.length > 0;
    const playsOn = !canSub && side.onPitch.length <= 1;
    this.emitAt('injury', {
      teamId: side.teamId,
      playerId: entry.player.id,
      data: { matchesOut, seasonEnding: severity.seasonEnding, ...(playsOn ? { playsOn: true } : {}) },
    });
    if (playsOn) return;
    if (!this.substitute(side, entry, 'injury')) {
      side.onPitch = side.onPitch.filter((e) => e !== entry);
      if (entry.slot === this.positions.keeper) this.replaceKeeper(side);
    }
  }

  /**
   * Bring on a bench player for an outgoing one, if a substitution is left. `from`: the bench players who may come on.
   * @returns {boolean}
   */
  substitute(/** @type {Side} */ side, /** @type {OnPitch} */ outgoing, /** @type {string} */ reason, from = side.bench) {
    if (side.subsUsed >= this.rules.match.maxSubstitutions || from.length === 0) return false;
    const incoming = /** @type {Player} */ (bestFor(from, outgoing.slot, this.positions));
    side.bench = side.bench.filter((p) => p !== incoming);
    side.subsUsed++;
    const entry = { player: incoming, slot: outgoing.slot, fatigue: 0 };
    side.onPitch = side.onPitch.map((e) => (e === outgoing ? entry : e));
    if (this.lastCarrier === outgoing) this.lastCarrier = entry;
    if (this.lastAdvancer === outgoing) this.lastAdvancer = null;
    if (this.priorAdvancer === outgoing) this.priorAdvancer = null;
    this.statsFor(incoming, side);
    this.emitAt('substitution', {
      teamId: side.teamId,
      playerId: incoming.id,
      data: { offId: outgoing.player.id, slot: outgoing.slot, reason },
    });
    return true;
  }

  /**
   * A tired player comes off, but only when it won't look strange (Task 41): at a stoppage (this action ended in a
   * goal, miss, held save, burn or foul) or while the team has the ball in its own defensive zone. Injuries don't wait.
   * Keepers never come off tired (Tasks 174, 174b, Tom): they tire more slowly (fatigue.keeperRate) and play on, so a
   * keeper leaves only through injury, and an outfield player goes in goal only then, with no keeper on the bench.
   * A tired outfield player comes off only for an outfield player (Task 174c): never a keeper sent on up front.
   * @param {Side} side
   */
  checkSubs(side) {
    const outfield = side.bench.filter((p) => p.position !== this.positions.keeper);
    if (side.subsUsed >= this.rules.match.maxSubstitutions || outfield.length === 0) return;
    if (!this.stopped && !(this.poss === side && this.zone === 'defensive')) return;
    const tired = side.onPitch.filter((e) => e.fatigue > this.rules.fatigue.subThreshold && e.slot !== this.positions.keeper);
    if (tired.length === 0) return;
    tired.sort((a, b) => b.fatigue - a.fatigue);
    this.substitute(side, tired[0], 'fatigue', outfield);
  }

  /** At half-time and before overtime, tired players can come off during the break. */
  breakSubs() {
    this.stopped = true;
    this.checkSubs(this.home);
    this.checkSubs(this.away);
  }

  /** The keeper left with no substitute: the best-keeping outfield player goes in goal. @param {Side} side */
  replaceKeeper(side) {
    if (side.onPitch.length === 0) return;
    const stand = [...side.onPitch].sort((a, b) => b.player.attributes.keeping - a.player.attributes.keeping)[0];
    stand.slot = this.positions.keeper;
  }

  // ---------------------------------------------------------------- helpers

  /**
   * A player chosen by the zone's carrier weights. Weight is shared among players in the same slot.
   * @param {Side} side @param {Zone} zone @param {boolean} outfieldOnly
   * @returns {OnPitch}
   */
  pickByZone(side, zone, outfieldOnly) {
    const weights = this.positions.carrierWeights[zone];
    let pool = outfieldOnly ? side.onPitch.filter((e) => e.slot !== this.positions.keeper) : side.onPitch;
    if (pool.length === 0) pool = side.onPitch;
    const counts = new Map();
    for (const e of pool) counts.set(e.slot, (counts.get(e.slot) ?? 0) + 1);
    const weightOf = (/** @type {OnPitch} */ e) => (weights[e.slot] ?? 0) / counts.get(e.slot);
    if (pool.every((e) => weightOf(e) === 0)) return this.rng.pick(pool);
    return this.rng.weighted(pool, weightOf);
  }

  /** Effective rating: attribute faded by fatigue, plus home advantage, minus a shorthanded penalty, plus momentum. */
  eff(/** @type {Side} */ side, /** @type {OnPitch} */ entry, /** @type {string} */ attr) {
    const m = this.rules.match;
    let v = entry.player.attributes[attr] * (1 - this.rules.fatigue.maxFade * entry.fatigue);
    if (side.isHome && !this.match.neutral) v += m.homeBonus;
    v -= m.shorthandedPenalty * Math.max(0, this.lineupTotal - side.onPitch.length);
    // momentum (Task 236): the bonus, fading steadily from full to nothing over its window.
    const mo = this.momentum;
    if (mo && mo.side === side && this.clock < mo.until && (!this.rules.momentum.withBall || side === this.poss)) v += this.rules.momentum.bonus * ((mo.until - this.clock) / (mo.until - mo.from));
    return v;
  }

  /** Passing/advance penalty from heat, softened by composure. @param {OnPitch} entry */
  heatPenalty(entry) {
    const h = this.rules.heat;
    const penalty = this.heatStage === 2 ? h.hotPenalty : this.heatStage === 1 ? h.warmPenalty : 0;
    return penalty * (1 - entry.player.attributes.composure / 99);
  }

  /** @param {Side} side @param {Zone} zone */
  setPossession(side, zone) {
    this.poss = side;
    this.zone = zone;
    this.heat = 0;
    this.heatStage = 0;
    this.quality = 0;
    this.inRange = false;
    this.breakaway = false;
    this.lastCarrier = null;
    this.lastAdvancer = null;
    this.priorAdvancer = null;
  }

  /**
   * @param {Side} side @param {Zone} zone @param {string} reason @param {string | null} playerId
   * @param {Record<string, unknown>} [extra]  More event data (a tackle's steal).
   */
  changePossession(side, zone, reason, playerId, extra = {}) {
    if (STOPPAGES.has(reason)) this.stopped = true;
    this.setPossession(side, zone);
    this.restart = RESTARTS.has(reason);
    this.emitAt('possession_change', { teamId: side.teamId, playerId, data: { reason, zone, ...extra } });
  }

  /** @param {Side} side */
  keeperOf(side) {
    return side.onPitch.find((e) => e.slot === this.positions.keeper) ?? null;
  }

  /** @param {Side} side */
  other(side) {
    return side === this.home ? this.away : this.home;
  }

  score() {
    return [this.home.goals, this.away.goals];
  }

  /** @param {Side} side */
  stat(side) {
    return /** @type {TeamStats} */ (this.teamStats.get(side));
  }

  /** @param {Player} player @param {Side} side @returns {PlayerStats} */
  statsFor(player, side) {
    this.playerStats[player.id] ??= {
      teamId: side.teamId, started: false, secondsPlayed: 0, goals: 0, assists: 0, scorchers: 0,
      shots: 0, shotsOnTarget: 0, saves: 0, tackles: 0, fouls: 0, burns: 0, blocks: 0, conceded: 0,
    };
    return this.playerStats[player.id];
  }

  /** @param {string} type @param {{ teamId?: string | null, playerId?: string | null, data?: Record<string, unknown> }} [fields] */
  emitAt(type, fields = {}) {
    this.emit(type, { clock: Math.round(this.clock), ...fields });
  }
}

/**
 * The winning team's id, or null for a draw.
 * @param {{ homeId: string, awayId: string, result: MatchResult }} summary
 */
export function winnerOf({ homeId, awayId, result }) {
  if (result.homeGoals !== result.awayGoals) return result.homeGoals > result.awayGoals ? homeId : awayId;
  if (result.shootout) return result.shootout.home > result.shootout.away ? homeId : awayId;
  return null;
}
