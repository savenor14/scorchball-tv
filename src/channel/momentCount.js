// How often each kind of moment airs live (MOMENTS, plan step 1; docs/tasks.md): runs the channel's programme over
// some seasons as it airs and counts what a viewer watching around the clock would see live, to set each kind's
// steps. Pure and browser-safe, for npm run moments. Live only: re-airs and highlights earn nothing. In the final round
// (several matches at once) only the featured feed counts, as the channel shows it unless the viewer switches.
import { createCalendar } from './calendar.js';
import { recordCaptions } from './captions.js';
import { LiveLeague } from './liveLeague.js';
import { createProgramme } from './programme.js';
import { createTimeline } from './timeline.js';

/** The kinds, in the hand-off's groups (docs/tasks.md), and the secret candidates. */
export const KINDS = /** @type {const} */ ({
  match: ['goal', 'scorcher', 'burn', 'hat_trick', 'golden_goal', 'shootout', 'last_minute_winner', 'late_winner_2m', 'late_winner_5m', 'clean_sheet', 'big_win'],
  air: ['record', 'interview', 'ad_break'],
  habit: ['whole_match', 'match', 'day'],
  secret: ['nil_nil', 'keeper_kick', 'keeper_kick_scored', 'scorcher_golden_goal', 'first_minute_goal', 'two_golden_goals_day', 'every_team_day', 'opening_and_closing'],
});

/**
 * Every kind's count over `seasons` seasons from `first`, as seen live by a viewer watching all day.
 * @param {any} config @param {string} seed @param {number} first @param {number} seasons
 * @returns {{ days: number, liveHours: number, counts: Record<string, number>, byTeam: Record<string, Record<string, number>> }}
 */
export function countMoments(config, seed, first, seasons) {
  const calendar = createCalendar(config);
  const from = calendar.instant(first, 0);
  const to = calendar.instant(first + seasons, 0);
  const half = config.rules.match.halfMinutes * 60;
  const keeper = config.positions.keeper;
  const live = new LiveLeague(config, { now: from, seed });
  /** @type {Map<string, import('./timeline.js').Timeline>} */
  const timelines = new Map();
  const timelineOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => timelines.get(m.id) ?? /** @type {any} */ (timelines.set(m.id, createTimeline(m, config)).get(m.id));
  const programme = createProgramme(live, timelineOf);
  const players = live.league.players;
  const captionCtx = { playerName: () => '', captions: config.settings.captions };

  /** @type {Record<string, number>} */
  const counts = Object.fromEntries(Object.values(KINDS).flat().map((k) => [k, 0]));
  /** Goals, matches and wins seen, by team. @type {Record<string, Record<string, number>>} */
  const byTeam = { goal: {}, match: {}, win: {} };
  const add = (/** @type {string} */ kind, n = 1) => { counts[kind] += n; };
  const addTeam = (/** @type {string} */ kind, /** @type {string} */ teamId) => { byTeam[kind][teamId] = (byTeam[kind][teamId] ?? 0) + 1; };
  /** Golden goals and teams seen, by day (in the league's days from `from`). @type {Map<number, { golden: number, teams: Set<string> }>} */
  const days = new Map();
  const dayOf = (/** @type {number} */ t) => {
    const d = Math.floor((t - from) / 86_400_000);
    return days.get(d) ?? /** @type {any} */ (days.set(d, { golden: 0, teams: new Set() }).get(d));
  };
  /** Seasons whose opening and sign-off both aired (live, not their repeats). @type {Map<number, Set<string>>} */
  const occasions = new Map();
  let liveMs = 0;

  /** Whether match `m` is on screen at `t` (the featured feed). @param {import('./liveLeague.js').LiveMatch} m @param {number} t */
  const onScreen = (m, t) => {
    const seg = programme.at(t);
    return seg.kind === 'live' && seg.match.id === m.id;
  };

  /** @param {import('./liveLeague.js').LiveMatch} m */
  const countMatch = (m) => {
    const tl = timelineOf(m);
    const result = /** @type {any} */ (m.events.at(-1)?.data);
    const end = m.kickoff + tl.duration - 1;
    const atStart = onScreen(m, m.kickoff);
    const atEnd = onScreen(m, end);
    let seenAny = false;
    /** @type {Map<string, number>} */
    const goalsBy = new Map();
    const goals = { [m.homeId]: 0, [m.awayId]: 0 };
    const winnerId = result.homeGoals > result.awayGoals ? m.homeId : result.awayGoals > result.homeGoals ? m.awayId : (result.winnerId ?? null);
    const loserGoals = winnerId === m.homeId ? result.awayGoals : result.homeGoals;
    for (const { event: e, at } of tl.events) {
      const t = m.kickoff + at;
      const seen = onScreen(m, t);
      if (seen) seenAny = true;
      const data = /** @type {any} */ (e.data);
      if (e.type === 'goal') {
        const teamId = /** @type {string} */ (e.teamId);
        goals[teamId]++;
        const n = (goalsBy.get(/** @type {string} */ (e.playerId)) ?? 0) + 1;
        goalsBy.set(/** @type {string} */ (e.playerId), n);
        if (!seen) continue;
        add('goal');
        addTeam('goal', teamId);
        if (data.scorcher) add('scorcher');
        if (n === 3) add('hat_trick');
        if (e.clock < 60) add('first_minute_goal');
        if (e.clock > 2 * half) {
          add('golden_goal');
          dayOf(t).golden++;
          if (data.scorcher) add('scorcher_golden_goal');
        } else if (result.decidedBy !== 'overtime' && result.decidedBy !== 'shootout' && teamId === winnerId
          && goals[teamId] === loserGoals + 1) {
          // The winning goal in regulation; the last minute, and two wider windows to compare (Tom: widened if too rare).
          if (e.clock >= 2 * half - 60) add('last_minute_winner');
          if (e.clock >= 2 * half - 120) add('late_winner_2m');
          if (e.clock >= 2 * half - 300) add('late_winner_5m');
        }
      } else if (e.type === 'burn' && seen) add('burn');
      else if (e.type === 'shootout_kick' && seen && players[/** @type {string} */ (e.playerId)]?.position === keeper) {
        add('keeper_kick');
        if (data.scored) add('keeper_kick_scored');
      }
    }
    if (result.decidedBy === 'shootout' && atEnd) add('shootout');
    if (seenAny) {
      add('match');
      for (const id of [m.homeId, m.awayId]) { addTeam('match', id); dayOf(m.kickoff).teams.add(id); }
    }
    if (atEnd) {
      if (result.homeGoals === 0) add('clean_sheet');
      if (result.awayGoals === 0) add('clean_sheet');
      if (result.homeGoals === 0 && result.awayGoals === 0) add('nil_nil');
      if (Math.abs(result.homeGoals - result.awayGoals) >= 5) add('big_win');
      if (winnerId) addTeam('win', winnerId);
    }
    if (atStart && atEnd) add('whole_match');
    for (const c of recordCaptions(live.records.inMatch(m.id), tl, captionCtx)) if (onScreen(m, m.kickoff + c.at)) add('record');
  };

  /** @type {Set<string>} */
  const counted = new Set();
  for (let t = from; t < to;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = programme.at(Math.max(p.from, t));
    if (seg.kind === 'live' && p.from >= from) {
      liveMs += p.until - p.from;
      for (const m of seg.group) if (!counted.has(m.id)) { counted.add(m.id); countMatch(m); }
    } else if (p.from >= from) {
      if (seg.kind === 'potm' && seg.show) add('interview');
      if (seg.kind === 'ads' && seg.part === 'bumper_in') add('ad_break');
      if (seg.kind === 'ident' && seg.next) occasions.set(seg.next.season, (occasions.get(seg.next.season) ?? new Set()).add(`opening-${seg.next.slot}`));
      if (seg.kind === 'talk' && seg.topic === 'signoff' && seg.match && !counted.has(`signoff-${seg.match.season}`)) {
        counted.add(`signoff-${seg.match.season}`);
        occasions.set(seg.match.season, (occasions.get(seg.match.season) ?? new Set()).add('signoff'));
      }
    }
    t = p.until > t ? p.until : t + 1000;
  }
  const dayCount = Math.round((to - from) / 86_400_000);
  counts.day = dayCount;
  const teams = config.teams.teams.length;
  for (const d of days.values()) {
    if (d.golden >= 2) add('two_golden_goals_day');
    if (d.teams.size === teams) add('every_team_day');
  }
  // The season's own opening (its first match's ident, slot 0) and its sign-off both aired.
  for (const set of occasions.values()) if (set.has('opening-0') && set.has('signoff')) add('opening_and_closing');
  return { days: dayCount, liveHours: liveMs / 3_600_000, counts, byTeam };
}
