// The league's daily post (the Director's TODAY tab; getting the word out, docs/launch-plan.md), for Tom to copy and
// post with its picture (the share card, shareCard.js, which carries the results and the table; Tom, 2026-10-22): the
// text short (the day in a line, the player of the day, one standout, the link, within Bluesky's 300 characters), the
// picture's alt text the whole day (the results, the table, the same lines) for anyone who can't see it. Pure, no DOM:
// the desk (src/cli/directorDesk.js) gives it a day's finished matches.
//
// The standout, the best first: a golden goal, a shootout, the champions, a five-goal haul (clipMoments' picks), else
// the biggest win, else the day's scorchers; left out when it's the player of the day's own haul, or the post is too long.
import { clipMoments } from '../channel/clipMoments.js';
import { playerOfTheDay } from '../sim/potm.js';

/** Bluesky's limit, in characters as people count them. */
export const POST_MAX = 300;

/** A string's length as Bluesky counts it (by grapheme, near enough: by code point). @param {string} s */
export const postLength = (s) => [...s].length;

/**
 * @typedef {import('../channel/liveLeague.js').LiveMatch} LiveMatch
 * @typedef {object} DayPost
 * @property {string} text  The post.
 * @property {number} chars
 * @property {string} alt  The picture's alt text: the whole day.
 * @property {import('../channel/clipMoments.js').ClipMoment | null} clip  The day's best moment for a clip.
 * @property {DayCard} card  The day as data, for its picture (the share card, sharecard.html).
 * @typedef {object} DayCard
 * @property {string} heading
 * @property {{ homeId: string, awayId: string, hg: number, ag: number, how: '' | 'golden goal' | 'pens', pens: [number, number] | null, stage: string }[]} results
 * @property {{ kind: string, text: string, teamId: string | null, who: string | null }} standout  kind: golden, shootout,
 *   finalGoal, haul, bigWin, scorchers, or '' (none).
 * @property {{ teamId: string, points: number, won: number, drawn: number, lost: number }[]} table  The whole regular-season
 *   table after the day (in the playoffs, as the regular season ended).
 * @property {boolean} playoffs
 * @property {{ who: string, teamId: string, line: string, words: string } | null} playerOfDay  line "10 GOALS, 3 ASSISTS IN 2
 *   MATCHES" (the card), words "10 goals and 3 assists in 2 matches" (the text).
 * @property {string | null} champions  The final's winner, on its day.
 */

/**
 * @param {object} o
 * @param {string} o.heading  "Scorchball · Season 2, Thursday"
 * @param {LiveMatch[]} o.matches  The day's matches, all finished.
 * @param {(m: LiveMatch) => import('../channel/timeline.js').Timeline} o.timelineOf
 * @param {(id: string) => string} o.playerName
 * @param {(id: string) => string} o.abbr
 * @param {any} o.clipSettings  settings.clips
 * @param {{ teamId: string, points: number }[]} o.table  The regular-season table after the day (empty in the playoffs).
 * @param {{ teamId: string, points: number, won: number, drawn: number, lost: number }[]} [o.fullTable]  The whole table, for the card.
 * @param {{ weights: Record<string, number>, winBonus: number }} [o.potm]  interviews.potm, for the player of the day.
 * @param {string} [o.dayKey]
 * @param {string} o.link  "scorchball.tv/?from=bsky"
 * @param {number} [o.max]
 * @returns {DayPost}
 */
export function dayPost({ heading, matches, timelineOf, playerName, abbr, clipSettings, table, link, max = POST_MAX, fullTable = [], potm, dayKey = '' }) {
  const score = (/** @type {LiveMatch} */ m) => {
    const r = m.summary.result;
    const so = /** @type {{ home: number, away: number } | null} */ (r.shootout ?? null);
    const how = r.decidedBy === 'overtime' ? ' (golden goal)' : r.decidedBy === 'shootout' ? ` (${so ? `${so.home}-${so.away} ` : ''}pens)` : '';
    return `${abbr(m.homeId)} ${r.homeGoals}-${r.awayGoals} ${abbr(m.awayId)}${how}`;
  };
  const results = matches.map(score);
  const moments = clipMoments({ matches, timelineOf, playerName, abbr, settings: { ...clipSettings, listMax: 1000 }, now: Infinity });
  const best = moments.find((x) => x.kind !== 'scorcher') ?? null;
  const standout = best ? sentence(best, /** @type {LiveMatch} */ (matches.find((x) => x.id === best.matchId)), abbr) : biggestWin(matches, abbr) ?? scorchers(matches, timelineOf);
  const potd = dayPlayer(matches, potm, dayKey, playerName);
  const goals = matches.reduce((n, m) => n + m.summary.result.homeGoals + m.summary.result.awayGoals, 0);
  const dayLine = `${heading}: ${matches.length} match${matches.length === 1 ? '' : 'es'}, ${goals} goal${goals === 1 ? '' : 's'}.`;
  const potdLine = potd ? `Player of the day: ${potd.who} (${abbr(potd.teamId)}), ${potd.words}.` : '';
  // The standout, unless it's the player of the day's own haul (said already).
  const own = best?.kind === 'haul' && potd !== null && best.who === potd.who;
  const build = (/** @type {boolean} */ withStandout) => [dayLine, potdLine, withStandout && !own ? standout : '', link].filter(Boolean).join('\n');
  let text = build(true);
  if (postLength(text) > max) text = build(false);
  // The picture's alt text: the whole day, for anyone who can't see it.
  const tableLine = fullTable.length ? `${table.length ? 'The table' : 'The final table'}: ${fullTable.map((r, i) => `${i + 1} ${abbr(r.teamId)} ${r.points}`).join(', ')}.` : '';
  const alt = [heading, `Results: ${results.join(', ')}.`, tableLine, potdLine, standout].filter(Boolean).join('\n');
  const card = {
    heading,
    results: matches.map((m) => {
      const r = m.summary.result;
      const so = /** @type {{ home: number, away: number } | null} */ (r.shootout ?? null);
      return { homeId: m.homeId, awayId: m.awayId, hg: r.homeGoals, ag: r.awayGoals, how: /** @type {'' | 'golden goal' | 'pens'} */ (r.decidedBy === 'overtime' ? 'golden goal' : r.decidedBy === 'shootout' ? 'pens' : ''), pens: so ? /** @type {[number, number]} */ ([so.home, so.away]) : null, stage: m.stage };
    }),
    standout: best ? { kind: best.kind, text: standout, teamId: best.kind === 'finalGoal' ? winnerOf(matches.filter((m) => m.id === best.matchId)) : best.teamId, who: best.who } : { kind: standout.startsWith('Biggest') ? 'bigWin' : standout ? 'scorchers' : '', text: standout, teamId: standout.startsWith('Biggest') ? winnerOf(matches) : null, who: null },
    table: fullTable,
    playoffs: !table.length,
    playerOfDay: potd,
    champions: matches.some((m) => m.stage === 'final') ? winnerOf(matches.filter((m) => m.stage === 'final')) : null,
  };
  return { text, chars: postLength(text), alt, clip: moments[0] ?? null, card };
}

/**
 * A moment as a sentence, with its match's final score (the label has the score as it stood).
 * @param {import('../channel/clipMoments.js').ClipMoment} m @param {LiveMatch} match @param {(id: string) => string} abbr
 */
function sentence(m, match, abbr) {
  const r = match.summary.result;
  const game = `${abbr(match.homeId)} ${r.homeGoals}-${r.awayGoals} ${abbr(match.awayId)}`;
  // The moment's label: "S2 R5 · PCG 2-1 VAR · 13' GOLDEN GOAL · E. Roskilly".
  const [, , what, who] = m.label.split(' · ');
  const minute = what?.match(/^\d+'/)?.[0] ?? '';
  if (m.kind === 'golden') return `A golden goal: ${who}, ${minute}, ${game}.`;
  if (m.kind === 'shootout') return `Settled on penalties: ${game}, the last kick ${who}'s.`;
  if (m.kind === 'finalGoal') {
    const homeWon = r.homeGoals > r.awayGoals || (r.homeGoals === r.awayGoals && (r.shootout?.home ?? 0) > (r.shootout?.away ?? 0));
    const [w, l, wg, lg] = homeWon ? [match.homeId, match.awayId, r.homeGoals, r.awayGoals] : [match.awayId, match.homeId, r.awayGoals, r.homeGoals];
    return `${abbr(w)} are champions, ${wg}-${lg} over ${abbr(l)}, the last goal ${who}'s (${minute}).`;
  }
  return `Five goals for ${who} in ${game}.`;
}

/** The day's biggest win, if one stands out (three goals or more). @param {LiveMatch[]} matches @param {(id: string) => string} abbr */
function biggestWin(matches, abbr) {
  const m = [...matches].sort((a, b) => margin(b) - margin(a))[0];
  if (!m || margin(m) < 3) return null;
  const r = m.summary.result;
  const [w, l, wg, lg] = r.homeGoals > r.awayGoals ? [m.homeId, m.awayId, r.homeGoals, r.awayGoals] : [m.awayId, m.homeId, r.awayGoals, r.homeGoals];
  return `Biggest win: ${abbr(w)} ${wg}-${lg} ${abbr(l)}.`;
}
/**
 * The player of the day, with their day in a line: the two biggest of goals, assists and saves, and their matches.
 * @param {LiveMatch[]} matches @param {{ weights: Record<string, number>, winBonus: number } | undefined} potm @param {string} dayKey
 * @param {(id: string) => string} playerName
 */
function dayPlayer(matches, potm, dayKey, playerName) {
  if (!potm) return null;
  const p = playerOfTheDay(matches, potm, dayKey);
  if (!p) return null;
  const said = [['goals', 'GOAL'], ['assists', 'ASSIST'], ['saves', 'SAVE']].map(([k, word]) => [p.stats[k] ?? 0, word]).filter(([n]) => Number(n) > 0).slice(0, 2);
  const line = `${said.map(([n, word]) => `${n} ${word}${n === 1 ? '' : 'S'}`).join(', ')}${said.length ? ' ' : ''}IN ${p.matches} MATCH${p.matches === 1 ? '' : 'ES'}`;
  const parts = said.map(([n, word]) => `${n} ${String(word).toLowerCase()}${n === 1 ? '' : 's'}`);
  const words = `${parts.join(' and ')}${parts.length ? ' ' : ''}in ${p.matches} match${p.matches === 1 ? '' : 'es'}`;
  return { who: playerName(p.playerId), teamId: p.teamId, line, words };
}

/** The biggest win's winner. @param {LiveMatch[]} matches */
function winnerOf(matches) {
  const m = [...matches].sort((a, b) => margin(b) - margin(a))[0];
  const r = m.summary.result;
  // Level after extra time: the shootout's winner.
  if (r.homeGoals === r.awayGoals) return (r.shootout?.home ?? 0) > (r.shootout?.away ?? 0) ? m.homeId : m.awayId;
  return r.homeGoals > r.awayGoals ? m.homeId : m.awayId;
}
/** @param {LiveMatch} m */
const margin = (m) => Math.abs(m.summary.result.homeGoals - m.summary.result.awayGoals);

/** The day's scorchers, counted. @param {LiveMatch[]} matches @param {(m: LiveMatch) => import('../channel/timeline.js').Timeline} timelineOf */
function scorchers(matches, timelineOf) {
  const n = matches.reduce((k, m) => k + timelineOf(m).events.filter((t) => t.event.type === 'goal' && (/** @type {any} */ (t.event.data)).scorcher).length, 0);
  return n ? `${n} scorcher${n === 1 ? '' : 's'} on the day.` : '';
}
