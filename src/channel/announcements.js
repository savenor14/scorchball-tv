// The League's announcements at a moment (Task 262, refined in Task 265; docs/channel.md §24): what INFO's UPDATES tab
// and the ticker show. Pure and worked out from the data, not logged: Tom's announcements and inductions
// (data/decisions.json), and each poll's opening and result (data/polls.json), each from when it airs. Only what has
// aired by the moment asked, like the chronicle. Upkeep is quiet (Tom): rule changes are never announced.
import { allPolls } from './polls.js';
import { parseDayTime } from '../util.js';

/**
 * @typedef {object} Announcement
 * @property {string} id  "announcement:<id>", "induction:<id>", "poll_open:<poll>" or "poll_result:<poll>": unique.
 * @property {'announcement' | 'induction' | 'poll_open' | 'poll_result'} kind
 * @property {number} at  Epoch ms: when it airs.
 * @property {string} headline  The ticker's, in capitals.
 * @property {string} words  UPDATES'.
 * @property {string | null} roadmap  An announcement's roadmap idea.
 * @property {string | null} playerId  An induction's player.
 * @property {number | null} season  An induction's season (when it takes effect).
 * @property {{ id: string, votes: Record<string, number>, winner: { id: string, label: string, share: number } | null, total: number, closesAt: number } | null} poll
 */

/**
 * Every announcement aired by `t`, newest first.
 * @param {import('../config.js').Config} config
 * @param {{ instant: (season: number, minutes: number) => number }} calendar
 * @param {number} t  Epoch ms.
 * @returns {Announcement[]}
 */
export function announcementsAt(config, calendar, t) {
  /** @param {{ season: number, at: string }} a */
  const when = (a) => calendar.instant(a.season, parseDayTime(a.at).minutes);
  const base = { roadmap: null, playerId: null, season: null, poll: null };
  const format = new Intl.DateTimeFormat('en-US', { timeZone: config.settings.live.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  /** @type {Announcement[]} */
  const all = (config.decisions?.decisions ?? []).map((/** @type {any} */ d) => (d.kind === 'announcement'
    ? { ...base, id: `announcement:${d.id}`, kind: /** @type {const} */ ('announcement'), at: when(d.announced), headline: d.headline.toUpperCase(), words: d.words, roadmap: d.roadmap ?? null }
    : { ...base, id: `induction:${d.id}`, kind: /** @type {const} */ ('induction'), at: when(d.announced), headline: 'A NEW LEGEND FOR THE HALL OF FAME', words: d.reason, playerId: d.playerId, season: d.season }));
  for (const p of allPolls(config, calendar, Infinity)) {
    const raw = /** @type {any} */ (config.polls.polls.find((/** @type {any} */ x) => x.id === p.id));
    const close = format.format(new Date(p.closesAt)).toUpperCase().replace(',', '');
    all.push({ ...base, id: `poll_open:${p.id}`, kind: 'poll_open', at: p.opensAt, headline: `NEW POLL: ${p.question} VOTE IN AUDIENCE`, words: `${p.question} Vote in the AUDIENCE pane until ${close}.`, poll: { id: p.id, votes: {}, winner: null, total: 0, closesAt: p.closesAt } });
    if (raw.result) {
      const votes = /** @type {Record<string, number>} */ ({ ...raw.result.votes });
      const total = Object.values(votes).reduce((a, b) => a + b, 0);
      const best = p.options.map((o) => ({ ...o, n: votes[o.id] ?? 0 })).sort((a, b) => b.n - a.n)[0];
      const winner = best && best.n > 0 ? { id: best.id, label: best.label, share: Math.round((best.n / total) * 100) } : null;
      all.push({
        ...base, id: `poll_result:${p.id}`, kind: 'poll_result', at: when(raw.result.announced),
        headline: winner ? `POLL: ${p.question} ${winner.label}, ${winner.share}%` : `POLL: ${p.question} NO VOTES`,
        words: winner ? `${p.question} ${winner.label} with ${winner.share}% of ${total} votes. Every result in AUDIENCE.` : `${p.question} No votes were cast.`,
        poll: { id: p.id, votes, winner, total, closesAt: p.closesAt },
      });
    }
  }
  return all.filter((a) => a.at <= t).sort((a, b) => b.at - a.at);
}
