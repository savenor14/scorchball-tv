// How soon each voiced line comes round again (Task 257): a season of the programme as it airs, every line the
// commentators, the desk and the interview say, with when, so the lines heard again soonest get more ways. Pure and
// browser-safe, for npm run repeats. Not counted: the commentators' calls of passes in a row and of a player holding
// the ball (worked out live, from the picture), and the off-season night's talk (a different show).
import { collectFacts } from '../chronicle/factsLeague.js';
import { createCalendar } from './calendar.js';
import { commentaryCalls, commentatorFor, dealt, roundShape } from './commentary.js';
import { factKey, interviewTalk } from './interviewTalk.js';
import { LiveLeague } from './liveLeague.js';
import { quoteChoice } from './potm.js';
import { createProgramme } from './programme.js';
import { talkContext, talkScript } from './talk.js';
import { createTimeline } from './timeline.js';

/**
 * One group of lines dealt (or rolled) together: a desk kind, a commentary moment, an interview reaction or fact.
 * @typedef {object} Group
 * @property {'desk' | 'commentary' | 'interview'} voice
 * @property {string} group  The kind, the moment, or the interview's sentence set.
 * @property {number} lines  How many ways it has (the commentary: lines in its deck).
 * @property {number} heard  Times heard in the season.
 * @property {number} perDay
 * @property {number} hoursBetween  On average, hours between hearing the same line (the season's hours over each line's hearings).
 * @property {number} soonestHours  The shortest time between two hearings of the same line, in hours.
 * @property {number | null} perMatch  The commentary only: how often each line is heard in a match, on average (a
 *   viewer watches a whole match, so this is what they notice).
 */

/**
 * Every voiced line of a season, grouped.
 * @param {any} config @param {string} seed @param {number} season
 * @returns {{ days: number, groups: Group[] }}
 */
export function countRepeats(config, seed, season) {
  const calendar = createCalendar(config);
  const from = calendar.instant(season, 0);
  const to = calendar.instant(season + 1, 0);
  const hours = (to - from) / 3_600_000;
  /** @type {Map<string, { voice: Group['voice'], group: string, lines: number, at: Map<string, number[]> }>} */
  const groups = new Map();
  /** @param {Group['voice']} voice @param {string} group @param {number} lines @param {string} line @param {number} at */
  const heard = (voice, group, lines, line, at) => {
    const key = `${voice}|${group}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { voice, group, lines, at: new Map() }));
    const times = g.at.get(line) ?? [];
    times.push(at);
    g.at.set(line, times);
  };

  // The desk: the programme as it airs.
  const live = new LiveLeague(config, { now: from, seed });
  /** @type {Map<string, import('./timeline.js').Timeline>} */
  const timelines = new Map();
  const timelineOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => timelines.get(m.id) ?? /** @type {any} */ (timelines.set(m.id, createTimeline(m, config)).get(m.id));
  const programme = createProgramme(live, timelineOf);
  const ctx = talkContext(live, timelineOf);
  const lines = config.studio.lines;
  for (let t = from; t < to;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = programme.at(Math.max(p.from, t));
    if (seg.kind === 'talk' && p.from >= from) {
      const script = seg.script === undefined ? talkScript(seg, live, seg.from, ctx) : seg.script;
      for (const line of script ?? []) {
        const kind = line.clip.kind;
        heard('desk', kind, lines[kind]?.ways.length ?? 1, `${kind}#${line.clip.way}`, seg.from);
      }
    }
    t = p.until > t ? p.until : t + 1000;
  }

  // The commentators: every match of the season, its commentator's calls.
  const shape = roundShape(config);
  const players = live.league.players;
  const matches = live.matchesIn(season).length;
  for (const m of live.matchesIn(season)) {
    const who = commentatorFor(m, config.commentary, shape);
    const calls = commentaryCalls(timelineOf(m), { matchId: m.id, homeId: m.homeId, commentatorId: who.id, data: config.commentary, settings: config.settings.commentary, stage: m.stage, surnameOf: (id) => players[id]?.lastName });
    for (const c of calls) {
      const deck = config.commentary.moments[c.moment] ? dealt(config.commentary, c.moment).length : 1;
      heard('commentary', c.moment, deck, c.line, m.kickoff + c.at);
    }
  }

  // The interview: each match's player of the match, two sentences or a canned quote.
  const { chronicle, after } = collectFacts(config, seed, season);
  const kickoff = new Map(live.matchesIn(season).map((m) => [m.id, m.kickoff]));
  const data = config.interviews;
  for (const x of after) {
    const at = kickoff.get(x.matchId);
    if (at === undefined || !x.potm) continue;
    const m = /** @type {any} */ (chronicle.matches.get(x.matchId));
    const outcome = m.winnerId === null ? 'draw' : m.winnerId === x.potm.teamId ? 'win' : 'loss';
    const talk = interviewTalk(x.facts, { matchId: m.id, playerId: x.potm.playerId, teamId: x.potm.teamId, outcome }, data);
    if (talk) {
      const [reaction, fact] = talk.sentences;
      heard('interview', `reaction (${outcome})`, data.reactions[outcome].length, reaction.key, at);
      const kind = factKey(talk.fact);
      heard('interview', `fact ${kind}`, data.facts[kind]?.length ?? 1, fact.key, at);
    } else {
      const isKeeper = chronicle.players.get(x.potm.playerId)?.position === config.positions.keeper;
      const summary = { result: { homeGoals: m.homeGoals, awayGoals: m.awayGoals, decidedBy: m.decidedBy, shootout: m.shootout } };
      const q = quoteChoice(/** @type {any} */ ({ teamId: x.potm.teamId, stats: { goals: x.potm.goals } }), /** @type {any} */ ({ id: m.id, homeId: m.homeId, awayId: m.awayId, summary }), data.quotes, isKeeper);
      const [role, result] = q.key.split('-');
      heard('interview', `quote (${role}, ${result})`, data.quotes[role][result].length, q.key, at);
    }
  }

  const days = Math.round((to - from) / 86_400_000);
  /** @type {Group[]} */
  const out = [...groups.values()].map((g) => {
    const all = [...g.at.values()];
    const count = all.reduce((n, ts) => n + ts.length, 0);
    let soonest = Infinity;
    for (const ts of all) {
      ts.sort((a, b) => a - b);
      for (let i = 1; i < ts.length; i++) soonest = Math.min(soonest, ts[i] - ts[i - 1]);
    }
    // Each line's hearings spread over the season: the season's hours over the hearings a line gets on average.
    const lineCount = Math.max(g.lines, g.at.size);
    return { voice: g.voice, group: g.group, lines: lineCount, heard: count, perDay: count / days, hoursBetween: (hours * lineCount) / count, soonestHours: soonest / 3_600_000, perMatch: g.voice === 'commentary' ? count / matches / lineCount : null };
  });
  return { days, groups: out.sort((a, b) => a.hoursBetween - b.hoursBetween) };
}
