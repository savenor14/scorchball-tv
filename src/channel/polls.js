// The AUDIENCE pane's polls at a moment (Task 260; docs/channel.md §23; data/polls.json). Pure: no DOM, no network,
// so the channel, the dev server and the tests share it. A poll is seen from when it opens; it can be voted on until
// it closes; its tally is shown only once its result is announced (in the data with its date, Tom on the desk). The
// poll in gold at the top is the newest one seen while it's open or waiting for its result; the rest are past polls.
import { parseDayTime } from '../util.js';

/**
 * @typedef {object} PollOption
 * @property {string} id     A team's id (options "teams").
 * @property {string} label  As the pane shows it ("GULLS").
 *
 * @typedef {object} Poll
 * @property {string} id
 * @property {string} question  In capitals, as the pane shows it.
 * @property {PollOption[]} options
 * @property {number} opensAt   Epoch ms.
 * @property {number} closesAt  Epoch ms.
 * @property {'open' | 'closed'} status  At the moment asked.
 * @property {Record<string, number> | null} votes  The result, from when it's announced; null until then.
 *
 * @typedef {object} PollsNow
 * @property {Poll | null} current  The poll in gold: the newest seen, while open or waiting for its result.
 * @property {Poll[]} past  The others seen, newest first.
 */

/**
 * Every poll in the data, with its times as instants.
 * @param {import('../config.js').Config} config
 * @param {{ instant: (season: number, minutes: number) => number }} calendar
 * @param {number} t  Epoch ms: the moment, for each poll's status.
 * @returns {Poll[]} In the data's order (oldest first).
 */
export function allPolls(config, calendar, t) {
  const teams = /** @type {any[]} */ (config.teams.teams);
  return /** @type {any[]} */ (config.polls.polls).map((p) => {
    const opensAt = calendar.instant(p.season, parseDayTime(p.opens).minutes);
    const closesAt = calendar.instant(p.season, parseDayTime(p.closes).minutes);
    return {
      id: p.id,
      question: p.question.toUpperCase(),
      options: teams.map((x) => ({ id: x.id, label: x.shortName.toUpperCase() })),
      opensAt,
      closesAt,
      status: t < closesAt ? 'open' : 'closed',
      // The tally from when the result is announced (Task 262), never before.
      votes: p.result && calendar.instant(p.result.announced.season, parseDayTime(p.result.announced.at).minutes) <= t ? { ...p.result.votes } : null,
    };
  });
}

/**
 * The polls a viewer sees at `t`: the one in gold and the past ones.
 * @param {import('../config.js').Config} config
 * @param {{ instant: (season: number, minutes: number) => number }} calendar
 * @param {number} t  Epoch ms.
 * @returns {PollsNow}
 */
export function pollsAt(config, calendar, t) {
  const seen = allPolls(config, calendar, t).filter((p) => p.opensAt <= t).reverse();
  const first = seen[0];
  const current = first && (first.status === 'open' || !first.votes) ? first : null;
  return { current, past: current ? seen.slice(1) : seen };
}

/**
 * Whether a vote counts: a known poll, open at `t`, and one of its options.
 * @param {import('../config.js').Config} config
 * @param {{ instant: (season: number, minutes: number) => number }} calendar
 * @param {number} t  Epoch ms.
 * @param {string} pollId @param {string} optionId
 */
export function voteAllowed(config, calendar, t, pollId, optionId) {
  const p = allPolls(config, calendar, t).find((x) => x.id === pollId);
  return !!p && p.opensAt <= t && p.status === 'open' && p.options.some((o) => o.id === optionId);
}
