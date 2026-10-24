// On-pitch callouts: a short speech bubble over the player involved in a key moment (TACKLE!, STEAL!, BREAKAWAY!, SAVE!,
// MISS! …), and over the referee for their calls (Task 64): KICK-OFF! as each period starts, FOUL!, BURN!, GOAL! (with their
// arm up and the whistle) and SUB ON. Pure and DOM-free; overlays/callout.js draws it. See docs/channel.md §6.

/**
 * @typedef {object} Callout
 * @property {string} key      Unique per callout (its event's seq).
 * @property {string} text     e.g. "TACKLE!"
 * @property {'play' | 'foul' | 'burn' | 'goal' | 'golden'} kind  For the bubble's style (golden: a golden goal, Task 147).
 * @property {string | null} playerId  Who it's over; null means at the ball (or the referee).
 * @property {boolean} referee  Said by the referee: the bubble goes over them.
 * @property {string | null} teamId    Whose kit colour edges the bubble.
 * @property {number} f        0 → 1 through its time on screen.
 */

/** What each kind of moment says, and which wins when several share a moment (higher rank). */
const SPECS = /** @type {Record<string, { text: string, kind: Callout['kind'], rank: number, referee?: boolean }>} */ ({
  golden: { text: 'GOLDEN GOAL!', kind: 'golden', rank: 8, referee: true },
  goal: { text: 'GOAL!', kind: 'goal', rank: 7, referee: true },
  foul: { text: 'FOUL!', kind: 'foul', rank: 6, referee: true },
  // Over the referee (Tom, 2026-10-18): at the ball, it travelled with it to the keeper.
  burn: { text: 'BURN!', kind: 'burn', rank: 5, referee: true },
  save: { text: 'SAVE!', kind: 'play', rank: 4 },
  block: { text: 'BLOCK!', kind: 'play', rank: 3 },
  miss: { text: 'MISS!', kind: 'play', rank: 2 },
  tackle: { text: 'TACKLE!', kind: 'play', rank: 1 },
  steal: { text: 'STEAL!', kind: 'play', rank: 1 },
  breakaway: { text: 'BREAKAWAY!', kind: 'play', rank: 1 },
  kickoff: { text: 'KICK-OFF!', kind: 'play', rank: 0, referee: true },
});
const NO_CALLOUTS = new Set(['shootout_break', 'shootout']);

/** The spec for an event, if it gets a callout. @param {Readonly<import('../chronicle/eventLog.js').LeagueEvent>} e */
function specOf(e) {
  if (e.type === 'possession_change') {
    const data = /** @type {any} */ (e.data);
    if (data?.reason !== 'tackle') return null;
    return data.steal ? SPECS.steal : SPECS.tackle; // a pass cut out, or the ball won off the carrier
  }
  // A breakaway shows as the player breaks through, before their run at goal.
  if (e.type === 'advance') return /** @type {any} */ (e.data)?.breakaway ? SPECS.breakaway : null;
  return SPECS[e.type] ?? null;
}

/**
 * The callout on screen at a moment: from the most recent moment with one, within the last `calloutMs`; if that moment
 * had several, the highest-ranked.
 * @param {import('./timeline.js').Timeline} timeline
 * @param {number} elapsed  ms since kick-off.
 * @param {{ calloutMs: number }} ctx
 * @returns {Callout | null}
 */
export function calloutAt(timeline, elapsed, { calloutMs }) {
  if (NO_CALLOUTS.has(timeline.stateAt(elapsed).phase)) return null;
  const ev = timeline.events;
  /** @type {{ at: number, rank: number, event: Readonly<import('../chronicle/eventLog.js').LeagueEvent>, spec: (typeof SPECS)[string] } | null} */
  let best = null;
  for (let i = timeline.countAt(elapsed) - 1; i >= 0 && ev[i].at > elapsed - calloutMs; i--) {
    const spec = ev[i].event.type === 'goal' && ev[i].at === timeline.goldenAt ? SPECS.golden : specOf(ev[i].event);
    if (!spec) continue;
    if (best && ev[i].at < best.at) break; // only the most recent moment with a callout counts
    if (!best || spec.rank > best.rank) best = { at: ev[i].at, rank: spec.rank, event: ev[i].event, spec };
  }
  if (!best) return null;
  return {
    key: String(best.event.seq),
    text: best.spec.text,
    kind: best.spec.kind,
    playerId: best.spec.referee ? null : best.event.playerId ?? null,
    referee: Boolean(best.spec.referee),
    teamId: best.event.teamId ?? null,
    f: (elapsed - best.at) / calloutMs,
  };
}

/**
 * The referee's SUB ON (Task 64; over the player coming on before, Task 41), shown alongside the play callout since
 * substitutions mostly come at stoppages, when a SAVE! or MISS! is already showing. One at a time: the latest
 * substitution within the last `subCalloutMs`, edged in that team's colour. (An array, empty or with one bubble.)
 * @param {import('./timeline.js').Timeline} timeline
 * @param {number} elapsed  ms since kick-off.
 * @param {{ subCalloutMs: number }} ctx
 * @returns {Callout[]}
 */
export function subCalloutsAt(timeline, elapsed, { subCalloutMs }) {
  if (NO_CALLOUTS.has(timeline.stateAt(elapsed).phase)) return [];
  const ev = timeline.events;
  for (let i = timeline.countAt(elapsed) - 1; i >= 0 && ev[i].at > elapsed - subCalloutMs; i--) {
    const e = ev[i].event;
    if (e.type !== 'substitution') continue;
    // The whole moment's substitutions share the bubble, timed from the first of them.
    return [{ key: `sub|${ev[i].at}`, text: 'SUB ON', kind: 'play', playerId: null, referee: true, teamId: e.teamId ?? null, f: (elapsed - ev[i].at) / subCalloutMs }];
  }
  return [];
}
