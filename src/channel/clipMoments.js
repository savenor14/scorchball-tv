// The clip tool's moments (getting the word out, docs/launch-plan.md; clips.html, npm run clip -- --list): the moments
// worth a clip among the matches that have aired, the best first, each with when to start recording and for how long
// (settings.clips). Pure and DOM-free: given the matches, their timelines and names, it only reads what was played.
//
// The best first: a golden goal; a shootout's deciding kick; the final's last goal; a player's fifth goal in a match
// (a haul: about one match in four, where a hat-trick is several a match, 2026-10-22); then any scorcher. The rest
// of the goals are left out (about 8½ a match). Newer before older within a kind.

/** How each kind ranks (higher first). */
const RANK = Object.freeze({ golden: 5, shootout: 4, finalGoal: 4, haul: 3, scorcher: 2 });

/**
 * @typedef {'golden' | 'shootout' | 'finalGoal' | 'haul' | 'scorcher'} MomentKind
 * @typedef {object} ClipMoment
 * @property {MomentKind} kind
 * @property {number} at  When to start recording: the channel's time (epoch ms), a lead-in before the moment.
 * @property {number} moment  The moment itself (epoch ms).
 * @property {number} seconds  How long to record.
 * @property {string} matchId
 * @property {string | null} teamId  The team that scored (or took the deciding kick).
 * @property {string | null} who  The player, as named.
 * @property {string} label  "S2 R5 · PCG 2-1 VAR · 13' SCORCHER · E. Roskilly"
 */

/**
 * @param {object} o
 * @param {import('./liveLeague.js').LiveMatch[]} o.matches  Matches to look in (only those over by `now` are used).
 * @param {(m: import('./liveLeague.js').LiveMatch) => import('./timeline.js').Timeline} o.timelineOf
 * @param {(id: string) => string} o.playerName
 * @param {(id: string) => string} o.abbr  A team's letters.
 * @param {{ leadSeconds: Record<'goal' | 'golden' | 'shootout', number>, tailSeconds: Record<'goal' | 'golden' | 'shootout', number>, listMax: number }} o.settings  settings.clips
 * @param {number} o.now  Epoch ms: nothing after it is listed (it hasn't aired).
 * @returns {ClipMoment[]}
 */
export function clipMoments({ matches, timelineOf, playerName, abbr, settings, now }) {
  /** @type {ClipMoment[]} */
  const out = [];
  for (const m of matches) {
    const tl = timelineOf(m);
    if (m.kickoff + tl.duration > now) continue;
    const stage = m.stage === 'final' ? 'FINAL' : m.stage === 'semifinal' ? 'SF' : `R${m.round}`;
    const score = (/** @type {[number, number] | undefined} */ s) => (s ? `${abbr(m.homeId)} ${s[0]}-${s[1]} ${abbr(m.awayId)}` : `${abbr(m.homeId)} v ${abbr(m.awayId)}`);
    /** @param {MomentKind} kind @param {number} eventAt @param {'goal' | 'golden' | 'shootout'} timing @param {string} what @param {{ teamId?: string, playerId?: string }} [e] */
    const add = (kind, eventAt, timing, what, e = {}) => {
      const moment = m.kickoff + eventAt;
      const lead = settings.leadSeconds[timing] * 1000;
      out.push({ kind, at: moment - lead, moment, seconds: settings.leadSeconds[timing] + settings.tailSeconds[timing], matchId: m.id, teamId: e.teamId ?? null, who: e.playerId ? playerName(e.playerId) : null, label: `S${m.season} ${stage} · ${what}` });
    };
    const goals = tl.events.filter((t) => t.event.type === 'goal');
    const byScorer = new Map();
    for (const g of goals) {
      const e = g.event;
      const data = /** @type {any} */ (e.data);
      const minute = `${Math.floor(e.clock / 60) + 1}'`;
      const who = e.playerId ? playerName(e.playerId) : '?';
      const count = (byScorer.get(e.playerId) ?? 0) + 1;
      byScorer.set(e.playerId, count);
      const line = `${score(data.score)} · ${minute}`;
      if (g.at === tl.goldenAt) add('golden', g.at, 'golden', `${line} GOLDEN GOAL · ${who}`, e);
      else if (m.stage === 'final' && g === goals.at(-1)) add('finalGoal', g.at, 'goal', `${line} THE FINAL'S LAST GOAL · ${who}`, e);
      else if (count === 5) add('haul', g.at, 'goal', `${line} FIVE GOALS · ${who}`, e);
      else if (data.scorcher) add('scorcher', g.at, 'goal', `${line} SCORCHER · ${who}`, e);
    }
    const kicks = tl.events.filter((t) => t.event.type === 'shootout_kick');
    const last = kicks.at(-1);
    if (last) add('shootout', last.at, 'shootout', `${score()} · SHOOTOUT, THE DECIDING KICK ${(/** @type {any} */ (last.event.data)).shootout.join('-')} · ${last.event.playerId ? playerName(last.event.playerId) : '?'}`, last.event);
  }
  return out.sort((a, b) => RANK[b.kind] - RANK[a.kind] || b.moment - a.moment).slice(0, settings.listMax);
}
