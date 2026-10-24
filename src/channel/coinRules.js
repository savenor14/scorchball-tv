// Fan Coins, version 2 (Tom, 2026-10-17; vision §8; docs/channel.md §29.6; settings.fanCoins.shared): the rules the
// audience service keeps, pure and DOM-free so the worker, the dev server and the tests share them. Coins are counted in
// the browser by version 1's rates and banked with the service at each check-in, never faster than a coin a minute and
// never past the daily cap for the household. Spends are shared: each joins a queue and gets a start, the same for
// everyone watching. The service can't build the league, so a spend in a match names it by season and slot and is
// checked against the published calendar; the halves' times come from the channel, checked to fall inside the match.
//
// The queues (Tom: several viewers may queue, up to fanCoins.shared.queueMax waiting, each shown its place and when it
// starts): the ticker, one message after another for tickerMinutes each; FAN BOARD (the back screen until Tom moved it
// beside the scorebug, 2026-10-21; its kind still 'screen'), one board after another for screenMinutes each, never in
// the final round; in a live match, each end's shouts, one after another
// for shoutSeconds; and each end's chants and flags together, a half each (Tom: one per end at a time), so at most the
// match's halves still to come. A viewer has at most one spend of a kind waiting or showing.

/** @typedef {'ticker' | 'chant' | 'flag' | 'screen' | 'shout'} SpendKind */
/** @typedef {'home' | 'away'} Side */
/**
 * @typedef {object} Row  A spend as the service keeps it (times in ms).
 * @property {number} [id]
 * @property {SpendKind} kind
 * @property {string} queue  The queue it's in: ticker, screen, shout|<match>|<side>, stands|<match>|<side>.
 * @property {number} slot  Its place in the queue: its start (ms), or the half (1 or 2) for the stands.
 * @property {Side | null} side
 * @property {string} choice  A picture's id (ticker, screen), a chant's id, a shout's number in data/fanCoins.json; '' for a flag.
 * @property {string | null} player  The player a shout names (I ♥ <star>).
 * @property {string | null} match  s<season>-<slot>.
 * @property {number} starts
 * @property {number} until
 */

export const KINDS = /** @type {const} */ (['ticker', 'chant', 'flag', 'screen', 'shout']);
/** A viewer's id: random hex, made and kept by the browser. */
export const VIEWER = /^[0-9a-f]{32}$/;
/** A match: its season and its slot in the calendar. */
export const MATCH = /^s([1-9]\d{0,4})-(\d{1,3})$/;
/** A player's id, as the league writes them. */
const PLAYER = /^[A-Za-z0-9_-]{1,40}$/;
/** The most coins one check-in may bank. */
const CHECK_IN_MAX = 120;
const MINUTE = 60_000;

/**
 * The days a viewer may be on at real time `now`: their own date, anywhere from UTC−12 to UTC+14.
 * @param {string} day @param {number} now
 */
export function plausibleDay(day, now) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const iso = (/** @type {number} */ t) => new Date(t).toISOString().slice(0, 10);
  return day >= iso(now - 12 * 3_600_000) && day <= iso(now + 14 * 3_600_000);
}

/**
 * A check-in: how many of the coins the channel counted can be banked. A wallet banks a coin a minute at most (its
 * `credited` moment moves on a minute for each coin), with at most bankMinutes of watching unbanked at once, and the
 * household at most dailyCap on the viewer's day.
 * @param {any} settings  config.settings.fanCoins.
 * @param {{ coins: number, credited: number | null, today: number, now: number }} o
 *   credited: the wallet's moment so far (null for a new wallet); today: what the household has banked on that day.
 * @returns {{ grant: number, credited: number }}
 */
export function bank(settings, { coins, credited, today, now }) {
  const from = Math.max(credited ?? now - MINUTE, now - settings.shared.bankMinutes * MINUTE);
  const due = Math.floor((now - from) / MINUTE);
  const grant = Math.max(0, Math.min(Math.floor(coins), due, settings.dailyCap - today));
  return { grant, credited: from + grant * MINUTE };
}

/** Whether a check-in's body is well formed. @param {any} body @param {number} now @returns {string | null} what's wrong */
export function checkInProblem(body, now) {
  if (typeof body?.viewer !== 'string' || !VIEWER.test(body.viewer)) return 'A check-in needs its viewer';
  if (!Number.isInteger(body.coins) || body.coins < 0 || body.coins > CHECK_IN_MAX) return 'Coins: a whole number';
  if (typeof body.day !== 'string' || !plausibleDay(body.day, now)) return 'Day: the viewer\'s own date';
  return null;
}

/**
 * A spend asked for, checked and made ready to queue: what it is, its queue and its match's limits.
 * @param {any} config @param {import('./calendar.js').Calendar} calendar @param {any} body @param {number} now
 * @param {string[]} pictures  The pictures' ids (fanCoins.js picturesOf).
 * @returns {{ error: string } | { kind: SpendKind, viewer: string, side: Side | null, choice: string, player: string | null, match: string | null, queue: string, halves: [number, number][] | null }}
 */
export function readSpend(config, calendar, body, now, pictures) {
  const s = config.settings.fanCoins;
  const kind = body?.kind;
  if (!KINDS.includes(kind)) return { error: 'Not a spend' };
  if (typeof body.viewer !== 'string' || !VIEWER.test(body.viewer)) return { error: 'A spend needs its viewer' };
  const viewer = body.viewer;
  if (kind === 'ticker' || kind === 'screen') {
    if (!pictures.includes(body.choice)) return { error: 'Not one of the pictures' };
    return { kind, viewer, side: null, choice: body.choice, player: null, match: null, queue: kind, halves: null };
  }
  // In a live match: the match on now, by the calendar, and its halves inside it.
  const side = body.side === 'home' || body.side === 'away' ? body.side : null;
  if (!side) return { error: 'Which end' };
  const m = typeof body.match === 'string' ? MATCH.exec(body.match) : null;
  const slot = m ? calendar.slots(Number(m[1]))[Number(m[2])] : null;
  const latest = slot ? slot.kickoff + s.shared.matchWindowMinutes * MINUTE : 0;
  if (!slot || now < slot.kickoff || now > latest) return { error: 'IN A LIVE MATCH' };
  const h = body.halves;
  const pair = (/** @type {any} */ x) => Array.isArray(x) && x.length === 2 && x.every(Number.isFinite);
  if (!Array.isArray(h) || h.length !== 2 || !h.every(pair)) return { error: 'The match\'s halves' };
  const [[a, b], [c, d]] = /** @type {[number, number][]} */ (h);
  if (!(slot.kickoff <= a && a < b && b <= c && c < d && d <= latest)) return { error: 'The match\'s halves' };
  const match = /** @type {string} */ (body.match);
  let choice = '';
  let player = null;
  if (kind === 'chant') {
    if (!config.fanCoins.chants.some((/** @type {any} */ x) => x.id === body.choice)) return { error: 'Not one of the chants' };
    choice = body.choice;
  } else if (kind === 'shout') {
    const i = Number(body.choice);
    const words = config.fanCoins.shouts[i];
    if (!Number.isInteger(i) || words === undefined) return { error: 'Not one of the shouts' };
    choice = String(i);
    if (words.includes('{star}')) {
      if (typeof body.player !== 'string' || !PLAYER.test(body.player)) return { error: 'Which player' };
      player = body.player;
    }
  }
  return { kind, viewer, side, choice, player, match, queue: `${kind === 'shout' ? 'shout' : 'stands'}|${match}|${side}`, halves: [[a, b], [c, d]] };
}

/**
 * When FAN BOARD can't show around `now` (Tom, 2026-10-21): the final round, when the strip beside the scorebug picks
 * the match to watch: from its kick-off to matchWindowMinutes after, this season's and the next's.
 * @param {any} config @param {import('./calendar.js').Calendar} calendar @param {number} now
 * @returns {[number, number][]}
 */
export function boardBlocked(config, calendar, now) {
  const season = calendar.seasonAt(now);
  return [season, season + 1].map((s) => {
    const k = calendar.slots(s)[calendar.regularCount - 1].kickoff;
    return /** @type {[number, number]} */ ([k, k + config.settings.fanCoins.shared.matchWindowMinutes * MINUTE]);
  });
}

/** A board's start: `from`, or after any blocked time it would overlap. @param {number} from @param {number} length @param {[number, number][]} blocked */
export function boardStart(from, length, blocked) {
  let starts = from;
  for (const [a, b] of [...blocked].sort((x, y) => x[0] - y[0])) if (starts < b && starts + length > a) starts = b;
  return starts;
}

/**
 * Where a spend goes in its queue, from what's in it (rows still waiting or showing, any order): its start, its end and
 * its slot, how many are ahead of it (the one showing included), or why it can't go in.
 * @param {any} settings  config.settings.fanCoins.
 * @param {SpendKind} kind @param {Row[]} queue @param {number} now
 * @param {[number, number][] | null} halves  A match's halves (its spends only).
 * @param {[number, number][]} [blocked]  When FAN BOARD can't show (boardBlocked): a board that would overlap one starts after it.
 * @returns {{ error: string } | { slot: number, starts: number, until: number, ahead: number }}
 */
export function place(settings, kind, queue, now, halves, blocked = []) {
  const live = queue.filter((r) => r.until > now).sort((x, y) => x.starts - y.starts);
  const waiting = live.filter((r) => r.starts > now).length;
  if (waiting >= settings.shared.queueMax) return { error: 'QUEUE FULL' };
  const last = live.at(-1);
  if (kind === 'ticker') {
    const starts = Math.max(now, last ? last.until : now);
    return { slot: starts, starts, until: starts + settings.tickerMinutes * MINUTE, ahead: live.length };
  }
  if (kind === 'screen') {
    // FAN BOARD: one after another, screenMinutes each, past any time it can't show.
    const starts = boardStart(Math.max(now, last ? last.until : now), settings.screenMinutes * MINUTE, blocked);
    return { slot: starts, starts, until: starts + settings.screenMinutes * MINUTE, ahead: live.length };
  }
  const [first, second] = /** @type {[number, number][]} */ (halves);
  if (kind === 'shout') {
    const starts = Math.max(now, last ? last.until : now);
    const until = starts + settings.shoutSeconds * 1000;
    if (until > second[1]) return { error: 'NO ROOM THIS MATCH' };
    return { slot: starts, starts, until, ahead: live.length };
  }
  // A chant or a flag: the rest of a half, the first one free that's still to finish (none at half-time but the second).
  const taken = new Set(live.map((r) => r.slot));
  for (const [half, [from, to]] of /** @type {[1 | 2, [number, number]][]} */ ([[1, first], [2, second]])) {
    if (now < to && !taken.has(half)) return { slot: half, starts: Math.max(now, from), until: to, ahead: live.length };
  }
  return { error: 'NO ROOM THIS MATCH' };
}

/**
 * What the feed sends: every spend still waiting or showing, the same for everyone (no viewer in it), oldest first.
 * @param {Row[]} rows
 */
export function feedOf(rows) {
  return rows.map((r) => ({ id: r.id, kind: r.kind, side: r.side, choice: r.choice, player: r.player, match: r.match, starts: r.starts, until: r.until })).sort((x, y) => x.starts - y.starts || /** @type {number} */ (x.id) - /** @type {number} */ (y.id));
}
