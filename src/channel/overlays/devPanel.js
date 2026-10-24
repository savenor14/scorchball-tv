// The dev panel (toggle with the ` key): where the channel is, FPS, what's on air, and links that jump to handy
// moments for this seed, with a help panel beside it (H). The jump list itself is worked out in ../dev.js.
// See docs/channel.md §10.
import { jumpSearch, jumpsFor, matchShare, zoneStamper } from '../dev.js';
import { LiveLeague } from '../liveLeague.js';
import { createProgramme } from '../programme.js';
import { createTimeline } from '../timeline.js';
import { $, el, mmss, setText } from './dom.js';

/** FPS is frames counted over this many real ms. */
const FPS_WINDOW_MS = 1000;
/** How far ahead (league ms) the Next … links search: a little over a day, so the once-a-day opening is always found. */
const SEARCH_MS = 30 * 3600_000;

/**
 * @param {import('../../config.js').Config} config
 * @param {LiveLeague} live
 * @param {string} seed
 * @param {(m: import('../liveLeague.js').LiveMatch) => import('../timeline.js').Timeline} timelineOf
 */
export function createDevPanel(config, live, seed, timelineOf) {
  const panel = $('dev');
  const status = $('dev-status');
  const jumpBox = $('dev-jumps');
  const stamp = zoneStamper(config.settings.live.timeZone);
  /** Just the time of day from a stamp: "17:00" or "17:00:05". @param {number} t */
  const clockOf = (t) => stamp(t).slice(11).replace(/[+-]\d\d:\d\d$/, '');
  const here = el('a');
  here.title = 'Reload at this moment (copy the link to share it)';
  // A plain-language refresher on everything in the panel; its text is in index.html.
  const help = $('dev-help');
  const toggleHelp = () => {
    if (panel.classList.contains('open')) help.classList.toggle('open');
  };
  $('dev-help-link').addEventListener('click', toggleHelp);

  // The season's match share, worked out on request with a scratch league (about a second), then remembered.
  const shareLink = $('dev-share-link');
  /** @type {Map<number, string>} */
  const shares = new Map();
  shareLink.addEventListener('click', () => {
    const season = live.calendar.seasonAt(live.now);
    let text = shares.get(season);
    if (!text) {
      const { share, live: onLive } = matchShare(config, seed, season);
      shares.set(season, (text = `S${season} match on ${(share * 100).toFixed(1)}% (live ${(onLive * 100).toFixed(1)}%)`));
    }
    setText(shareLink, text);
  });

  let fps = 0;
  /** The last error a frame threw, for the status (null if none). @type {string | null} */
  let problem = null;
  /** Errors already logged, so each is logged once. @type {Set<string>} */
  const logged = new Set();
  let frames = 0;
  let countFrom = 0;
  let jumpKey = '';
  /** The layout and sound as of the last frame, carried over every jump (Task 62). @type {{ layout: 'full' | 'broadcast', sound: boolean }} */
  let state = { layout: 'full', sound: false };

  /** When a season's final ends on screen, if it has been played in this league. @param {number} season */
  const finalEndIn = (season) => {
    const final = live.matchesIn(season).find((m) => m.stage === 'final');
    return final ? final.kickoff + timelineOf(final).duration : null;
  };

  /**
   * The final hasn't been played here yet, so build a scratch league up to its kick-off to see how long it lasts.
   * Takes about as long as the page's own build.
   * @param {number} season
   */
  const finalEndAhead = (season) => {
    const slots = live.calendar.slots(season);
    const scratch = new LiveLeague(config, { now: slots[slots.length - 1].kickoff, seed });
    const final = /** @type {import('../liveLeague.js').LiveMatch} */ (scratch.matchesIn(season).find((m) => m.stage === 'final'));
    return final.kickoff + createTimeline(final, config).duration;
  };

  /** Rebuild the jump links: when the panel opens, each league minute (so past ones dim), or when the final's end becomes known. @param {number} t */
  function refreshJumps(t) {
    const season = live.calendar.seasonAt(t);
    const finalEnd = finalEndIn(season);
    const key = `${season}|${finalEnd}|${Math.floor(t / 60_000)}|${state.layout}|${state.sound}`;
    if (key === jumpKey) return;
    jumpKey = key;
    // The most recent match to finish on screen, for its handshakes and post-match show.
    const ends = [...live.matches.values()].map((m) => m.kickoff + timelineOf(m).duration).filter((e) => e <= t);
    const lastEnd = ends.length > 0 ? Math.max(...ends) : null;
    const links = jumpsFor(live.calendar, t, config.settings, finalEnd, lastEnd).map((j) => {
      const a = el('a', '', [j.label]);
      if (j.at !== null) {
        a.href = jumpSearch(location.search, stamp(j.at), state);
        if (j.at < t) a.classList.add('past');
      } else {
        a.title = 'Works out when the final ends first (a moment\'s wait)';
        a.addEventListener('click', () => {
          const champions = jumpsFor(live.calendar, t, config.settings, finalEndAhead(season)).find((x) => x.label === j.label);
          if (champions?.at != null) location.search = jumpSearch(location.search, stamp(champions.at), state);
        });
      }
      return a;
    });
    // The parts between matches (Task 95, channel.md §16) come round at their own times: each is found on a click, by
    // walking the running order ahead on a scratch league (the page's own league isn't run ahead).
    /** @type {[string, (s: import('../programme.js').Segment) => boolean][]} */
    const searches = [
      ['Next match talk', (s) => s.kind === 'talk' && (s.topic === 'match' || s.topic === 'round')],
      ['Next ad break', (s) => s.kind === 'ads' && s.part === 'bumper_in'],
      ['Next tee-up', (s) => s.kind === 'talk' && s.topic === 'tee_up'],
      ['Next re-air interview', (s) => s.kind === 'reair' && s.part === 'interview'],
      // A highlights unit in the gap (Task 104), not the post-match show's own package.
      ['Next highlights unit', (s) => s.kind === 'highlights' && !s.show],
      ['Next opening', (s) => s.kind === 'ident'],
    ];
    for (const [label, wanted] of searches) {
      const link = el('a', '', [label]);
      link.title = 'Searches ahead through the running order (a moment\'s wait)';
      link.addEventListener('click', () => {
        const scratch = new LiveLeague(config, { now: t, seed });
        /** @type {Map<string, ReturnType<typeof createTimeline>>} */
        const tls = new Map();
        const programme = createProgramme(scratch, (m) => tls.get(m.id) ?? /** @type {ReturnType<typeof createTimeline>} */ (tls.set(m.id, createTimeline(m, config)).get(m.id)));
        for (let x = t + 1000; x < t + SEARCH_MS;) {
          scratch.advanceTo(x);
          const p = programme.pieceAt(x);
          if (p.from > t && wanted(programme.at(p.from))) {
            location.search = jumpSearch(location.search, stamp(p.from + 500), state);
            return;
          }
          x = Math.max(p.until, x + 1000);
        }
        link.textContent = `${label}: none soon`;
      });
      links.push(link);
    }
    // Two columns, read top to bottom (with "This moment" first).
    jumpBox.style.gridTemplateRows = `repeat(${Math.ceil((links.length + 1) / 2)}, auto)`;
    jumpBox.replaceChildren(...links);
  }

  return {
    /** The ` key: the panel on or off (the help closes with it). */
    toggle() {
      const open = panel.classList.toggle('open');
      if (!open) help.classList.remove('open');
      jumpKey = '';
    },

    /** The H key or the Help link: the help beside the panel, only while the panel is open. */
    toggleHelp,

    /**
     * A frame threw: log it once (with the moment, as a link) and show it at the top of the status.
     * @param {unknown} err @param {number} t
     */
    problem(err, t) {
      const message = err instanceof Error ? err.message : String(err);
      problem = `ERROR    ${message}  at ${stamp(t)}`;
      if (!logged.has(message)) {
        logged.add(message);
        console.error(`Frame error at ${stamp(t)}: ${location.origin}${location.pathname}${jumpSearch(location.search, stamp(t))}`, err);
      }
      if (panel.classList.contains('open')) setText(status, problem);
    },

    /**
     * Called every frame. Measures FPS always; touches the DOM only while the panel is open.
     * @param {number} t
     * @param {{ pos: import('../calendar.js').CalendarPosition, seg: import('../programme.js').Segment,
     *   shown: import('../liveLeague.js').LiveMatch | null, viewerPick: string | null, speed: number, buildMs: number,
     *   sound: { on: boolean, played: number, offered?: boolean }, layout: string }} s  sound: whether it's on, how many sounds have played since load, and whether the click-for-sound prompt is up (Task 62). layout: Full or Broadcast.
     */
    update(t, { pos, seg, shown, viewerPick, speed, buildMs, sound, layout }) {
      state = { layout: /** @type {'full' | 'broadcast'} */ (layout), sound: sound.on || Boolean(sound.offered) };
      const realNow = performance.now();
      frames++;
      if (realNow - countFrom >= FPS_WINDOW_MS) {
        if (countFrom) fps = (frames * 1000) / (realNow - countFrom);
        frames = 0;
        countFrom = realNow;
      }
      if (!panel.classList.contains('open')) return;

      const teams = live.league.teams;
      let onAir = '-';
      if (shown) {
        const at = 'elapsed' in seg ? seg.elapsed : t - shown.kickoff;
        const state = timelineOf(shown).stateAt(at);
        const pick = seg.kind === 'live' && seg.group.length > 1 ? (viewerPick ? '  viewer pick' : '  channel pick') : '';
        onAir = `${shown.id} ${teams[shown.homeId].abbr} ${state.score.join('-')} ${teams[shown.awayId].abbr}  ${mmss(at / 1000)} in${seg.kind === 'highlights' ? ` (highlights, clip ${seg.clip + 1}/${seg.clips})` : seg.kind === 'reair' ? ' (re-air)' : ''}${pick}`;
      }
      const nowStamp = stamp(t);
      setText(status, [
        ...(problem ? [problem] : []),
        `now      ${nowStamp}  x${speed}  ${Math.round(fps)} fps  sound ${sound.on ? `on, ${sound.played} played` : 'off'}  ${layout}`,
        `season   ${pos.season}  ${pos.phase}  ${pos.started}/${live.calendar.slotCount} kicked off`,
        `segment  ${seg.kind}${seg.kind === 'studio' ? ` ${seg.card}` : ''}${'show' in seg && seg.show ? ' (post-match show)' : ''}${seg.kind === 'reair' ? ` ${seg.part} ${seg.match.id}` : ''}${'until' in seg ? ` until ${clockOf(seg.until)}` : ''}`,
        `on air   ${onAir}`,
        `next     ${pos.next ? `${pos.next.stage} slot ${pos.next.index} at ${stamp(pos.next.kickoff)}` : '-'}`,
        `seed     "${seed}"  built in ${Math.round(buildMs)} ms, ${live.log.lastSeq.toLocaleString('en-US')} events`,
      ].join('\n'));

      refreshJumps(t);
      const hereHref = jumpSearch(location.search, nowStamp, state);
      if (here.getAttribute('href') !== hereHref) here.href = hereHref;
      if (here.parentNode !== jumpBox) {
        here.textContent = 'This moment (link)';
        jumpBox.prepend(here);
      }
    },
  };
}
