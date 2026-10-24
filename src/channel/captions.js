// Lower-third captions: which one is on screen at a moment in a match. Pure and DOM-free. See docs/channel.md §6.
// A caption appears when its event happens on screen and stays for settings.captions.ms (goals: goalMs).
// The newest caption wins, except that a lesser one never cuts a goal (or the half-time/full-time card) short.

/**
 * @typedef {object} Caption
 * @property {string} key      Unique per caption (its event's seq), so the overlay knows when it changes.
 * @property {'goal' | 'scorcher' | 'burn' | 'free_shot' | 'substitution' | 'injury' | 'period' | 'shootout' | 'record'} kind
 * @property {string} title    e.g. "SCORCHER!"
 * @property {string} detail   e.g. "R. Tamsin · assist K. Orrin · 2–1"
 * @property {string | null} teamId  For the colour stripe.
 * @property {number} f        0 → 1 through the caption's time on screen.
 */

/** Higher wins while both are showing. */
const PRIORITY = /** @type {const} */ ({ record: 4, goal: 3, scorcher: 3, period: 2, shootout: 2, burn: 1, free_shot: 1, substitution: 1, injury: 1 });

/**
 * A record falling on screen (Task 220b): when, and what the caption says.
 * @typedef {{ key: string, at: number, title: string, detail: string, teamId: string }} RecordCaption
 */

/**
 * @param {import('./timeline.js').Timeline} timeline
 * @param {number} elapsed  ms since kick-off.
 * @param {{ playerName: (id: string) => string, teamName: (id: string) => string, captions: { ms: number, goalMs: number, recordMs: number }, records?: RecordCaption[] }} ctx
 *   records: the match's records falling (recordCaptions); each has the caption bar to itself for captions.recordMs.
 * @returns {Caption | null}
 */
export function captionAt(timeline, elapsed, ctx) {
  for (const r of ctx.records ?? []) {
    const since = elapsed - r.at;
    if (since >= 0 && since < ctx.captions.recordMs) return { key: r.key, kind: 'record', title: r.title, detail: r.detail, teamId: r.teamId, f: since / ctx.captions.recordMs };
  }
  const count = timeline.countAt(elapsed);
  /** @type {Caption | null} */
  let best = null;
  // Walk back from the newest event while captions could still be showing.
  const longest = Math.max(ctx.captions.ms, ctx.captions.goalMs);
  for (let i = count - 1; i >= 0; i--) {
    const { event, at } = timeline.events[i];
    const since = elapsed - at;
    if (since >= longest) break;
    const made = describe(event, ctx, timeline);
    if (!made) continue;
    const length = made.kind === 'goal' || made.kind === 'scorcher' ? ctx.captions.goalMs : ctx.captions.ms;
    if (since >= length) continue;
    const caption = { ...made, key: String(event.seq), f: since / length };
    if (!best || PRIORITY[caption.kind] > PRIORITY[best.kind]) best = caption;
  }
  return best;
}

/** Does this event add one to a player's stat (goals, assists, saves, stops)? @param {any} e @param {string} stat @param {string} id */
function counts(e, stat, id) {
  if (stat === 'goals') return e.type === 'goal' && e.playerId === id;
  if (stat === 'assists') return e.type === 'goal' && e.data.assistId === id;
  if (stat === 'saves') return e.type === 'save' && e.playerId === id;
  return e.playerId === id && ((e.type === 'possession_change' && e.data.reason === 'tackle') || e.type === 'block');
}

const STAT_WORD = /** @type {Record<string, string>} */ ({ goals: 'goals', assists: 'assists', saves: 'saves', stops: 'stops' });

/**
 * A match's records falling, as captions (Task 220b, Tom's look A): each at the event that passed the record (after a
 * goal's own caption when it's a goal or an assist), "ALL-TIME RECORD · N. Yarosh · 134 career goals, passing
 * D. Santoro" or "SEASON RECORD · C. Sabrier · 52 goals this season, past V. Bonnefoy's 51 (S12)".
 * @param {import('../chronicle/chronicle.js').RecordBroken[]} broken  The match's (live.records.inMatch).
 * @param {import('./timeline.js').Timeline} timeline
 * @param {{ playerName: (id: string) => string, captions: { goalMs: number, recordMs: number } }} ctx
 * @returns {RecordCaption[]}
 */
export function recordCaptions(broken, timeline, ctx) {
  /** @type {RecordCaption[]} */
  const out = [];
  // Each record at the moment it fell, in match order (Task 271: a saves record late in a match held back the caption of
  // a goal record broken before it, 50 s after its goal).
  const fell = broken.flatMap((r) => {
    const inMatch = timeline.events.filter((x) => counts(x.event, r.stat, r.playerId)).length;
    let total = r.value - inMatch;
    const passed = timeline.events.find((x) => counts(x.event, r.stat, r.playerId) && ++total > r.previous.value);
    return passed ? [{ r, passed, total }] : [];
  }).sort((a, b) => a.passed.at - b.passed.at);
  for (const { r, passed, total } of fell) {
    const goal = passed.event.type === 'goal';
    // After the goal's caption; one record at a time.
    const at = Math.max(passed.at + (goal ? ctx.captions.goalMs : 0), (out.at(-1)?.at ?? -Infinity) + ctx.captions.recordMs);
    const who = ctx.playerName(r.playerId);
    const prev = ctx.playerName(r.previous.playerId);
    out.push({
      key: `record-${r.matchId}-${r.scope}-${r.stat}-${r.playerId}`,
      at,
      teamId: r.teamId,
      title: r.scope === 'career' ? 'ALL-TIME RECORD' : 'SEASON RECORD',
      detail: r.scope === 'career'
        ? `${who} · ${total} career ${STAT_WORD[r.stat]}, passing ${prev}`
        : `${who} · ${total} ${STAT_WORD[r.stat]} this season, past ${prev}'s ${r.previous.value} (S${r.previous.season})`,
    });
  }
  return out;
}

/**
 * @typedef {object} Alert
 * @property {string} key
 * @property {string} teamId   The scoring team.
 * @property {string} homeId   @property {string} awayId  The match's teams (each gets its kit, Task 110).
 * @property {string} text     e.g. "GOAL! WRS 1-2 BGH"
 * @property {number} index    The match's number in the group (1–4), for "press N to watch".
 * @property {number} f        0 → 1 through its time on screen.
 */

/**
 * A goal elsewhere while several matches are live: the newest one in the last captions.alertMs, from any match in the
 * group other than the one on screen.
 * @param {import('./liveLeague.js').LiveMatch[]} group  The simultaneous matches, in play order.
 * @param {string} shownId  The match on screen.
 * @param {number} t  Epoch ms.
 * @param {{ timelineOf: (m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline, abbr: (teamId: string) => string, alertMs: number }} ctx
 * @returns {Alert | null}
 */
export function alertAt(group, shownId, t, ctx) {
  /** @type {Alert | null} */
  let best = null;
  let bestAt = -Infinity;
  group.forEach((m, i) => {
    if (m.id === shownId) return;
    const tl = ctx.timelineOf(m);
    const elapsed = t - m.kickoff;
    for (let k = tl.countAt(elapsed) - 1; k >= 0; k--) {
      const { event, at } = tl.events[k];
      if (elapsed - at >= ctx.alertMs) break;
      if (event.type !== 'goal' || m.kickoff + at <= bestAt) continue;
      const s = /** @type {any} */ (event.data).score;
      best = {
        key: String(event.seq),
        teamId: /** @type {string} */ (event.teamId),
        homeId: m.homeId,
        awayId: m.awayId,
        text: `${/** @type {any} */ (event.data).scorcher ? 'SCORCHER!' : 'GOAL!'} ${ctx.abbr(m.homeId)} ${s[0]}-${s[1]} ${ctx.abbr(m.awayId)}`,
        index: i + 1,
        f: (elapsed - at) / ctx.alertMs,
      };
      bestAt = m.kickoff + at;
      break;
    }
  });
  return best;
}

/**
 * The caption for one event, or null if it doesn't get one.
 * @param {Readonly<import('../chronicle/eventLog.js').LeagueEvent>} e
 * @param {{ playerName: (id: string) => string, teamName: (id: string) => string }} ctx
 * @param {import('./timeline.js').Timeline} timeline
 * @returns {Omit<Caption, 'key' | 'f'> | null}
 */
function describe(e, { playerName, teamName }, timeline) {
  const d = /** @type {any} */ (e.data);
  const who = e.playerId ? playerName(e.playerId) : '';
  const score = (/** @type {number[]} */ s) => `${s[0]}–${s[1]}`;
  switch (e.type) {
    case 'goal': {
      // The goal that wins a match in overtime (Task 147): GOLDEN GOAL!, in gold, a scorcher or not.
      const golden = timeline.decidedBy === 'overtime' && timeline.events.findLast((t) => t.event.type === 'goal')?.event === e;
      return {
        kind: golden ? 'golden' : d.scorcher ? 'scorcher' : 'goal',
        title: golden ? (d.scorcher ? 'GOLDEN GOAL! SCORCHER!' : 'GOLDEN GOAL!') : d.scorcher ? 'SCORCHER!' : d.freeShot ? 'GOAL! (FREE SHOT)' : 'GOAL!',
        detail: [who, d.assistId ? `assist ${playerName(d.assistId)}` : null, score(d.score)].filter(Boolean).join(' · '),
        teamId: e.teamId,
      };
    }
    case 'burn':
      return { kind: 'burn', title: 'BURN!', detail: `${teamName(/** @type {string} */ (e.teamId))} held it too long${who ? ` · ${who}` : ''}`, teamId: e.teamId };
    case 'free_shot':
      return { kind: 'free_shot', title: 'FREE SHOT', detail: who, teamId: e.teamId };
    case 'substitution':
      return { kind: 'substitution', title: d.reason === 'injury' ? 'INJURY SUB' : 'SUBSTITUTION', detail: `on ${who} · off ${playerName(d.offId)}`, teamId: e.teamId };
    case 'injury':
      return { kind: 'injury', title: 'INJURY', detail: `${who} is hurt`, teamId: e.teamId };
    case 'half_time':
      return { kind: 'period', title: 'HALF-TIME', detail: score(d.score), teamId: null };
    case 'full_time':
      return { kind: 'period', title: 'FULL TIME', detail: score(d.score), teamId: null };
    case 'overtime_start':
      return { kind: 'period', title: 'GOLDEN GOAL', detail: `Level at ${score(d.score)}: next goal wins`, teamId: null };
    case 'shootout_kick': {
      const first = timeline.events.find((t) => t.event.type === 'shootout_kick')?.event;
      return {
        kind: 'shootout',
        title: e === first ? `SHOOTOUT · ${d.scored ? 'SCORED' : 'MISSED'}` : d.scored ? 'SCORED' : 'MISSED',
        detail: `${who} · ${score(d.shootout)}`,
        teamId: e.teamId,
      };
    }
    default:
      return null;
  }
}
