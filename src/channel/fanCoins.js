// Fan Coins (vision §8; docs/channel.md §29, version 2 §29.6; settings.fanCoins, data/fanCoins.json): a viewer earns them
// by watching and spends them on the channel: a message on the ticker, a chant from one end, a flag held up, a fan shout,
// FAN BOARD beside the scorebug. Earned here (the browser keeps the count, momentStore.js with this module's data) and
// banked with the audience service (coinBank.js); every spend is shared, in a queue (coinRules.js), and drawn here from
// the service's feed. Pure and DOM-free: the channel tells the earner, every frame, what's on screen, and asks what's
// showing. Never a sim input.
//
// Earning (Tom, 2026-10-16): only while the tab shows (a gap between frames over frameGapSeconds counts nothing and
// breaks a highlights package being watched whole). A coin every liveMinutes of live play; every offseasonMinutes of the
// off-season show as it airs (the trophy lift, the champions, the awards, the farewells, the lottery, the draft, the
// moves; its repeats are replays); one for each highlights package watched whole (from within graceSeconds of its
// start); every studioMinutes of everything else: re-airs, the desk, cards, the build-up, ads, the ident, the countdown.
// At most dailyCap a day, from midnight in the viewer's own time.
//
// Showing (the queues' rules are coinRules.js's): a ticker message for tickerMinutes; FAN BOARD for screenMinutes; a
// chant or a flag in a live match for the rest of its half, the chant coming round every chantEverySeconds (Tom: any
// oftener grates), one chant or flag per end at a time; a fan shout (Tom's notes, task 3) over its end's fans for
// shoutSeconds; chants, flags and shouts kept out of a goal's celebration, and shown again at the same moment of a re-air.
import { winnerOf } from '../sim/potm.js';
import { boardStart } from './coinRules.js';
import { isFinished, tableAt } from './onScreen.js';
import { OLE, parseTune } from './soundRecipes.js';

// Version 2 (2026-10-17): the viewer's id and the coins pending banking; version 1's data started afresh (Tom).
export const DATA_VERSION = 2;

/**
 * @typedef {'ticker' | 'chant' | 'flag' | 'screen' | 'shout'} SpendKind
 * @typedef {'home' | 'away'} Side
 * @typedef {object} Spend  One spent, while it lasts.
 * @property {SpendKind} kind
 * @property {number} at  When (channel time, ms).
 * @property {string} choice  A picture's id (ticker, screen) or a chant's id (chant); a flag's side; a shout's words.
 * @property {Side} [side]  A chant's or a shout's end.
 * @property {string} [instance]  A chant's or flag's match: live:<id>.
 * @property {number} [until]  When a chant or flag ends: its half's end.
 * @property {number} [id]  Version 2: its id in the service's feed.
 * @typedef {object} CoinData  What the browser keeps.
 * @property {number} v
 * @property {string} viewer  Version 2: this browser's id with the audience service (coinBank.js newViewer).
 * @property {number} pending  Version 2: coins earned here, not yet banked.
 * @property {string} day  The viewer's own date, "2026-10-15": today's counts are for it.
 * @property {number} today  Earned today (against the cap).
 * @property {number} balance
 * @property {number} liveMs  Live play watched towards the next coin.
 * @property {number} studioMs  Everything else watched (the studio, re-airs, ads) towards the next coin.
 * @property {number} offseasonMs  The off-season show watched as it airs towards the next coin.
 * @property {Spend[]} active
 */

/** A fresh viewer's data. @returns {CoinData} */
export function emptyData() {
  return { v: DATA_VERSION, viewer: '', pending: 0, day: '', today: 0, balance: 0, liveMs: 0, studioMs: 0, offseasonMs: 0, active: [] };
}

/** Data read back from storage, made safe: anything missing filled in, another version started afresh. @param {any} raw @returns {CoinData} */
export function normalizeData(raw) {
  const fresh = emptyData();
  if (!raw || typeof raw !== 'object' || raw.v !== DATA_VERSION) return fresh;
  const n = (/** @type {any} */ x) => (Number.isFinite(x) && x >= 0 ? x : 0);
  return {
    v: DATA_VERSION,
    viewer: typeof raw.viewer === 'string' && /^[0-9a-f]{32}$/.test(raw.viewer) ? raw.viewer : '',
    pending: n(raw.pending),
    day: typeof raw.day === 'string' ? raw.day : '',
    today: n(raw.today),
    balance: n(raw.balance),
    liveMs: n(raw.liveMs),
    studioMs: n(raw.studioMs),
    offseasonMs: n(raw.offseasonMs),
    active: Array.isArray(raw.active) ? raw.active.filter((s) => s && typeof s === 'object' && typeof s.kind === 'string' && Number.isFinite(s.at)) : [],
  };
}

/** The viewer's own date at real time `now` (ms), "2026-10-15". @param {number} now */
export function dayOf(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Minutes to the viewer's next midnight from real time `now`, for the pane's countdown. @param {number} now */
export function minutesToMidnight(now) {
  const d = new Date(now);
  return Math.ceil((new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - now) / 60_000);
}

/**
 * A chant, ready to play: its lines with when each is sung (ms from the chant's start), and its length.
 * @param {any} config @param {string} id
 * @returns {{ id: string, words: string, tune: string[] | undefined, lines: { words: string, from: number, to: number }[], sung: { from: number, to: number }[], length: number } | null}
 *   sung: when voices sing (the end waves its arms then; not through its claps and breaths).
 */
export function chantOf(config, id) {
  const c = config.fanCoins.chants.find((/** @type {any} */ x) => x.id === id);
  if (!c) return null;
  const syllables = c.tune ? parseTune(c.tune) : OLE.map(([vowel, note, len]) => ({ vowel, note, len }));
  const starts = [0];
  for (const s of syllables) starts.push(starts.at(-1) + s.len * 1000);
  let i = 0;
  const lines = c.lines.map((/** @type {{ words: string, syllables: number }} */ l) => {
    const from = starts[i];
    i += l.syllables;
    return { words: l.words, from, to: starts[i] };
  });
  /** @type {{ from: number, to: number }[]} */
  const sung = [];
  syllables.forEach((x, k) => {
    if (x.vowel === 'clap' || x.vowel === 'rest') return;
    const last = sung.at(-1);
    if (last && last.to === starts[k]) last.to = starts[k + 1];
    else sung.push({ from: starts[k], to: starts[k + 1] });
  });
  return { id: c.id, words: c.words, tune: c.tune, lines, sung, length: /** @type {number} */ (starts.at(-1)) };
}

/** FAN BOARD's and the ticker's pictures: the general ones, then GO <TEAM>! for each team. @param {any} config */
export function picturesOf(config) {
  return [
    ...config.fanCoins.pictures.map((/** @type {any} */ p) => ({ id: p.id, words: p.words, teamId: /** @type {string | null} */ (null) })),
    ...config.teams.teams.map((/** @type {any} */ t) => ({ id: t.id, words: config.fanCoins.teamWords.replace('{team}', t.shortName.toUpperCase()), teamId: /** @type {string | null} */ (t.id) })),
  ];
}

/**
 * The live match on screen that a chant or flag would go with (Tom: live matches only), its half (1 or 2, 0 at
 * half-time) and when that half ends.
 * @param {import('./programme.js').Segment} seg @param {number} t
 * @param {(m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline} timelineOf
 * @returns {{ instance: string, half: 0 | 1 | 2, until: number } | null}
 */
export function matchOnScreen(seg, t, timelineOf) {
  if (seg.kind !== 'live') return null;
  const tl = timelineOf(seg.match);
  const br = tl.breaks[0] ?? { from: tl.duration, to: tl.duration };
  const elapsed = t - seg.match.kickoff;
  const half = elapsed < br.from ? 1 : elapsed >= br.to ? 2 : 0;
  return { instance: `live:${seg.match.id}`, half, until: half === 1 ? seg.match.kickoff + br.from : seg.match.kickoff + tl.duration };
}

/**
 * The match being played on screen, live or re-aired (2026-10-18: its spends shown again on its re-airs), and the moment
 * of it showing as the channel's time when it was live (its kick-off and how far in), so a spend made live shows at the
 * same moment of every re-air, its time in the live match's.
 * @param {import('./programme.js').Segment} seg @param {number} t
 * @returns {{ match: import('./liveLeague.js').LiveMatch, instance: string, at: number, replay: boolean } | null}
 */
export function matchShown(seg, t) {
  if (seg.kind === 'live') return { match: seg.match, instance: `live:${seg.match.id}`, at: t, replay: false };
  if (seg.kind === 'reair' && seg.part === 'match') return { match: seg.match, instance: `live:${seg.match.id}`, at: seg.match.kickoff + seg.elapsed, replay: true };
  return null;
}

/**
 * A live match's goal celebrations (its clock's pauses for goals), channel time, which the stands' spends keep out of (Tom).
 * @param {import('./programme.js').Segment} seg
 * @param {(m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline} timelineOf
 */
function goalsOf(seg, timelineOf) {
  if (seg.kind !== 'live' && !(seg.kind === 'reair' && seg.part === 'match')) return [];
  return timelineOf(seg.match).pauses.filter((p) => p.kind === 'goal').map((p) => ({ from: seg.match.kickoff + p.at, to: seg.match.kickoff + p.at + p.ms }));
}
/**
 * When a fan shout meant to start at `at` pops up (Tom: after a goal's celebration if one's on): at once, or as the
 * celebration on then ends. Not held back for celebrations to come (2026-10-18, the final's 14 goals: waiting for a
 * clear 30 s pushed an away shout past its slot, and it never showed).
 * @param {{ from: number, to: number }[]} goals @param {number} at
 */
function afterCelebration(goals, at) {
  const on = goals.find((g) => at >= g.from && at < g.to);
  return on ? on.to : at;
}

/** When something meant to start at `at`, `length` long, starts: after any celebration it would run into. @param {{ from: number, to: number }[]} goals @param {number} at @param {number} length */
function clearOfGoals(goals, at, length) {
  let start = at;
  for (const g of goals) if (start < g.to && start + length > g.from) start = g.to;
  return start;
}

/**
 * What's showing at `t`: a chant (and where it's got to), a flag, a ticker message, FAN BOARD, a fan shout. In a
 * re-air, the match's own spends (`replays`, from the service) at the moment of the match they had live.
 * @param {any} config @param {CoinData} data
 * @param {{ t: number, seg: import('./programme.js').Segment, timelineOf: (m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline }} at
 * @param {Spend[]} [replays]  The re-aired match's chants, flags and shouts as they were live.
 */
export function showing(config, data, { t, seg, timelineOf }, replays = []) {
  const s = config.settings.fanCoins;
  const m = matchShown(seg, t);
  // The match's spends in its own time: live, the channel's; re-aired, the moment it had live.
  const mt = m ? m.at : t;
  const on = (/** @type {Spend} */ x) => m !== null && x.instance === m.instance && mt >= x.at && mt < /** @type {number} */ (x.until);
  const spends = m?.replay ? [...data.active.filter((x) => x.instance !== m.instance), ...replays.filter((x) => x.instance === m.instance)] : data.active;
  /** @type {{ chant: ReturnType<typeof chantOf> & {}, side: Side, into: number, line: number, sung: boolean, round: number, start: number } | null} */
  let chant = null;
  /** @type {{ side: Side } | null} */
  let flag = null;
  /** @type {string | null} */
  let ticker = null;
  /** @type {string | null} */
  let screen = null;
  // The match's goal celebrations, which a chant and a flag keep out of (Tom).
  const goals = m ? goalsOf(seg, timelineOf) : [];
  const clear = (/** @type {number} */ at, /** @type {number} */ length) => clearOfGoals(goals, at, length);
  /** @type {{ words: string, side: Side } | null} */
  let shout = null;
  for (const x of spends) {
    if (x.kind === 'chant' && on(x)) {
      const c = chantOf(config, x.choice);
      if (!c) continue;
      const every = s.chantEverySeconds * 1000;
      const k = Math.floor((mt - x.at) / every);
      // This round, or the last one if a celebration pushed it on; each sung whole, none so late in the half that it's cut off.
      for (const round of [k, k - 1]) {
        if (round < 0) continue;
        const start = clear(x.at + round * every, c.length);
        const into = mt - start;
        if (into >= 0 && into < c.length && start + c.length <= /** @type {number} */ (x.until)) {
          chant = { chant: c, side: x.side ?? 'home', into, line: c.lines.findIndex((l) => into >= l.from && into < l.to), sung: c.sung.some((l) => into >= l.from && into < l.to), round, start };
          break;
        }
      }
    } else if (x.kind === 'flag' && on(x)) {
      // Lowered through a goal's celebration, then held up again.
      if (!goals.some((g) => mt >= g.from && mt < g.to)) flag = { side: x.choice === 'away' ? 'away' : 'home' };
    }
    else if (x.kind === 'shout' && on(x)) shout = { words: x.choice, side: x.side ?? 'home' };
    else if (x.kind === 'ticker' && t >= x.at && t - x.at < s.tickerMinutes * 60_000) ticker = x.choice;
    // FAN BOARD (Tom, 2026-10-21): beside the scorebug, from its start for screenMinutes.
    else if (x.kind === 'screen' && t >= x.at && t < /** @type {number} */ (x.until)) screen = x.choice;
  }
  return { chant, flag, ticker, screen, shout };
}

/**
 * The earner: told every frame what's on screen, it adds what was earned (returned, for the +1) and keeps the spends
 * tidy (what's over is dropped).
 * @param {object} o
 * @param {any} o.config
 * @param {CoinData} o.data  Changed in place; o.onChange is told.
 * @param {(m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline} o.timelineOf
 * @param {() => void} [o.onChange]
 */
export function createEarner({ config, data, timelineOf, onChange }) {
  const s = config.settings.fanCoins;
  const gapMs = s.frameGapSeconds * 1000;
  const graceMs = s.graceSeconds * 1000;
  /** Real time of the last visible frame, or null after a hidden one. @type {number | null} */
  let lastWall = null;
  /** A highlights package being watched, and whether it's been whole so far. @type {{ key: string, whole: boolean } | null} */
  let piece = null;
  /** The off-season show's scenes (the lift is the handshakes' place after the final). */
  const OFFSEASON = new Set(['champion', 'award', 'farewell', 'lottery', 'draft', 'moves']);

  /**
   * What a segment earns by the minute: live play at the live rate, the off-season show as it airs at its own (its
   * repeats as replays), highlights by the package (not here), everything else at the studio's.
   * @param {import('./programme.js').Segment} seg @returns {'live' | 'offseason' | 'studio' | null}
   */
  const rateOf = (seg) => {
    if (seg.kind === 'live') return 'live';
    if (seg.kind === 'highlights') return null;
    if ((seg.kind === 'handshakes' && seg.lift) || (OFFSEASON.has(seg.kind) && !(/** @type {any} */ (seg).repeat))) return 'offseason';
    return 'studio';
  };

  /** Spends that are over go. @param {number} t */
  function upkeep(t) {
    const keep = data.active.filter((x) => {
      if (x.kind === 'ticker') return t - x.at < s.tickerMinutes * 60_000;
      return t < /** @type {number} */ (x.until);
    });
    if (keep.length !== data.active.length) {
      data.active = keep;
      onChange?.();
    }
  }

  return {
    /**
     * @param {{ t: number, wall: number, now: number, visible: boolean, seg: import('./programme.js').Segment }} f
     *   t: channel time; wall: real ms for gaps (performance.now()); now: real epoch ms for the viewer's own day.
     * @returns {number} Coins earned this frame.
     */
    frame({ t, wall, now, visible, seg }) {
      upkeep(t);
      if (!visible) {
        lastWall = null;
        if (piece) piece.whole = false;
        return 0;
      }
      const gap = lastWall === null || wall < lastWall || wall - lastWall > gapMs;
      const dt = gap ? 0 : wall - /** @type {number} */ (lastWall);
      lastWall = wall;
      const day = dayOf(now);
      if (day !== data.day) Object.assign(data, { day, today: 0 });

      let earned = 0;
      const rate = rateOf(seg);
      if (rate === 'live') data.liveMs += dt;
      if (rate === 'studio') data.studioMs += dt;
      if (rate === 'offseason') data.offseasonMs += dt;
      const liveMs = s.liveMinutes * 60_000;
      const studioMs = s.studioMinutes * 60_000;
      const offseasonMs = s.offseasonMinutes * 60_000;
      while (data.liveMs >= liveMs) { data.liveMs -= liveMs; earned++; }
      while (data.studioMs >= studioMs) { data.studioMs -= studioMs; earned++; }
      while (data.offseasonMs >= offseasonMs) { data.offseasonMs -= offseasonMs; earned++; }

      // A highlights package watched whole: a coin as it ends.
      const pkg = seg.kind === 'highlights' ? { key: `h:${seg.from}`, fresh: t - seg.from <= graceMs } : null;
      if (piece && gap) piece.whole = false;
      if (piece && piece.key !== pkg?.key) {
        if (piece.whole && !gap) earned++;
        piece = null;
      }
      if (pkg && !piece) piece = { key: pkg.key, whole: pkg.fresh };

      if (earned === 0) return 0;
      const add = Math.max(0, Math.min(earned, s.dailyCap - data.today));
      // At the cap, nothing carries over to be earned later.
      if (data.today + add >= s.dailyCap) Object.assign(data, { liveMs: 0, studioMs: 0, offseasonMs: 0 });
      data.today += add;
      data.balance += add;
      // Version 2: banked at the next check-in (coinBank.js).
      data.pending += add;
      onChange?.();
      return add;
    },
  };
}

// ---- Version 2 (Tom, 2026-10-17; docs/channel.md §29.6): spends shared through the audience service ----

/**
 * A live match's halves in channel time, as the service is told them: the first from the kick-off to half-time, the
 * second from the restart to full time (overtime and a shootout included).
 * @param {import('./liveLeague.js').LiveMatch} m
 * @param {(m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline} timelineOf
 * @returns {[[number, number], [number, number]]}
 */
export function halvesOf(m, timelineOf) {
  const tl = timelineOf(m);
  const br = tl.breaks[0] ?? { from: tl.duration / 2, to: tl.duration / 2 };
  return [[m.kickoff, m.kickoff + br.from], [m.kickoff + br.to, m.kickoff + tl.duration]];
}

/** A match as the service names it: its season and its slot. @param {{ season: number, slot: number }} m */
export const matchKey = (m) => `s${m.season}-${m.slot}`;

/**
 * The feed's rows as spends to show (showing() draws them): each match's spends tied to that match, a shout's words
 * made for its end (the team, the player it names), a shout held past a goal's celebration.
 * @param {any} config
 * @param {import('./coinBank.js').FeedRow[]} rows
 * @param {object} o
 * @param {(key: string) => import('./liveLeague.js').LiveMatch | null} o.matchOf  A match by its key (s<season>-<slot>).
 * @param {(m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline} o.timelineOf
 * @param {(teamId: string) => any} o.teamOf
 * @param {(playerId: string) => string | null} o.nameOf  A player's surname as the shout says it.
 * @param {Spend[]} [o.previous]  What was shown before (a shout still on, below).
 * @param {(id: number) => number} [o.delayOf]  How long this viewer's own spend is held back (ms): one that started at
 *   once and switched to Broadcast starts after the slide (Tom, 2026-10-18), so its first round is seen.
 * @param {number} [o.now]  The channel's time: a shout still on (its start moved past a celebration, so it ends a few
 *   seconds after its slot) is kept from `previous` once the feed no longer has it.
 * @returns {Spend[]}
 */
export function spendsFromFeed(config, rows, { matchOf, timelineOf, teamOf, nameOf, previous = [], delayOf = () => 0, now = Infinity }) {
  /** @type {Spend[]} */
  const out = [];
  for (const r of rows) {
    if (r.kind === 'ticker') { out.push({ id: r.id, kind: 'ticker', at: r.starts, choice: r.choice }); continue; }
    if (r.kind === 'screen') { out.push({ id: r.id, kind: 'screen', at: r.starts, until: r.until, choice: r.choice }); continue; }
    const m = r.match ? matchOf(r.match) : null;
    if (!m) continue;
    const side = r.side === 'away' ? 'away' : 'home';
    const instance = `live:${m.id}`;
    const starts = r.starts + delayOf(r.id);
    if (r.kind === 'flag') { out.push({ id: r.id, kind: 'flag', at: starts, until: r.until, choice: side, instance }); continue; }
    if (r.kind === 'chant') { out.push({ id: r.id, kind: 'chant', at: starts, until: r.until, choice: r.choice, side, instance }); continue; }
    const template = config.fanCoins.shouts[Number(r.choice)];
    if (template === undefined) continue;
    const team = teamOf(side === 'home' ? m.homeId : m.awayId);
    const star = r.player ? nameOf(r.player) : null;
    if (template.includes('{star}') && !star) continue;
    const words = template.replace('{team}', team.shortName.toUpperCase()).replace('{star}', star ?? '');
    const length = r.until - r.starts;
    const goals = timelineOf(m).pauses.filter((p) => p.kind === 'goal').map((p) => ({ from: m.kickoff + p.at, to: m.kickoff + p.at + p.ms }));
    const at = afterCelebration(goals, starts);
    out.push({ id: r.id, kind: 'shout', at, until: at + length, choice: words, side, instance });
  }
  for (const x of previous) if (x.kind === 'shout' && /** @type {number} */ (x.until) > now && !out.some((y) => y.id === x.id)) out.push(x);
  return out;
}

/** Whether two spends share a queue (the ticker; FAN BOARD; a match end's shouts; a match end's chants and flags). @param {import('./coinBank.js').FeedRow} a @param {import('./coinBank.js').FeedRow} b */
export function sameQueue(a, b) {
  const group = (/** @type {string} */ k) => (k === 'chant' || k === 'flag' ? 'stands' : k);
  if (group(a.kind) !== group(b.kind)) return false;
  return a.kind === 'ticker' || a.kind === 'screen' || (a.match === b.match && a.side === b.side);
}

/**
 * A spend's queue as the COINS tab tells it, from the feed: whether it can be spent now (and in which end), how many
 * are ahead and when it would start, or why not: the viewer's own already waiting or showing, the queue full, no room
 * left in the match, not enough coins. `free`: in a match, the ends where it would start now.
 * @param {any} config @param {CoinData} data @param {import('./coinBank.js').FeedRow[]} rows @param {Set<number>} mine
 * @param {SpendKind} kind
 * @param {{ t: number, match: import('./liveLeague.js').LiveMatch | null, halves: [[number, number], [number, number]] | null, blocked?: [number, number][] }} at
 *   The live match on screen (null outside one) and its halves; when FAN BOARD can't show (coinRules.js boardBlocked).
 * @param {'home' | 'away'} [end]
 * @returns {{ ok: boolean, why: string, ahead: number, starts: number | null, own: import('./coinBank.js').FeedRow | null, free: ('home' | 'away')[] }}
 */
export function queueState(config, data, rows, mine, kind, { t, match, halves, blocked }, end) {
  const s = config.settings.fanCoins;
  const own = rows.find((r) => r.kind === kind && mine.has(r.id) && r.until > t) ?? null;
  /** @type {('home' | 'away')[]} */
  let free = [];
  const base = { ahead: 0, starts: /** @type {number | null} */ (null), own, free, showing: false };
  if (own) {
    // Its place: those in its queue ahead of it (the one showing included), and whether one's showing now.
    const same = rows.filter((r) => r.id !== own.id && r.until > t && sameQueue(r, own));
    return { ...base, ok: false, why: own.starts > t ? 'YOURS IS QUEUED' : 'YOURS IS ON', ahead: same.filter((r) => r.starts < own.starts).length, starts: own.starts, showing: same.some((r) => r.starts <= t) };
  }
  const inMatch = kind === 'chant' || kind === 'flag' || kind === 'shout';
  if (inMatch && (!match || !halves)) return { ...base, ok: false, why: 'IN A LIVE MATCH' };
  const key = match ? matchKey(match) : null;
  /** The rows in a queue, still waiting or showing. @param {'home' | 'away' | null} side */
  const queueOf = (side) => rows.filter((r) => r.until > t && (kind === 'ticker' || kind === 'screen' ? r.kind === kind
    : r.match === key && r.side === side && (kind === 'shout' ? r.kind === 'shout' : r.kind === 'chant' || r.kind === 'flag')));
  /** Where it would go in that queue. @param {'home' | 'away' | null} side @returns {{ starts: number, ahead: number } | null} */
  const slot = (side) => {
    const q = queueOf(side).sort((a, b) => a.starts - b.starts);
    if (q.filter((r) => r.starts > t).length >= s.shared.queueMax) return null;
    const last = q.at(-1);
    if (kind === 'ticker') return { starts: Math.max(t, last ? last.until : t), ahead: q.length };
    if (kind === 'screen') return { starts: boardStart(Math.max(t, last ? last.until : t), s.screenMinutes * 60_000, blocked ?? []), ahead: q.length };
    const [first, second] = /** @type {[[number, number], [number, number]]} */ (halves);
    if (kind === 'shout') {
      const starts = Math.max(t, last ? last.until : t);
      return starts + s.shoutSeconds * 1000 <= second[1] ? { starts, ahead: q.length } : null;
    }
    const taken = new Set(q.map((r) => (r.starts < first[1] ? 1 : 2)));
    if (t < first[1] && !taken.has(1)) return { starts: Math.max(t, first[0]), ahead: q.length };
    if (t < second[1] && !taken.has(2)) return { starts: Math.max(t, second[0]), ahead: q.length };
    return null;
  };
  let place;
  if (inMatch) {
    free = /** @type {('home' | 'away')[]} */ (['home', 'away']).filter((side) => { const x = slot(side); return x !== null && x.starts <= t; });
    place = end ? slot(end) : slot(free[0] ?? 'home') ?? slot('away');
    if (!place) return { ...base, free, ok: false, why: kind === 'shout' ? 'QUEUE FULL' : 'NO ROOM THIS MATCH' };
  } else {
    place = slot(null);
    if (!place) return { ...base, ok: false, why: 'QUEUE FULL' };
  }
  const price = s.prices[kind];
  if (data.balance < price) return { ...base, ...place, free, ok: false, why: `${price - data.balance} MORE` };
  return { ...base, ...place, free, ok: true, why: '' };
}

/**
 * The teams FAN BOARD can be bought for at `t` (Tom, 2026-10-21): in the playoffs only those still in it, the four once
 * the regular season has finished on screen, the two once both semifinals have; every team otherwise (null).
 * @param {import('./liveLeague.js').LiveLeague} live @param {number} t
 * @param {(m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline} timelineOf
 * @returns {Set<string> | null}
 */
export function boardTeams(live, t, timelineOf) {
  const durationOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => timelineOf(m).duration;
  const season = live.calendar.seasonAt(t);
  const played = live.matchesIn(season);
  const done = (/** @type {string} */ stage) => played.filter((m) => m.stage === stage && isFinished(m, t, durationOf));
  if (done('regular').length < live.calendar.regularCount || done('final').length) return null;
  const semis = done('semifinal');
  if (semis.length >= 2) return new Set(semis.map((m) => /** @type {string} */ (winnerOf(m))));
  return new Set(tableAt(live, season, t, durationOf).slice(0, live.config.rules.playoffs.teams).map((r) => r.teamId));
}
