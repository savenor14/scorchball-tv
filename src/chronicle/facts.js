// The facts module (Talk that remembers, Task 243; docs/simulation.md §12c): what's true and notable about a match now,
// read from the chronicle, for the desk and the interview to pick lines by. Pure; ids and numbers only (the words are
// the channel's). Most facts reach back past the match itself: a final's rematch, a run against one club, a drought
// ended, a player beating a club they left, a long career's likely last match. The match's own moments (a late winner,
// a comeback, a hat-trick) are talk.js's matchFacts; here only the ones that turned on a scorcher or momentum.
//
// The chronicle can run ahead of the screen (the live league simulates at kick-off): facts after a match read only the
// matches up to it; facts before one take what has aired.
import { withoutComments } from '../util.js';
import { retirementChance } from '../sim/offseason.js';
import { seasonConfig } from '../sim/rules.js';
import { matchLines } from './matchLines.js';

/**
 * @typedef {import('./chronicle.js').Chronicle} Chronicle
 * @typedef {import('./chronicle.js').MatchRecord} MatchRecord
 * @typedef {import('./chronicle.js').PlayerRecord} PlayerRecord
 *
 * @typedef {'final_rematch' | 'head_to_head_ended' | 'head_to_head_run' | 'win_run' | 'winless_ended'
 *   | 'first_final' | 'final_drought_ended' | 'finals_in_a_row' | 'first_cup' | 'cup_drought_ended' | 'cups_in_a_row' | 'dynasty'
 *   | 'first_goal' | 'milestone' | 'record' | 'back_from_injury' | 'old_club' | 'likely_last' | 'one_more_season'
 *   | 'scorcher_decider' | 'momentum_decider' | 'late_decider' | 'goal_haul' | 'comeback'} FactKind
 *
 * @typedef {object} Fact  One notable thing.
 * @property {FactKind} kind
 * @property {number} weight  How notable (data/chronicle.json facts.weights): the desk says the heaviest.
 * @property {string} [teamId]  Whose fact it is (the winner, the player's team).
 * @property {string} [opponentId]
 * @property {string} [playerId]
 * @property {number} [value]  The number the fact turns on: a run's length, seasons since, a milestone, a record.
 * @property {string} [stat]  milestone, record.
 * @property {number} [season]  final_rematch: the final's season.
 * @property {boolean} [revenge]  final_rematch: the final's loser won this time.
 * @property {boolean} [again]  final_rematch: the same two in the final again.
 * @property {boolean} [clubBest]  win_run: the longest in the club's history.
 * @property {'let_go' | 'left'} [how]  old_club: released or not kept (let go), or chose to leave.
 * @property {boolean} [scored]  old_club, back_from_injury, one_more_season: and scored.
 * @property {boolean} [potm]  old_club, back_from_injury: and was player of the match.
 * @property {boolean} [champion]  likely_last: going out a champion.
 * @property {number} [chance]  likely_last: the odds they retire now (never shown).
 * @property {'winner' | 'equaliser' | 'golden_goal'} [decider]  late_decider, scorcher_decider, momentum_decider.
 * @property {number} [minute]  scorcher_decider, momentum_decider: the match minute (1-based).
 * @property {number} [inLast]  dynasty: Cups in the last few seasons.
 * @property {'record' | 'career'} [scope]  record: all-time ('career') or a single season ('season').
 */

/** The facts' bars and weights. @param {any} config */
const optsOf = (config) => withoutComments(config.chronicle.facts);

/** The other side of a match. @param {MatchRecord} m @param {string} id */
const otherSide = (m, id) => (m.homeId === id ? m.awayId : m.homeId);

/** @param {MatchRecord} m @param {string} id */
const plays = (m, id) => m.homeId === id || m.awayId === id;

/** Did these two meet in it? @param {MatchRecord} m @param {string} a @param {string} b */
const between = (m, a, b) => plays(m, a) && plays(m, b);

/**
 * How many of `list`, counted back from its end, pass `pass`.
 * @template T @param {T[]} list @param {(x: T) => boolean} pass
 */
function runFromEnd(list, pass) {
  let n = 0;
  for (let i = list.length - 1; i >= 0 && pass(list[i]); i--) n++;
  return n;
}

/** The longest run of `pass` anywhere in `list`. @template T @param {T[]} list @param {(x: T) => boolean} pass */
function longestRun(list, pass) {
  let best = 0;
  let n = 0;
  for (const x of list) {
    n = pass(x) ? n + 1 : 0;
    best = Math.max(best, n);
  }
  return best;
}

/**
 * The season's final of `season` among `past`, if played. @param {MatchRecord[]} past @param {number} season
 */
const finalOf = (past, season) => past.find((m) => m.season === season && m.stage === 'final') ?? null;

/**
 * Has a player's team beaten their old club since the player left it? @param {MatchRecord[]} past @param {PlayerRecord} p
 * @param {string} oldId
 */
function wonSince(past, p, oldId) {
  const leftIn = Math.max(...Object.entries(p.seasons).filter(([, ps]) => ps.teamId === oldId).map(([s]) => Number(s)));
  return past.some((x) => {
    const teamId = p.seasons[x.season]?.teamId;
    return x.season > leftIn && teamId && teamId !== oldId && between(x, oldId, teamId) && x.winnerId === teamId;
  });
}

/**
 * The facts between two teams from their meetings so far: last season's final met again for the first time, and runs
 * one side has over the other. `winnerId` is this match's winner after it (facts after), or null (before, or a draw).
 * @param {MatchRecord[]} past  Matches before this one, in order.
 * @param {{ season: number, stage: string, homeId: string, awayId: string }} m @param {string | null} winnerId
 * @param {any} o  facts options @param {(kind: FactKind) => number} w
 * @param {boolean} after
 * @returns {Fact[]}
 */
function pairFacts(past, m, winnerId, o, w, after) {
  /** @type {Fact[]} */
  const out = [];
  const h2h = past.filter((x) => between(x, m.homeId, m.awayId));
  const final = finalOf(past, m.season - 1);
  if (final && between(final, m.homeId, m.awayId) && !h2h.some((x) => x.season === m.season)) {
    const loserThen = final.winnerId ? otherSide(final, final.winnerId) : null;
    out.push({
      kind: 'final_rematch', weight: w('final_rematch'), teamId: winnerId ?? final.winnerId ?? m.homeId,
      opponentId: otherSide(/** @type {any} */ (m), winnerId ?? final.winnerId ?? m.homeId), season: final.season,
      revenge: winnerId !== null && winnerId === loserThen, again: m.stage === 'final',
    });
  }
  if (after && winnerId) {
    const loserId = winnerId === m.homeId ? m.awayId : m.homeId;
    const without = runFromEnd(h2h, (x) => x.winnerId !== winnerId);
    if (without >= o.headToHeadRun) out.push({ kind: 'head_to_head_ended', weight: w('head_to_head_ended'), teamId: winnerId, opponentId: loserId, value: without });
    else {
      const run = runFromEnd(h2h, (x) => x.winnerId === winnerId) + 1;
      if (run >= o.headToHeadRun) out.push({ kind: 'head_to_head_run', weight: w('head_to_head_run'), teamId: winnerId, opponentId: loserId, value: run });
    }
  }
  if (!after) {
    // Before: one side has won the last few between them.
    for (const id of [m.homeId, m.awayId]) {
      const run = runFromEnd(h2h, (x) => x.winnerId === id);
      if (run >= o.headToHeadRun) out.push({ kind: 'head_to_head_run', weight: w('head_to_head_run'), teamId: id, opponentId: otherSide(/** @type {any} */ (m), id), value: run });
    }
  }
  return out;
}

/**
 * A team's playoff facts after winning a semifinal (the final reached) or the final (the Cup).
 * @param {MatchRecord[]} past @param {MatchRecord} m @param {string} teamId @param {any} o @param {(kind: FactKind) => number} w
 * @returns {Fact[]}
 */
function playoffFacts(past, m, teamId, o, w) {
  const finals = past.filter((x) => x.stage === 'final' && plays(x, teamId));
  if (m.stage === 'semifinal') {
    const last = finals.at(-1);
    // Firsts from season 2 (in the founding season every final and Cup is one).
    if (!last) return m.season > 1 ? [{ kind: 'first_final', weight: w('first_final'), teamId }] : [];
    const since = m.season - last.season;
    const inARow = runFromEnd(seasonsUpTo(m.season - 1), (s) => finals.some((x) => x.season === s)) + 1;
    if (inARow >= o.inARow) return [{ kind: 'finals_in_a_row', weight: w('finals_in_a_row'), teamId, value: inARow }];
    if (since >= o.finalDrought) return [{ kind: 'final_drought_ended', weight: w('final_drought_ended'), teamId, value: since }];
    return [];
  }
  if (m.stage !== 'final' || m.winnerId !== teamId) return [];
  const cups = finals.filter((x) => x.winnerId === teamId);
  const last = cups.at(-1);
  if (!last) return m.season > 1 ? [{ kind: 'first_cup', weight: w('first_cup'), teamId }] : [];
  const since = m.season - last.season;
  const inARow = runFromEnd(seasonsUpTo(m.season - 1), (s) => cups.some((x) => x.season === s)) + 1;
  if (inARow >= 2) return [{ kind: 'cups_in_a_row', weight: w('cups_in_a_row'), teamId, value: inARow }];
  const inLast = cups.filter((x) => x.season > m.season - o.dynastySeasons).length + 1;
  if (inLast >= o.dynastyCups) return [{ kind: 'dynasty', weight: w('dynasty'), teamId, value: inLast, inLast: o.dynastySeasons }];
  if (since >= o.cupDrought) return [{ kind: 'cup_drought_ended', weight: w('cup_drought_ended'), teamId, value: since }];
  return [];
}

/** Seasons 1..n. @param {number} n */
const seasonsUpTo = (n) => Array.from({ length: Math.max(0, n) }, (_, i) => i + 1);

/**
 * The seasons a player played for a team, before `season`. @param {PlayerRecord} p @param {string} teamId @param {number} season
 */
const seasonsAt = (p, teamId, season) => Object.entries(p.seasons)
  .filter(([s, ps]) => Number(s) < season && ps.teamId === teamId && (ps.regular || ps.playoffs)).length;

/**
 * How a player left a club: chose to (their deal ran out and they went to the market though the club wanted them),
 * or let go (released or not kept). @param {PlayerRecord} p @param {string} teamId
 * @returns {'let_go' | 'left'}
 */
const howLeft = (p, teamId) => {
  const release = p.moves.filter((x) => x.type === 'release' && x.teamId === teamId).at(-1);
  return release?.byPlayer ? 'left' : 'let_go';
};

/**
 * How many goals the winner was ever behind by (0 for none, or a draw). @param {readonly import('./eventLog.js').LeagueEvent[]} events
 * @param {MatchRecord} m
 */
function comebackFrom(events, m) {
  if (!m.winnerId) return 0;
  const home = m.winnerId === m.homeId;
  let worst = 0;
  for (const e of events) {
    if (e.type !== 'goal') continue;
    const [h, a] = /** @type {any} */ (e.data).score;
    worst = Math.min(worst, home ? h - a : a - h);
  }
  return -worst;
}

/**
 * The goal that decided a match, if it came late (a late winner, a late equaliser, a golden goal), with whether it was
 * a scorcher and whether the scoring team had momentum at the time.
 * @param {readonly import('./eventLog.js').LeagueEvent[]} events @param {MatchRecord} m @param {number} lateFrom  Game seconds.
 */
function lateDecider(events, m, lateFrom) {
  /** @type {{ side: string, until: number } | null} */
  let momentum = null;
  /** @type {{ clock: number, teamId: string, playerId: string, scorcher: boolean, momentum: boolean, score: number[] }[]} */
  const goals = [];
  for (const e of events) {
    const d = /** @type {any} */ (e.data);
    if (e.type === 'momentum') momentum = { side: /** @type {string} */ (e.teamId), until: d.until };
    if (e.type === 'goal') {
      const clock = /** @type {number} */ (e.clock);
      goals.push({
        clock, teamId: /** @type {string} */ (e.teamId), playerId: /** @type {string} */ (e.playerId), scorcher: !!d.scorcher, score: d.score,
        momentum: !!momentum && momentum.side === e.teamId && clock < momentum.until,
      });
    }
  }
  if (m.decidedBy === 'shootout') return null;
  if (m.winnerId) {
    // The goal that put the winner ahead for good.
    const home = m.winnerId === m.homeId;
    let decider = null;
    let before = 0;
    for (const g of goals) {
      const lead = home ? g.score[0] - g.score[1] : g.score[1] - g.score[0];
      if (lead > 0 && before <= 0) decider = g;
      before = lead;
    }
    if (!decider) return null;
    if (m.decidedBy === 'overtime') return { ...decider, decider: /** @type {const} */ ('golden_goal') };
    return decider.clock >= lateFrom ? { ...decider, decider: /** @type {const} */ ('winner') } : null;
  }
  const last = goals.at(-1);
  return last && last.score[0] === last.score[1] && last.clock >= lateFrom ? { ...last, decider: /** @type {const} */ ('equaliser') } : null;
}

/**
 * Was this a long career's likely last match? The player's team's season over with it (out of the playoffs at the
 * regular season's end, a semifinal lost, the final either way), the odds they retire after it (the sim's own,
 * rules.retirement for the off-season that follows) facts.lastMatch.chance or more, and a long career behind them.
 * Returns the odds and the seasons played, or null.
 * @param {Chronicle} chronicle @param {any} config @param {PlayerRecord} p @param {MatchRecord} m @param {string} teamId
 */
function likelyLast(chronicle, config, p, m, teamId) {
  const e = chronicle.season(m.season);
  const over = (m.stage === 'regular' && e.seeds.length > 0 && !e.seeds.includes(teamId))
    || (m.stage === 'semifinal' && m.winnerId !== teamId) || m.stage === 'final';
  if (!over) return null;
  const L = optsOf(config).lastMatch;
  const career = chronicle.career(p.id, 'all', m.season);
  if (career.seasons < L.seasons || career.appearances < L.appearances) return null;
  const chance = retirementChance(seasonConfig(config, m.season + 1).rules.retirement, {
    age: m.season - p.birthSeason, keeper: p.position === config.positions.keeper, rating: p.overall[m.season] ?? 0, peakAge: p.peakAge, unsigned: false,
  });
  return chance >= L.chance ? { chance, seasons: career.seasons } : null;
}

/**
 * What's notable after a match, the heaviest first.
 * @param {Chronicle} chronicle  With the match folded in (it may hold later matches too: they're not read).
 * @param {any} config  The whole config (the facts' bars, the rules for late and for retirement, the keeper's position).
 * @param {readonly import('./eventLog.js').LeagueEvent[]} events  The match's events, in order, ending in its match_result.
 * @returns {Fact[]}
 */
export function factsAfter(chronicle, config, events) {
  const o = optsOf(config);
  const w = (/** @type {FactKind} */ kind) => o.weights[kind];
  const matchId = /** @type {string} */ (events.at(-1)?.matchId);
  const m = chronicle.matches.get(matchId);
  if (!m) throw new Error(`Match ${matchId} isn't in the chronicle yet`);
  const all = [...chronicle.matches.values()];
  const past = all.slice(0, all.indexOf(m));
  const rules = seasonConfig(config, m.season).rules;
  /** @type {Fact[]} */
  const out = [];

  // The two teams.
  out.push(...pairFacts(past, m, m.winnerId, o, w, true));
  for (const id of [m.homeId, m.awayId]) {
    const mine = past.filter((x) => plays(x, id));
    if (m.winnerId === id) {
      const winless = runFromEnd(mine, (x) => x.winnerId !== id);
      if (winless >= o.winlessRun) out.push({ kind: 'winless_ended', weight: w('winless_ended'), teamId: id, value: winless });
      const run = runFromEnd(mine, (x) => x.winnerId === id) + 1;
      if (run >= o.winRun) out.push({ kind: 'win_run', weight: w('win_run'), teamId: id, value: run, clubBest: run > longestRun(mine, (x) => x.winnerId === id) });
      out.push(...playoffFacts(past, m, id, o, w));
    }
  }

  // The players.
  const lines = matchLines(events);
  for (const [id, l] of Object.entries(lines.players)) {
    const p = /** @type {PlayerRecord} */ (chronicle.players.get(id));
    const current = p.lastMatchId === matchId;
    const opponentId = otherSide(m, l.teamId);
    const won = m.winnerId === l.teamId;
    const potm = lines.potmId === id;
    // A first goal (not in the founding season, when everyone's is).
    if (current && m.season > 1 && l.goals > 0 && p.totals.goals === l.goals) {
      out.push({ kind: 'first_goal', weight: w('first_goal'), teamId: l.teamId, playerId: id, value: p.totals.appearances });
    }
    // Back from a long injury: their last match before this was the one they were hurt in.
    const injury = p.injuries.filter((x) => x.matchId !== matchId && all.indexOf(/** @type {MatchRecord} */ (chronicle.matches.get(x.matchId))) < all.indexOf(m)).at(-1);
    if (current && injury && p.prevMatchId === injury.matchId && (injury.seasonEnding || injury.matchesOut >= o.injuryMatches) && (l.goals > 0 || potm)) {
      out.push({ kind: 'back_from_injury', weight: w('back_from_injury'), teamId: l.teamId, playerId: id, value: injury.matchesOut, scored: l.goals > 0, potm });
    }
    // Beating a club they played for: the first win over them since leaving (moves happen only between seasons, so a
    // season's team is the player's all season).
    const there = seasonsAt(p, opponentId, m.season);
    if (won && there >= o.oldClubSeasons && (l.started || l.goals > 0) && !wonSince(past, p, opponentId)) {
      out.push({ kind: 'old_club', weight: w('old_club'), teamId: l.teamId, opponentId, playerId: id, value: there, how: howLeft(p, opponentId), scored: l.goals > 0, potm });
    }
    // A long career's likely last match: the team's season is over and the odds say they'll retire.
    const last = likelyLast(chronicle, config, p, m, l.teamId);
    if (last) out.push({ kind: 'likely_last', weight: w('likely_last'), teamId: l.teamId, playerId: id, value: last.seasons, chance: last.chance, champion: m.stage === 'final' && won });
    // One more season (Tom): their first match of a season after a likely last match that wasn't.
    const prev = p.prevMatchId ? chronicle.matches.get(p.prevMatchId) : undefined;
    if (current && prev && prev.season < m.season && likelyLast(chronicle, config, p, prev, /** @type {string} */ (p.seasons[prev.season]?.teamId))) {
      out.push({ kind: 'one_more_season', weight: w('one_more_season'), teamId: l.teamId, playerId: id, value: chronicle.career(id, 'all', prev.season).seasons + 1, scored: l.goals > 0, potm });
    }
  }
  for (const x of chronicle.milestones) {
    if (x.matchId === matchId) out.push({ kind: 'milestone', weight: w('milestone'), teamId: x.teamId, playerId: x.playerId, stat: x.stat, value: x.value });
  }
  for (const x of chronicle.recordsBroken) {
    if (x.matchId === matchId) out.push({ kind: 'record', weight: w('record'), teamId: x.teamId, playerId: x.playerId, stat: x.stat, value: x.value, scope: /** @type {any} */ (x.scope) });
  }

  // The match's own moments, for the interview (Task 245): a haul of goals (four or more: three come in most matches), a comeback from two or more down.
  for (const [id, l] of Object.entries(lines.players)) {
    if (l.goals >= o.haulGoals) out.push({ kind: 'goal_haul', weight: w('goal_haul'), teamId: l.teamId, playerId: id, value: l.goals });
  }
  const down = comebackFrom(events, m);
  if (m.winnerId && down >= o.comebackFrom) out.push({ kind: 'comeback', weight: w('comeback'), teamId: m.winnerId, opponentId: otherSide(m, m.winnerId), value: down });

  // A late decider (a late winner or equaliser, a golden goal), and whether it turned on a scorcher or momentum.
  const lateFrom = o.lateShare * 2 * rules.match.halfMinutes * 60;
  const d = lateDecider(events, m, lateFrom);
  if (d) {
    const base = { teamId: d.teamId, opponentId: otherSide(m, d.teamId), playerId: d.playerId, decider: d.decider, minute: Math.floor(d.clock / 60) + 1 };
    out.push({ kind: 'late_decider', weight: w('late_decider'), ...base });
    if (d.scorcher) out.push({ kind: 'scorcher_decider', weight: w('scorcher_decider'), ...base });
    if (d.momentum) out.push({ kind: 'momentum_decider', weight: w('momentum_decider'), ...base });
  }

  return rank(out);
}

/**
 * The likely last matches of a team whose regular season is over (Task 245): its last regular-season match, once the
 * playoff places are known (they're set after the final round, which is played all at once, so the facts for a final-round
 * match are topped up at the seeding). The facts to add to that match's.
 * @param {Chronicle} chronicle  With the season's seeds.
 * @param {any} config @param {readonly import('./eventLog.js').LeagueEvent[]} events  The team's last regular-season match's.
 * @param {string} teamId
 * @returns {Fact[]}
 */
export function seasonOverFacts(chronicle, config, events, teamId) {
  const o = optsOf(config);
  const m = /** @type {MatchRecord} */ (chronicle.matches.get(/** @type {string} */ (events.at(-1)?.matchId)));
  /** @type {Fact[]} */
  const out = [];
  for (const [id, l] of Object.entries(matchLines(events).players)) {
    if (l.teamId !== teamId) continue;
    const last = likelyLast(chronicle, config, /** @type {PlayerRecord} */ (chronicle.players.get(id)), m, teamId);
    if (last) out.push({ kind: 'likely_last', weight: o.weights.likely_last, teamId, playerId: id, value: last.seasons, chance: last.chance, champion: false });
  }
  return out;
}

/**
 * What's notable before a match between two teams, the heaviest first: last season's final met again, one side's run
 * over the other, players facing a club they played for the first time since leaving.
 * @param {Chronicle} chronicle @param {any} config
 * @param {{ season: number, stage: 'regular' | 'semifinal' | 'final', homeId: string, awayId: string }} next
 * @param {(m: MatchRecord) => boolean} [aired]  Which matches have aired (all, by default).
 * @returns {Fact[]}
 */
export function factsBefore(chronicle, config, next, aired = () => true) {
  const o = optsOf(config);
  const w = (/** @type {FactKind} */ kind) => o.weights[kind];
  const past = [...chronicle.matches.values()].filter(aired);
  const out = pairFacts(past, next, null, o, w, false);
  for (const p of chronicle.players.values()) {
    if (p.status !== 'roster' || (p.teamId !== next.homeId && p.teamId !== next.awayId)) continue;
    const opponentId = p.teamId === next.homeId ? next.awayId : next.homeId;
    const there = seasonsAt(p, opponentId, next.season);
    if (there < o.oldClubSeasons) continue;
    // The first meeting since they left: no match between their team and the old club since the season they moved.
    const leftIn = Math.max(...Object.entries(p.seasons).filter(([, ps]) => ps.teamId === opponentId).map(([s]) => Number(s)));
    const metSince = past.some((x) => x.season > leftIn && between(x, opponentId, /** @type {string} */ (p.teamId)));
    if (!metSince) out.push({ kind: 'old_club', weight: w('old_club'), teamId: p.teamId ?? undefined, opponentId, playerId: p.id, value: there, how: howLeft(p, opponentId) });
  }
  return rank(out);
}

/** The heaviest first, then the bigger number. @param {Fact[]} facts */
export const rank = (facts) => facts.sort((a, b) => b.weight - a.weight || (b.value ?? 0) - (a.value ?? 0));
