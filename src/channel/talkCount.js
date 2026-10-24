// How often each kind of desk line is heard (Task 246b): the channel's programme over a whole season, as it airs, every
// line the desk says counted by its kind. Pure and browser-safe, for npm run talk and desklines.html.
import { createCalendar } from './calendar.js';
import { LiveLeague } from './liveLeague.js';
import { createProgramme } from './programme.js';
import { talkContext, talkScript } from './talk.js';
import { createTimeline } from './timeline.js';

/**
 * Every desk line said over a season's days, by kind.
 * @param {any} config @param {string} seed @param {number} season
 * @returns {{ days: number, byKind: Map<string, number>, standIns: number }}
 */
export function countTalk(config, seed, season) {
  const calendar = createCalendar(config);
  const from = calendar.instant(season, 0);
  const to = calendar.instant(season + 1, 0);
  const live = new LiveLeague(config, { now: from, seed });
  /** @type {Map<string, import('./timeline.js').Timeline>} */
  const timelines = new Map();
  const timelineOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => timelines.get(m.id) ?? /** @type {any} */ (timelines.set(m.id, createTimeline(m, config)).get(m.id));
  const programme = createProgramme(live, timelineOf);
  const ctx = talkContext(live, timelineOf);
  /** @type {Map<string, number>} */
  const byKind = new Map();
  let standIns = 0;
  for (let t = from; t < to;) {
    live.advanceTo(t);
    const p = programme.pieceAt(t);
    const seg = programme.at(Math.max(p.from, t));
    if (seg.kind === 'talk' && p.from >= from) {
      const script = seg.script === undefined ? talkScript(seg, live, seg.from, ctx) : seg.script;
      if (!script) standIns++;
      for (const line of script ?? []) byKind.set(line.clip.kind, (byKind.get(line.clip.kind) ?? 0) + 1);
    }
    t = p.until > t ? p.until : t + 1000;
  }
  return { days: Math.round((to - from) / 86_400_000), byKind, standIns };
}
