// What's notable (It remembers, Task 220): the stories LATEST and HISTORY tell, picked from the chronicle by the bars in
// data/chronicle.json. Pure; ids and numbers only (the words are the channel's). The seed of Talk that remembers' facts
// module (vision §12 4½): the desk and the interview will read the same items. See docs/channel.md §20.3.
import { withoutComments } from '../util.js';
import { statOf } from './chronicle.js';

/**
 * @typedef {import('./chronicle.js').Chronicle} Chronicle
 * @typedef {import('./chronicle.js').MatchRecord} MatchRecord
 *
 * @typedef {object} Item  One notable thing.
 * @property {'milestone' | 'performance' | 'run' | 'pennant' | 'playoffs' | 'champion' | 'award' | 'first_pick' | 'legend' | 'call_up' | 'first_season' | 'first_cup' | 'cups_in_a_row' | 'drought' | 'double' | 'record'} kind
 * @property {'career' | 'season'} [scope]  record: all-time, or a single regular season (Task 220b).
 * @property {number} season
 * @property {string | null} matchId  The match it happened in (or the last one before it), else null (the off-season, a season's end).
 * @property {string} [playerId]
 * @property {string} [teamId]
 * @property {string} [opponentId]
 * @property {string} [stat]  milestone, performance, award, record.
 * @property {number} [value]
 * @property {string[]} [teamIds]  playoffs: the seeds.
 * @property {string} [score]  champion: the final's score from the champion's side.
 * @property {string} [previousId]  record: who held it.
 * @property {number} [previousValue]  record: theirs.
 * @property {boolean} [withPennant]  A Cup landmark (first_cup, cups_in_a_row, drought) won with the Pennant too.
 */

/** Career stats whose all-time record changing hands is a landmark (not games: Task 220), and whose bars make a legend. */
const RECORD_STATS = ['goals', 'assists', 'saves', 'stops'];

/** A record broken as an item. @param {import('./chronicle.js').RecordBroken} r @param {number} value */
const recordItem = (r, value) => /** @type {Item} */ ({
  kind: 'record', season: r.season, matchId: r.matchId, playerId: r.playerId, teamId: r.teamId, scope: r.scope, stat: r.stat, value,
  previousId: r.previous.playerId, previousValue: r.previous.value,
});

/** The final's score from the winner's side ("3-1", "2-2 (4-3 SO)", "3-2 GG"). @param {MatchRecord} m */
export function finalScore(m) {
  const flip = m.winnerId !== m.homeId;
  const pair = (/** @type {number} */ h, /** @type {number} */ a) => (flip ? `${a}-${h}` : `${h}-${a}`);
  const tail = m.decidedBy === 'overtime' ? ' GG' : m.shootout ? ` (${pair(m.shootout.home, m.shootout.away)} SO)` : '';
  return `${pair(m.homeGoals, m.awayGoals)}${tail}`;
}

/**
 * A season's story so far, in the order it happened: milestones, big matches, runs (each once, at its longest), the
 * Pennant and the playoff places once the regular season is done, the Cup.
 * @param {Chronicle} chronicle @param {any} options  data/chronicle.json (config.chronicle) @param {number} season
 * @returns {Item[]}
 */
export function seasonStory(chronicle, options, season) {
  const L = withoutComments(options.latest);
  const e = chronicle.season(season);
  const order = new Map(e.matchIds.map((id, i) => [id, i]));
  /** @type {{ at: number, item: Item }[]} */
  const out = [];
  const add = (/** @type {number} */ at, /** @type {Item} */ item) => out.push({ at, item });

  for (const m of chronicle.milestones) {
    if (m.season !== season || (m.stat === 'appearances' && m.value < L.appearancesFrom)) continue;
    add(/** @type {number} */ (order.get(m.matchId)), { kind: 'milestone', season, matchId: m.matchId, playerId: m.playerId, teamId: m.teamId, stat: m.stat, value: m.value });
  }
  for (const x of chronicle.performances) {
    if (x.season !== season) continue;
    const m = /** @type {MatchRecord} */ (chronicle.matches.get(x.matchId));
    const opponentId = m.homeId === x.teamId ? m.awayId : m.homeId;
    // The biggest of the three, if it clears its bar.
    const stat = x.goals >= L.matchGoals ? 'goals' : x.assists >= L.matchAssists ? 'assists' : x.saves >= L.matchSaves ? 'saves' : null;
    if (stat) add(/** @type {number} */ (order.get(x.matchId)), { kind: 'performance', season, matchId: x.matchId, playerId: x.playerId, teamId: x.teamId, opponentId, stat, value: x[stat] });
  }
  // Records as they fell (Task 220b): the value then.
  for (const r of chronicle.recordsBroken) {
    if (r.season !== season) continue;
    add(/** @type {number} */ (order.get(r.matchId)), recordItem(r, r.value));
  }
  // Runs: each once, at its longest (the match that made it so), if it reaches its bar.
  for (const teamId of e.teamIds) {
    /** @type {Record<'won' | 'winless', { n: number, at: number, id: string }>} */
    const best = { won: { n: 0, at: 0, id: '' }, winless: { n: 0, at: 0, id: '' } };
    const run = { won: 0, winless: 0 };
    const close = (/** @type {'won' | 'winless'} */ k) => {
      if (best[k].n >= (k === 'won' ? L.winRun : L.winlessRun)) add(best[k].at, { kind: 'run', season, matchId: best[k].id, teamId, stat: k, value: best[k].n });
      best[k] = { n: 0, at: 0, id: '' };
      run[k] = 0;
    };
    e.matchIds.forEach((id, i) => {
      const m = /** @type {MatchRecord} */ (chronicle.matches.get(id));
      if (m.homeId !== teamId && m.awayId !== teamId) return;
      const won = m.winnerId === teamId;
      for (const k of /** @type {const} */ (['won', 'winless'])) {
        if (k === 'won' ? won : !won) {
          run[k]++;
          best[k] = { n: run[k], at: i, id };
        } else close(k);
      }
    });
    close('won');
    close('winless');
  }
  // The regular season's end: the Pennant and the playoff places (known at its last match).
  const lastRegular = e.matchIds.findLastIndex((id) => chronicle.matches.get(id)?.stage === 'regular');
  if (e.seeds.length && lastRegular >= 0) {
    const top = e.table[0];
    add(lastRegular + 0.5, { kind: 'pennant', season, matchId: e.matchIds[lastRegular], teamId: top.teamId, value: top.points });
    add(lastRegular + 0.6, { kind: 'playoffs', season, matchId: e.matchIds[lastRegular], teamIds: [...e.seeds] });
  }
  if (e.championId) {
    const final = /** @type {MatchRecord} */ ([...e.matchIds].reverse().map((id) => chronicle.matches.get(id)).find((m) => m?.stage === 'final'));
    add(e.matchIds.length, { kind: 'champion', season, matchId: final.id, teamId: e.championId, opponentId: /** @type {string} */ (e.runnerUpId), score: finalScore(final) });
  }
  return out.sort((a, b) => a.at - b.at).map((x) => x.item);
}

/**
 * A season's off-season, once it has aired: the awards (in the order the show gives them), the No. 1 pick, the legends
 * retiring, the Kindling League's call-ups.
 * @param {Chronicle} chronicle @param {any} options @param {number} season  The season just finished.
 * @param {string[]} [awardOrder]  The show's order (settings.awards.order); the list's order otherwise.
 * @returns {Item[]}
 */
export function offseasonStory(chronicle, options, season, awardOrder) {
  const e = chronicle.season(season);
  const awards = awardOrder ? [...e.awards].sort((a, b) => awardOrder.indexOf(a.award) - awardOrder.indexOf(b.award)) : e.awards;
  /** @type {Item[]} */
  const out = awards.map((a) => ({ kind: /** @type {const} */ ('award'), season, matchId: null, playerId: a.playerId, teamId: a.teamId, stat: a.award, value: a.value }));
  for (const id of e.retired) if (isLegend(chronicle, options, id)) out.push({ kind: 'legend', season, matchId: null, playerId: id });
  for (const p of chronicle.players.values()) {
    for (const mv of p.moves) {
      if (mv.season !== season) continue;
      if (mv.type === 'draft' && mv.round === 1 && mv.pick === 1) out.push({ kind: 'first_pick', season, matchId: null, playerId: p.id, teamId: /** @type {string} */ (mv.teamId) });
      if (mv.type === 'call_up') out.push({ kind: 'call_up', season, matchId: null, playerId: p.id, teamId: /** @type {string} */ (mv.teamId) });
    }
  }
  return out;
}

/**
 * A legend (Tom: by rules, as they retire): a career over a bar in goals, assists, saves or stops, or enough awards,
 * or enough Scorch Cups as a regular (data/chronicle.json legends). False for anyone still playing.
 * @param {Chronicle} chronicle @param {any} options @param {string} playerId
 */
export function isLegend(chronicle, options, playerId) {
  return legendWhy(chronicle, options, playerId) !== null;
}

/**
 * Why a retired player is a legend, for their line: the stat over its bar (the first of goals, assists, saves,
 * stops), else their awards, else their Cups as a regular; null if they aren't one.
 * @param {Chronicle} chronicle @param {any} options @param {string} playerId
 * @returns {{ stat: string, value: number } | null}
 */
export function legendWhy(chronicle, options, playerId) {
  const p = chronicle.players.get(playerId);
  if (!p?.retired) return null;
  const G = withoutComments(options.legends);
  const c = chronicle.career(playerId, 'all', p.retired.season);
  const stat = RECORD_STATS.find((k) => statOf(c, k) >= G[k]);
  if (stat) return { stat, value: statOf(c, stat) };
  if (p.awards.length >= G.awards) return { stat: 'awards', value: p.awards.length };
  let cups = 0;
  for (const [season, s] of Object.entries(p.seasons)) {
    const e = chronicle.season(Number(season));
    const games = e.table.find((r) => r.teamId === s.teamId)?.played ?? 0;
    if (e.championId === s.teamId && (s.regular?.appearances ?? 0) >= G.regularShare * games) cups++;
  }
  return cups >= G.cups ? { stat: 'cups', value: cups } : null;
}

/**
 * A finished season's landmarks, for HISTORY: the first season, a team's first Cup, Cups in a row, a drought ended
 * (each `withPennant` when the table was won too), else the Pennant and the Cup together (`double`), all-time records
 * changing hands, legends retiring.
 * @param {Chronicle} chronicle @param {any} options @param {number} season
 * @returns {Item[]}
 */
export function landmarks(chronicle, options, season) {
  const H = withoutComments(options.history);
  const e = chronicle.season(season);
  /** @type {Item[]} */
  const out = [];
  if (season === 1) out.push({ kind: 'first_season', season, matchId: null });
  const champ = e.championId;
  if (champ) {
    const cups = /** @type {any} */ (chronicle.teams.get(champ)).cups.filter((/** @type {number} */ s) => s < season);
    let row = 1;
    while (cups.includes(season - row)) row++;
    const withPennant = e.shieldId === champ;
    /** @type {Item | null} */
    let cup = null;
    if (cups.length === 0) cup = { kind: 'first_cup', season, matchId: null, teamId: champ };
    else if (row >= 2) cup = { kind: 'cups_in_a_row', season, matchId: null, teamId: champ, value: row };
    else if (season - cups[cups.length - 1] >= H.droughtSeasons) cup = { kind: 'drought', season, matchId: null, teamId: champ, value: season - cups[cups.length - 1] };
    // One line for the Cup, the Pennant with it (Tom: not two lines for one season).
    if (cup) out.push(withPennant ? { ...cup, withPennant } : cup);
    else if (withPennant) out.push({ kind: 'double', season, matchId: null, teamId: champ });
  }
  // Records that changed hands (Task 220b, from the log): each holder once per record, a season record with its
  // final figure (the season's total), an all-time one with the total it was taken at.
  const seen = new Set();
  for (const r of chronicle.recordsBroken) {
    if (r.season !== season || seen.has(`${r.scope} ${r.stat} ${r.playerId}`)) continue;
    seen.add(`${r.scope} ${r.stat} ${r.playerId}`);
    const line = r.scope === 'season' ? chronicle.players.get(r.playerId)?.seasons[season]?.regular : null;
    out.push(recordItem(r, line ? statOf(line, r.stat) : r.value));
  }
  for (const id of e.retired) if (isLegend(chronicle, options, id)) out.push({ kind: 'legend', season, matchId: null, playerId: id });
  return out;
}

/**
 * On this day: from earlier seasons, the most notable things on the same day of the week (a season is a week), up to
 * `n`: Cups first, then milestones, big matches, runs.
 * @param {Chronicle} chronicle @param {any} options
 * @param {{ before: number, day: number, dayOf: (season: number, matchId: string) => number, n?: number }} o
 *   before: the season shown now (earlier ones count). day: today's day of the season (0 = Monday). dayOf: a match's.
 * @returns {Item[]}
 */
export function onThisDay(chronicle, options, { before, day, dayOf, n = 3 }) {
  const rank = { champion: 0, milestone: 1, performance: 2, run: 3, pennant: 4, playoffs: 5 };
  /** @type {Item[]} */
  const found = [];
  for (let s = before - 1; s >= 1; s--) {
    for (const it of seasonStory(chronicle, options, s)) {
      if (it.matchId && dayOf(s, it.matchId) === day && it.kind in rank) found.push(it);
    }
  }
  return found
    .sort((a, b) => /** @type {any} */ (rank)[a.kind] - /** @type {any} */ (rank)[b.kind] || b.season - a.season)
    .slice(0, n);
}
