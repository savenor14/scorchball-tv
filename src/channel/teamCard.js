// The team card's contents (It remembers, Task 223; docs/channel.md §20.6): who they are, this season so far, the
// squad on its deals (the payroll against the cap, Task 234's money shared with MONEY), the last off-season's comings
// and goings, its history season by season, the club's records and its head-to-heads. Pure: reads the chronicle (only
// what has aired) and the config; the pane draws it.
import { seasonConfig } from '../sim/rules.js';
import { computeStandings } from '../sim/standings.js';
import { lotsSeedOf } from '../sim/season.js';
import { seedStreams } from '../sim/streams.js';
import { teamContracts } from './money.js';
import { groundName } from './groundsTour.js';

/** The squad's order: keepers, defenders, midfielders, strikers. */
const POSITIONS = ['K', 'D', 'M', 'S'];

/**
 * The latest season that has started on screen (its squad is the one after the off-season before it, so a new
 * season's first morning shows its new squad, no games yet). @param {import('../chronicle/chronicle.js').Chronicle} chronicle
 */
const latestSeason = (chronicle) => Math.max(0, ...[...chronicle.seasons.values()].filter((e) => e.teamIds.length).map((e) => e.season));

/**
 * A match from one team's side: W, D or L (a shootout's winner wins), goals for and against.
 * @param {import('../chronicle/chronicle.js').MatchRecord} m @param {string} id
 */
export function fromSide(m, id) {
  const home = m.homeId === id;
  return { outcome: m.winnerId === id ? 'W' : m.winnerId ? 'L' : 'D', for: home ? m.homeGoals : m.awayGoals, against: home ? m.awayGoals : m.homeGoals, opponentId: home ? m.awayId : m.homeId };
}

/**
 * Everything the card shows.
 * @param {import('../chronicle/chronicle.js').Chronicle} chronicle
 * @param {import('../config.js').Config} config
 * @param {any} team  league.teams[id] (name, city, region, blurb)
 * @param {(season: number) => string} [lotsOf]  The season's seed for drawing lots, the table's last tiebreaker (Task 271:
 *   the sim's, lotsSeedFor; the dev pages' default works it out from the dev seed).
 */
export function teamCard(chronicle, config, team, lotsOf = (season) => lotsSeedOf(seedStreams(config.settings.live.seed), season)) {
  const id = team.id;
  const rec = chronicle.teams.get(id);
  const now = latestSeason(chronicle);
  const rules = seasonConfig(config, Math.max(1, now)).rules;
  const regions = Object.fromEntries(config.regions.regions.map((/** @type {any} */ r) => [r.id, r.name]));
  const players = [...chronicle.players.values()];
  /** @param {string} pid */
  const nameOf = (pid) => {
    const p = /** @type {import('../chronicle/chronicle.js').PlayerRecord} */ (chronicle.players.get(pid));
    return `${p.firstName[0]}. ${p.lastName}`;
  };
  const ours = [...chronicle.matches.values()].filter((m) => m.homeId === id || m.awayId === id);

  // This season so far: the table's row from the regular-season matches aired (as the side panel's TABLE works it out:
  // the chronicle's own table only changes once a round is over), the run they're on, how far in the playoffs.
  const entry = chronicle.season(now);
  const regular = [...chronicle.matches.values()].filter((m) => m.season === now && m.stage === 'regular');
  const table = regular.length ? computeStandings(entry.teamIds, regular.map((m) => ({ homeId: m.homeId, awayId: m.awayId, result: { homeGoals: m.homeGoals, awayGoals: m.awayGoals } })),
    rules, lotsOf(now)) : [];
  const row = table.find((r) => r.teamId === id) ?? null;
  const thisSeason = ours.filter((m) => m.season === now);
  const results = thisSeason.map((m) => fromSide(m, id).outcome);
  let run = { outcome: results[results.length - 1] ?? null, length: 0 };
  for (let i = results.length - 1; i >= 0 && results[i] === run.outcome; i--) run.length++;
  const playoffs = entry.championId === id ? 'champion' : entry.runnerUpId === id ? 'runner_up'
    : entry.seeds.includes(id) ? (thisSeason.some((m) => m.stage === 'final') ? 'final' : thisSeason.some((m) => m.stage === 'semifinal' && m.winnerId !== id) ? 'semifinal' : 'in') : null;

  // The squad on its deals, by position; the rookie (while the rule is in force), the injured and the home-grown (from
  // the team's own region; Tom's note 8, 2026-10-19) marked. Their reserves in the Kindling League too (off the cap).
  const deals = new Map(teamContracts(chronicle, id).map((c) => [c.playerId, c]));
  const rookieRule = rules.roster.rookieStarters > 0;
  /** Out injured now: an injury this season with matches still to miss (the team's matches since it). @param {import('../chronicle/chronicle.js').PlayerRecord} p */
  const injured = (p) => p.injuries.some((inj) => {
    if (inj.season !== now) return false;
    if (inj.seasonEnding) return true;
    const at = thisSeason.findIndex((m) => m.id === inj.matchId);
    return at >= 0 && thisSeason.length - 1 - at < inj.matchesOut;
  });
  /** @param {import('../chronicle/chronicle.js').PlayerRecord} p */
  const member = (p) => {
    const s = p.seasons[now];
    const both = [s?.regular, s?.playoffs].filter((l) => l && l.teamId === id);
    const sum = (/** @type {'appearances' | 'goals' | 'assists' | 'saves' | 'tackles' | 'blocks' | 'conceded'} */ k) => both.reduce((n, l) => n + /** @type {any} */ (l)[k], 0);
    const saves = sum('saves');
    const faced = saves + sum('conceded');
    const earlier = Object.keys(p.seasons).some((x) => Number(x) < now);
    return {
      id: p.id, name: nameOf(p.id), position: p.position, age: now - p.birthSeason,
      games: sum('appearances'), stat: p.position === 'K' ? saves : sum('goals'),
      // This season's numbers for SQUAD's STATS (Task 278n): goals, assists and stops (tackles and blocks) for
      // outfielders, saves and the save percentage for keepers.
      goals: sum('goals'), assists: sum('assists'), stops: sum('tackles') + sum('blocks'), saves, savePct: faced > 0 ? saves / faced : null,
      wage: deals.get(p.id)?.wage ?? p.contract?.wage ?? null, until: deals.get(p.id)?.until ?? p.contract?.until ?? null,
      rookie: rookieRule && p.joined?.how === 'draft' && !earlier,
      homeGrown: p.region === team.region,
      injured: injured(p),
    };
  };
  /** @param {ReturnType<typeof member>} a @param {ReturnType<typeof member>} b */
  const byPosition = (a, b) => POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || (b.wage ?? 0) - (a.wage ?? 0) || a.name.localeCompare(b.name);
  const squad = players.filter((p) => p.status === 'roster' && p.teamId === id).map(member).sort(byPosition);
  const reserves = players.filter((p) => p.status === 'reserves' && p.teamId === id).map(member).sort(byPosition);

  // The last off-season (the one before the season shown): who came, who went.
  const off = now - 1;
  const moves = { season: off, drafted: /** @type {{ id: string, name: string, round: number, pick: number }[]} */ ([]), signed: /** @type {{ id: string, name: string, fromId: string | null, wage: number, until: number }[]} */ ([]), left: /** @type {{ id: string, name: string, toId: string | null, how: string }[]} */ ([]) };
  if (off >= 1) {
    for (const p of players) {
      const d = p.moves.find((m) => m.type === 'draft' && m.season === off && m.teamId === id);
      if (d) moves.drafted.push({ id: p.id, name: nameOf(p.id), round: /** @type {number} */ (d.round), pick: /** @type {number} */ (d.pick) });
      // Left: played for them last season and isn't with them now (the reserves are still theirs).
      if (p.seasons[off]?.teamId === id && p.teamId !== id) {
        moves.left.push({ id: p.id, name: nameOf(p.id), toId: p.teamId, how: p.status === 'retired' ? 'retired' : p.teamId ? 'signed' : 'free' });
      }
    }
    for (const d of chronicle.season(off).deals) {
      if (d.teamId === id && d.kind === 'free_agent') moves.signed.push({ id: d.playerId, name: nameOf(d.playerId), fromId: d.fromId, wage: d.wage, until: d.until });
    }
    moves.drafted.sort((a, b) => a.round - b.round || a.pick - b.pick);
    moves.signed.sort((a, b) => b.wage - a.wage);
  }

  // History: a row a finished season, newest first.
  const history = Object.entries(rec?.seasons ?? {}).map(([s, ts]) => ({
    season: Number(s), position: ts.position, points: ts.row.points, won: ts.row.won, drawn: ts.row.drawn, lost: ts.row.lost,
    playoffs: ts.playoffs, pennant: rec?.pennants.includes(Number(s)) ?? false,
  })).sort((a, b) => b.season - a.season);

  // The club's records: its best players for the club (the playoffs included), its best season, biggest win, runs.
  /** @type {Record<string, Map<string, number>>} */
  const forClub = { goals: new Map(), assists: new Map(), saves: new Map(), appearances: new Map() };
  for (const p of players) {
    for (const s of Object.values(p.seasons)) {
      for (const l of [s.regular, s.playoffs]) {
        if (!l || l.teamId !== id) continue;
        for (const [k, m] of Object.entries(forClub)) m.set(p.id, (m.get(p.id) ?? 0) + /** @type {any} */ (l)[k]);
      }
    }
  }
  const best = (/** @type {Map<string, number>} */ m) => {
    const [pid, value] = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
    return pid && value ? { playerId: pid, name: nameOf(pid), value } : null;
  };
  const bestSeason = history.slice().sort((a, b) => b.points - a.points || a.season - b.season)[0] ?? null;
  const wins = ours.map((m) => ({ m, s: fromSide(m, id) })).filter(({ s }) => s.for > s.against)
    .sort((a, b) => (b.s.for - b.s.against) - (a.s.for - a.s.against) || b.s.for - a.s.for || a.m.season - b.m.season)[0];
  /** Their longest run within a season, the playoffs included. @param {(o: string) => boolean} keep */
  const longest = (keep) => {
    let bestRun = { length: 0, season: 0 };
    let cur = 0;
    let season = 0;
    for (const m of ours) {
      if (m.season !== season) { cur = 0; season = m.season; }
      cur = keep(fromSide(m, id).outcome) ? cur + 1 : 0;
      if (cur > bestRun.length) bestRun = { length: cur, season };
    }
    return bestRun.length ? bestRun : null;
  };
  const records = {
    goals: best(forClub.goals), assists: best(forClub.assists), saves: best(forClub.saves), games: best(forClub.appearances),
    bestSeason: bestSeason && { season: bestSeason.season, points: bestSeason.points },
    biggestWin: wins ? { season: wins.m.season, for: wins.s.for, against: wins.s.against, opponentId: wins.s.opponentId } : null,
    winningRun: longest((o) => o === 'W'),
    unbeatenRun: longest((o) => o !== 'L'),
  };

  // Head-to-heads: against every other team, all-time, the playoffs included.
  const headToHead = (entry.teamIds.length ? entry.teamIds : [...chronicle.teams.keys()]).filter((o) => o !== id).map((o) => {
    const h = { opponentId: o, won: 0, drawn: 0, lost: 0, for: 0, against: 0 };
    for (const m of ours) {
      if (m.homeId !== o && m.awayId !== o) continue;
      const s = fromSide(m, id);
      h[s.outcome === 'W' ? 'won' : s.outcome === 'L' ? 'lost' : 'drawn']++;
      h.for += s.for;
      h.against += s.against;
    }
    return h;
  }).sort((a, b) => (b.won - b.lost) - (a.won - a.lost) || a.opponentId.localeCompare(b.opponentId));

  return {
    id, name: team.name, shortName: team.shortName, abbr: team.abbr, city: team.city, region: regions[team.region] ?? team.region, blurb: team.blurb,
    // The home ground (Tom's note 14), from the data.
    ground: groundName(config, id),
    cups: rec?.cups ?? [], pennants: rec?.pennants ?? [],
    season: { season: now, row, run: run.outcome ? run : null, playoffs, played: thisSeason.length },
    squad, reserves,
    payroll: [...deals.values()].reduce((n, c) => n + c.wage, 0), cap: rules.finances.cap,
    moves, history, records, headToHead,
  };
}
