// The playoff analyst's talk (the big matches promoted, Tom 2026-10-17; docs/channel.md §30.2; data/analyst.json):
// the PLAYOFF PREVIEW show's desk bits, the analyst in the left seat and the host (Ysolde) in hers on the right. THE
// FOUR after THE TABLE'S STORY: the host brings the analyst in, the top seed's case, then a case for each of the other
// three; and before each semifinal's TALE OF THE TAPE: the host introduces it, who's favoured (or too close to call),
// an upset or how their meetings went, who decides it (the top scorer to stop, the keeper if clearly better), a close.
// Each line said only when its fact is true; players and numbers on the graphic, never spoken. Pure and DOM-free.
// FINALS PREVIEW's two (Tom, 2026-10-18; §30.3): after THE ROAD TO THE FINAL, how each finalist got there; before its
// TALE OF THE TAPE, the final as a semifinal's bit has it (the host introducing the final).
import { winnerOf } from '../sim/potm.js';
import { isFinished, seasonTotalsAt, tableAt } from './onScreen.js';
import { sayer, teamsForTalk } from './studio.js';

/**
 * @typedef {import('./liveLeague.js').LiveLeague} LiveLeague
 * @typedef {import('./liveLeague.js').LiveMatch} LiveMatch
 * @typedef {'four' | 'semi1' | 'semi2' | 'road' | 'final'} AnalystBit
 */

/**
 * Who sits where for the analyst's talk, left first: the analyst (in the left seat, Tom), then the host.
 * @param {import('../config.js').Config} config
 * @returns {[{ id: string, name: string, voice?: string, look: any }, any]}
 */
export function analystCast(config) {
  const a = config.analyst;
  const him = a.candidates.find((/** @type {any} */ c) => c.id === a.pick) ?? a.candidates[0];
  const host = config.studio.presenters.find((/** @type {any} */ p) => p.id === a.host) ?? config.studio.presenters[1];
  return [him, host];
}

/**
 * A bit's lines (studio.js `Said`s, each with its seat), or null with nothing to say (no semifinals known yet).
 * @param {AnalystBit} bit @param {LiveLeague} live @param {number} t @param {{ timelineOf: (m: LiveMatch) => import('./timeline.js').Timeline, playerName: (id: string) => string, formatTime: (t: number) => string }} ctx
 * @param {string} seed  Varies the wording (the segment).
 * @returns {import('./studio.js').Said[] | null}
 */
export function analystSaid(bit, live, t, ctx, seed) {
  const { config } = live;
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const season = live.calendar.seasonAt(t);
  const regular = live.matchesIn(season).filter((m) => m.stage === 'regular' && isFinished(m, t, durationOf));
  if (regular.length < live.calendar.regularCount) return null;
  const table = tableAt(live, season, t, durationOf);
  const players = Object.values(seasonTotalsAt(live, season, t, durationOf));
  const teams = live.league.teams;
  const win = config.rules.points.win;
  const fifth = table[4]?.points ?? 0;
  const semis = [[table[0].teamId, table[3].teamId], [table[1].teamId, table[2].teamId]];
  const four = semis.flat();
  const slots = live.calendar.slots(season).filter((s) => s.stage === 'semifinal');

  /** A side's numbers. @param {string} id */
  const side = (id) => {
    const r = /** @type {import('../sim/standings.js').TableRow} */ (table.find((x) => x.teamId === id));
    let homeWins = 0;
    const home = [0, 0, 0];
    for (const m of regular.filter((x) => x.homeId === id)) {
      const res = m.summary.result;
      const k = res.homeGoals > res.awayGoals ? 0 : res.homeGoals === res.awayGoals ? 1 : 2;
      home[k]++;
      if (k === 0) homeWins++;
    }
    const mine = players.filter((p) => p.teamId === id);
    const scorer = [...mine].sort((a, b) => b.goals - a.goals || b.scorchers - a.scorchers)[0];
    const keeper = [...mine].sort((a, b) => b.saves - a.saves)[0];
    return {
      id, name: teams[id].shortName, position: r.position, points: r.points, goalsFor: r.goalsFor, goalsAgainst: r.goalsAgainst,
      form: r.form.join(''), wins5: r.form.filter((f) => f === 'W').length, home: home.join('-'), homeWins,
      scorer: scorer ? { id: scorer.playerId, name: ctx.playerName(scorer.playerId).toUpperCase(), goals: scorer.goals } : null,
      keeper: keeper ? { name: ctx.playerName(keeper.playerId).toUpperCase(), pct: Math.round((100 * keeper.saves) / Math.max(1, keeper.saves + keeper.conceded)) } : null,
    };
  };
  const sides = Object.fromEntries(four.map((id) => [id, side(id)]));
  const leagueTop = [...players].sort((a, b) => b.goals - a.goals)[0];

  const [him] = analystCast(config);
  const { said, say } = sayer(config.analyst.lines, `analyst|${seed}`, teamsForTalk(teams, config.studio.spokenTeam));
  /** Say a kind, its seat from who says it, the analyst's name where the line has it. @param {string} kind @param {Record<string, string | number>} [fill] */
  const line = (kind, fill = {}) => {
    say(kind, fill);
    const l = /** @type {import('./studio.js').Said} */ (said.at(-1));
    l.who = config.analyst.lines[kind].who === 'analyst' ? 0 : 1;
    l.text = l.text.replace(/\{analyst\}/g, him.name);
    if (l.show) l.show = l.show.replace(/\{ANALYST\}/g, him.name.toUpperCase());
  };

  if (bit === 'four') {
    const top = sides[four[0]];
    line('hostIntro', { ANALYST: him.name.toUpperCase() });
    line('analystHello');
    line('caseTop', { team: top.name, points: top.points });
    line('hostRest');
    // Each of the other three: the first case that's true of it (each kind once), else steady by its place.
    /** @type {[string, (s: ReturnType<typeof side>) => boolean, (s: ReturnType<typeof side>) => Record<string, string | number>][]} */
    const cases = [
      ['caseAttack', (s) => four.every((id) => sides[id].goalsFor <= s.goalsFor), (s) => ({ goalsFor: s.goalsFor })],
      ['caseDefence', (s) => four.every((id) => sides[id].goalsAgainst >= s.goalsAgainst), (s) => ({ goalsAgainst: s.goalsAgainst })],
      ['caseHot', (s) => s.wins5 >= 4, (s) => ({ form: s.form })],
      ['caseScraped', (s) => s.position === 4 && s.points - fifth <= win, (s) => ({ gap: s.points - fifth })],
      ['caseCold', (s) => s.wins5 <= 1, (s) => ({ form: s.form })],
      ['caseHome', (s) => four.every((id) => sides[id].homeWins <= s.homeWins), (s) => ({ home: s.home })],
    ];
    const used = new Set();
    for (const id of four.slice(1).sort((a, b) => sides[a].position - sides[b].position)) {
      const s = sides[id];
      const c = cases.find(([kind, holds]) => !used.has(kind) && holds(s));
      if (c) {
        used.add(c[0]);
        line(c[0], { team: s.name, ...c[2](s) });
      } else line('caseSteady', { team: s.name, place: ordinal(s.position), points: s.points });
    }
    return said;
  }

  // FINALS PREVIEW's: the semifinals as they finished, the finalists the better seed first (as the sim has them).
  const done = live.matchesIn(season).filter((m) => m.stage === 'semifinal' && isFinished(m, t, durationOf)).sort((x, y) => x.slot - y.slot);
  const finalists = done.map((m) => /** @type {string} */ (winnerOf(m))).sort((x, y) => sides[x].position - sides[y].position);
  if ((bit === 'road' || bit === 'final') && done.length < 2) return null;
  const finalSlot = live.calendar.slots(season).find((x) => x.stage === 'final');

  if (bit === 'road') {
    line('hostIntro', { ANALYST: him.name.toUpperCase() });
    line('analystHelloFinal');
    // Each finalist's road, the first that's true; a kind said for both deals its other way the second time (Tom).
    finalists.forEach((id, i) => {
      if (i === 1) line('hostOther');
      const m = /** @type {LiveMatch} */ (done.find((x) => x.homeId === id || x.awayId === id));
      const r = m.summary.result;
      const home = m.homeId === id;
      const opp = home ? m.awayId : m.homeId;
      const [f, g] = home ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
      const fill = { team: sides[id].name, score: `${f}-${g}`, opponent: teams[opp].abbr, place: ordinal(sides[id].position), opponentPlace: ordinal(sides[opp].position) };
      if (r.decidedBy === 'shootout' && r.shootout) line('roadShootout', { ...fill, shootout: home ? `${r.shootout.home}-${r.shootout.away}` : `${r.shootout.away}-${r.shootout.home}` });
      else if (r.decidedBy === 'overtime') line('roadGoldenGoal', fill);
      else if (sides[id].position > sides[opp].position) line('roadUpset', fill);
      else if (f - g >= 3) line('roadBig', fill);
      else line('roadNarrow', fill);
    });
    return said;
  }

  const n = bit === 'semi1' ? 1 : 2;
  const [hid, aid] = bit === 'final' ? finalists : semis[n - 1];
  const h = sides[hid];
  const a = sides[aid];
  const met = regular.filter((m) => [m.homeId, m.awayId].includes(h.id) && [m.homeId, m.awayId].includes(a.id)).sort((x, y) => x.kickoff - y.kickoff);
  const wins = (/** @type {string} */ id) => met.filter((m) => {
    const r = m.summary.result;
    return (m.homeId === id ? r.homeGoals - r.awayGoals : r.awayGoals - r.homeGoals) > 0;
  }).length;
  const meetings = met.map((m) => `${teams[m.homeId].abbr} ${m.summary.result.homeGoals}-${m.summary.result.awayGoals} ${teams[m.awayId].abbr}`).join(' · ');
  if (bit === 'final') line('hostFinal', { home: teams[h.id].abbr, away: teams[a.id].abbr, when: finalSlot ? ctx.formatTime(finalSlot.kickoff) : '' });
  else line(`hostSemi${n}`, { home: teams[h.id].abbr, away: teams[a.id].abbr, when: slots[n - 1] ? ctx.formatTime(slots[n - 1].kickoff) : '' });
  // Two lines on the matchup: who's favoured (or too close), then an upset if the lower seed is in better form, or
  // else how their meetings went.
  if (h.points - a.points > win) line('favourite', { team: h.name, points: h.points, otherPoints: a.points });
  else line('tooClose');
  const both = [h, a].find((s) => met.length >= 2 && wins(s.id) === met.length);
  if (a.wins5 > h.wins5) line('upset', { team: a.name, form: a.form });
  else if (both) line('wonBoth', { team: both.name, meetings });
  else if (met.length) line('split', { meetings });
  line('hostWho');
  const topHere = [h, a].find((s) => s.scorer && s.scorer.id === leagueTop?.playerId);
  if (topHere?.scorer) line('topScorer', { team: topHere.name, player: topHere.scorer.name, goals: topHere.scorer.goals });
  else {
    const s = (h.scorer?.goals ?? 0) >= (a.scorer?.goals ?? 0) ? h : a;
    if (s.scorer) line('stopScorer', { team: s.name, player: s.scorer.name, goals: s.scorer.goals });
  }
  const k = [h, a].filter((s) => s.keeper).sort((x, y) => /** @type {any} */ (y.keeper).pct - /** @type {any} */ (x.keeper).pct);
  if (k.length === 2 && /** @type {any} */ (k[0].keeper).pct - /** @type {any} */ (k[1].keeper).pct >= 5) line('keeper', { team: k[0].name, player: /** @type {any} */ (k[0].keeper).name, pct: /** @type {any} */ (k[0].keeper).pct });
  line('analystClose');
  return said;
}

/** "1ST", "2ND". @param {number} n */
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] ?? 'TH'}`;
