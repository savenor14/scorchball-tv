// The talk at the desk (Task 99; docs/channel.md §16.7): what the presenters say about a match after it (the result,
// the story of the game, a reaction, what it means), round the interview, after the final round, and opening the
// champions and the off-season. Pure: the facts come from what the sim already logged and the table as it stood; the
// words from data/studio.json, picked by the segment's seed, so every screen hears the same. Task 101 added the gap's
// clips (standings, scorers, upcoming), which never name a result, so nothing re-airing in the gap is spoiled, and the
// tee-up before each live match. Task 106 added the welcome that opens the channel's day.
import { analystCast, analystSaid } from './analystTalk.js';
import { finalDayResultsCard } from './cards.js';
import { isFinished, leadersAt, tableAt, upcomingAt } from './onScreen.js';
import { playerOfTheMatch, winnerOf } from './potm.js';
import { recipe } from './soundRecipes.js';
import { lineTiming, sayer, talkEnd, timeLines, teamsForTalk } from './studio.js';
import { awardEvents, awardOrder } from './awardShow.js';
import { deskAfter, deskBefore } from './deskFacts.js';
import { createRng } from '../sim/rng.js';

/**
 * The talks that open with the studio jingle (Task 180): the welcome (after the ident), the champions (after the final's
 * show) and the awards (after the champions' cards, Task 191). Their first line waits for the jingle to finish.
 */
export const JINGLE_TALKS = Object.freeze(new Set(['welcome', 'awards']));

/** The studio jingle's length, ms, to its last note's tail. @param {import('../config.js').Config} config */
export const studioJingleMs = (config) => recipe('jingle', 'studio', { jingle: config.studio.jingle }).duration * 1000;

/**
 * @typedef {import('./liveLeague.js').LiveMatch} LiveMatch
 * @typedef {import('./liveLeague.js').LiveLeague} LiveLeague
 * @typedef {{ timelineOf: (m: LiveMatch) => import('./timeline.js').Timeline, playerName: (id: string) => string, formatTime: (t: number) => string }} TalkContext
 * @typedef {object} MatchFacts
 * @property {string} home @property {string} away  Short names.
 * @property {string | null} winner @property {string | null} loser  Short names; null for a draw.
 * @property {string | null} winnerId @property {string | null} loserId
 * @property {string} score  The winner's side first ("5-2"); for a draw, home first.
 * @property {number} margin
 * @property {'regulation' | 'overtime' | 'shootout'} decidedBy
 * @property {string | null} shootout  The winner's side first ("3-2").
 * @property {'regular' | 'semifinal' | 'final'} stage
 * @property {{ down: number } | null} comeback  The winner came back from `down` goals behind (2 or more).
 * @property {{ scorer: string, minute: string } | null} lateWinner  The goal that put the winner ahead for good, late on.
 * @property {{ scorer: string, minute: string } | null} lateEqualiser  A draw levelled late on.
 * @property {{ scorer: string, goals: number } | null} hatTrick  The match's top scorer, with three or more.
 * @property {{ team: string, count: number } | null} scorchers  Three or more in the match: the side with the most.
 * @property {{ keeper: string, team: string, saves: number } | null} saves  Six or more by one player.
 * @property {number} burns
 * @property {{ kind: 'tableTop' | 'tableStillTop' | 'tableIntoFour' | 'tableOutOfFour' | 'tableWinStreak' | 'tableLossStreak', team: string, points: number, n: number } | null} table
 *   What the result did to the table (regular season only), the most striking first.
 */

/** "1st", "22nd", "38th". @param {number} n */
const ordinal = (n) => {
  const v = n % 100;
  return `${n}${['th', 'st', 'nd', 'rd'][(v - 20) % 10] ?? ['th', 'st', 'nd', 'rd'][v] ?? 'th'}`;
};

/**
 * What's worth saying about a match that has finished: from its events and summary, and the table before and after.
 * @param {LiveMatch} m @param {LiveLeague} live @param {TalkContext} ctx
 * @returns {MatchFacts}
 */
export function matchFacts(m, live, ctx) {
  const teams = live.league.teams;
  const name = (/** @type {string} */ id) => teams[id].shortName;
  const r = m.summary.result;
  const winnerId = winnerOf(m);
  const loserId = winnerId ? (winnerId === m.homeId ? m.awayId : m.homeId) : null;
  const winnerHome = winnerId === m.homeId;
  const [wg, lg] = winnerHome ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals];
  const tl = ctx.timelineOf(m);
  const goals = tl.events.filter((e) => e.event.type === 'goal').map((e) => ({
    clock: /** @type {number} */ (e.event.clock), teamId: /** @type {string} */ (e.event.teamId), playerId: /** @type {string} */ (e.event.playerId),
    score: /** @type {[number, number]} */ (/** @type {any} */ (e.event.data).score),
  }));
  const lateFrom = 0.85 * 2 * live.config.rules.match.halfMinutes * 60;
  const minuteOf = (/** @type {number} */ clock) => ordinal(Math.floor(clock / 60) + 1);

  // The winner's lead through the match: how far behind they ever were, and the goal that put them ahead for good.
  let comeback = null;
  let lateWinner = null;
  if (winnerId && r.decidedBy !== 'shootout') {
    let worst = 0;
    let decider = null;
    let before = 0;
    for (const g of goals) {
      const lead = winnerHome ? g.score[0] - g.score[1] : g.score[1] - g.score[0];
      worst = Math.min(worst, lead);
      if (lead > 0 && before <= 0) decider = g;
      before = lead;
    }
    if (worst <= -2) comeback = { down: -worst };
    if (decider && decider.clock >= lateFrom && r.decidedBy === 'regulation') lateWinner = { scorer: ctx.playerName(decider.playerId), minute: minuteOf(decider.clock) };
  }
  let lateEqualiser = null;
  const last = goals.at(-1);
  if (!winnerId && last && last.score[0] === last.score[1] && last.clock >= lateFrom) lateEqualiser = { scorer: ctx.playerName(last.playerId), minute: minuteOf(last.clock) };

  const stats = Object.entries(m.summary.playerStats);
  const top = stats.reduce((a, b) => (b[1].goals > a[1].goals ? b : a), stats[0]);
  const hatTrick = top && top[1].goals >= 3 ? { scorer: ctx.playerName(top[0]), goals: top[1].goals } : null;
  const ts = m.summary.teamStats;
  const scorchersTotal = ts.home.scorchers + ts.away.scorchers;
  const scorchers = scorchersTotal >= 3 ? { team: name(ts.home.scorchers >= ts.away.scorchers ? m.homeId : m.awayId), count: Math.max(ts.home.scorchers, ts.away.scorchers) } : null;
  const keeper = stats.reduce((a, b) => (b[1].saves > a[1].saves ? b : a), stats[0]);
  const saves = keeper && keeper[1].saves >= 6 ? { keeper: ctx.playerName(keeper[0]), team: name(keeper[1].teamId), saves: keeper[1].saves } : null;

  return {
    home: name(m.homeId), away: name(m.awayId),
    winner: winnerId ? name(winnerId) : null, loser: loserId ? name(loserId) : null, winnerId, loserId,
    score: winnerId ? `${wg}-${lg}` : `${r.homeGoals}-${r.awayGoals}`,
    margin: Math.abs(r.homeGoals - r.awayGoals),
    decidedBy: r.decidedBy,
    shootout: r.shootout ? (winnerHome ? `${r.shootout.home}-${r.shootout.away}` : `${r.shootout.away}-${r.shootout.home}`) : null,
    stage: m.stage,
    comeback, lateWinner, lateEqualiser, hatTrick, scorchers, saves,
    burns: ts.home.burns + ts.away.burns,
    table: m.stage === 'regular' ? tableEffect(m, live, ctx, winnerId, loserId) : null,
  };
}

/**
 * What a regular-season result did to the table, the most striking first: the winner going top, into the top four,
 * the loser dropping out of it, a streak of three or more, the leader staying top.
 * @param {LiveMatch} m @param {LiveLeague} live @param {TalkContext} ctx @param {string | null} winnerId @param {string | null} loserId
 * @returns {MatchFacts['table']}
 */
function tableEffect(m, live, ctx, winnerId, loserId) {
  const durationOf = (/** @type {LiveMatch} */ x) => ctx.timelineOf(x).duration;
  const cut = live.config.rules.playoffs.teams;
  const before = tableAt(live, m.season, m.kickoff - 1, durationOf);
  const after = tableAt(live, m.season, m.kickoff + durationOf(m), durationOf);
  const row = (/** @type {typeof after} */ table, /** @type {string} */ id) => /** @type {(typeof after)[number]} */ (table.find((r) => r.teamId === id));
  const name = (/** @type {string} */ id) => live.league.teams[id].shortName;
  const streak = (/** @type {string} */ id, /** @type {'W' | 'L'} */ kind) => {
    const form = row(after, id).form;
    let n = 0;
    for (let i = form.length - 1; i >= 0 && form[i] === kind; i--) n++;
    return n;
  };
  const effect = (/** @type {NonNullable<MatchFacts['table']>['kind']} */ kind, /** @type {string} */ id, n = 0) => ({ kind, team: name(id), points: row(after, id).points, n });
  if (winnerId) {
    const b = row(before, winnerId).position;
    const a = row(after, winnerId).position;
    if (a === 1 && b !== 1) return effect('tableTop', winnerId);
    if (a <= cut && b > cut) return effect('tableIntoFour', winnerId);
  }
  for (const id of loserId ? [loserId] : [m.homeId, m.awayId]) {
    if (row(before, id).position <= cut && row(after, id).position > cut) return effect('tableOutOfFour', id);
  }
  if (winnerId && streak(winnerId, 'W') >= 3) return effect('tableWinStreak', winnerId, streak(winnerId, 'W'));
  if (loserId && streak(loserId, 'L') >= 3) return effect('tableLossStreak', loserId, streak(loserId, 'L'));
  const leader = after[0];
  if (leader.played > 0 && (leader.teamId === m.homeId || leader.teamId === m.awayId)) return effect('tableStillTop', leader.teamId);
  return null;
}

/**
 * How the desk's history lines name things (Task 246a): teams by short name, players as the graphics show them and
 * by surname as said. @param {LiveLeague} live @param {TalkContext} ctx
 * @returns {import('./deskFacts.js').DeskNames}
 */
const deskNames = (live, ctx) => ({
  team: (id) => live.league.teams[id]?.shortName ?? id,
  player: (id) => ctx.playerName(id).toUpperCase(),
  surname: (id) => live.league.players[id]?.lastName ?? '',
});

/** "A, B, C and D". @param {string[]} names */
const listOf = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/**
 * The result in a line, as the match talk opens (and for each match of the final round).
 * @param {(kind: string, fill?: Record<string, string | number>) => void} say @param {MatchFacts} f
 */
function sayResult(say, f) {
  if (f.decidedBy === 'shootout') say('matchShootout', { winner: f.winner ?? '', loser: f.loser ?? '', shootout: f.shootout ?? '', score: f.score });
  else if (f.decidedBy === 'overtime') say('matchOvertime', { winner: f.winner ?? '', loser: f.loser ?? '', score: f.score });
  else if (f.winner) say('matchWin', { winner: f.winner, loser: f.loser ?? '', score: f.score });
  else say('matchDraw', { home: f.home, away: f.away, score: f.score });
}

/**
 * The lines for a talk segment, with their timing (studio.js `Line`s), or null when there's nothing to say (studio.js's
 * stand-in lines then fill in).
 * @param {Extract<import('./programme.js').Segment, { kind: 'talk' }>} seg @param {LiveLeague} live @param {number} t
 * @param {TalkContext} ctx
 * @returns {import('./studio.js').Line[] | null}
 */
export function talkScript(seg, live, t, ctx) {
  const lines = live.config.studio.lines;
  const total = seg.until - seg.from;
  const stage = talkStage(live, t, ctx);
  const { said, say, rng, setTurn } = sayer(lines, `${seg.topic}|${seg.wordsAt ?? seg.from}`, teamsForTalk(live.league.teams, live.config.studio.spokenTeam), live.config.studio.playerNames, stage);
  const teams = live.league.teams;
  const fullName = (/** @type {string} */ id) => {
    const p = live.league.players[id];
    return p ? `${p.firstName} ${p.lastName}` : ctx.playerName(id);
  };
  const m = /** @type {LiveMatch | null} */ (seg.match);
  switch (seg.topic) {
    case 'match': {
      if (!m) return null;
      const f = matchFacts(m, live, ctx);
      sayResult(say, f);
      // The story of the game: the most striking thing about it.
      if (f.comeback) say('storyComeback', { winner: f.winner ?? '', down: f.comeback.down });
      else if (f.lateWinner) say('storyLateWinner', f.lateWinner);
      else if (f.lateEqualiser) say('storyLateEqualiser', f.lateEqualiser);
      else if (f.hatTrick) say('storyHatTrick', f.hatTrick);
      else if (f.scorchers) say('storyScorchers', f.scorchers);
      else if (f.saves) say('storySaves', f.saves);
      else if (f.burns >= 4) say('storyBurns', { burns: f.burns });
      else say('storyPlain');
      if (!f.winner) say('reactDraw');
      else say(f.margin >= 3 ? 'reactBig' : 'reactWin', { winner: f.winner, loser: f.loser ?? '' });
      if (f.stage === 'semifinal') say('knockoutSemi', { winner: f.winner ?? '' });
      else if (f.stage === 'final') say('knockoutFinal', { winner: f.winner ?? '' });
      else if (f.table) say(f.table.kind, { team: f.table.team, points: f.table.points, n: f.table.n });
      // What it means in the long run (Task 246a): the heaviest fact the desk can say, if there's one.
      const history = deskAfter(live.facts.after(m.id), deskNames(live, ctx), live.config.chronicle.facts.deskFrom);
      if (history) say(history.kind, history.fill);
      break;
    }
    case 'round': {
      const group = /** @type {LiveMatch[]} */ (seg.group);
      if (group.length === 0) return null;
      const card = finalDayResultsCard(group, live, t, ctx);
      say('roundIntro');
      for (const x of group) sayResult(say, matchFacts(x, live, ctx));
      say('roundPlayoffs', { teams: listOf(card.playoffIds.map((id) => teams[id].shortName)) });
      say('roundPennant', { team: teams[card.shieldId].shortName, season: group[0].season });
      break;
    }
    case 'interview_tee_up': {
      if (!m) return null;
      const pick = playerOfTheMatch(m, live.config.interviews.potm);
      // Named (Task 246a), once the surnames' clips are made: its namedShare of the time (Tom: mostly, with some variety).
      const surname = live.league.players[pick.playerId]?.lastName;
      const share = live.config.studio.lines.interviewTeeUpNamed.namedShare ?? 1;
      if (live.config.studio.playerNames && surname && rng.chance(share)) say('interviewTeeUpNamed', { player: fullName(pick.playerId), team: teams[pick.teamId].shortName, surname });
      else say('interviewTeeUp', { player: fullName(pick.playerId), team: teams[pick.teamId].shortName });
      break;
    }
    case 'wrap_up': {
      if (!m) return null;
      const pick = playerOfTheMatch(m, live.config.interviews.potm);
      say('wrapUp', { player: fullName(pick.playerId) });
      // The highlights next, after the final too (Tom: its package now follows, before the champions' cards).
      say('highlightsNext');
      break;
    }
    case 'awards': {
      // Opening the awards (Task 191): what they are, then the five in the order they come (six from season 2, with
      // the Spark for the best rookie, Task 252; the founding season has no rookies).
      if (!m) return null;
      const names = awardOrder(live.config.settings.awards, awardEvents(live.leagueEvents, m.season))
        .map((id) => String(live.config.rules.awards.list.find((/** @type {{ id: string }} */ a) => a.id === id)?.name ?? id).replace(/^The /, '').toUpperCase());
      say('awardsIntro', { season: m.season });
      say(names.length === 6 ? 'awardsListSix' : 'awardsList', { list: names.join(' · ') });
      break;
    }
    case 'signoff': {
      // The sign-off (Task 194), last of the show: the season done, the new one's opener (the time on the graphic only,
      // the desk speaks it in words it can say ahead), goodbye.
      if (!m) return null;
      say('signoffDone', { season: m.season });
      const f = seg.next;
      if (f && f.season > m.season) {
        const [day, time] = spoken(ctx, f.kickoff).split(' ');
        say('signoffNext', { next: f.season, when: `${DAYS[day] ?? day} ${time}`, home: teams[f.homeId].shortName, away: teams[f.awayId].shortName });
      }
      say('signoffBye');
      break;
    }
    case 'clip': {
      const o = { live, t, ctx, say, stage };
      // In the playoffs (Task 155, Tom: after a semifinal the desk talked about the settled table) the standings clip
      // is about the playoffs instead.
      if (seg.clip === 'standings' && live.calendar.at(t).phase === 'playoffs') sayPlayoffs(o);
      else if (seg.clip === 'standings') sayStandings(o);
      else if (seg.clip === 'scorers') sayScorers(o);
      else if (seg.clip === 'upcoming') sayUpcoming(o);
      else return null;
      break;
    }
    case 'welcome': {
      if (!seg.next) return null;
      sayWelcome({ live, t, ctx, say, setTurn }, seg.next, /** @type {import('./programme.js').NextFixture[]} */ (seg.group));
      break;
    }
    case 'analyst': {
      // The playoff analyst's bits in the PLAYOFF PREVIEW show (analystTalk.js): their own seats and voices.
      const lines = analystSaid(/** @type {import('./analystTalk.js').AnalystBit} */ (seg.bit ?? 'four'), live, t, ctx, String(seg.wordsAt ?? seg.from));
      return lines ? timeLines(lines, total, lineTiming(live.config, analystCast(live.config)), 0) : null;
    }
    case 'tee_up': {
      if (!seg.next) return null;
      sayTeeUp({ live, t, ctx, say }, seg.next, /** @type {import('./programme.js').NextFixture[]} */ (seg.group));
      break;
    }
    default:
      return null;
  }
  return timeLines(said, total, lineTiming(live.config), quietMs(seg.topic, live.config));
}

/** How long a talk's desk waits beyond the usual lead-in: the studio jingle, for the talks it opens. @param {string} topic @param {import('../config.js').Config} config */
const quietMs = (topic, config) => (JINGLE_TALKS.has(topic) ? studioJingleMs(config) : 0);

/**
 * A talk sized to its lines (Task 187): its script given `maxMs` at most, and how long it needs: to its last line and
 * a beat, never more than `maxMs`. With nothing to say (studio.js's stand-in lines fill in), the whole `maxMs`.
 * @param {Extract<import('./programme.js').Segment, { kind: 'talk' }>} seg  Its `from` (or `wordsAt`) as it will air;
 *   its `until` is ignored.
 * @param {LiveLeague} live @param {TalkContext} ctx @param {number} maxMs
 * @returns {{ script: import('./studio.js').Line[] | null, ms: number }}
 */
export function sizedTalk(seg, live, ctx, maxMs) {
  const script = talkScript({ ...seg, until: seg.from + maxMs }, live, seg.wordsAt ?? seg.from, ctx);
  if (!script) return { script, ms: maxMs };
  return { script, ms: Math.min(maxMs, Math.ceil(talkEnd(script, lineTiming(live.config), quietMs(seg.topic, live.config)))) };
}

/**
 * Names and times as the channel shows them (main.js's, shared with the programme so a talk it sizes says what's
 * aired): a player as "F. Last", a time as "MON 21:58" in the league's zone.
 * @param {LiveLeague} live @param {(m: LiveMatch) => import('./timeline.js').Timeline} timelineOf
 * @returns {TalkContext}
 */
export function talkContext(live, timelineOf) {
  const when = new Intl.DateTimeFormat('en-US', { timeZone: live.config.settings.live.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return {
    timelineOf,
    playerName: (id) => {
      const p = live.league.players[id];
      return p ? `${p.firstName[0]}. ${p.lastName}` : '?';
    },
    formatTime: (ms) => when.format(ms).toUpperCase(),
  };
}

/** @typedef {{ live: LiveLeague, t: number, ctx: TalkContext, say: (kind: string, fill?: Record<string, string | number>) => void, setTurn?: (key: string, n: number) => void, stage?: import('./studio.js').TalkStage }} Saying */

/**
 * Where the season stands as a talk airs, by what has finished on screen (2026-10-18, Tom: after the final round the
 * desk still asked who'd finish top scorer): the regular season running; over, before a semifinal has finished; one
 * semifinal finished; the final set; the final finished. Data's ways name the stages they're never said in (`not`).
 * @param {LiveLeague} live @param {number} t @param {TalkContext} ctx
 * @returns {import('./studio.js').TalkStage}
 */
export function talkStage(live, t, ctx) {
  const pos = live.calendar.at(t);
  const slots = live.calendar.slots(pos.season);
  const regular = slots.filter((s) => s.stage === 'regular').length;
  // Before the final round has kicked off, no need to look further.
  if (pos.started < regular) return 'season';
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const done = live.matchesIn(pos.season).filter((m) => isFinished(m, t, durationOf));
  if (done.some((m) => m.stage === 'final')) return 'done';
  const semis = done.filter((m) => m.stage === 'semifinal').length;
  if (semis >= 2) return 'finalSet';
  if (semis === 1) return 'semis';
  return done.filter((m) => m.stage === 'regular').length >= regular ? 'settled' : 'season';
}

/** "1 point", "7 points". @param {number} n @param {string} one */
const count = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** A time as said aloud: "Mon 21:58" rather than the ticker's "MON 21:58". @param {TalkContext} ctx @param {number} t */
const spoken = (ctx, t) => ctx.formatTime(t).replace(/^([A-Z])([A-Z]+)/, (_, a, b) => a + b.toLowerCase());

/**
 * The playoffs clip (Task 155): once a semifinal has finished on screen, who's through and that they'll meet the
 * other semifinal's winner; once both have, the final (and whether a finalist topped the table), and a reaction.
 * Before either has finished, or once the final has, the standings clip as usual.
 * @param {Saying} o
 */
function sayPlayoffs(o) {
  const { live, t, ctx, say } = o;
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const pos = live.calendar.at(t);
  const name = (/** @type {string} */ id) => live.league.teams[id].shortName;
  const played = live.matchesIn(pos.season).filter((m) => m.stage !== 'regular' && isFinished(m, t, durationOf));
  const semis = played.filter((m) => m.stage === 'semifinal').sort((a, b) => a.slot - b.slot);
  if (semis.length === 0 || played.some((m) => m.stage === 'final')) {
    sayStandings(o);
    return;
  }
  const ahead = upcomingAt(live, t, durationOf, 3);
  const when = (/** @type {number} */ k) => spoken(ctx, k).toUpperCase();
  if (semis.length === 1) {
    const m = semis[0];
    const winner = /** @type {string} */ (winnerOf(m));
    say('knockoutSemi', { winner: name(winner) });
    const other = ahead.find((f) => f.stage === 'semifinal' && f.homeId && f.awayId);
    if (other) say('playoffsOtherSemi', { home: name(/** @type {string} */ (other.homeId)), away: name(/** @type {string} */ (other.awayId)), when: when(other.kickoff) });
  } else {
    const final = ahead.find((f) => f.stage === 'final' && f.homeId && f.awayId);
    if (final) {
      say('playoffsFinalSet', { home: name(/** @type {string} */ (final.homeId)), away: name(/** @type {string} */ (final.awayId)), when: when(final.kickoff) });
      const [top] = tableAt(live, pos.season, t, durationOf);
      if (top && (top.teamId === final.homeId || top.teamId === final.awayId)) say('standingsFinal', { team: name(top.teamId), points: top.points });
    }
  }
  say('playoffsReact');
}

/**
 * The standings clip: the leader and their margin, the race for the top-four cut, the bottom, a reaction. Once the
 * regular season is over, how it finished. Never a result.
 * @param {Saying} o
 */
function sayStandings(o) {
  const { live, t, ctx, say } = o;
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const table = tableAt(live, live.calendar.at(t).season, t, durationOf);
  const name = (/** @type {string} */ id) => live.league.teams[id].shortName;
  if (!table[0] || table[0].played === 0) {
    say('standingsEarly');
    sayUpcoming(o, 2);
    return;
  }
  const cut = live.config.rules.playoffs.teams;
  const games = (table.length - 1) * 2;
  const [top, second] = table;
  const bottom = /** @type {(typeof table)[number]} */ (table.at(-1));
  if (table.every((r) => r.played === games)) {
    say('standingsFinal', { team: name(top.teamId), points: count(top.points, 'point') });
    say('standingsFinalFour', { teams: listOf(table.slice(0, cut).map((r) => name(r.teamId))) });
    say('standingsFinalBottom', { team: name(bottom.teamId), points: count(bottom.points, 'point') });
    say('standingsFinalReact');
    return;
  }
  if (top.points === second.points) say('standingsLevel', { team: name(top.teamId), other: name(second.teamId), points: count(top.points, 'point') });
  else say('standingsLeader', { team: name(top.teamId), points: count(top.points, 'point'), margin: count(top.points - second.points, 'point') });
  const inside = table[cut - 1];
  const outside = table[cut];
  if (inside && outside) {
    const left = count(games - Math.min(inside.played, outside.played), 'game');
    if (inside.points === outside.points) say('standingsCutLevel', { inside: name(inside.teamId), outside: name(outside.teamId), points: count(inside.points, 'point'), left });
    else say('standingsCut', { inside: name(inside.teamId), outside: name(outside.teamId), gap: count(inside.points - outside.points, 'point'), left });
  }
  say('standingsBottom', { team: name(bottom.teamId), points: count(bottom.points, 'point') });
  say('standingsReact');
}

/**
 * The top scorers clip: the leader (or those sharing the lead), who's next, the most scorchers, a reaction; once the
 * regular season is over, how the scoring finished (2026-10-18). Never a result.
 * @param {Saying} o
 */
function sayScorers(o) {
  const { live, t, ctx, say } = o;
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const pos = live.calendar.at(t);
  const top = leadersAt(live, pos.season, t, durationOf, 'goals', 3);
  const team = (/** @type {{ teamId: string }} */ r) => live.league.teams[r.teamId].shortName;
  if (top.length === 0) {
    say('scorersNone');
    sayUpcoming(o, 2);
    return;
  }
  const [first, second] = top;
  const over = o.stage !== undefined && o.stage !== 'season';
  // In the playoffs (Task 155): the regular season's top scorer as it finished, then the playoffs' own (until the final
  // has finished: then the race lines' finished ways, below).
  const playoffs = pos.phase === 'playoffs' ? leadersAt(live, pos.season, t, durationOf, 'goals', 1, 'playoffs').filter((r) => r.goals > 0) : [];
  if (playoffs.length && o.stage !== 'done') {
    say('scorersFinal', { player: ctx.playerName(first.playerId), team: team(first), goals: count(first.goals, 'goal') });
    say('scorersPlayoffs', { player: ctx.playerName(playoffs[0].playerId), team: live.league.teams[playoffs[0].teamId].abbr, goals: playoffs[0].goals });
    say('playoffsReact');
    return;
  }
  // Once the regular season is over (2026-10-18), how the scoring finished; the race lines' ways that say it's still
  // on are kept out by their `not`.
  if (over && second && second.goals === first.goals) say('scorersShared', { player: ctx.playerName(first.playerId), other: ctx.playerName(second.playerId), goals: count(first.goals, 'goal') });
  else if (over || !pos.next) say('scorersFinal', { player: ctx.playerName(first.playerId), team: team(first), goals: count(first.goals, 'goal') });
  else if (second && second.goals === first.goals) say('scorersShared', { player: ctx.playerName(first.playerId), other: ctx.playerName(second.playerId), goals: count(first.goals, 'goal') });
  else say('scorersLeader', { player: ctx.playerName(first.playerId), team: team(first), goals: count(first.goals, 'goal') });
  // Who's next: the first with fewer goals than the leader.
  const next = top.find((r) => r.goals < first.goals);
  if (next) say('scorersChasing', { player: ctx.playerName(next.playerId), team: team(next), goals: count(next.goals, 'goal'), behind: count(first.goals - next.goals, 'goal') });
  // After the final (2026-10-18): the playoffs' top scorer in place of the most scorchers, and the season looked back on.
  if (o.stage === 'done') {
    if (playoffs.length) say('scorersPlayoffsDone', { player: ctx.playerName(playoffs[0].playerId), team: live.league.teams[playoffs[0].teamId].abbr, goals: count(playoffs[0].goals, 'goal') });
    say('seasonDoneReact');
    return;
  }
  const [hot] = leadersAt(live, pos.season, t, durationOf, 'scorchers', 1);
  if (hot) say('scorersScorchers', { player: ctx.playerName(hot.playerId), scorchers: count(hot.scorchers, 'scorcher') });
  say('scorersReact');
}

/**
 * The upcoming clip: the next fixtures and when (playoff teams to be decided until they're known on screen), or when
 * the new season starts.
 * @param {Saying} o @param {number} [n]  How many fixtures (3; 2 after another clip's opening line).
 */
function sayUpcoming({ live, t, ctx, say }, n = 3) {
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const pos = live.calendar.at(t);
  const name = (/** @type {string} */ id) => live.league.teams[id].shortName;
  const fixtures = upcomingAt(live, t, durationOf, n);
  if (fixtures.length === 0) {
    say('upcomingNewSeason', { season: pos.season + 1, when: spoken(ctx, pos.seasonEnd) });
    say('upcomingQuiet');
    return;
  }
  if (n >= 3) say('upcomingIntro');
  fixtures.forEach((f, i) => {
    const when = spoken(ctx, f.kickoff);
    if (!f.homeId || !f.awayId) say('upcomingTbc', { stage: f.stage === 'final' ? 'the final' : 'a semifinal', when });
    else if (f.stage === 'final') say('upcomingFinal', { home: name(f.homeId), away: name(f.awayId), when });
    else if (f.stage === 'semifinal') say('upcomingSemi', { home: name(f.homeId), away: name(f.awayId), when });
    else say(i === 0 ? 'upcomingFirst' : 'upcomingThen', { home: name(f.homeId), away: name(f.awayId), when });
  });
}

/**
 * The tee-up before a live match: the match and its stage (or the final round's matches all at once), the table
 * places and form, a player to watch, and kick-off in five minutes.
 * @param {Saying} o @param {import('./programme.js').NextFixture} f  The featured fixture.
 * @param {import('./programme.js').NextFixture[]} group  Every fixture kicking off with it.
 */
function sayTeeUp({ live, t, ctx, say }, f, group) {
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const name = (/** @type {string} */ id) => live.league.teams[id].shortName;
  const home = name(f.homeId);
  const away = name(f.awayId);
  if (group.length > 1) {
    say('teeUpRound', { n: group.length });
    say('teeUpFeatured', { home, away });
  } else if (f.stage === 'final') say('teeUpFinal', { home, away });
  else if (f.stage === 'semifinal') say('teeUpSemi', { home, away });
  else say('teeUpMatch', { home, away });
  // What's between them (Task 246a): last season's final, a run, a player facing an old club.
  const history = deskBefore(live.facts.before(f, f.id), deskNames(live, ctx));
  if (history) say(history.kind, history.fill);
  const table = tableAt(live, f.season, t, durationOf);
  const h = table.find((r) => r.teamId === f.homeId);
  const a = table.find((r) => r.teamId === f.awayId);
  if (f.stage === 'regular' && h && a && h.played > 0 && a.played > 0) {
    say('teeUpPlaces', { home, homePlace: ordinal(h.position), away, awayPlace: ordinal(a.position) });
    const wins = (/** @type {typeof h} */ r) => {
      const w = r.form.filter((x) => x === 'W').length;
      return w === 0 ? 'no wins' : count(w, 'win');
    };
    if (h.form.length >= 3 && a.form.length >= 3) say('teeUpForm', { home, homeWins: wins(h), homeN: h.form.length, away, awayWins: wins(a), awayN: a.form.length });
  }
  // A player to watch: the top scorer of either side this season.
  const watch = leadersAt(live, f.season, t, durationOf, 'goals', Infinity).find((r) => r.teamId === f.homeId || r.teamId === f.awayId);
  if (watch) say('teeUpWatch', { player: ctx.playerName(watch.playerId), team: name(watch.teamId), goals: count(watch.goals, 'goal') });
  say('teeUpKickoff');
}

/** Each day as said in full. */
const DAYS = /** @type {Record<string, string>} */ ({ Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday', Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday' });

/**
 * The welcome's shapes on an ordinary round day (Task 257, Tom: the same four lines in the same order every day felt
 * repetitive): after the hello, the round, today's first match and the leader in one of these orders, some leaving
 * one out. Dealt in a seeded order each season, a day each, so consecutive days differ and every screen hears the same.
 */
const WELCOME_SHAPES = /** @type {const} */ ([['round', 'today', 'leader'], ['today', 'leader'], ['round', 'today'], ['leader', 'today']]);

/**
 * The welcome that opens the channel's day (Task 106; §16.5a): the day, where the season stands (its start, round N,
 * the final round all at once, playoffs day, the final), today's live matches and the first kick-off, and the leader.
 * On an ordinary round day, in one of WELCOME_SHAPES (Task 257).
 * @param {Saying} o @param {import('./programme.js').NextFixture} f  The day's first live match (the featured one).
 * @param {import('./programme.js').NextFixture[]} group  Every fixture kicking off with it.
 */
function sayWelcome({ live, t, ctx, say, setTurn }, f, group) {
  const durationOf = (/** @type {LiveMatch} */ m) => ctx.timelineOf(m).duration;
  const name = (/** @type {string} */ id) => live.league.teams[id].shortName;
  const [day, time] = spoken(ctx, f.kickoff).split(' ');
  const table = tableAt(live, f.season, t, durationOf);
  const played = table.some((r) => r.played > 0);
  // A turn each (Task 257): no opening line comes round again until the rest of its kind's ways have been heard. The
  // season's opener (before its first match) is the first; then each day's, from its day of the season.
  const dayOfSeason = Math.floor((f.kickoff - live.calendar.instant(f.season, 0)) / 86_400_000);
  setTurn?.(`welcome|${f.season}`, played ? dayOfSeason + 1 : 0);
  say('welcomeHello', { day: DAYS[day] ?? day });
  const slots = live.calendar.slots(f.season);
  // Today's live matches: those kicking off from the first one on, on the same day.
  const today = slots.filter((s) => s.kickoff >= f.kickoff && spoken(ctx, s.kickoff).split(' ')[0] === day).length;
  const sayToday = () => {
    if (today > 1) say('welcomeToday', { n: today, home: name(f.homeId), away: name(f.awayId), when: time });
    else say('welcomeTodayOne', { home: name(f.homeId), away: name(f.awayId), when: time });
  };
  const top = table[0];
  const sayLeader = () => { if (top) say('welcomeLeader', { team: name(top.teamId), points: count(top.points, 'point') }); };
  // The special days say their news, today's matches, then the leader (in the regular season), as always.
  const special = f.stage === 'final' ? () => say('welcomeFinal', { home: name(f.homeId), away: name(f.awayId) })
    : f.stage === 'semifinal' ? () => say('welcomeSemis')
      : group.length > 1 ? () => say('welcomeFinalRound', { n: group.length })
        : !played ? () => say('welcomeSeasonStart', { season: f.season }) : null;
  if (special) {
    special();
    sayToday();
    if (f.stage === 'regular' && played) sayLeader();
    return;
  }
  const order = createRng(`welcome|shapes|${f.season}`).shuffle([...WELCOME_SHAPES.keys()]);
  for (const beat of WELCOME_SHAPES[order[dayOfSeason % order.length]]) {
    if (beat === 'round') say('welcomeRound', { round: slots[f.slot]?.round ?? '', season: f.season });
    else if (beat === 'today') sayToday();
    else sayLeader();
  }
}
