// The chronicle (It remembers, Task 215): the league's memory, folded from the event log as it is written. Pure; no DOM.
// Fed every event in order (`add`, an event sink), it keeps compact records that outlast the match events the browser
// drops: each player's details, moves and season lines, each team's seasons and honours, every match's result, and
// each season's table, playoffs and awards. A match is folded when its match_result arrives (matchLines.js), so
// nothing here needs a match's events afterwards. See docs/simulation.md §12b.
//
// The log runs ahead of the screen (the live league simulates a match at kick-off, the off-season at the final):
// readers on the channel decide what has aired, by match id or season, before showing anything.
import { withoutComments } from '../util.js';
import { matchLines } from './matchLines.js';

/**
 * Counting stats in a season line, as the sim's SeasonPlayerStats, plus steals, the player of the match and winning
 * goals (Task 216).
 */
export const LINE_COUNTS = /** @type {const} */ ([
  'goals', 'assists', 'scorchers', 'shots', 'shotsOnTarget', 'saves', 'tackles', 'steals', 'fouls', 'burns', 'blocks', 'conceded', 'potm', 'winningGoals',
]);

/** A line's value for a milestone or record stat: a count, or stops (tackles plus blocks, the Quell's stat). @param {Line} line @param {string} stat */
export const statOf = (line, stat) => (stat === 'stops' ? line.tackles + line.blocks : /** @type {number} */ (/** @type {any} */ (line)[stat]));

/**
 * A player's season, regular season or playoffs: as the sim's SeasonPlayerStats (src/sim/standings.js), plus steals,
 * how many times they were player of the match and their winning goals.
 * @typedef {{
 *   teamId: string, appearances: number, starts: number, minutes: number,
 * } & Record<typeof LINE_COUNTS[number], number>} Line
 *
 * @typedef {{ teamId: string, regular: Line | null, playoffs: Line | null }} PlayerSeason
 *
 * @typedef {object} Move  A change of where a player is, in order.
 * @property {number} season  The season it happened in (off-season moves carry the season just finished).
 * @property {'draft' | 'reserve' | 'call_up' | 'release' | 'signing' | 'retirement'} type
 * @property {string | null} teamId
 * @property {string} [reason]  release: roster, call_up, rights_expired, position, contract_end; call_up: better, short; retirement: retired, unsigned.
 * @property {boolean} [byPlayer]  release (contract_end): the club wanted to keep them and they chose to go (Task 243).
 * @property {number} [round] @property {number} [pick]  draft only.
 *
 * @typedef {object} PlayerRecord
 * @property {string} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} region       Where they were born.
 * @property {string} position
 * @property {number} birthSeason
 * @property {number} potential
 * @property {number} peakAge  When they're at their best (for the cards' VETERAN, Task 221).
 * @property {{ how: 'founding' | 'draft' | 'signing', season: number, teamId: string, round?: number, pick?: number } | null} joined
 *   How they first came to a team: on a founding roster, drafted, or signed from free agency (null until then).
 * @property {'prospect' | 'roster' | 'reserves' | 'free' | 'retired'} status
 * @property {string | null} teamId  Their team now (roster or reserves), else null.
 * @property {Move[]} moves
 * @property {Record<number, number>} overall  Their overall rating each season (never shown as a number: vision §9).
 * @property {Record<number, PlayerSeason>} seasons  The seasons they played in.
 * @property {Line} totals  Their career so far, the regular season and playoffs together (for milestones).
 * @property {{ season: number, award: string, value: number }[]} awards
 * @property {{ season: number, matchId: string, matchesOut: number, seasonEnding: boolean }[]} injuries
 * @property {{ season: number, reason: string, age: number } | null} retired
 * @property {{ season: number, id: string, reason: string } | null} inducted  A legend by the Director's induction
 *   (Task 262): the season it took effect, the decision's id and the League's reason.
 * @property {string | null} lastMatchId  The last match they played in (Task 243).
 * @property {string | null} prevMatchId  The one before it, so a match's facts can tell their first since an injury.
 * @property {{ wage: number, until: number } | null} contract  Their deal now (Task 234; thousands a season, the last season it
 *   covers), as aired; null when they have none.
 *
 * @typedef {object} MatchRecord  Every match's result, compact (head-to-heads, streaks, past seasons).
 * @property {string} id
 * @property {number} season
 * @property {'regular' | 'semifinal' | 'final'} stage
 * @property {number | null} round
 * @property {string} homeId
 * @property {string} awayId
 * @property {number} homeGoals
 * @property {number} awayGoals
 * @property {'regulation' | 'overtime' | 'shootout'} decidedBy
 * @property {{ home: number, away: number } | null} shootout
 * @property {string | null} winnerId  Shootouts included; null for a draw.
 * @property {string | null} potmId
 *
 * @typedef {Omit<import('../sim/standings.js').TableRow, 'form'>} TableRow
 *
 * @typedef {object} Milestone  A career total passing a multiple of its step (data/chronicle.json milestones).
 * @property {string} playerId
 * @property {string} teamId
 * @property {string} stat  goals, assists, appearances, saves or stops.
 * @property {number} value  The multiple passed: 50, 100, ...
 * @property {number} season
 * @property {string} matchId
 *
 * @typedef {object} RecordBroken  A record changing hands in a match (Task 220b): someone else's all-time (career, the
 *   regular season and playoffs together) or single-season (regular season) best passed.
 * @property {string} playerId
 * @property {string} teamId
 * @property {string} matchId
 * @property {number} season
 * @property {'career' | 'season'} scope
 * @property {string} stat  goals, assists, saves or stops.
 * @property {number} value  Their total after the match.
 * @property {{ playerId: string, value: number, season?: number }} previous  The record they passed (a season record's season).
 *
 * @typedef {object} Performance  A notable match by one player (data/chronicle.json notableMatch).
 * @property {string} playerId
 * @property {string} teamId
 * @property {string} matchId
 * @property {number} season
 * @property {'regular' | 'semifinal' | 'final'} stage
 * @property {number} goals
 * @property {number} assists
 * @property {number} saves
 *
 * @typedef {object} SeasonEntry
 * @property {number} season
 * @property {string[]} teamIds
 * @property {TableRow[]} table  After the last round played (the final table once the regular season is over).
 * @property {string[]} seeds
 * @property {string[]} matchIds  In the order played.
 * @property {string | null} championId
 * @property {string | null} runnerUpId
 * @property {string | null} shieldId  The Pennant (the table's winner).
 * @property {{ award: string, playerId: string, teamId: string, value: number, shortlist: { playerId: string, teamId: string, value: number }[] }[]} awards
 * @property {string[]} retired  Who retired in its off-season.
 * @property {string[]} inductions  Who was inducted a legend at its start (Task 262).
 * @property {Deal[]} deals  The deals signed in its off-season (Task 234), in the order signed.
 *
 * @typedef {object} Deal  A contract signed in an off-season (the `contract` event, Task 231).
 * @property {string} playerId @property {string} teamId @property {number} wage @property {number} until
 * @property {'rookie' | 're_sign' | 'free_agent'} kind
 * @property {string | null} fromId  For a free agent, the team that released him this off-season (null from the pool).
 * @property {number} offers  How many offers he had (the market's; 0 in the window).
 * @property {{ id: string, reason: string, values: { path: string, from: unknown, to: unknown }[] }[]} ruleChanges  The rule
 *   changes that took effect at its start (Task 229b); the rules it was played under are these and every earlier season's.
 *
 * @typedef {object} TeamSeason
 * @property {number} position  Final regular-season place (1 = the Pennant).
 * @property {TableRow} row
 * @property {'champion' | 'runner_up' | 'semifinal' | null} playoffs  How far they went.
 */

const zeroLine = (/** @type {string} */ teamId) => /** @type {Line} */ ({
  teamId, appearances: 0, starts: 0, minutes: 0, ...Object.fromEntries(LINE_COUNTS.map((k) => [k, 0])),
});

/** The stats whose records are watched as they fall (Task 220b). */
export const RECORD_STATS = /** @type {const} */ (['goals', 'assists', 'saves', 'stops']);

/**
 * The records as they fall (Task 220b): each stat's best career (the regular season and playoffs together) and best
 * regular season, and who holds them; a player passing someone else's is a record broken (logged from
 * history.recordsFrom seasons on), a holder extending their own isn't. The Chronicle keeps one; the live league keeps
 * another fed ahead of the screen (`add`, an event sink), so the channel knows a match's records from its kick-off.
 */
export class RecordWatch {
  /** @type {RecordBroken[]} */
  broken = [];
  #best = /** @type {Record<'career' | 'season', Record<string, { playerId: string, value: number, season?: number }>>} */ ({ career: {}, season: {} });
  /** Career totals by player, then this season's regular-season totals. @type {Map<string, Record<string, number>>} */
  #career = new Map();
  /** @type {Map<string, Record<string, number>>} */
  #season = new Map();
  #seasonNo = 0;
  /** @type {Map<string, import('./eventLog.js').LeagueEvent[]>} */
  #open = new Map();

  /** @param {{ history: { recordsFrom: number } }} options  data/chronicle.json */
  constructor(options) {
    this.recordsFrom = options.history.recordsFrom;
  }

  /** An event sink of its own: a match folds at its result. @param {Readonly<import('./eventLog.js').LeagueEvent>} e */
  add = (e) => {
    if (e.matchId === null) return;
    let events = this.#open.get(e.matchId);
    if (!events) this.#open.set(e.matchId, (events = []));
    events.push(e);
    if (e.type !== 'match_result') return;
    this.#open.delete(e.matchId);
    this.fold(matchLines(events), e.season, e.stage);
  };

  /** A finished match. @param {import('./matchLines.js').MatchLines} lines @param {number} season @param {string} stage */
  fold(lines, season, stage) {
    if (season !== this.#seasonNo) {
      this.#season.clear();
      this.#seasonNo = season;
    }
    for (const [id, l] of Object.entries(lines.players)) {
      const at = { playerId: id, teamId: l.teamId, matchId: lines.matchId, season };
      const career = this.#career.get(id) ?? this.#career.set(id, {}).get(id);
      const mine = this.#season.get(id) ?? this.#season.set(id, {}).get(id);
      for (const stat of RECORD_STATS) {
        const v = statOf(/** @type {any} */ (l), stat);
        if (v <= 0) continue;
        /** @type {Record<string, number>} */ (career)[stat] = (career?.[stat] ?? 0) + v;
        this.#record('career', stat, /** @type {Record<string, number>} */ (career)[stat], at);
        if (stage !== 'regular') continue;
        /** @type {Record<string, number>} */ (mine)[stat] = (mine?.[stat] ?? 0) + v;
        this.#record('season', stat, /** @type {Record<string, number>} */ (mine)[stat], at);
      }
    }
  }

  /** The records that fell in a match. @param {string} matchId */
  inMatch(matchId) {
    return this.broken.filter((r) => r.matchId === matchId);
  }

  /** Everything it holds, as plain data, for a snapshot (Task 272; src/pack.js keeps Maps and shared objects). */
  saveState() {
    return { broken: this.broken, best: this.#best, career: this.#career, season: this.#season, seasonNo: this.#seasonNo, open: this.#open };
  }

  /** Back to a saved state (on a new watch with the same options). @param {ReturnType<RecordWatch['saveState']>} s */
  loadState(s) {
    this.broken = s.broken;
    this.#best = s.best;
    this.#career = s.career;
    this.#season = s.season;
    this.#seasonNo = s.seasonNo;
    this.#open = s.open;
    return this;
  }

  /**
   * @param {'career' | 'season'} scope @param {string} stat @param {number} value
   * @param {{ playerId: string, teamId: string, matchId: string, season: number }} at
   */
  #record(scope, stat, value, at) {
    const best = this.#best[scope][stat];
    if (best && value <= best.value) return;
    if (best && best.playerId !== at.playerId && best.value > 0 && at.season >= this.recordsFrom) {
      this.broken.push({ ...at, scope, stat, value, previous: { ...best } });
    }
    this.#best[scope][stat] = { playerId: at.playerId, value, ...(scope === 'season' ? { season: at.season } : {}) };
  }
}

/** Add one line into another (in place). @param {Line} into @param {Line} line */
function addLine(into, line) {
  into.teamId = line.teamId;
  into.appearances += line.appearances;
  into.starts += line.starts;
  into.minutes += line.minutes;
  for (const k of LINE_COUNTS) into[k] += line[k];
}

export class Chronicle {
  /** @type {Milestone[]} In the order they came. */
  milestones = [];
  /** @type {Performance[]} In the order played. */
  performances = [];
  /** @type {Map<string, PlayerRecord>} */
  players = new Map();
  /** @type {Map<string, { id: string, seasons: Record<number, TeamSeason>, pennants: number[], cups: number[] }>} */
  teams = new Map();
  /** @type {Map<number, SeasonEntry>} */
  seasons = new Map();
  /** @type {Map<string, MatchRecord>} */
  matches = new Map();
  /** A match's events until its result is in. @type {Map<string, import('./eventLog.js').LeagueEvent[]>} */
  #open = new Map();

  /**
   * @param {{ milestones: Record<string, number>, notableMatch: Record<string, number>, history: { recordsFrom: number } }} options
   *   data/chronicle.json (config.chronicle): the milestones' steps, the notable-match bars, when records start to count.
   */
  constructor(options) {
    this.steps = Object.entries(withoutComments(options.milestones));
    this.bars = Object.entries(withoutComments(options.notableMatch));
    /** The records as they fall (Task 220b). */
    this.watch = new RecordWatch(options);
  }

  /** @type {RecordBroken[]} Each record changing hands, in the order they fell (from history.recordsFrom seasons on). */
  get recordsBroken() {
    return this.watch.broken;
  }

  /** The event sink: fold one event in. Events must arrive in log order. @param {Readonly<import('./eventLog.js').LeagueEvent>} e */
  add = (e) => {
    if (e.matchId !== null) {
      let events = this.#open.get(e.matchId);
      if (!events) this.#open.set(e.matchId, (events = []));
      events.push(e);
      if (e.type === 'match_result') {
        this.#open.delete(e.matchId);
        this.#match(e, events);
      }
      return;
    }
    this.#league(e);
  };

  /** Everything it holds, as plain data, for a snapshot (Task 272; src/pack.js keeps Maps and shared objects). */
  saveState() {
    const { milestones, performances, players, teams, seasons, matches } = this;
    return { milestones, performances, players, teams, seasons, matches, open: this.#open, watch: this.watch.saveState() };
  }

  /** Back to a saved state (on a new chronicle with the same options). @param {ReturnType<Chronicle['saveState']>} s */
  loadState(s) {
    Object.assign(this, { milestones: s.milestones, performances: s.performances, players: s.players, teams: s.teams, seasons: s.seasons, matches: s.matches });
    this.#open = s.open;
    this.watch.loadState(s.watch);
    return this;
  }

  /** @param {number} season */
  season(season) {
    let s = this.seasons.get(season);
    if (!s) {
      s = { season, teamIds: [], table: [], seeds: [], matchIds: [], championId: null, runnerUpId: null, shieldId: null, awards: [], retired: [], ruleChanges: [], inductions: [], deals: [] };
      this.seasons.set(season, s);
    }
    return s;
  }

  /** @param {string} id */
  team(id) {
    let t = this.teams.get(id);
    if (!t) this.teams.set(id, (t = { id, seasons: {}, pennants: [], cups: [] }));
    return t;
  }

  /** @param {Readonly<import('./eventLog.js').LeagueEvent>} result @param {import('./eventLog.js').LeagueEvent[]} events */
  #match(result, events) {
    const lines = matchLines(events);
    const stage = /** @type {MatchRecord['stage']} */ (result.stage);
    const { homeGoals, awayGoals, decidedBy, shootout } = lines.result;
    const winnerId = homeGoals !== awayGoals ? (homeGoals > awayGoals ? lines.homeId : lines.awayId)
      : shootout ? (shootout.home > shootout.away ? lines.homeId : lines.awayId) : null;
    this.matches.set(lines.matchId, {
      id: lines.matchId, season: result.season, stage, round: result.round, homeId: lines.homeId, awayId: lines.awayId,
      homeGoals, awayGoals, decidedBy, shootout, winnerId, potmId: lines.potmId,
    });
    this.season(result.season).matchIds.push(lines.matchId);

    const part = stage === 'regular' ? 'regular' : 'playoffs';
    for (const [id, l] of Object.entries(lines.players)) {
      const p = /** @type {PlayerRecord} */ (this.players.get(id));
      const ps = (p.seasons[result.season] ??= { teamId: l.teamId, regular: null, playoffs: null });
      ps.teamId = l.teamId;
      const t = (ps[part] ??= zeroLine(l.teamId));
      t.teamId = l.teamId;
      /** This match as a line, for the season's line and the career's. */
      const m = zeroLine(l.teamId);
      m.appearances = 1;
      m.starts = l.started ? 1 : 0;
      m.minutes = l.secondsPlayed / 60;
      for (const k of LINE_COUNTS) if (k !== 'potm' && k !== 'winningGoals') m[k] = l[k];
      m.potm = id === lines.potmId ? 1 : 0;
      m.winningGoals = id === lines.winningGoalId ? 1 : 0;
      addLine(t, m);
      p.prevMatchId = p.lastMatchId;
      p.lastMatchId = lines.matchId;
      const before = { ...p.totals };
      addLine(p.totals, m);
      for (const [stat, step] of this.steps) {
        for (let v = (Math.floor(statOf(before, stat) / step) + 1) * step; v <= statOf(p.totals, stat); v += step) {
          this.milestones.push({ playerId: id, teamId: l.teamId, stat, value: v, season: result.season, matchId: lines.matchId });
        }
      }
      if (this.bars.some(([stat, bar]) => statOf(m, stat) >= bar)) {
        this.performances.push({ playerId: id, teamId: l.teamId, matchId: lines.matchId, season: result.season, stage, goals: m.goals, assists: m.assists, saves: m.saves });
      }
    }
    this.watch.fold(lines, result.season, stage);
    for (const inj of lines.injuries) {
      /** @type {PlayerRecord} */ (this.players.get(inj.playerId)).injuries.push({ season: result.season, matchId: lines.matchId, matchesOut: inj.matchesOut, seasonEnding: inj.seasonEnding });
    }
  }

  /** @param {Readonly<import('./eventLog.js').LeagueEvent>} e */
  #league(e) {
    const d = /** @type {any} */ (e.data);
    const p = e.playerId ? this.players.get(e.playerId) : undefined;
    const move = (/** @type {Move['type']} */ type, /** @type {Partial<Move>} */ extra = {}) => {
      /** @type {PlayerRecord} */ (p).moves.push({ season: e.season, type, teamId: e.teamId, ...extra });
    };
    switch (e.type) {
      case 'player_created': {
        const founding = e.stage === 'preseason';
        /** @type {PlayerRecord} */
        const rec = {
          id: /** @type {string} */ (e.playerId), firstName: d.firstName, lastName: d.lastName, region: d.region, position: d.position,
          birthSeason: d.birthSeason, potential: d.potential, peakAge: d.peakAge,
          joined: founding && e.teamId ? { how: 'founding', season: e.season, teamId: e.teamId } : null,
          status: founding ? (e.teamId ? 'roster' : 'free') : 'prospect',
          teamId: founding ? e.teamId : null,
          moves: [],
          // A prospect is created in the off-season, for the next season.
          overall: { [founding ? e.season : e.season + 1]: d.overall },
          seasons: {}, totals: zeroLine(e.teamId ?? ''), awards: [], injuries: [], retired: null, inducted: null, contract: null,
          lastMatchId: null, prevMatchId: null,
        };
        this.players.set(rec.id, rec);
        break;
      }
      case 'player_development':
        /** @type {PlayerRecord} */ (p).overall[e.season + 1] = d.after;
        break;
      case 'draft_pick': {
        const rec = /** @type {PlayerRecord} */ (p);
        rec.joined = { how: 'draft', season: e.season, teamId: /** @type {string} */ (e.teamId), round: d.round, pick: d.pick };
        rec.status = 'roster';
        rec.teamId = e.teamId;
        move('draft', { round: d.round, pick: d.pick });
        break;
      }
      case 'reserve':
        /** @type {PlayerRecord} */ (p).status = 'reserves';
        move('reserve');
        break;
      case 'call_up':
        /** @type {PlayerRecord} */ (p).status = 'roster';
        move('call_up', { reason: d.reason });
        break;
      case 'contract': {
        const rec = /** @type {PlayerRecord} */ (p);
        rec.contract = { wage: d.wage, until: d.until };
        if (e.stage === 'offseason') {
          const left = rec.moves.findLast((m) => m.type === 'release' && m.season === e.season);
          this.season(e.season).deals.push({
            playerId: rec.id, teamId: /** @type {string} */ (e.teamId), wage: d.wage, until: d.until, kind: d.kind,
            fromId: d.kind === 'free_agent' ? left?.teamId ?? null : null, offers: d.turnedDown ? d.turnedDown.length + 1 : 0,
          });
        }
        break;
      }
      case 'release':
        Object.assign(/** @type {PlayerRecord} */ (p), { status: 'free', teamId: null, contract: null });
        move('release', d.byPlayer ? { reason: d.reason, byPlayer: true } : { reason: d.reason });
        break;
      case 'signing': {
        const rec = /** @type {PlayerRecord} */ (p);
        Object.assign(rec, { status: 'roster', teamId: e.teamId });
        rec.joined ??= { how: 'signing', season: e.season, teamId: /** @type {string} */ (e.teamId) };
        move('signing');
        break;
      }
      case 'retirement': {
        const rec = /** @type {PlayerRecord} */ (p);
        Object.assign(rec, { status: 'retired', teamId: null, contract: null, retired: { season: e.season, reason: d.reason, age: d.age } });
        move('retirement', { reason: d.reason });
        this.season(e.season).retired.push(rec.id);
        break;
      }
      case 'rule_change':
        this.season(e.season).ruleChanges.push({ id: d.id, reason: d.reason, values: d.values });
        break;
      case 'induction':
        // A legend inducted by the Director (Task 262), shown from Task 266. A player the chronicle doesn't know is skipped.
        if (!p) break;
        /** @type {PlayerRecord} */ (p).inducted = { season: e.season, id: d.id, reason: d.reason };
        this.season(e.season).inductions.push(/** @type {string} */ (e.playerId));
        break;
      case 'season_start':
        this.season(e.season).teamIds = [...d.teamIds];
        for (const id of d.teamIds) this.team(id);
        break;
      case 'standings':
        this.season(e.season).table = d.rows.map((/** @type {TableRow} */ r) => ({ ...r }));
        break;
      case 'playoff_seeding':
        this.season(e.season).seeds = [...d.seeds];
        break;
      case 'season_end': {
        const s = this.season(e.season);
        Object.assign(s, { championId: d.championId, runnerUpId: d.runnerUpId, shieldId: d.shieldId });
        const semis = new Set(s.seeds);
        for (const row of s.table) {
          const id = row.teamId;
          const playoffs = id === d.championId ? 'champion' : id === d.runnerUpId ? 'runner_up' : semis.has(id) ? 'semifinal' : null;
          this.team(id).seasons[e.season] = { position: row.position, row, playoffs };
        }
        this.team(d.shieldId).pennants.push(e.season);
        this.team(d.championId).cups.push(e.season);
        break;
      }
      case 'award':
        this.season(e.season).awards.push({ award: d.award, playerId: /** @type {string} */ (e.playerId), teamId: /** @type {string} */ (e.teamId), value: d.value, shortlist: d.shortlist });
        /** @type {PlayerRecord} */ (p).awards.push({ season: e.season, award: d.award, value: d.value });
        break;
    }
  }

  /**
   * A season's player lines, by player, regular season or playoffs: the shape of the sim's SeasonRecord.stats.
   * @param {number} season @param {'regular' | 'playoffs'} part
   * @returns {Record<string, Line & { playerId: string }>}
   */
  seasonStats(season, part) {
    /** @type {Record<string, Line & { playerId: string }>} */
    const out = {};
    for (const p of this.players.values()) {
      const line = p.seasons[season]?.[part];
      if (line) out[p.id] = { playerId: p.id, ...line };
    }
    return out;
  }

  /**
   * A season's playoff matches, in the order played.
   * @param {number} season
   */
  playoffs(season) {
    return this.season(season).matchIds.map((id) => /** @type {MatchRecord} */ (this.matches.get(id))).filter((m) => m.stage !== 'regular');
  }

  /**
   * Every match between two teams, in the order played (regular season and playoffs).
   * @param {string} a @param {string} b
   */
  headToHead(a, b) {
    return [...this.matches.values()].filter((m) => (m.homeId === a && m.awayId === b) || (m.homeId === b && m.awayId === a));
  }

  /**
   * A player's career totals: the regular season, the playoffs, or both (`all`, as the all-time records count them),
   * over the seasons up to `upTo` (all of them by default). `teamId` is the last team they played for; `seasons` how
   * many seasons they played in.
   * @param {string} playerId @param {'regular' | 'playoffs' | 'all'} part @param {number} [upTo]
   */
  career(playerId, part, upTo = Infinity) {
    const p = /** @type {PlayerRecord} */ (this.players.get(playerId));
    const total = zeroLine(p.teamId ?? '');
    let seasons = 0;
    for (const [season, s] of Object.entries(p.seasons)) {
      if (Number(season) > upTo) continue;
      const lines = part === 'all' ? [s.regular, s.playoffs] : [s[part]];
      if (!lines.some(Boolean)) continue;
      seasons++;
      for (const line of lines) if (line) addLine(total, line);
    }
    return { ...total, seasons };
  }
}
