// MOMENTS (Milestone 5¾; docs/channel.md §25; the kinds and steps in data/moments.json): what a viewer collects for
// each kind of moment they watched live while the tab showed. Pure and DOM-free: the channel tells the tracker, every
// frame, what's on screen; the tracker keeps what was seen (each goal's match and event, each day tuned in as a date,
// each secret with when and what was on air: Tom, 2026-10-12, so two devices could be joined later without counting a
// goal twice) and says which steps were reached, for the notice. Never a sim input.
//
// Watching means the tab showing, sound on or off. Live only: re-airs and highlights earn nothing. In the final round
// the match on screen counts (the featured feed, or the viewer's pick). A gap between frames longer than
// settings.moments.frameGapSeconds (a hidden tab, a sleeping laptop) means nobody was watching: what played in it isn't
// counted, and a whole match in progress (or an interview or ad break) is broken. Results are known before they air, so anything that depends on how
// a match ends (a clean sheet, a big win, a last-minute winner, a 0–0) is counted at its final whistle, never sooner.

/**
 * What the browser keeps (momentStore.js). Times are minutes since 1970 (whole minutes are enough for a date).
 * @typedef {object} MomentData
 * @property {number} v  Format version.
 * @property {Record<string, Record<string, number | (string | number | null)[]>>} seen  Per kind, each moment seen by
 *   its key: when, or [when, …details] (a goal's scoring team; a whole match's teams, winner and layout).
 * @property {Record<string, Record<string, number>>} reached  Per kind, when each step was reached.
 * @property {Record<string, { at: number, where: string }>} secrets  Each secret found, when and what was on air.
 * @property {string[]} places  What SEEN IT ALL has seen opened.
 * @property {Record<string, string[]>} dayTeams  The teams seen live on each recent day (for EVERY TEAM).
 * @property {Record<string, number>} openings  The seasons whose opening was seen (for OPENING TO CLOSING).
 * @property {boolean} notices  The notices shown (the switch at the foot of MOMENTS).
 */

/**
 * A step reached or a secret found, for the notice.
 * @typedef {{ kind: string, step: number } | { secret: string }} Notice
 */

export const DATA_VERSION = 1;

/** A fresh viewer's data. @returns {MomentData} */
export function emptyData() {
  return { v: DATA_VERSION, seen: {}, reached: {}, secrets: {}, places: [], dayTeams: {}, openings: {}, notices: true };
}

/**
 * Data read back from storage, made safe to use: anything missing filled in, a different version started afresh.
 * @param {any} raw @returns {MomentData}
 */
export function normalizeData(raw) {
  const fresh = emptyData();
  if (!raw || typeof raw !== 'object' || raw.v !== DATA_VERSION) return fresh;
  const objOr = (/** @type {any} */ x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
  return {
    v: DATA_VERSION,
    ...firstMinuteKind(objOr(raw.seen), objOr(raw.reached), objOr(raw.secrets)),
    // AUDIENCE's second tab was POLLS until 2026-10-14 (now FEEDBACK): a viewer who opened it keeps it.
    places: Array.isArray(raw.places) ? raw.places.filter((p) => typeof p === 'string').map((p) => (p === 'AUDIENCE:POLLS' ? 'AUDIENCE:FEEDBACK' : p)) : [],
    dayTeams: objOr(raw.dayTeams),
    openings: objOr(raw.openings),
    notices: raw.notices !== false,
  };
}

/**
 * FIRST-MINUTE GOAL was a secret until 2026-10-16 (Tom), now a kind in LATE WINNERS' place: a viewer who found the
 * secret has seen one, its first step reached when they found it. Late winners seen stay in the browser, unshown.
 * @param {Record<string, any>} seen @param {Record<string, any>} reached @param {Record<string, any>} secrets
 */
function firstMinuteKind(seen, reached, secrets) {
  const found = secrets.first_minute;
  if (!found) return { seen, reached, secrets };
  const { first_minute: _, ...rest } = secrets;
  const at = typeof found.at === 'number' ? found.at : 0;
  return {
    seen: seen.first_minute ? seen : { ...seen, first_minute: { 'secret-found': at } },
    reached: reached.first_minute ? reached : { ...reached, first_minute: { 1: at } },
    secrets: rest,
  };
}

/** How many of a kind have been seen. @param {MomentData} data @param {string} kind */
export const countOf = (data, kind) => Object.keys(data.seen[kind] ?? {}).length;

/**
 * A kind's progress: how many seen, the highest step reached, the next, and when each step reached was reached.
 * @param {MomentData} data @param {{ id: string, steps: number[] }} kind
 */
export function progressOf(data, kind) {
  const n = countOf(data, kind.id);
  const reached = kind.steps.filter((s) => s <= n);
  const at = data.reached[kind.id] ?? {};
  return { n, level: reached.at(-1) ?? 0, next: kind.steps.find((s) => s > n) ?? null, when: reached.map((s) => (at[s] ?? null)) };
}

/**
 * Seen counts by team, for a kind's page: goals by the scoring team; whole matches by both teams, with wins.
 * @param {MomentData} data @param {'goals' | 'matches'} by
 * @returns {Record<string, { n: number, won: number }>}
 */
export function byTeamOf(data, by) {
  /** @type {Record<string, { n: number, won: number }>} */
  const out = {};
  const bump = (/** @type {any} */ id, /** @type {boolean} */ won) => {
    if (typeof id !== 'string') return;
    const r = (out[id] ??= { n: 0, won: 0 });
    r.n++;
    if (won) r.won++;
  };
  for (const v of Object.values(data.seen[by === 'goals' ? 'goal' : 'whole_match'] ?? {})) {
    if (!Array.isArray(v)) continue;
    if (by === 'goals') bump(v[1], false);
    else for (const id of [v[1], v[2]]) bump(id, id === v[3]);
  }
  return out;
}

/**
 * A viewer about two weeks in, for the dev server's ?moments=demo: counts between steps, the days before `t` tuned in,
 * two secrets found. Stand-in keys, never a real match's.
 * @param {MomentData} data @param {any} config @param {number} t
 */
export function demoMoments(data, config, t) {
  const COUNTS = { goal: 120, scorcher: 30, burn: 60, hat_trick: 6, first_minute: 1, clean_sheet: 4, big_win: 2, record: 1, interview: 15, ad_break: 80, whole_match: 14 };
  const teams = /** @type {any[]} */ (config.teams.teams).map((x) => x.id);
  const now = Math.floor(t / 60_000);
  const span = 14 * 1440;
  const day = dayKeyer(config.settings.live.timeZone);
  Object.assign(data, emptyData(), { notices: data.notices });
  for (const [kind, n] of Object.entries(COUNTS)) {
    const seen = (data.seen[kind] = /** @type {Record<string, any>} */ ({}));
    for (let i = 0; i < n; i++) {
      const at = now - span + Math.round(((i + 1) / n) * span);
      const home = teams[i % teams.length];
      const away = teams[(i + 3) % teams.length];
      seen[`demo-${i}`] = kind === 'goal' ? [at, teams[(i * 5) % teams.length]] : kind === 'whole_match' ? [at, home, away, i % 3 ? home : away, i % 2 ? 'full' : 'broadcast'] : at;
    }
    const k = config.moments.kinds.find((/** @type {any} */ x) => x.id === kind);
    data.reached[kind] = Object.fromEntries(k.steps.filter((/** @type {number} */ s) => s <= n).map((/** @type {number} */ s) => [s, now - span + Math.round((s / n) * span)]));
  }
  data.seen.day = {};
  data.reached.day = {};
  for (let d = 13; d >= 0; d--) data.seen.day[day(t - d * 86_400_000)] = now - d * 1440;
  for (const s of [1, 5, 10]) data.reached.day[s] = now - (14 - s) * 1440;
  data.secrets.seven_days = { at: now - 7 * 1440, where: 'S1 SUN 18:02' };
  data.secrets.golden_goal = { at: now - 3 * 1440, where: 'S1 WED 10:13 · BGA 1–0 PCG' };
  data.places = ['SIDE:STATS', 'SIDE:TABLE', 'CHRONICLE:LATEST'];
}

/** The day in the league's zone, "2026-10-19". @param {string} timeZone */
function dayKeyer(timeZone) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
  return (/** @type {number} */ t) => f.format(new Date(t));
}

/** The day before "2026-10-19". @param {string} day */
function dayBefore(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * @typedef {object} Frame  What's on screen this frame.
 * @property {number} t        The channel's clock, epoch ms.
 * @property {number} wall     Real time, ms (performance.now()): gaps are measured in it, not the channel's clock.
 * @property {boolean} visible The tab showing.
 * @property {import('./programme.js').Segment} seg
 * @property {import('./liveLeague.js').LiveMatch | null} shown  The match on screen (the viewer's pick in the final round).
 * @property {'full' | 'broadcast'} layout
 */

/**
 * @param {object} o
 * @param {any} o.config
 * @param {MomentData} o.data  The viewer's data (changed in place; o.onChange is told).
 * @param {(m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline} o.timelineOf
 * @param {(m: import('./liveLeague.js').LiveMatch) => { key: string, at: number }[]} o.recordsOf  A match's record
 *   captions (captions.js recordCaptions), each at its moment on screen.
 * @param {(t: number) => number} o.seasonAt
 * @param {(teamId: string) => string} o.abbr
 * @param {() => void} [o.onChange]  Something was added (to save).
 */
export function createMomentTracker({ config, data, timelineOf, recordsOf, seasonAt, abbr, onChange }) {
  const m = config.moments;
  const s = config.settings.moments;
  const half = config.rules.match.halfMinutes * 60;
  const regulation = 2 * half;
  const gapMs = s.frameGapSeconds * 1000;
  const graceMs = s.startGraceSeconds * 1000;
  const pieceGraceMs = s.pieceGraceSeconds * 1000;
  const kinds = new Map(/** @type {any[]} */ (m.kinds).map((k) => [k.id, k]));
  const secretIds = new Set(/** @type {any[]} */ (m.secrets).map((x) => x.id));
  const teamCount = config.teams.teams.length;
  const dayOf = dayKeyer(config.settings.live.timeZone);
  const when = new Intl.DateTimeFormat('en-US', { timeZone: config.settings.live.timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const minutes = (/** @type {number} */ t) => Math.floor(t / 60_000);

  /** @type {Notice[]} */
  let out = [];
  /** Real time of the last visible frame, or null after a hidden one. @type {number | null} */
  let lastWall = null;
  /**
   * The match being watched: how far in it's been seen, whether it's whole so far, the layouts it was watched in.
   * @type {{ match: import('./liveLeague.js').LiveMatch, at: number, idx: number, rec: number, whole: boolean, layouts: Set<string>, goals: Set<number> } | null}
   */
  let watch = null;
  /**
   * An interview or an ad break being watched (Tom: counted once seen to its end, like a whole match): its kind, its key,
   * and whether it's been watched whole so far (from within pieceGraceSeconds of its start, no gap since).
   * @type {{ kind: 'interview' | 'ad_break', key: string, whole: boolean } | null}
   */
  let piece = null;

  /** "S2 WED 10:13", and " · BGA 1–0 PCG" with a match. @param {number} t @param {import('./liveLeague.js').LiveMatch | null} [match] */
  function where(t, match = null) {
    const head = `S${seasonAt(t)} ${when.format(new Date(t)).toUpperCase().replace(',', '')}`;
    if (!match) return head;
    const tl = timelineOf(match);
    const [h, a] = tl.stateAt(Math.min(t - match.kickoff, tl.duration)).score;
    return `${head} · ${abbr(match.homeId)} ${h}–${a} ${abbr(match.awayId)}`;
  }

  /** Add a moment seen; a notice if it reaches a step. @param {string} kind @param {string} key @param {number} t @param {(string | number | null)[]} [details] */
  function add(kind, key, t, details) {
    const seen = (data.seen[kind] ??= {});
    if (key in seen) return;
    seen[key] = details ? [minutes(t), ...details] : minutes(t);
    const k = kinds.get(kind);
    const n = Object.keys(seen).length;
    if (k?.steps.includes(n)) {
      (data.reached[kind] ??= {})[n] = minutes(t);
      out.push({ kind, step: n });
    }
    onChange?.();
  }

  /** Find a secret, once. @param {string} id @param {number} t @param {string} at */
  function secret(id, t, at) {
    if (!secretIds.has(id) || data.secrets[id]) return;
    data.secrets[id] = { at: minutes(t), where: at };
    out.push({ secret: id });
    onChange?.();
  }

  /** A day tuned in; seven in a row. @param {number} t */
  function tunedIn(t) {
    const day = dayOf(t);
    if (data.seen.day?.[day] !== undefined) return;
    add('day', day, t);
    let run = 1;
    for (let d = dayBefore(day); data.seen.day?.[d] !== undefined; d = dayBefore(d)) run++;
    if (run >= m.sevenDays) secret('seven_days', t, where(t));
    // Only the last few days' teams are needed.
    for (const d of Object.keys(data.dayTeams)) if (d < dayBefore(dayBefore(day))) delete data.dayTeams[d];
  }

  /** Both teams of a match seen live today; every team. @param {import('./liveLeague.js').LiveMatch} match @param {number} t */
  function teamsSeen(match, t) {
    const day = dayOf(t);
    const list = (data.dayTeams[day] ??= []);
    let changed = false;
    for (const id of [match.homeId, match.awayId]) if (!list.includes(id)) { list.push(id); changed = true; }
    if (changed) onChange?.();
    if (list.length >= teamCount) secret('every_team', t, where(t));
  }

  /** The events of the match watched that aired since the last frame. @param {number} at @param {number} t */
  function eventsTo(at, t) {
    const w = /** @type {NonNullable<typeof watch>} */ (watch);
    const tl = timelineOf(w.match);
    const events = tl.events;
    while (w.idx < events.length && events[w.idx].at <= at) {
      const { event: e, at: eAt } = events[w.idx++];
      if (eAt <= w.at) continue;
      const key = `${w.match.id}#${e.seq}`;
      if (e.type === 'goal') {
        add('goal', key, t, [e.teamId]);
        w.goals.add(e.seq);
        if (/** @type {any} */ (e.data).scorcher) add('scorcher', key, t);
        const clock = /** @type {number} */ (e.clock);
        if (clock > regulation) secret('golden_goal', t, where(t, w.match));
        // A first-minute goal (Tom, 2026-10-16: a kind in place of late winners, which were about as rare).
        if (clock < m.firstMinuteGoalMinutes * 60) add('first_minute', key, t);
        // A hat-trick: the scorer's third of the match.
        const n = events.filter((x) => x.event.type === 'goal' && x.event.playerId === e.playerId && x.event.seq <= e.seq).length;
        if (n === 3) add('hat_trick', `${w.match.id}:${e.playerId}`, t);
      } else if (e.type === 'burn') add('burn', key, t);
      // A stop (Tom): a tackle (STATS' steals and tackles) or a block, either team.
      if ((e.type === 'possession_change' && /** @type {any} */ (e.data).reason === 'tackle') || e.type === 'block') add('stop', key, t);
    }
    const records = recordsOf(w.match);
    while (w.rec < records.length && records[w.rec].at <= at) {
      const r = records[w.rec++];
      if (r.at > w.at) add('record', r.key, t);
    }
    w.at = at;
  }

  /** The match watched has ended (its final whistle seen): what depends on how it ended. @param {number} t */
  function whistle(t) {
    const w = /** @type {NonNullable<typeof watch>} */ (watch);
    const match = w.match;
    const r = /** @type {any} */ (match.events.at(-1)?.data);
    const [h, a] = [r.homeGoals, r.awayGoals];
    const winnerId = h > a ? match.homeId : a > h ? match.awayId : null;
    if (h === 0) add('clean_sheet', `${match.id}:${match.awayId}`, t);
    if (a === 0) add('clean_sheet', `${match.id}:${match.homeId}`, t);
    if (Math.abs(h - a) >= m.bigWinMargin) add('big_win', match.id, t);
    // A last-minute winner: the goal that won it in regulation, seen, in its last minute.
    if (winnerId && r.decidedBy === 'regulation') {
      const lost = winnerId === match.homeId ? a : h;
      const winning = match.events.filter((e) => e.type === 'goal' && e.teamId === winnerId)[lost];
      const clock = /** @type {number} */ (winning?.clock);
      if (winning && w.goals.has(winning.seq) && clock <= regulation) {
        if (clock >= regulation - m.lastMinuteWinnerMinutes * 60) secret('last_minute', t, where(t, match));
      }
    }
    if (w.whole) {
      const layout = w.layouts.size === 1 ? [...w.layouts][0] : null;
      const winner = winnerId ?? (r.decidedBy === 'shootout' ? (r.shootout?.[0] > r.shootout?.[1] ? match.homeId : match.awayId) : null);
      add('whole_match', match.id, t, [match.homeId, match.awayId, winner, layout]);
      if (h === 0 && a === 0) secret('nil_nil', t, where(t, match));
      const stops = match.events.filter((e) => (e.type === 'possession_change' && /** @type {any} */ (e.data).reason === 'tackle') || e.type === 'block').length;
      if (stops >= m.stopsMatch) secret('hundred_stops', t, `${where(t, match)} · ${stops} STOPS`);
      const layouts = new Set(Object.values(data.seen.whole_match ?? {}).map((v) => (Array.isArray(v) ? v[4] : null)));
      if (layouts.has('full') && layouts.has('broadcast')) secret('both_ways', t, where(t, match));
    }
  }

  /** Something SEEN IT ALL counts has been opened ("CHRONICLE:LATEST", "LEVELS"…). @param {string} place @param {number} t */
  function visit(place, t) {
    if (!m.places.includes(place) || data.places.includes(place)) return;
    data.places.push(place);
    onChange?.();
    if (/** @type {string[]} */ (m.places).every((p) => data.places.includes(p))) secret('seen_it_all', t, where(t));
  }

  /** The notices found since last asked. */
  function take() {
    const n = out;
    out = [];
    return n;
  }

  return {
    /**
     * Look at this frame; returns the steps reached and secrets found since the last frame (SEEN IT ALL's included).
     * @param {Frame} f @returns {Notice[]}
     */
    frame({ t, wall, visible, seg, shown, layout }) {
      if (!visible) {
        lastWall = null;
        return take();
      }
      const gap = lastWall === null || wall - lastWall > gapMs;
      lastWall = wall;
      tunedIn(t);
      if (layout === 'broadcast') visit('BROADCAST', t);

      // The match watched: carry on, finish it at its whistle, or let it go.
      if (watch) {
        const end = watch.match.kickoff + timelineOf(watch.match).duration;
        if (gap) watch.whole = false;
        if (t >= end) {
          // Ended: counted if it was being watched up to the end (no gap since the last frame).
          if (!gap) {
            eventsTo(timelineOf(watch.match).duration, t);
            whistle(t);
          }
          watch = null;
        } else if (!(seg.kind === 'live' && shown?.id === watch.match.id)) watch = null;
      }
      if (seg.kind === 'live' && shown) {
        const at = t - shown.kickoff;
        if (!watch) {
          // Started watching: only what comes after this frame counts.
          const tl = timelineOf(shown);
          const idx = tl.events.findIndex((x) => x.at > at);
          const records = recordsOf(shown);
          const rec = records.findIndex((x) => x.at > at);
          watch = { match: shown, at, idx: idx < 0 ? tl.events.length : idx, rec: rec < 0 ? records.length : rec, whole: at <= graceMs, layouts: new Set([layout]), goals: new Set() };
          teamsSeen(shown, t);
        } else if (gap) {
          // Back after a gap: skip what played in it.
          const tl = timelineOf(shown);
          while (watch.idx < tl.events.length && tl.events[watch.idx].at <= at) watch.idx++;
          const records = recordsOf(shown);
          while (watch.rec < records.length && records[watch.rec].at <= at) watch.rec++;
          watch.at = at;
        } else {
          watch.layouts.add(layout);
          eventsTo(at, t);
        }
      }

      // An interview or an ad break: counted when it ends, if it was watched from its start (Tom: like a whole match).
      // An ad break runs from its bumper in through its ads to its bumper out.
      const now = seg.kind === 'potm' && seg.show ? { kind: /** @type {const} */ ('interview'), key: seg.match.id, start: true }
        : seg.kind === 'ads' ? { kind: /** @type {const} */ ('ad_break'), key: String(minutes(seg.from)), start: seg.part === 'bumper_in' } : null;
      if (piece) {
        if (gap) piece.whole = false;
        const same = now && now.kind === piece.kind && (now.kind === 'ad_break' || now.key === piece.key);
        if (!same) {
          if (piece.whole && !gap) add(piece.kind, piece.key, t);
          piece = null;
        }
      }
      if (now && !piece) piece = { kind: now.kind, key: now.key, whole: now.start && t - /** @type {any} */ (seg).from <= pieceGraceMs };

      if (seg.kind === 'ident' && seg.next?.slot === 0) {
        // The season's opening: the ident before its first match.
        if (!data.openings[seg.next.season]) { data.openings[seg.next.season] = minutes(t); onChange?.(); }
      } else if (seg.kind === 'talk' && seg.topic === 'signoff' && !seg.repeat && seg.match && data.openings[seg.match.season]) {
        secret('season_ends', t, `SEASON ${seg.match.season}`);
      }
      return take();
    },
    visit,
  };
}
