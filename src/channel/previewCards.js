// The PLAYOFF PREVIEW show's cards (the big matches promoted, Tom 2026-10-17; docs/channel.md §30.1; mock-ups on
// preview.html, Tom's picks): the opening, THE TABLE'S STORY, BY THE NUMBERS, and a TALE OF THE TAPE and PLAYERS TO
// WATCH per semifinal. Pure and DOM-free, from what has happened on screen (onScreen.js, the chronicle as aired).
// FINALS PREVIEW's (Tom, 2026-10-18; finalspreview.html, Tom's picks): its opening, THE ROAD TO THE FINAL, and a TALE OF
// THE TAPE and PLAYERS TO WATCH for the final, each with its semifinal.
import { seasonStory } from '../chronicle/notable.js';
import { winnerOf } from '../sim/potm.js';
import { isFinished, seasonTotalsAt, tableAt } from './onScreen.js';

/**
 * @typedef {import('./liveLeague.js').LiveLeague} LiveLeague
 * @typedef {import('./liveLeague.js').LiveMatch} LiveMatch
 * @typedef {{ timelineOf: (m: LiveMatch) => import('./timeline.js').Timeline, playerName: (id: string) => string }} Ctx
 */

/** 1st, 2nd, 3rd, 4th. @param {number} n */
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

/**
 * What the show knows at `t`: the season, its regular matches finished on screen, the table, the players' totals and
 * the semifinals (1st v 4th, 2nd v 3rd by the table on screen).
 * @param {LiveLeague} live @param {number} t @param {Ctx} ctx
 */
function known(live, t, ctx) {
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const season = live.calendar.seasonAt(t);
  const regular = live.matchesIn(season).filter((m) => m.stage === 'regular' && isFinished(m, t, durationOf)).sort((a, b) => a.kickoff - b.kickoff);
  const table = tableAt(live, season, t, durationOf);
  const players = Object.values(seasonTotalsAt(live, season, t, durationOf));
  const semis = [[table[0]?.teamId, table[3]?.teamId], [table[1]?.teamId, table[2]?.teamId]];
  const slots = live.calendar.slots(season).filter((s) => s.stage === 'semifinal');
  return { season, regular, table, players, semis, slots, durationOf };
}

/**
 * A preview card (studio card names preview_open, table_story, season_numbers, tape_1, tape_2, watch_1, watch_2), or
 * null for another name.
 * @param {string} card @param {LiveLeague} live @param {number} t @param {Ctx} ctx
 */
export function previewCard(card, live, t, ctx) {
  const k = known(live, t, ctx);
  const abbr = (/** @type {string} */ id) => live.league.teams[id].abbr;
  const meetings = (/** @type {string} */ a, /** @type {string} */ b) => k.regular
    .filter((m) => [m.homeId, m.awayId].includes(a) && [m.homeId, m.awayId].includes(b))
    .map((m) => `${abbr(m.homeId)} ${m.summary.result.homeGoals}-${m.summary.result.awayGoals} ${abbr(m.awayId)}`);
  const pair = (/** @type {number} */ i) => /** @type {[string, string]} */ (k.semis[i]);

  if (card === 'preview_open') {
    return {
      kind: /** @type {const} */ ('preview_open'), season: k.season,
      semis: k.semis.map(([h, a], i) => ({ label: `SEMIFINAL ${i + 1}`, homeId: /** @type {string} */ (h), awayId: /** @type {string} */ (a), kickoff: k.slots[i]?.kickoff ?? 0 })),
    };
  }

  if (card === 'table_story') {
    // Where each team stood after each round: the table on screen just before the next round's first kick-off.
    const rounds = [...new Set(k.regular.map((m) => /** @type {number} */ (m.round)))].sort((a, b) => a - b);
    const places = rounds.map((r) => {
      const next = k.regular.find((m) => /** @type {number} */ (m.round) > r);
      return Object.fromEntries(tableAt(live, k.season, next ? next.kickoff - 1 : t, k.durationOf).map((row) => [row.teamId, row.position]));
    });
    return {
      kind: /** @type {const} */ ('table_story'), season: k.season, cut: live.config.rules.playoffs.teams,
      rows: k.table.map((r) => ({ teamId: r.teamId, points: r.points, places: places.map((p) => p[r.teamId]) })),
    };
  }

  if (card === 'season_numbers') return { kind: /** @type {const} */ ('season_numbers'), season: k.season, tiles: numberTiles(live, k, ctx) };

  const tape = /^tape_([12])$/.exec(card);
  if (tape) {
    const [h, a] = pair(Number(tape[1]) - 1);
    if (!h || !a) return null;
    return { kind: /** @type {const} */ ('tape'), label: `SEMIFINAL ${tape[1]}`, home: { ...tapeSide(k, h), semi: /** @type {string | null} */ (null) }, away: { ...tapeSide(k, a), semi: /** @type {string | null} */ (null) }, meetings: meetings(h, a) };
  }

  const watch = /^watch_([12])$/.exec(card);
  if (watch) {
    const [h, a] = pair(Number(watch[1]) - 1);
    if (!h || !a) return null;
    return { kind: /** @type {const} */ ('watch'), label: `SEMIFINAL ${watch[1]}`, home: watchSide(k, h, ctx, null), away: watchSide(k, a, ctx, null) };
  }
  return finalsCard(card, live, t, ctx, k);
}

/**
 * A side in a TALE OF THE TAPE: its regular season's numbers.
 * @param {ReturnType<typeof known>} k @param {string} id
 */
function tapeSide(k, id) {
  const r = /** @type {import('../sim/standings.js').TableRow} */ (k.table.find((x) => x.teamId === id));
  const mine = k.players.filter((p) => p.teamId === id);
  const rec = { home: [0, 0, 0], away: [0, 0, 0] };
  for (const m of k.regular) {
    if (m.homeId !== id && m.awayId !== id) continue;
    const res = m.summary.result;
    const [f, g] = m.homeId === id ? [res.homeGoals, res.awayGoals] : [res.awayGoals, res.homeGoals];
    rec[m.homeId === id ? 'home' : 'away'][f > g ? 0 : f === g ? 1 : 2]++;
  }
  const sum = (/** @type {'scorchers' | 'saves'} */ s) => mine.reduce((n, p) => n + p[s], 0);
  return { teamId: id, position: r.position, points: r.points, record: `${r.won}-${r.drawn}-${r.lost}`, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst, scorchers: sum('scorchers'), saves: sum('saves'), home: rec.home.join('-'), away: rec.away.join('-') };
}

/**
 * A side in PLAYERS TO WATCH: its regular season's top scorer and keeper, and (the final's) what each did in the playoffs.
 * @param {ReturnType<typeof known>} k @param {string} id @param {Ctx} ctx
 * @param {import('../sim/standings.js').SeasonPlayerStats[] | null} playoffs  The playoffs' totals, for the final's.
 */
function watchSide(k, id, ctx, playoffs) {
  const mine = k.players.filter((p) => p.teamId === id);
  const scorer = [...mine].sort((x, y) => y.goals - x.goals || y.scorchers - x.scorchers)[0];
  const keeper = [...mine].sort((x, y) => y.saves - x.saves)[0];
  const po = (/** @type {string} */ pid) => (playoffs ? playoffs.find((x) => x.playerId === pid) ?? null : null);
  return {
    teamId: id,
    scorer: scorer ? { playerId: scorer.playerId, name: ctx.playerName(scorer.playerId), goals: scorer.goals, scorchers: scorer.scorchers, semi: playoffs ? po(scorer.playerId)?.goals ?? 0 : null } : null,
    keeper: keeper ? { playerId: keeper.playerId, name: ctx.playerName(keeper.playerId), saves: keeper.saves, pct: Math.round((100 * keeper.saves) / Math.max(1, keeper.saves + keeper.conceded)), semi: playoffs ? po(keeper.playerId)?.saves ?? 0 : null } : null,
  };
}

/**
 * FINALS PREVIEW's cards (finals_open, road, tape_final, watch_final), once both semifinals have finished on screen and
 * until the final kicks off; null otherwise.
 * @param {string} card @param {LiveLeague} live @param {number} t @param {Ctx} ctx @param {ReturnType<typeof known>} k
 */
function finalsCard(card, live, t, ctx, k) {
  if (!/^(finals_open|road|tape_final|watch_final)$/.test(card)) return null;
  const semis = live.matchesIn(k.season).filter((m) => m.stage === 'semifinal' && isFinished(m, t, k.durationOf)).sort((a, b) => a.slot - b.slot);
  const finalSlot = live.calendar.slots(k.season).find((x) => x.stage === 'final');
  if (semis.length < 2 || !finalSlot || t >= finalSlot.kickoff) return null;
  const abbr = (/** @type {string} */ id) => live.league.teams[id].abbr;
  const place = (/** @type {string} */ id) => k.table.find((r) => r.teamId === id)?.position ?? 99;
  // The finalists, the better seed at home (as the sim has it).
  const [h, a] = /** @type {string[]} */ (semis.map((m) => winnerOf(m))).sort((x, y) => place(x) - place(y));
  /** A semifinal as it finished: its seeds, its score, how it was won. @param {LiveMatch} m @param {number} i */
  const semi = (m, i) => {
    const r = m.summary.result;
    return { label: `SEMIFINAL ${i + 1}`, homeId: m.homeId, awayId: m.awayId, homePlace: place(m.homeId), awayPlace: place(m.awayId), homeGoals: r.homeGoals, awayGoals: r.awayGoals, decidedBy: r.decidedBy, shootout: r.shootout ?? null, winnerId: /** @type {string} */ (winnerOf(m)) };
  };
  /** A finalist's semifinal from its side: "3-2 v LIS". @param {string} id */
  const semiLine = (id) => {
    const m = /** @type {LiveMatch} */ (semis.find((x) => x.homeId === id || x.awayId === id));
    const r = m.summary.result;
    const [f, g] = m.homeId === id ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
    return `${f}-${g} v ${abbr(m.homeId === id ? m.awayId : m.homeId)}`;
  };
  if (card === 'finals_open') return { kind: /** @type {const} */ ('finals_open'), season: k.season, homeId: h, awayId: a, kickoff: finalSlot.kickoff };
  if (card === 'road') return { kind: /** @type {const} */ ('road'), season: k.season, semis: semis.map(semi), homeId: h, awayId: a, kickoff: finalSlot.kickoff };
  if (card === 'tape_final') {
    const meetings = k.regular.filter((m) => [m.homeId, m.awayId].includes(h) && [m.homeId, m.awayId].includes(a))
      .map((m) => `${abbr(m.homeId)} ${m.summary.result.homeGoals}-${m.summary.result.awayGoals} ${abbr(m.awayId)}`);
    return { kind: /** @type {const} */ ('tape'), label: 'THE FINAL', home: { ...tapeSide(k, h), semi: /** @type {string | null} */ (semiLine(h)) }, away: { ...tapeSide(k, a), semi: /** @type {string | null} */ (semiLine(a)) }, meetings };
  }
  const playoffs = Object.values(seasonTotalsAt(live, k.season, t, k.durationOf, 'playoffs'));
  return { kind: /** @type {const} */ ('watch'), label: 'THE FINAL', home: watchSide(k, h, ctx, playoffs), away: watchSide(k, a, ctx, playoffs) };
}

/**
 * BY THE NUMBERS' tiles (Tom: always settings.preview.numberTiles, filled from what the season had): a big number, what
 * it was and who, in order of interest, each kind once, until there are enough.
 * @param {LiveLeague} live @param {ReturnType<typeof known>} k @param {Ctx} ctx
 * @returns {{ n: string, what: string, who: string }[]}
 */
function numberTiles(live, k, ctx) {
  const team = (/** @type {string} */ id) => live.league.teams[id].shortName;
  const name = ctx.playerName;
  /** @type {{ n: string, what: string, who: string }[]} */
  const out = [];
  const add = (/** @type {number | string} */ n, /** @type {string} */ what, /** @type {string} */ who) => out.push({ n: String(n), what, who });
  const top = (/** @type {'goals' | 'assists' | 'scorchers' | 'saves' | 'tackles'} */ s) => [...k.players].sort((a, b) => b[s] - a[s])[0];
  const story = seasonStory(live.chronicle, live.config.chronicle, k.season);
  const scorer = top('goals');
  if (scorer?.goals) add(scorer.goals, 'GOALS, THE MOST', name(scorer.playerId));
  if (k.table[0]) add(k.table[0].points, 'POINTS, THE PENNANT', team(k.table[0].teamId));
  for (const r of story.filter((x) => x.kind === 'record').slice(0, 2)) add(/** @type {number} */ (r.value), `${String(r.stat).toUpperCase()}, A RECORD`, name(/** @type {string} */ (r.playerId)));
  const runs = story.filter((x) => x.kind === 'run');
  const won = runs.filter((x) => x.stat === 'won').sort((a, b) => /** @type {number} */ (b.value) - /** @type {number} */ (a.value))[0];
  if (won) add(/** @type {number} */ (won.value), 'WINS IN A ROW', team(/** @type {string} */ (won.teamId)));
  const perf = story.filter((x) => x.kind === 'performance' && x.stat === 'goals').sort((a, b) => /** @type {number} */ (b.value) - /** @type {number} */ (a.value))[0];
  if (perf) add(/** @type {number} */ (perf.value), 'GOALS IN A GAME', name(/** @type {string} */ (perf.playerId)));
  const sc = top('scorchers');
  if (sc?.scorchers) add(sc.scorchers, 'SCORCHERS, THE MOST', name(sc.playerId));
  const sv = top('saves');
  if (sv?.saves) add(sv.saves, 'SAVES, THE MOST', name(sv.playerId));
  const as = top('assists');
  if (as?.assists) add(as.assists, 'ASSISTS, THE MOST', name(as.playerId));
  // The biggest win and the most goals in a match.
  const res = (/** @type {LiveMatch} */ m) => m.summary.result;
  const big = [...k.regular].sort((a, b) => Math.abs(res(b).homeGoals - res(b).awayGoals) - Math.abs(res(a).homeGoals - res(a).awayGoals))[0];
  if (big) {
    const r = res(big);
    const [w, l] = r.homeGoals >= r.awayGoals ? [big.homeId, big.awayId] : [big.awayId, big.homeId];
    add(`${Math.max(r.homeGoals, r.awayGoals)}-${Math.min(r.homeGoals, r.awayGoals)}`, 'THE BIGGEST WIN', `${team(w)} v ${live.league.teams[l].abbr}`);
  }
  const most = [...k.regular].sort((a, b) => res(b).homeGoals + res(b).awayGoals - res(a).homeGoals - res(a).awayGoals)[0];
  if (most) add(res(most).homeGoals + res(most).awayGoals, 'GOALS IN ONE MATCH', `${live.league.teams[most.homeId].abbr} ${res(most).homeGoals}-${res(most).awayGoals} ${live.league.teams[most.awayId].abbr}`);
  const winless = runs.filter((x) => x.stat === 'winless').sort((a, b) => /** @type {number} */ (b.value) - /** @type {number} */ (a.value))[0];
  if (winless) add(/** @type {number} */ (winless.value), 'GAMES WITHOUT A WIN', team(/** @type {string} */ (winless.teamId)));
  const tk = top('tackles');
  if (tk?.tackles) add(tk.tackles, 'TACKLES, THE MOST', name(tk.playerId));
  const goals = k.regular.reduce((n, m) => n + res(m).homeGoals + res(m).awayGoals, 0);
  add(goals, 'GOALS IN ALL', `${k.regular.length} MATCHES, ${(goals / Math.max(1, k.regular.length)).toFixed(1)} A MATCH`);
  return out.slice(0, live.config.settings.preview.numberTiles);
}

export { ordinal };
