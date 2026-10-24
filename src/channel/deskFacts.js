// The desk remembers (Talk that remembers, Task 246a; docs/channel.md §18.15): which of a match's facts the desk says,
// and what fills its line. Pure; the facts are the facts module's (src/chronicle/facts.js), the words data/studio.json's
// (factRematch to factMomentumDecider after a match, teeUpRematch, teeUpRunOver, teeUpOldClub before one). Said: generic
// or one team; shown: the specifics.

/**
 * @typedef {import('../chronicle/facts.js').Fact} Fact
 * @typedef {{ kind: string, fill: Record<string, string | number> }} DeskLine  A studio line kind and its fill.
 * @typedef {object} DeskNames  How the line names things.
 * @property {(teamId: string) => string} team  A team's short name ("Gulls").
 * @property {(playerId: string) => string} player  A player as the graphics show them ("C. PENHALLOW").
 * @property {(playerId: string) => string} surname  As said ("Penhallow").
 */

/** After a match: each fact kind (or kind.variant) the desk can say, and its line. */
const AFTER = /** @type {Record<string, string>} */ ({
  final_rematch: 'factRematch', 'final_rematch.revenge': 'factRematchRevenge', head_to_head_ended: 'factFirstWinOver',
  winless_ended: 'factWinlessEnded',
  first_final: 'factFirstFinal', final_drought_ended: 'factFinalDrought', finals_in_a_row: 'factFinalsInARow',
  first_cup: 'factFirstCup', cup_drought_ended: 'factCupDrought', cups_in_a_row: 'factCupsInARow', dynasty: 'factDynasty',
  milestone: 'factMilestone', record: 'factRecord', back_from_injury: 'factBackFromInjury',
  'old_club.let_go': 'factOldClubLetGo', 'old_club.left': 'factOldClubLeft', likely_last: 'factLikelyLast',
  one_more_season: 'factOneMore', scorcher_decider: 'factScorcherDecider', momentum_decider: 'factMomentumDecider',
});
/** Before a match. */
const BEFORE = /** @type {Record<string, string>} */ ({ final_rematch: 'teeUpRematch', head_to_head_run: 'teeUpRunOver', old_club: 'teeUpOldClub' });

/** A milestone's or record's stat on the graphic. */
const STAT = /** @type {Record<string, [string, string]>} */ ({
  goals: ['GOAL', 'GOALS'], assists: ['ASSIST', 'ASSISTS'], appearances: ['MATCH', 'MATCHES'], saves: ['SAVE', 'SAVES'], stops: ['STOP', 'STOPS'],
});

/** "100TH", "22ND". @param {number} n */
const ordinal = (n) => {
  const v = n % 100;
  return `${n}${['TH', 'ST', 'ND', 'RD'][(v - 20) % 10] ?? ['TH', 'ST', 'ND', 'RD'][v] ?? 'TH'}`;
};

/** Which line a fact has, if the desk says it. @param {Fact} f @param {Record<string, string>} map */
function lineFor(f, map) {
  const variant = f.kind === 'final_rematch' && f.revenge ? 'final_rematch.revenge'
    : f.kind === 'old_club' ? `old_club.${f.how}`
      : f.kind;
  return variant ? map[variant] ?? map[f.kind] ?? null : null;
}

/** A fact's fill, for the desk's graphics and the interview's fact strip (Task 247a). @param {Fact} f @param {DeskNames} names */
export function fillOf(f, names) {
  /** @type {Record<string, string | number>} */
  const fill = { n: f.value ?? '' };
  if (f.teamId) fill.team = names.team(f.teamId);
  if (f.opponentId) fill.opponent = names.team(f.opponentId);
  if (f.playerId) Object.assign(fill, { player: names.player(f.playerId), surname: names.surname(f.playerId) });
  if (f.minute) fill.minute = `${f.minute}'`;
  if (f.inLast) fill.seasons = f.inLast;
  const [one, many] = STAT[f.stat ?? ''] ?? ['', ''];
  if (f.kind === 'milestone') fill.milestone = `${ordinal(Number(f.value))} ${one}`;
  if (f.kind === 'record') fill.record = `${f.scope === 'season' ? 'SEASON' : 'ALL-TIME'} ${many} RECORD · ${f.value}`;
  return fill;
}

/**
 * The desk's history line after a match: the heaviest fact it can say, from `from` in weight; null for none.
 * @param {Fact[]} facts  Heaviest first. @param {DeskNames} names @param {number} from  facts.deskFrom
 * @returns {DeskLine | null}
 */
export function deskAfter(facts, names, from) {
  for (const f of facts) {
    if (f.weight < from) break;
    const kind = lineFor(f, AFTER);
    if (kind) return { kind, fill: fillOf(f, names) };
  }
  return null;
}

/**
 * The tee-up's history line before a match: the heaviest fact it can say; null for none. A final's rematch names last
 * season's winner on the graphic.
 * @param {Fact[]} facts @param {DeskNames} names @returns {DeskLine | null}
 */
export function deskBefore(facts, names) {
  for (const f of facts) {
    const kind = lineFor(f, BEFORE);
    if (!kind) continue;
    const fill = fillOf(f, names);
    if (f.kind === 'final_rematch') fill.winner = names.team(/** @type {string} */ (f.teamId));
    return { kind, fill };
  }
  return null;
}
