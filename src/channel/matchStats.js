// Live match stats for the side panel (Task 32): counted from a match's events up to the moment on screen, so a live
// match, a re-air or a highlight never shows anything that hasn't happened yet. Pure and DOM-free. See docs/channel.md §6.
// At the final whistle the counts equal the sim's own match totals (tested).

/**
 * @typedef {object} TeamStats
 * @property {number} goals @property {number} shots @property {number} onTarget  Shots that scored or were saved.
 * @property {number} saves  By this team's keeper. @property {number} possession  Game seconds with the ball.
 * @property {number} tackles  Balls won, steals included (as the sim counts them). @property {number} steals  Of those,
 *   passes cut out (Task 33). @property {number} blocks  Shots this team blocked (Task 183). @property {number} scorchers
 * @property {number} burns @property {number} fouls
 *
 * @typedef {{ minute: number, playerId: string, teamId: string, scorcher: boolean }} ScorerLine
 * @typedef {{ home: TeamStats, away: TeamStats, scorers: ScorerLine[] }} MatchStats
 */

/** A team's stats before anything has happened (the side panel's UP NEXT too). @returns {TeamStats} */
export const zero = () => ({ goals: 0, shots: 0, onTarget: 0, saves: 0, possession: 0, blocks: 0, tackles: 0, steals: 0, scorchers: 0, burns: 0, fouls: 0 });

/**
 * A match's stats as they stand `elapsed` ms after its kick-off.
 * @param {import('./timeline.js').Timeline} timeline
 * @param {number} elapsed
 * @returns {MatchStats}
 */
export function matchStatsAt(timeline, elapsed) {
  const home = zero();
  const away = zero();
  /** @type {ScorerLine[]} */
  const scorers = [];
  const of = (/** @type {string | null | undefined} */ teamId) => (teamId === timeline.homeId ? home : away);
  const other = (/** @type {string | null | undefined} */ teamId) => (teamId === timeline.homeId ? away : home);
  /** @type {string | null} */
  let holder = null;
  let since = 0;
  const n = timeline.countAt(elapsed);
  for (let i = 0; i < n; i++) {
    const { event: e } = timeline.events[i];
    const data = /** @type {any} */ (e.data);
    switch (e.type) {
      case 'shot': of(e.teamId).shots++; break;
      case 'save': of(e.teamId).saves++; other(e.teamId).onTarget++; break; // the save's team is the keeper's
      case 'goal':
        of(e.teamId).goals++;
        of(e.teamId).onTarget++;
        if (data.scorcher) of(e.teamId).scorchers++;
        scorers.push({ minute: Math.floor(/** @type {number} */ (e.clock) / 60) + 1, playerId: /** @type {string} */ (e.playerId), teamId: /** @type {string} */ (e.teamId), scorcher: Boolean(data.scorcher) });
        break;
      case 'possession_change':
        if (data.reason === 'tackle') of(e.teamId).tackles++;
        if (data.reason === 'tackle' && data.steal) of(e.teamId).steals++;
        break;
      case 'block': of(e.teamId).blocks++; break; // the block's team is the blocker's
      case 'burn': of(e.teamId).burns++; break;
      case 'foul': of(e.teamId).fouls++; break;
    }
    if (e.type === 'kickoff' || e.type === 'possession_change') {
      if (holder !== null) of(holder).possession += /** @type {number} */ (e.clock) - since;
      holder = e.teamId ?? null;
      since = /** @type {number} */ (e.clock);
    }
  }
  const state = timeline.stateAt(elapsed);
  const playing = state.phase === 'first_half' || state.phase === 'second_half' || state.phase === 'overtime';
  const clockNow = playing ? state.clock : timeline.events[Math.max(0, n - 1)]?.event.clock ?? 0;
  if (holder !== null) of(holder).possession += Math.max(0, /** @type {number} */ (clockNow) - since);
  return { home, away, scorers };
}

/**
 * The panel's rows: label, home, away. GOALS first (Groundwork, Tom: between matches the panel still shows the last
 * match, and the score said how it ended only through the goals list). Possession as a share of the time so far, then
 * BLOCKS (Task 183: the defenders' work, beside the balls won). Steals and tackles are shown as the two kinds of ball won,
 * so TACKLES leaves the steals out.
 * @param {MatchStats} s
 * @returns {[string, string, string][]}
 */
export function statRows(s) {
  const total = s.home.possession + s.away.possession;
  const pct = (/** @type {number} */ v) => (total > 0 ? `${Math.round((100 * v) / total)}%` : '-');
  /** @type {[string, keyof TeamStats][]} */
  const counts = [['GOALS', 'goals'], ['SHOTS', 'shots'], ['ON GOAL', 'onTarget'], ['SAVES', 'saves'], ['BLOCKS', 'blocks'], ['STEALS', 'steals'], ['TACKLES', 'tackles'], ['SCORCHERS', 'scorchers'], ['BURNS', 'burns'], ['FOULS', 'fouls']];
  const value = (/** @type {TeamStats} */ t, /** @type {keyof TeamStats} */ key) => (key === 'tackles' ? t.tackles - t.steals : t[key]);
  const rows = counts.map(([label, key]) => /** @type {[string, string, string]} */ ([label, String(value(s.home, key)), String(value(s.away, key))]));
  rows.splice(4, 0, ['POSS', pct(s.home.possession), pct(s.away.possession)]);
  return rows;
}
