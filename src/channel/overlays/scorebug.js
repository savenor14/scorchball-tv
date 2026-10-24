// The scorebug (top left): LIVE, HIGHLIGHTS or REPLAY with score, clock and heat strip; FT after a match; NEXT with a countdown.
// Its swatches show the kits worn in the match (after the clash rule).
import { heatColour } from '../pitch.js';
import { $, countdown, mmss, setText } from './dom.js';
import { replayLabel } from '../sidePanel.js';

/** The tag before the game clock (also in the line sent with a note, Task 261). */
export const PERIOD_LABEL = /** @type {Record<string, string>} */ ({
  first_half: '1H', half_time: 'HT', second_half: '2H', overtime_break: 'GG', overtime: 'GG',
  shootout_break: 'SO', shootout: 'SO', finished: 'FT',
});
/** Knockout stages get a label. */
const STAGE_LABEL = /** @type {Record<string, string>} */ ({ semifinal: 'SEMI', final: 'FINAL' });

/**
 * @param {{ league: import('../../sim/league.js').League, config: import('../../config.js').Config,
 *   kitsOf: (homeId: string, awayId: string) => import('../kits.js').MatchKits }} channel
 */
export function createScorebug({ league, config, kitsOf }) {
  const bug = $('bug');

  /** @param {string} homeId @param {string} awayId */
  function teams(homeId, awayId) {
    setText($('home'), league.teams[homeId].abbr);
    setText($('away'), league.teams[awayId].abbr);
    const kits = kitsOf(homeId, awayId);
    for (const [id, kit] of /** @type {const} */ ([['home-kit', kits.home], ['away-kit', kits.away]])) {
      const swatch = $(id);
      swatch.style.background = kit.primary;
      swatch.style.setProperty('--kit2', kit.secondary);
    }
  }

  /** @param {string} text @param {string} cls */
  function setBug(text, cls) {
    setText(bug, text);
    if (bug.className !== cls) bug.className = cls;
  }

  /** The clock blinks while it's paused for a goal or substitution. @param {boolean} on */
  function stopped(on) {
    const time = $('time');
    if (time.classList.contains('stopped') !== on) time.classList.toggle('stopped', on);
  }

  /**
   * momentum (Task 238, Tom's pick B): the team's kit swatch glows heat orange, as strong as the momentum left; the
   * other's plain. @param {string} homeId @param {{ teamId: string, left: number } | null} mo
   */
  let glowKey = '';
  function glow(homeId, mo) {
    const key = mo ? `${mo.teamId}|${mo.left.toFixed(2)}` : '';
    if (key === glowKey) return;
    glowKey = key;
    for (const [id, home] of /** @type {const} */ ([['home-kit', true], ['away-kit', false]])) {
      const on = mo && (mo.teamId === homeId) === home;
      const c = on ? `color-mix(in srgb, var(--heat-orange) ${Math.round(100 * (mo?.left ?? 0))}%, transparent)` : '';
      // The swatch's own trim (its secondary colour, an inset shadow in .kit) kept under the glow (Tom: not one colour).
      $(id).style.boxShadow = on ? `inset calc(var(--px) * -1) 0 0 var(--kit2, transparent), 0 0 0 var(--px) ${c}, 0 0 calc(var(--px) * 4) var(--px) ${c}` : '';
    }
  }

  /** @param {number} heat */
  function heatStrip(heat) {
    const fill = $('heat-fill');
    fill.style.width = `${heat}%`;
    fill.style.background = heatColour(heat, config.rules.heat);
  }

  return {
    /**
     * A match being played: live, in its highlights, or re-aired in full.
     * @param {import('../liveLeague.js').LiveMatch} m @param {import('../timeline.js').MatchState} s
     * @param {'live' | 'highlights' | 'vault' | 'replay'} mode
     * @param {{ teamId: string, left: number } | null} [mo]  Who has momentum and how much is left (Task 238).
     * @param {number} [season]  The season now: an earlier season's re-air is S1 REPLAY (Task 277b).
     */
    match(m, s, mode, mo = null, season = m.season) {
      // FROM THE VAULT's reel (Tom's note 14): named so, in the replays' blue.
      setBug(mode === 'live' ? 'LIVE' : mode === 'highlights' ? 'HIGHLIGHTS' : mode === 'vault' ? 'FROM THE VAULT' : replayLabel(m, season), mode === 'live' ? '' : 'replay');
      setText($('stage-label'), STAGE_LABEL[m.stage] ?? '');
      teams(m.homeId, m.awayId);
      setText($('score'), `${s.score[0]}-${s.score[1]}`);
      // In a shootout (and after its last kick) the clock shows its tally, SO 4-3, beside the score rather than in it:
      // the scorebug stays narrow enough for the ad still beside it in Full.
      const shootout = s.phase.startsWith('shootout') || (s.phase === 'finished' && s.shootout) ? `${s.shootout?.[0] ?? 0}-${s.shootout?.[1] ?? 0}` : null;
      setText($('period'), shootout ? 'SO' : PERIOD_LABEL[s.phase] ?? '');
      setText($('time'), shootout ?? (s.phase === 'half_time' || s.phase === 'finished' ? '' : mmss(s.clock)));
      stopped(s.paused !== null);
      heatStrip(s.heat);
      glow(m.homeId, mo);
    },

    /** The match just finished. @param {import('../liveLeague.js').LiveMatch} m */
    result(m) {
      glow('', null);
      const r = m.summary.result;
      setBug('FT', 'next');
      setText($('stage-label'), STAGE_LABEL[m.stage] ?? '');
      teams(m.homeId, m.awayId);
      setText($('score'), `${r.homeGoals}-${r.awayGoals}`);
      setText($('period'), r.decidedBy === 'overtime' ? 'GG' : r.shootout ? 'SO' : '');
      setText($('time'), r.shootout ? `${r.shootout.home}-${r.shootout.away}` : '');
      stopped(false);
      heatStrip(0);
    },

    /**
     * A re-air before its kick-off (its intro and line-up; Tom, 2026-10-16): REPLAY (or S1 REPLAY), the teams, and the
     * countdown to its kick-off, as NEXT counts down to a live match's.
     * @param {import('../liveLeague.js').LiveMatch} m @param {number} msLeft @param {number} [season]
     */
    replayCountdown(m, msLeft, season = m.season) {
      glow('', null);
      setBug(replayLabel(m, season), 'replay');
      setText($('stage-label'), STAGE_LABEL[m.stage] ?? '');
      teams(m.homeId, m.awayId);
      setText($('score'), 'v');
      setText($('period'), '');
      setText($('time'), countdown(msLeft));
      stopped(false);
      heatStrip(0);
    },

    /**
     * Between matches: who's next and when.
     * @param {import('../programme.js').NextFixture | null} fixture @param {number} msLeft
     * @param {number} season  The season on screen; a fixture from the next one shows "SEASON N".
     * @param {boolean} [repeat]  The off-season show repeated (Task 195): REPEAT in the tag, the countdown as before.
     */
    upcoming(fixture, msLeft, season, repeat = false) {
      glow('', null);
      const newSeason = fixture !== null && fixture.season !== season;
      setBug(repeat ? 'REPEAT' : newSeason ? `SEASON ${fixture.season}` : 'NEXT', repeat ? 'replay' : 'next');
      setText($('stage-label'), fixture ? STAGE_LABEL[fixture.stage] ?? '' : '');
      if (fixture) teams(fixture.homeId, fixture.awayId);
      setText($('score'), 'v');
      setText($('period'), '');
      setText($('time'), countdown(msLeft));
      stopped(false);
      heatStrip(0);
    },
  };
}
