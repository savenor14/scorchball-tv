// What the full-time, pre-match and studio cards say. Pure and DOM-free: data in, plain objects out.
// Everything comes from what has happened on screen (onScreen.js). See docs/channel.md §7.
import { podcastPremiere, themesOf } from './podcastTalk.js';
import { restsKeeper, selectLineup } from '../sim/match.js';
import { isRookie } from '../sim/players.js';
import { seasonConfig } from '../sim/rules.js';
import { careerCard } from './careerCard.js';
import { MORE_CARDS, moreCard } from './moreCards.js';
import { movesView } from './offseasonShow.js';
import { previewCard } from './previewCards.js';
import { payrolls } from './money.js';
import { byStakes, isFinished, seasonTotalsAt, stakesOf, tableAt, topScorersAt, upcomingAt } from './onScreen.js';
import { wrapUpAt } from './calendar.js';
import { CARD_STATS, cardStat } from './playerCard.js';
import { fillOf } from './deskFacts.js';
import { factKey, interviewTalk } from './interviewTalk.js';
import { playerOfTheMatch, potmQuote, statLine, quoteChoice, winnerOf as resultWinner } from './potm.js';
import { interviewVoice } from './speech.js';
import { groundName } from './groundsTour.js';
import { vaultCard } from './vault.js';

/**
 * @typedef {import('./liveLeague.js').LiveMatch} LiveMatch
 * @typedef {import('./liveLeague.js').LiveLeague} LiveLeague
 * @typedef {{ timelineOf: (m: LiveMatch) => import('./timeline.js').Timeline, playerName: (id: string) => string }} CardContext
 * @typedef {{ playerId: string, name: string, minute: number, scorcher: boolean, freeShot: boolean }} Scorer
 */

const STAGE_TITLE = /** @type {Record<string, string>} */ ({ semifinal: 'SEMIFINAL', final: 'THE FINAL' });

/**
 * The result card after the final whistle: score, scorers with minutes, and how it was decided.
 * @param {LiveMatch} m @param {CardContext} ctx
 */
export function fullTimeCard(m, ctx) {
  const tl = ctx.timelineOf(m);
  /** @type {Record<string, Scorer[]>} */
  const scorers = { [m.homeId]: [], [m.awayId]: [] };
  for (const { event: e } of tl.events) {
    if (e.type !== 'goal' || !e.teamId || !e.playerId) continue;
    const d = /** @type {any} */ (e.data);
    scorers[e.teamId].push({ playerId: e.playerId, name: ctx.playerName(e.playerId), minute: Math.floor(/** @type {number} */ (e.clock) / 60) + 1, scorcher: d.scorcher, freeShot: d.freeShot });
  }
  const r = m.summary.result;
  const note = r.decidedBy === 'overtime' ? 'Won with a golden goal'
    : r.shootout ? `Won ${Math.max(r.shootout.home, r.shootout.away)}-${Math.min(r.shootout.home, r.shootout.away)} in the shootout`
      : '';
  return {
    kind: /** @type {const} */ ('full_time'),
    title: m.stage === 'regular' ? 'FULL TIME' : `${STAGE_TITLE[m.stage]} · FULL TIME`,
    home: { teamId: m.homeId, goals: r.homeGoals, scorers: scorers[m.homeId] },
    away: { teamId: m.awayId, goals: r.awayGoals, scorers: scorers[m.awayId] },
    note,
  };
}

/**
 * Before kick-off: both teams, their table position and form, and the starting five the sim will pick.
 * @param {import('./programme.js').NextFixture} fixture @param {LiveLeague} live @param {number} t @param {CardContext} ctx
 */
export function preMatchCard(fixture, live, t, ctx) {
  const { league, config } = live;
  const season = live.calendar.seasonAt(fixture.kickoff);
  const table = tableAt(live, season, t, (m) => ctx.timelineOf(m).duration);
  const side = (/** @type {string} */ teamId) => {
    const team = league.teams[teamId];
    const row = table.find((x) => x.teamId === teamId);
    // The season's rules (Task 229b), as the match itself will be played.
    const rulesConfig = seasonConfig(config, fixture.season);
    const { starters, bench, injured } = selectLineup(team, league.players, rulesConfig, { restKeeper: restsKeeper(league, fixture, teamId, rulesConfig.rules), season: fixture.season });
    return {
      teamId,
      name: team.name,
      city: team.city,
      position: row && row.played > 0 ? row.position : null,
      points: row?.points ?? 0,
      form: row?.form ?? [],
      // The rookie (Task 234, Tom's pick A: a gold R chip), while the rookie rule is in force.
      lineup: starters.map((s) => ({ playerId: s.player.id, name: ctx.playerName(s.player.id), slot: s.slot,
        rookie: rulesConfig.rules.roster.rookieStarters > 0 && isRookie(s.player, fixture.season) })),
      bench: bench.map((p) => p.id),
      // In the dugout too, in team tracksuits (Task 185).
      injured,
    };
  };
  return {
    kind: /** @type {const} */ ('pre_match'),
    title: fixture.stage === 'regular' ? 'UP NEXT' : STAGE_TITLE[fixture.stage],
    kickoff: fixture.kickoff,
    // Where (Tom's note 14): the home side's ground and town, "at the Rookery, Wrenhollow".
    venue: `at ${groundName(config, fixture.homeId)}, ${league.teams[fixture.homeId].city}`,
    home: side(fixture.homeId),
    away: side(fixture.awayId),
  };
}

/**
 * Player of the match: who, for whom, their stat line and what they said (potm.js). `from` is when the segment began,
 * so the quote can type out.
 * @param {LiveMatch} m @param {LiveLeague} live @param {number} from
 */
export function potmCard(m, live, from) {
  const { league, config } = live;
  const pick = playerOfTheMatch(m, config.interviews.potm);
  const player = league.players[pick.playerId];
  const team = league.teams[pick.teamId];
  const isKeeper = player?.position === config.positions.keeper;
  const quote = potmQuote(pick, m, config.interviews.quotes, {
    isKeeper,
    teamName: (id) => league.teams[id].shortName,
    city: (id) => league.teams[id].city,
  });
  // The quote's recorded clip (Task 135): its key, and the voice (the player's region, a man's or a woman's).
  const quoteKey = quoteChoice(pick, m, config.interviews.quotes, isKeeper).key;
  // Talk that remembers (Task 247a): with a fact about them or their team that fits the result, a reaction and the
  // fact, each its own clip; otherwise the canned quote.
  const winner = resultWinner(m);
  const outcome = winner === null ? 'draw' : winner === pick.teamId ? 'win' : 'loss';
  const talk = interviewTalk(live.facts.after(m.id), { matchId: m.id, playerId: pick.playerId, teamId: pick.teamId, outcome }, config.interviews);
  const parts = talk ? talk.sentences.map((x) => ({ text: x.say, key: x.key })) : [{ text: quote, key: quoteKey }];
  return {
    kind: /** @type {const} */ ('potm'),
    title: 'PLAYER OF THE MATCH',
    playerId: pick.playerId,
    teamId: pick.teamId,
    name: player ? `${player.firstName} ${player.lastName}` : pick.playerId,
    position: player?.position ?? '',
    stats: statLine(pick.stats),
    // The whole quote as typed, and its parts, each a clip.
    quote: parts.map((p) => p.text).join(' '),
    parts,
    // The fact spoken to, if any, and its strip under the name and stat line (Task 247a, Tom's look A).
    fact: talk?.fact ?? null,
    factStrip: talk ? factStrip(talk.fact, live) : null,
    quoteKey: parts[0].key,
    voice: interviewVoice(player, config.regions.regions),
    from,
    teamName: team.name,
  };
}

/**
 * The interview's fact strip (Task 247a): the fact's words (interviews.strip, by its key) filled as the desk's graphics
 * are, in capitals; null for a fact without words.
 * @param {import('../chronicle/facts.js').Fact} fact @param {LiveLeague} live
 */
export function factStrip(fact, live) {
  const words = live.config.interviews.strip[factKey(fact)];
  if (!words) return null;
  const fill = fillOf(fact, {
    team: (id) => live.league.teams[id]?.shortName ?? id,
    player: (id) => { const p = live.league.players[id]; return p ? `${p.firstName[0]}. ${p.lastName}` : id; },
    surname: (id) => live.league.players[id]?.lastName ?? '',
  });
  return words.replace(/\{(\w+)\}/g, (_, k) => String(fill[k] ?? '')).toUpperCase();
}

/**
 * Before a re-air: which match, and when and where it was played. Never the result.
 * @param {LiveMatch} m @param {{ formatTime: (t: number) => string }} ctx
 */
export function reairCard(m, { formatTime }) {
  return {
    kind: /** @type {const} */ ('reair'),
    title: m.stage === 'regular' ? 'FULL MATCH REPLAY' : `FULL MATCH REPLAY · ${STAGE_TITLE[m.stage]}`,
    homeId: m.homeId,
    awayId: m.awayId,
    note: `Played ${formatTime(m.kickoff)}${m.stage === 'regular' && m.round ? ` · round ${m.round}` : ''}`,
  };
}

/**
 * Before the simultaneous final round: all the fixtures, and what each team is still playing for.
 * @param {import('./programme.js').NextFixture[]} group  In the channel's order (biggest stakes first).
 * @param {LiveLeague} live @param {number} t @param {CardContext} ctx
 */
export function finalDayCard(group, live, t, ctx) {
  const { rules } = live.config;
  const table = tableAt(live, group[0].season, t, (m) => ctx.timelineOf(m).duration);
  const stakes = stakesOf(table, rules.playoffs.teams, rules.points.win);
  const at = (/** @type {string} */ id) => /** @type {import('../sim/standings.js').TableRow} */ (table.find((r) => r.teamId === id));
  const races = (/** @type {string} */ id) => {
    const s = stakes.get(id);
    return [s?.shield ? 'Pennant' : null, s?.playoff ? 'playoffs' : null].filter(Boolean).join(' + ');
  };
  return {
    kind: /** @type {const} */ ('final_day'),
    title: 'FINAL DAY · ALL MATCHES AT ONCE',
    kickoff: group[0].kickoff,
    rows: group.map((f, i) => ({
      number: i + 1,
      home: { teamId: f.homeId, position: at(f.homeId).position, points: at(f.homeId).points, races: races(f.homeId) },
      away: { teamId: f.awayId, position: at(f.awayId).position, points: at(f.awayId).points, races: races(f.awayId) },
    })),
  };
}

/**
 * After the simultaneous final round: all the results, the Pennant and the playoff places.
 * @param {LiveMatch[]} group @param {LiveLeague} live @param {number} t @param {CardContext} ctx
 */
export function finalDayResultsCard(group, live, t, ctx) {
  const table = tableAt(live, group[0].season, t, (m) => ctx.timelineOf(m).duration);
  return {
    kind: /** @type {const} */ ('final_day_results'),
    title: 'FINAL DAY · FULL TIME',
    rows: group.map((m) => ({ homeId: m.homeId, awayId: m.awayId, homeGoals: m.summary.result.homeGoals, awayGoals: m.summary.result.awayGoals })),
    shieldId: table[0].teamId,
    playoffIds: table.slice(0, live.config.rules.playoffs.teams).map((r) => r.teamId),
  };
}

/**
 * The playoff bracket: both semifinals and the final, with results only once they've finished on screen.
 * @param {LiveLeague} live @param {number} t @param {CardContext} ctx
 */
export function bracketCard(live, t, ctx) {
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const season = live.calendar.seasonAt(t);
  const slots = live.calendar.slots(season).slice(live.calendar.regularCount);
  const played = live.matchesIn(season);
  const table = tableAt(live, season, t, durationOf);
  const seeds = table.slice(0, live.config.rules.playoffs.teams).map((r) => r.teamId);
  /** @type {(string | null)[]} */
  const semiWinners = [];
  const rows = slots.map((slot, i) => {
    const m = played.find((x) => x.slot === slot.index) ?? null;
    let homeId = m?.homeId ?? null;
    let awayId = m?.awayId ?? null;
    if (!m && slot.stage === 'semifinal') [homeId, awayId] = i === 0 ? [seeds[0], seeds[3]] : [seeds[1], seeds[2]];
    // The better seed at home, as the sim will have it (season.js nextFixture).
    if (!m && slot.stage === 'final' && semiWinners.length === 2 && semiWinners.every(Boolean)) [homeId, awayId] = /** @type {string[]} */ ([...semiWinners].sort((a, b) => seeds.indexOf(/** @type {string} */ (a)) - seeds.indexOf(/** @type {string} */ (b))));
    const done = m !== null && isFinished(m, t, durationOf);
    if (slot.stage === 'semifinal') semiWinners.push(done && m ? winnerOf(m) : null);
    const r = m?.summary.result;
    return {
      label: slot.stage === 'final' ? 'FINAL' : `SEMI ${i + 1}`,
      kickoff: slot.kickoff,
      homeId: homeId ?? null,
      awayId: awayId ?? null,
      status: done ? 'done' : m ? 'live' : 'upcoming',
      result: done && r ? { homeGoals: r.homeGoals, awayGoals: r.awayGoals, decidedBy: r.decidedBy, shootout: r.shootout, winnerId: winnerOf(/** @type {LiveMatch} */ (m)) } : null,
    };
  });
  return { kind: /** @type {const} */ ('bracket'), title: `PLAYOFFS · SEASON ${season}`, rows };
}

/** When a kick-off is, from `t`'s side: TONIGHT (from 18:00), TODAY, TOMORROW or the weekday. @param {string} timeZone */
export function dayWords(timeZone) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' });
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const day = (/** @type {number} */ x) => Date.parse(`${ymd.format(x)}T00:00:00Z`) / 86_400_000;
  /** @param {number} kickoff @param {number} t */
  return (kickoff, t) => {
    const d = day(kickoff) - day(t);
    const word = d === 0 ? (Number(hour.format(kickoff)) >= 18 ? 'TONIGHT' : 'TODAY') : d === 1 ? 'TOMORROW' : weekday.format(kickoff).toUpperCase();
    return `${word} ${hhmm.format(kickoff)}`;
  };
}

/** "3-2", "4-4 GG", "3-3 (4-2 SO)". @param {{ homeGoals: number, awayGoals: number, decidedBy?: string, shootout?: { home: number, away: number } | null }} r */
const scoreText = (r) => `${r.homeGoals}-${r.awayGoals}${r.decidedBy === 'overtime' ? ' GG' : r.shootout ? ` (${r.shootout.home}-${r.shootout.away} SO)` : ''}`;

/**
 * Which big event the next kick-off is, once nothing is live (the big matches promoted, Tom 2026-10-17): the final
 * round, a semifinal or the final; null otherwise. Shared by the programme's studio blocks (as their first card) and
 * the ticker, so both promote on the same timing.
 * @param {LiveLeague} live @param {number} t @param {(m: LiveMatch) => number} durationOf
 * @returns {'final_round' | 'semifinals' | 'final' | null}
 */
export function promotedAt(live, t, durationOf) {
  const pos = live.calendar.at(t);
  if (!pos.next) return null;
  const slots = live.calendar.slots(pos.season);
  const next = slots[pos.started];
  if (!next) return null;
  if (next.stage === 'semifinal') return 'semifinals';
  if (next.stage === 'final') return 'final';
  // The final round: the regular season's last kick-off, every match at once.
  return slots.filter((s) => s.kickoff === next.kickoff).length > 1 ? 'final_round' : null;
}

/**
 * OFF THE BALL's premiere promoted (Tom, 2026-10-21: like a big match), on the big matches' poster: the name stacked in
 * its column with the day, the time and the countdown; beside it, tonight's three discussions and the pair. Null
 * without a premiere to promote.
 * @param {LiveLeague} live @param {number} t @param {CardContext} ctx
 */
export function podcastPromoCard(live, t, ctx) {
  const slot = podcastPremiere(live, t, { ...ctx, playerName: () => '', formatTime: () => '' });
  if (!slot) return null;
  const when = dayWords(live.config.settings.live.timeZone);
  const pod = live.config.podcast;
  const titles = themesOf(live, slot).map((d) => pod.discussions[d.discussion].title);
  return {
    kind: /** @type {const} */ ('promo'), event: /** @type {const} */ ('podcast'), words: String(pod.show).split(' '), kickoff: slot.at, when: when(slot.at, t),
    rows: /** @type {any[]} */ ([]), face: null, lines: ['TONIGHT', ...titles], hot: `${pod.pair.tamsin.name.toUpperCase()} & ${pod.pair.samir.name.toUpperCase()}`,
  };
}

/**
 * The promo card (the big matches promoted, Tom's pick C, the poster; bigmatches.html): the final round, the
 * semifinals or the final, the matches as known on screen at `t` (places, what's at stake, this season's meetings, the
 * first semifinal's result once in, a player to watch a side) and the next kick-off for the countdown.
 * @param {LiveLeague} live @param {number} t @param {CardContext & { formatTime?: (t: number) => string }} ctx
 */
export function promoCard(live, t, ctx) {
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const event = promotedAt(live, t, durationOf);
  if (!event) return null;
  const season = live.calendar.seasonAt(t);
  const when = dayWords(live.config.settings.live.timeZone);
  const table = tableAt(live, season, t, durationOf);
  const place = (/** @type {string} */ id) => {
    const r = /** @type {import('../sim/standings.js').TableRow} */ (table.find((x) => x.teamId === id));
    return { position: r.position, points: r.points };
  };
  const abbr = (/** @type {string} */ id) => live.league.teams[id].abbr;
  // This season's regular meetings finished on screen, oldest first: "BGA 3-2 LIS".
  const meetings = (/** @type {string} */ a, /** @type {string} */ b) => {
    const list = live.matchesIn(season)
      .filter((m) => m.stage === 'regular' && isFinished(m, t, durationOf) && [m.homeId, m.awayId].includes(a) && [m.homeId, m.awayId].includes(b))
      .sort((x, y) => x.kickoff - y.kickoff)
      .map((m) => `${abbr(m.homeId)} ${m.summary.result.homeGoals}-${m.summary.result.awayGoals} ${abbr(m.awayId)}`);
    return list.length ? `THIS SEASON: ${list.join(' · ')}` : "THEY HAVEN'T MET THIS SEASON";
  };
  const scorers = topScorersAt(live, season, t, durationOf, 1000);
  const watch = (/** @type {string[]} */ ids) => {
    const names = ids.map((id) => scorers.find((s) => s.teamId === id && s.goals > 0)).filter((s) => s !== undefined)
      .map((s) => `${ctx.playerName(s.playerId)} (${s.goals})`);
    return names.length ? `TO WATCH: ${names.join(' · ')}` : null;
  };
  const upcoming = upcomingAt(live, t, durationOf, 8);

  if (event === 'final_round') {
    const kickoff = upcoming[0].kickoff;
    const group = upcoming.filter((f) => f.kickoff === kickoff).map((f, i) => ({ homeId: /** @type {string} */ (f.homeId), awayId: /** @type {string} */ (f.awayId), slot: i }));
    const { rules } = live.config;
    const stakes = stakesOf(table, rules.playoffs.teams, rules.points.win);
    const racing = (/** @type {'shield' | 'playoff'} */ race) => group.flatMap((m) => [m.homeId, m.awayId]).filter((id) => stakes.get(id)?.[race]).map(abbr);
    const pennant = racing('shield');
    const playoffs = racing('playoff');
    return {
      kind: /** @type {const} */ ('promo'), event, words: ['THE', 'FINAL', 'ROUND'], kickoff, when: when(kickoff, t),
      rows: byStakes(group, stakes, table).map((m) => ({ homeId: m.homeId, awayId: m.awayId, home: place(m.homeId), away: place(m.awayId), result: null })),
      lines: ['ALL FOUR AT ONCE · PRESS 1-4 TO PICK'],
      hot: [pennant.length ? `PENNANT ${pennant.join(', ')}` : '', playoffs.length ? `PLAYOFFS ${playoffs.join(', ')}` : ''].filter(Boolean).join(' · ') || null,
      face: null,
    };
  }

  const bracket = bracketCard(live, t, ctx);
  if (event === 'semifinals') {
    const semis = bracket.rows.filter((r) => r.label.startsWith('SEMI') && r.homeId && r.awayId);
    const next = semis.find((r) => !r.result) ?? semis[0];
    return {
      kind: /** @type {const} */ ('promo'), event, words: ['THE', 'SEMI', 'FINALS'], kickoff: next.kickoff, when: when(next.kickoff, t),
      rows: semis.map((r) => {
        const [h, a] = /** @type {[string, string]} */ ([r.homeId, r.awayId]);
        const label = r.label.replace('SEMI', 'SEMIFINAL');
        return {
          homeId: h, awayId: a, home: place(h), away: place(a),
          result: r.result ? { text: scoreText(r.result), winnerId: r.result.winnerId } : null,
          sub: r.result ? `${label} · ${live.league.teams[r.result.winnerId].shortName.toUpperCase()} THROUGH TO THE FINAL` : `${label} · ${when(r.kickoff, t)} · ${meetings(h, a)}`,
          watch: r.result ? null : watch([h, a]),
        };
      }),
      lines: [], hot: null, face: null,
    };
  }

  const final = /** @type {(typeof bracket.rows)[number]} */ (bracket.rows.find((r) => r.label === 'FINAL'));
  const [h, a] = /** @type {[string, string]} */ ([final.homeId, final.awayId]);
  const semis = bracket.rows.filter((r) => r.result).map((r) => {
    const res = /** @type {NonNullable<typeof r.result>} */ (r.result);
    return `${abbr(res.winnerId)} BEAT ${abbr(res.winnerId === r.homeId ? /** @type {string} */ (r.awayId) : /** @type {string} */ (r.homeId))} ${scoreText(res)}`;
  });
  return {
    kind: /** @type {const} */ ('promo'), event, words: ['THE', 'FINAL'], kickoff: final.kickoff, when: when(final.kickoff, t),
    rows: [], face: { homeId: h, awayId: a, home: place(h), away: place(a) },
    lines: [meetings(h, a), `SEMIS: ${semis.join(' · ')}`],
    hot: watch([h, a]),
  };
}

/** @param {LiveMatch} m */
function winnerOf(m) {
  const r = m.summary.result;
  if (r.shootout) return r.shootout.home > r.shootout.away ? m.homeId : m.awayId;
  return r.homeGoals > r.awayGoals ? m.homeId : m.awayId;
}

/**
 * The champions, after the final.
 * @param {LiveMatch} final @param {LiveLeague} live @param {number} t @param {CardContext} ctx
 */
export function championCard(final, live, t, ctx) {
  const championId = winnerOf(final);
  const runnerUpId = championId === final.homeId ? final.awayId : final.homeId;
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const table = tableAt(live, final.season, t, durationOf);
  // The playoffs' top scorer (Task 141, Tom's D); the season's left to the Ember Boot (Task 206).
  const [playoffScorer] = topScorersAt(live, final.season, t, durationOf, 1, 'playoffs');
  const titles = live.league.history.filter((h) => h.season <= final.season && h.championId === championId).length;
  const r = final.summary.result;
  // The score from the champions' side: "5-2", "3-3 (3-2 shootout)".
  const homeWon = championId === final.homeId;
  const [won, lost] = homeWon ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
  const so = r.shootout ? (homeWon ? [r.shootout.home, r.shootout.away] : [r.shootout.away, r.shootout.home]) : null;
  return {
    kind: /** @type {const} */ ('champion'),
    title: `SEASON ${final.season} CHAMPIONS`,
    championId,
    runnerUpId,
    score: `${won}-${lost}${r.decidedBy === 'overtime' ? ' (golden goal)' : so ? ` (${so[0]}-${so[1]} shootout)` : ''}`,
    finalHomeId: final.homeId,
    finalAwayId: final.awayId,
    shieldId: table[0].teamId,
    titles,
    playoffScorer: playoffScorer?.goals ? { name: ctx.playerName(playoffScorer.playerId), teamId: playoffScorer.teamId, goals: playoffScorer.goals } : null,
  };
}

/**
 * Between the final and the new season: a countdown, the defending champion and the opening fixture.
 * @param {LiveLeague} live @param {number} t
 */
export function newSeasonCard(live, t) {
  const pos = live.calendar.at(t);
  const season = pos.season + 1;
  const kickoff = live.calendar.slots(season)[0].kickoff;
  const champion = live.league.history.find((h) => h.season === pos.season)?.championId ?? null;
  const opener = live.state.season === season ? live.state.schedule[0].matches[0] : null;
  return {
    kind: /** @type {const} */ ('new_season'),
    title: `SEASON ${season}`,
    kickoff,
    championId: champion,
    opener: opener ? { homeId: opener.homeId, awayId: opener.awayId } : null,
  };
}

/**
 * A stand-in card for a part of the programme whose visuals aren't built yet (Task 95: ads, the opening).
 * @param {string} title @param {string} note
 */
export function placeholderCard(title, note) {
  return { kind: /** @type {const} */ ('placeholder'), title, note };
}

/** @param {string} card @returns {card is typeof MORE_CARDS[number]} */
const isMoreCard = (card) => /** @type {readonly string[]} */ (MORE_CARDS).includes(card);

/**
 * Whether a studio card has something to say at `at`, so the deck deals it (programme.js; Tom's note 11: an empty card
 * is skipped, not shown thin). Only what `at` fixes counts (what's on screen by then, past seasons, the sim's events),
 * so every screen deals the same. THE PLAYOFF RACE once no team has more than segments.raceFromGamesLeft games left
 * (Task 278n: Friday on today's calendar); head-to-head only with a next match whose sides are known.
 * @param {string} card @param {LiveLeague} live @param {number} at @param {CardContext} ctx
 */
export function cardShows(card, live, at, ctx) {
  const t = wrapUpAt(live.calendar, at);
  if (isMoreCard(card)) return moreCard(card, live, t, ctx) !== null;
  const c = /** @type {any} */ (studioCard(card, live, at, 0, ctx));
  if (card === 'race') {
    const games = (c.rows.length - 1) * 2;
    return c.rows.every((/** @type {any} */ r) => r.left <= live.config.settings.segments.raceFromGamesLeft) && c.rows.some((/** @type {any} */ r) => r.left < games);
  }
  if (card === 'head_to_head') return c.kind === 'head_to_head' && c.fixture !== null;
  if (card === 'form') return c.rows.some((/** @type {any} */ r) => r.form.length > 0);
  if (Array.isArray(c.rows)) return c.rows.length > 0;
  return true;
}

/**
 * A studio card.
 * @param {string} card  One of settings.segments.studioCards.
 * @param {LiveLeague} live @param {number} at @param {number} rotation  Which studio rotation this is (for the spotlight).
 * @param {CardContext} ctx
 */
export function studioCard(card, live, at, rotation, ctx) {
  // After midnight, until the new season's first kick-off, still about the season just finished (Task 277b).
  const t = wrapUpAt(live.calendar, at);
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const season = live.calendar.seasonAt(t);
  if (card === 'bracket') return bracketCard(live, t, ctx);
  // The big matches promoted: past its event (a dev jump, say), the latest results in its place.
  if (card === 'promo') return promoCard(live, at, ctx) ?? studioCard('results', live, at, rotation, ctx);
  if (card === 'podcast_promo') return podcastPromoCard(live, at, ctx) ?? studioCard('results', live, at, rotation, ctx);
  // The PLAYOFF PREVIEW and FINALS PREVIEW shows' cards (previewCards.js); past their night (a dev jump), the latest results.
  if (/^(preview_open|table_story|season_numbers|tape_[12]|watch_[12]|finals_open|road|tape_final|watch_final)$/.test(card)) return previewCard(card, live, at, ctx) ?? studioCard('results', live, at, rotation, ctx);
  // FROM THE VAULT's (Tom's note 14; vault.js); with no story (a dev jump), the latest results.
  if (card === 'vault_open' || card === 'vault_since') return vaultCard(card, live, at, ctx) ?? studioCard('results', live, at, rotation, ctx);
  if (card === 'new_season') return newSeasonCard(live, t);
  // The eleven from Tom's note 11 (moreCards.js); one with nothing to say (the deck skips it), the latest results.
  if (isMoreCard(card)) return moreCard(card, live, t, ctx) ?? studioCard('results', live, at, rotation, ctx);
  if (card === 'results') {
    // The latest result's season only (Task 277b, Tom: a new season's first matches never beside last season's).
    const finished = [...live.matches.values()].filter((m) => isFinished(m, t, durationOf))
      .sort((a, b) => a.kickoff - b.kickoff || a.slot - b.slot);
    const latest = finished.at(-1)?.season;
    const done = finished.filter((m) => m.season === latest).slice(-6).reverse();
    return {
      kind: /** @type {const} */ ('results'),
      title: 'LATEST RESULTS',
      rows: done.map((m) => ({ homeId: m.homeId, awayId: m.awayId, homeGoals: m.summary.result.homeGoals, awayGoals: m.summary.result.awayGoals, decidedBy: m.summary.result.decidedBy })),
    };
  }
  if (card === 'upcoming') {
    return { kind: /** @type {const} */ ('upcoming'), title: 'COMING UP', rows: upcomingAt(live, t, durationOf, 4) };
  }
  if (card === 'scorers' || card === 'playoff_scorers') {
    // The season's (regular season) or the playoffs' (Task 141), drawn alike.
    const playoffs = card === 'playoff_scorers';
    return {
      kind: /** @type {const} */ ('scorers'),
      title: `${playoffs ? 'PLAYOFF' : 'TOP'} SCORERS · SEASON ${season}`,
      rows: topScorersAt(live, season, t, durationOf, 5, playoffs ? 'playoffs' : 'regular').filter((s) => s.goals > 0)
        .map((s) => ({ playerId: s.playerId, name: ctx.playerName(s.playerId), teamId: s.teamId, goals: s.goals, scorchers: s.scorchers })),
    };
  }
  // The desk's career card (Task 226, Tom's pick A): one player's career in big totals, its focus cycling with the
  // rotation (a star from the next match's teams, a milestone in sight). Nobody fits (a young league): the leaders.
  if (card === 'career') {
    const next = upcomingAt(live, t, durationOf, 1)[0];
    const c = careerCard(live.chronicle, live.config, rotation, { teamIds: /** @type {string[]} */ ([next?.homeId, next?.awayId].filter(Boolean)) });
    if (!c) return studioCard('assists', live, t, rotation, ctx);
    const p = c.player;
    return {
      kind: /** @type {const} */ ('career'),
      title: `CAREER · ${c.why.focus === 'star' ? 'ONE TO WATCH' : 'MILESTONE IN SIGHT'}`,
      why: c.why,
      next: c.why.focus === 'star' && next?.homeId && next.awayId ? { homeId: next.homeId, awayId: next.awayId } : null,
      name: p.name, position: p.position, positionName: p.positionName, teamId: /** @type {string} */ (p.teamId ?? p.lastTeamId), age: p.age,
      seasons: p.totals.seasons, games: p.totals.appearances,
      totals: CARD_STATS[p.position].map(([k]) => ({ stat: k, value: cardStat(/** @type {any} */ (p.totals), k) })),
      cups: p.honours.cups.length,
      awards: p.honours.awards.map((a) => ({ award: a.award, times: a.seasons.length })),
      potm: p.totals.potm,
    };
  }
  // Task 102's four new cards.
  // Money (Task 234, Tom's picks): every team's payroll against the cap, and the last off-season's biggest signings, as
  // aired (the chronicle's), in the studio after the final.
  if (card === 'payrolls') {
    return {
      kind: /** @type {const} */ ('payrolls'),
      title: 'PAYROLLS',
      cap: seasonConfig(live.config, season).rules.finances.cap,
      rows: payrolls(live.chronicle, Object.keys(live.league.teams)),
    };
  }
  if (card === 'signings') {
    // After the final (Tom, 2026-10-18: it showed nothing), the off-season just aired on the moves board: its signings
    // from the same source, the sim's events, since the chronicle only takes them in later that night
    // (settings.chronicle.offseasonAiredMinutes).
    const final = live.matchesIn(season).find((m) => m.stage === 'final');
    if (final && isFinished(final, t, durationOf)) {
      const mv = live.config.settings;
      const signed = movesView(live.leagueEvents, season, live.league.history, live.league.players, live.league.teams, live.config.rules.awards, { maxLines: Infinity }, mv.farewells.awardWeight)
        .filter((m) => (m.kind === 'signed' || m.kind === 're_signed') && m.deal);
      if (signed.length) {
        return {
          kind: /** @type {const} */ ('signings'),
          title: `BIGGEST SIGNINGS · OFF-SEASON ${season}`,
          rows: signed.slice(0, 7).map((m) => ({ playerId: m.playerId, name: ctx.playerName(m.playerId), teamId: m.teamId, fromId: m.fromId, wage: /** @type {any} */ (m.deal).wage, seasons: /** @type {any} */ (m.deal).seasons })),
        };
      }
    }
    const off =Math.max(0, ...[...live.chronicle.seasons.values()].filter((e) => e.deals.some((d) => d.kind === 'free_agent')).map((e) => e.season));
    const deals = off ? live.chronicle.season(off).deals.filter((d) => d.kind === 'free_agent').sort((a, b) => b.wage - a.wage).slice(0, 7) : [];
    return {
      kind: /** @type {const} */ ('signings'),
      title: off ? `BIGGEST SIGNINGS · OFF-SEASON ${off}` : 'BIGGEST SIGNINGS',
      rows: deals.map((d) => ({ playerId: d.playerId, name: ctx.playerName(d.playerId), teamId: d.teamId, fromId: d.fromId, wage: d.wage, seasons: d.until - off })),
    };
  }
  if (card === 'form') {
    return {
      kind: /** @type {const} */ ('form'),
      title: 'FORM GUIDE · LAST FIVE',
      rows: tableAt(live, season, t, durationOf).map((r) => ({ teamId: r.teamId, form: r.form })),
    };
  }
  if (card === 'race') {
    const table = tableAt(live, season, t, durationOf);
    const cut = live.config.rules.playoffs.teams;
    const games = (table.length - 1) * 2;
    const done = table.every((r) => r.played === games);
    const fourth = table[cut - 1]?.points ?? 0;
    const fifth = table[cut]?.points ?? 0;
    return {
      kind: /** @type {const} */ ('race'),
      title: done ? 'THE PLAYOFF RACE · SETTLED' : 'THE PLAYOFF RACE',
      cut,
      done,
      rows: table.map((r) => ({
        position: r.position, teamId: r.teamId, points: r.points, left: games - r.played,
        // Inside the cut: how far clear of the first team outside it; outside: how far off the last team inside.
        gap: r.position <= cut ? r.points - fifth : fourth - r.points,
      })),
    };
  }
  if (card === 'honours') {
    // The season's honours (Task 206): its champions, the Pennant, the five awards and the No. 1 pick, at a glance.
    // The latest season finished (after midnight the calendar already counts the new one).
    const h = live.league.history.filter((x) => x.season <= season).at(-1);
    const done = h?.season ?? season;
    const nameOfAward = (/** @type {string} */ id) => live.config.rules.awards.list.find((/** @type {{ id: string }} */ a) => a.id === id)?.name ?? id;
    const pick = live.leagueEvents.find((e) => e.type === 'draft_pick' && e.season === done && /** @type {any} */ (e.data).pick === 1);
    return {
      kind: /** @type {const} */ ('honours'),
      title: `SEASON ${done} HONOURS`,
      championId: h?.championId ?? null,
      shieldId: h?.shieldId ?? null,
      awards: (h?.awards ?? []).map((a) => ({ name: nameOfAward(a.award), player: ctx.playerName(a.playerId), teamId: a.teamId })),
      firstPick: pick ? { player: ctx.playerName(/** @type {string} */ (pick.playerId)), teamId: /** @type {string} */ (pick.teamId) } : null,
    };
  }
  // A big stat's own leaders (Task 278n, Tom: in place of the combined card; goals and scorchers have TOP SCORERS): the
  // top five in assists, in stops (tackles and blocks, the Quell's stat), or keepers by saves with their save percentage.
  if (card === 'assists' || card === 'stops' || card === 'keepers') {
    const totals = Object.values(seasonTotalsAt(live, season, t, durationOf));
    const value = (/** @type {import('../sim/standings.js').SeasonPlayerStats} */ x) => (card === 'assists' ? x.assists : card === 'stops' ? x.tackles + x.blocks : x.saves);
    const rows = totals.filter((x) => value(x) > 0)
      .sort((a, b) => value(b) - value(a) || a.appearances - b.appearances || a.playerId.localeCompare(b.playerId))
      .slice(0, 5)
      .map((x) => ({ playerId: x.playerId, name: ctx.playerName(x.playerId), teamId: x.teamId, value: value(x), pct: card === 'keepers' && x.saves + x.conceded > 0 ? Math.round((100 * x.saves) / (x.saves + x.conceded)) : null }));
    const what = card === 'assists' ? 'ASSISTS' : card === 'stops' ? 'STOPS' : 'KEEPERS';
    return { kind: /** @type {const} */ ('stat_leaders'), stat: card, title: `TOP ${what} · SEASON ${season}`, rows };
  }
  if (card === 'head_to_head') {
    // The next live match's teams: their places, form, and every meeting this season and last, finished on screen.
    const next = upcomingAt(live, t, durationOf, 1)[0];
    if (!next?.homeId || !next.awayId) return { kind: /** @type {const} */ ('head_to_head'), title: 'HEAD TO HEAD', fixture: null, home: null, away: null, meetings: [] };
    const { homeId, awayId } = next;
    const table = tableAt(live, season, t, durationOf);
    const side = (/** @type {string} */ id) => {
      const r = table.find((x) => x.teamId === id);
      return { teamId: id, position: r && r.played > 0 ? r.position : null, points: r?.points ?? 0, form: r?.form ?? [] };
    };
    const meetings = [...live.matchesIn(season - 1), ...live.matchesIn(season)]
      .filter((m) => isFinished(m, t, durationOf) && [m.homeId, m.awayId].includes(homeId) && [m.homeId, m.awayId].includes(awayId))
      .sort((a, b) => b.kickoff - a.kickoff).slice(0, 4)
      .map((m) => ({ homeId: m.homeId, awayId: m.awayId, homeGoals: m.summary.result.homeGoals, awayGoals: m.summary.result.awayGoals, season: m.season, stage: m.stage }));
    return {
      kind: /** @type {const} */ ('head_to_head'),
      title: `HEAD TO HEAD · ${live.league.teams[homeId].abbr} v ${live.league.teams[awayId].abbr}`,
      fixture: { kickoff: next.kickoff, stage: next.stage },
      home: side(homeId),
      away: side(awayId),
      meetings,
    };
  }
  // Team spotlight: the next team in alphabetical order of id, one per rotation.
  const ids = Object.keys(live.league.teams).sort();
  const teamId = ids[((rotation % ids.length) + ids.length) % ids.length];
  const team = live.league.teams[teamId];
  const row = tableAt(live, season, t, durationOf).find((r) => r.teamId === teamId);
  const region = live.config.regions.regions.find((/** @type {any} */ g) => g.id === team.region);
  return {
    kind: /** @type {const} */ ('spotlight'),
    title: 'TEAM SPOTLIGHT',
    teamId,
    name: team.name,
    place: `${team.city}, ${region?.name ?? team.region}`,
    blurb: team.blurb,
    position: row && row.played > 0 ? row.position : null,
    points: row?.points ?? 0,
    played: row?.played ?? 0,
  };
}
