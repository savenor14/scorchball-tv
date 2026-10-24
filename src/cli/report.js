// Plain-text reports for the fast-forward runner. Pure functions: league data in, lines of text out.
import { overall } from '../sim/players.js';
import { leaders } from '../sim/standings.js';

/**
 * @typedef {import('../sim/league.js').League} League
 * @typedef {import('../sim/season.js').SeasonRecord} SeasonRecord
 * @typedef {import('../sim/offseason.js').OffseasonReport} OffseasonReport
 */

/** @param {League} league @param {string} id */
const teamName = (league, id) => league.teams[id].name;
/** @param {League} league @param {string} id */
const abbr = (league, id) => league.teams[id].abbr;
/** @param {League} league @param {string} id */
const playerName = (league, id) => `${league.players[id].firstName} ${league.players[id].lastName}`;
/** @param {number} n */
const signed = (n) => (n > 0 ? `+${n}` : String(n));

/**
 * Full report for one season: table, playoffs, honours, leaders and the off-season.
 * @param {League} league @param {SeasonRecord} record @param {OffseasonReport} offseason @param {any} positions
 * @returns {string[]}
 */
export function seasonReport(league, record, offseason, positions) {
  const lines = [`=== Season ${record.season} ===`, ''];
  lines.push('Pos Team                       P   W  D  L   GF  GA   GD  Pts  Form');
  for (const r of record.table) {
    const tag = r.teamId === record.championId ? '  Champion' : '';
    lines.push(
      `${String(r.position).padStart(2)}  ${teamName(league, r.teamId).padEnd(24)} ${String(r.played).padStart(3)}  ${String(r.won).padStart(2)} ${String(r.drawn).padStart(2)} ${String(r.lost).padStart(2)}`
      + `  ${String(r.goalsFor).padStart(3)} ${String(r.goalsAgainst).padStart(3)}  ${signed(r.goalDifference).padStart(4)}  ${String(r.points).padStart(3)}  ${r.form.join('')}${tag}`,
    );
  }

  lines.push('', 'Playoffs:');
  for (const m of record.playoffs) {
    const label = m.stage === 'final' ? 'Final' : 'Semi ';
    lines.push(`  ${label}  ${matchLine(league, m)}`);
  }
  lines.push('', `Champion: ${teamName(league, record.championId)}   Pennant: ${teamName(league, record.shieldId)}   Runner-up: ${teamName(league, record.runnerUpId)}`);

  for (const [stat, label] of /** @type {const} */ ([['goals', 'Top scorers'], ['assists', 'Assists'], ['scorchers', 'Scorchers'], ['saves', 'Saves']])) {
    const top = leaders(record.stats.regular, stat, 5).map((t) => `${playerName(league, t.playerId)} (${abbr(league, t.teamId)}) ${t[stat]}`);
    lines.push(`${`${label}:`.padEnd(13)} ${top.join(', ') || '-'}`);
  }

  const matches = record.schedule.flatMap((r) => r.matches);
  const goals = matches.reduce((s, m) => s + (m.result ? m.result.homeGoals + m.result.awayGoals : 0), 0);
  lines.push(`Goals per match: ${(goals / matches.length).toFixed(2)}`);

  const first = offseason.draft[0];
  const firstPick = first
    ? `${playerName(league, first.playerId)} (${league.players[first.playerId].position}, ovr ${Math.round(overall(league.players[first.playerId], positions))}) to ${teamName(league, first.teamId)}`
    : 'none';
  lines.push(
    `Off-season: ${offseason.retired.length} retired, ${offseason.released.length} released, ${offseason.signed.length} signed. No. 1 pick: ${firstPick}`,
    '',
  );
  return lines;
}

/** @param {League} league @param {import('../sim/season.js').PlayoffMatch} m */
function matchLine(league, m) {
  const r = m.result;
  let extra = '';
  if (r.decidedBy === 'overtime') extra = ' (golden goal)';
  if (r.decidedBy === 'shootout' && r.shootout) extra = ` (${r.shootout.home}-${r.shootout.away} on the shootout)`;
  return `${teamName(league, m.homeId)} ${r.homeGoals}-${r.awayGoals} ${teamName(league, m.awayId)}${extra}  -> ${abbr(league, m.winnerId)}`;
}

/**
 * One line per season, for quiet mode.
 * @param {League} league @param {SeasonRecord} record
 */
export function seasonLine(league, record) {
  const top = record.table[0];
  const scorer = league.history.find((h) => h.season === record.season)?.topScorers[0];
  return `S${String(record.season).padStart(3)}  Champion ${abbr(league, record.championId)}  Pennant ${abbr(league, record.shieldId)} (${top.won}-${top.drawn}-${top.lost}, ${top.points} pts)`
    + (scorer ? `  Top scorer ${playerName(league, scorer.playerId)} ${scorer.goals}` : '');
}

/**
 * Summary of a whole run: champions by season and titles per team.
 * @param {League} league
 * @returns {string[]}
 */
export function runSummary(league) {
  const lines = ['=== Honours ===', '', 'Season  Champion                  Pennant                   Top scorer'];
  for (const h of league.history) {
    const s = h.topScorers[0];
    lines.push(`${String(h.season).padStart(6)}  ${teamName(league, h.championId).padEnd(24)}  ${teamName(league, h.shieldId).padEnd(24)}  ${s ? `${playerName(league, s.playerId)} (${s.goals})` : '-'}`);
  }
  /** @type {Map<string, { titles: number, shields: number }>} */
  const counts = new Map(Object.keys(league.teams).map((id) => [id, { titles: 0, shields: 0 }]));
  for (const h of league.history) {
    /** @type {{ titles: number, shields: number }} */ (counts.get(h.championId)).titles++;
    /** @type {{ titles: number, shields: number }} */ (counts.get(h.shieldId)).shields++;
  }
  lines.push('', 'Team                      Titles  Pennants');
  for (const [id, c] of [...counts].sort((a, b) => b[1].titles - a[1].titles || b[1].shields - a[1].shields)) {
    lines.push(`${teamName(league, id).padEnd(24)}  ${String(c.titles).padStart(6)}  ${String(c.shields).padStart(8)}`);
  }
  return lines;
}
