// Dev controls: the URL parameters (?at, ?speed, ?seed, ?hl, ?layout, ?sound), league-time stamps, the dev panel's jump list and the
// season's match share. Pure and DOM-free. See docs/channel.md §10.
import { createCalendar, zoneOffsets } from './calendar.js';
import { LiveLeague } from './liveLeague.js';
import { createProgramme, showsPlay } from './programme.js';
import { createTimeline } from './timeline.js';
import { liftParts } from './trophyLift.js';

const MIN = 60_000;
/** The URL parameters the channel understands. Anything else is a typo. */
const KNOWN = ['at', 'speed', 'seed', 'hl', 'layout', 'sound', 'hush', 'fire', 'fit', 'accent', 'moments', 'cheer', 'perf', 'latency', 'crowdrate', 'murmur', 'ahead', 'recordings', 'phone', 'coins', 'watching', 'from'];
/** Jumps land this long after a kick-off, so the match is already under way. */
const INTO_MATCH_MS = 2 * MIN;
/** The final-round jump lands later, so all four matches have a few minutes on the clock. */
const INTO_FINAL_ROUND_MS = 6 * MIN;
/** Card jumps (final day, new season) land this long before the moment they lead up to. */
const BEFORE_MS = 3 * MIN;
/** The champions and off-season jumps land this far into their segment. */
const INTO_SEGMENT_MS = 15_000;

/**
 * How much of a season's week shows play (live, the match part of a re-air, or highlights: showsPlay), sampled every
 * `stepMs` with a scratch league. The north star (vision §3) wants this above half; the floor is 60% (Tom, 2026-10-19).
 * Takes about a second for a whole season at one-minute steps.
 * @param {import('../config.js').Config} config @param {string} seed @param {number} season
 * @param {number} [stepMs]
 * @returns {{ share: number, live: number }}  Fractions of the week: any match, and live matches only.
 */
export function matchShare(config, seed, season, stepMs = MIN) {
  const calendar = createCalendar(config);
  const from = calendar.seasonStart(season);
  const to = calendar.seasonStart(season + 1);
  const live = new LiveLeague(config, { now: from, seed });
  /** @type {Map<string, import('./timeline.js').Timeline>} */
  const timelines = new Map();
  const timelineOf = (/** @type {import('./liveLeague.js').LiveMatch} */ m) => {
    let tl = timelines.get(m.id);
    if (!tl) timelines.set(m.id, (tl = createTimeline(m, config)));
    return tl;
  };
  const programme = createProgramme(live, timelineOf);
  let on = 0;
  let onLive = 0;
  let all = 0;
  for (let t = from; t < to; t += stepMs) {
    live.advanceTo(t);
    const seg = programme.at(t);
    all++;
    if (showsPlay(seg)) on++;
    if (seg.kind === 'live') onLive++;
  }
  return { share: on / all, live: onLive / all };
}

/**
 * Read `?at=`, `?speed=`, `?seed=`, `?hl=` (try another highlights speed), `?layout=broadcast` (start in Broadcast)
 * and `?sound=on` (sound was on before a dev-panel jump: offer it back) from a URL query string; and `?hush=` (roar,
 * murmur, both or none: which sounds go silent on switching matches, overriding sound.resume.hush for listening); and
 * `?moments=` (reset: this browser's MOMENTS start afresh; demo: a viewer about two weeks in); `?coins=` (reset: this
 * browser's Fan Coins start afresh; rich: 500 to spend; docs/channel.md §29); and `?cheer=` (pair, group or
 * none: the goal celebrations to compare, Task 278l; pair and group with the winners cheering at full time); and `?perf=1`
 * (the phone readout: frame times and late sounds, the live site too); `?watching=on` (how many are watching on the
 * ticker, settings.audience.watchingTicker; the live site too); `?from=` (where a visit came from, sourceTag; the live
 * site too); and the sound switches (soundSwitches).
 * @param {string} search  e.g. location.search
 * @returns {{ at: number | null, speed: number, seed: string | null, highlightsSpeed: number | null, layout: 'full' | 'broadcast', sound: boolean, hush: 'roar' | 'murmur' | 'both' | 'none' | null, fire: 'crackle' | 'torch' | 'comet' | null, fill: boolean, moments: 'reset' | 'demo' | null, coins: 'reset' | 'rich' | null, cheer: 'pair' | 'group' | 'none' | null, perf: boolean, watching: boolean, from: string | null } & SoundSwitches}
 * @throws {Error} with a readable message if a value is malformed or a parameter is unknown.
 */
export function devParams(search) {
  const params = new URLSearchParams(search);
  const unknown = [...params.keys()].filter((k) => !KNOWN.includes(k));
  if (unknown.length) throw new Error(`Unknown URL parameter ${unknown.map((k) => `?${k}=`).join(', ')} (known: ${KNOWN.map((k) => `?${k}=`).join(', ')})`);
  const atText = params.get('at');
  const speedText = params.get('speed');
  const seed = params.get('seed');
  const at = atText === null ? null : Date.parse(atText);
  if (at !== null && Number.isNaN(at)) throw new Error(`?at= must be a date-time like 2026-10-07T18:00-04:00 (got "${atText}")`);
  const speed = speedText === null ? 1 : Number(speedText);
  if (!(speed > 0) || !Number.isFinite(speed)) throw new Error(`?speed= must be a number above 0 (got "${speedText}")`);
  if (seed !== null && seed.trim() === '') throw new Error('?seed= must not be empty');
  const hlText = params.get('hl');
  const highlightsSpeed = hlText === null ? null : Number(hlText);
  if (highlightsSpeed !== null && (!(highlightsSpeed > 0) || !Number.isFinite(highlightsSpeed))) throw new Error(`?hl= must be a number above 0 (got "${hlText}")`);
  const layout = params.get('layout') ?? 'full';
  if (layout !== 'full' && layout !== 'broadcast') throw new Error(`?layout= must be full or broadcast (got "${layout}")`);
  const soundText = params.get('sound');
  if (soundText !== null && soundText !== 'on') throw new Error(`?sound= must be on (got "${soundText}")`);
  const hush = params.get('hush');
  if (hush !== null && !['roar', 'murmur', 'both', 'none'].includes(hush)) throw new Error(`?hush= must be roar, murmur, both or none (got "${hush}")`);
  // The ident's fire, to hear each in place (Task 249).
  const fire = params.get('fire');
  if (fire !== null && !['crackle', 'torch', 'comet'].includes(fire)) throw new Error(`?fire= must be crackle, torch or comet (got "${fire}")`);
  // The picture fills the window (Task 277c); ?fit=whole scales it by whole numbers as before, to compare.
  const fit = params.get('fit');
  if (fit !== null && fit !== 'fill' && fit !== 'whole') throw new Error(`?fit= must be fill or whole (got "${fit}")`);
  const moments = params.get('moments');
  if (moments !== null && moments !== 'reset' && moments !== 'demo') throw new Error(`?moments= must be reset or demo (got "${moments}")`);
  const coins = params.get('coins');
  if (coins !== null && coins !== 'reset' && coins !== 'rich') throw new Error(`?coins= must be reset or rich (got "${coins}")`);
  const cheer = params.get('cheer');
  if (cheer !== null && !['pair', 'group', 'none'].includes(cheer)) throw new Error(`?cheer= must be pair, group or none (got "${cheer}")`);
  const perf = params.get('perf');
  if (perf !== null && perf !== '1') throw new Error(`?perf= must be 1 (got "${perf}")`);
  return { ...soundSwitches(params, true), at, speed, seed, highlightsSpeed, layout, sound: soundText === 'on', perf: perf === '1', watching: params.get('watching') === 'on', from: sourceTag(params.get('from')), fill: fit !== 'whole', hush: /** @type {'roar' | 'murmur' | 'both' | 'none' | null} */ (hush), fire: /** @type {'crackle' | 'torch' | 'comet' | null} */ (fire), moments: /** @type {'reset' | 'demo' | null} */ (moments), coins: /** @type {'reset' | 'rich' | null} */ (coins), cheer: /** @type {'pair' | 'group' | 'none' | null} */ (cheer) };
}

/**
 * Whether the dev tools work here (Task 275; docs/live.md §6): only on the dev server, `localhost`. On the live site
 * (and its pages.dev address, so the dress rehearsal plays as viewers see it) `?at=`, `?seed=`, `?speed=` would let
 * anyone jump ahead and spoil the league.
 * @param {string} hostname  e.g. location.hostname
 */
export const devToolsAllowed = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');

/**
 * The URL's parameters as the live site reads them (Task 275): only `?layout=broadcast` (a link into Broadcast) and
 * `?perf=1` (the phone readout: harmless, it only shows numbers over the picture), `?watching=on` and `?from=` (the
 * link a visit came in by: our posts' tags, counted on the desk); everything else ignored, never refused, so a link with a
 * tracking tag added (`?fbclid=`) still plays.
 * @param {string} search
 * @returns {ReturnType<typeof devParams>}
 */
export function publicParams(search) {
  const params = new URLSearchParams(search);
  const layout = params.get('layout') === 'broadcast' ? 'broadcast' : 'full';
  return { at: null, speed: 1, seed: null, highlightsSpeed: null, layout, sound: false, hush: null, fire: null, fill: true, moments: null, coins: null, cheer: null, perf: params.get('perf') === '1', watching: params.get('watching') === 'on', from: sourceTag(params.get('from')), ...soundSwitches(params, false) };
}

/**
 * Where a visit came in (getting the word out, docs/launch-plan.md): the tag on our posts' links (`?from=hn`), lower case,
 * 1–16 letters, digits or dashes; anything else ignored (null), never refused. Sent with the visit's hellos and counted
 * on the Director's desk; nothing about the viewer.
 * @param {string | null} text @returns {string | null}
 */
export function sourceTag(text) {
  const tag = text?.trim().toLowerCase() ?? '';
  return /^[a-z0-9-]{1,16}$/.test(tag) ? tag : null;
}

/**
 * @typedef {{ latency: number | null, crowdRate: number | null, murmurBed: boolean, ahead: number | null, recordingsOff: boolean, phone: boolean | null }} SoundSwitches
 */

/**
 * The sound switches for phones (Firefox's crowd popped; docs/channel.md §27), on the live site too, for listening:
 * `?latency=` the audio buffer asked for in seconds (0.01–1; Firefox ignores "playback"), `?crowdrate=` the crowd's takes
 * rendered at this rate (8000–96000; 48000 is the phone's own, nothing to resample), `?murmur=bed` the murmur one loop, `?ahead=` every sound started this many seconds ahead on the audio clock (0–1), `?recordings=off` every sound built in the browser as before the recordings; and `?phone=1` or `?phone=0`, the phone's
 * layout or not, whatever the screen (phones, step 4).
 * On the dev server a bad value is refused (`strict`); on the live site it's ignored.
 * @param {URLSearchParams} params @param {boolean} strict
 * @returns {SoundSwitches}
 */
export function soundSwitches(params, strict) {
  /** @param {string} key @param {number} lo @param {number} hi */
  const num = (key, lo, hi) => {
    const text = params.get(key);
    if (text === null) return null;
    const n = Number(text);
    if (Number.isFinite(n) && n >= lo && n <= hi) return n;
    if (strict) throw new Error(`?${key}= must be a number from ${lo} to ${hi} (got "${text}")`);
    return null;
  };
  const murmur = params.get('murmur');
  const recordings = params.get('recordings');
  const phone = params.get('phone');
  if (strict && phone !== null && phone !== '1' && phone !== '0') throw new Error(`?phone= must be 1 or 0 (got "${phone}")`);
  if (strict && recordings !== null && recordings !== 'off') throw new Error(`?recordings= must be off (got "${recordings}")`);
  if (strict && murmur !== null && murmur !== 'bed') throw new Error(`?murmur= must be bed (got "${murmur}")`);
  return { latency: num('latency', 0.01, 1), crowdRate: num('crowdrate', 8000, 96000), murmurBed: murmur === 'bed', ahead: num('ahead', 0, 1), recordingsOff: recordings === 'off', phone: phone === '1' ? true : phone === '0' ? false : null };
}

/**
 * A moment as wall-clock time in a time zone, in the form ?at= accepts: "2026-10-07T17:00-04:00", with seconds only
 * when they aren't zero.
 * @param {string} timeZone  IANA zone.
 */
export function zoneStamper(timeZone) {
  const zone = zoneOffsets(timeZone);
  const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
  /** @param {number} t  Epoch ms. */
  return (t) => {
    const whole = Math.floor(t / 1000) * 1000;
    const offset = zone.offsetAt(whole);
    const wall = new Date(whole + offset).toISOString(); // the wall time, written as if it were UTC
    const secs = wall.slice(17, 19);
    const off = Math.abs(offset) / MIN;
    return `${wall.slice(0, 16)}${secs === '00' ? '' : `:${secs}`}${offset < 0 ? '-' : '+'}${pad(Math.floor(off / 60))}:${pad(off % 60)}`;
  };
}

/**
 * A query string with ?at= set to a moment, keeping the other parameters. With `state`, the layout and sound are
 * carried over too (Task 62): ?layout=broadcast, ?sound=on, or neither.
 * @param {string} search @param {string} stamp @param {{ layout: 'full' | 'broadcast', sound: boolean }} [state]
 */
export function jumpSearch(search, stamp, state) {
  const params = new URLSearchParams(search);
  params.set('at', stamp);
  if (state) {
    if (state.layout === 'broadcast') params.set('layout', 'broadcast');
    else params.delete('layout');
    if (state.sound) params.set('sound', 'on');
    else params.delete('sound');
  }
  return `?${params.toString().replace(/%3A/gi, ':')}`;
}

/**
 * @typedef {object} Jump
 * @property {string} label
 * @property {number | null} at  Epoch ms, or null when it depends on how long the final lasts and that isn't known yet.
 */

/**
 * The handy moments around a season, for the dev panel: the next match, the season's big days, and the next
 * season's start. Moments after the final need the final's end (it can go to overtime or a shootout); pass null when
 * it hasn't been played, and those jumps come back with `at: null`.
 * @param {import('./calendar.js').Calendar} calendar
 * @param {number} t  The current moment, epoch ms.
 * @param {{ segments: { walkOutMinutes: number, handshakeMinutes: number, fullTimeMinutes: number, potmSeconds: number, championMinutes: number }, trophyLift: import('./trophyLift.js').LiftSettings, awards: { talkSeconds: number, awardSeconds: number, order: string[] } }} settings
 * @param {number | null} finalEnd  When the season's final ends on screen (epoch ms), if known.
 * @param {number | null} [lastEnd]  When the most recent finished match ended on screen, if any: for the jumps to its
 *   handshakes and post-match show.
 * @returns {Jump[]}
 */
export function jumpsFor(calendar, t, settings, finalEnd, lastEnd = null) {
  const pos = calendar.at(t);
  const slots = calendar.slots(pos.season);
  const finalRound = slots[calendar.regularCount - 1];
  const nextOpener = calendar.slots(pos.season + 1)[0];
  const { fullTimeMinutes, potmSeconds } = settings.segments;
  // After the final the trophy lift (Task 190) takes the handshakes' place.
  const lift = liftParts(settings.trophyLift);
  const championFrom = finalEnd === null ? null : finalEnd + lift.total + fullTimeMinutes * MIN + potmSeconds * 1000;
  const awardsMs = (settings.awards.talkSeconds + settings.awards.order.length * settings.awards.awardSeconds) * 1000;
  /** @type {Jump[]} */
  const jumps = [];
  if (lastEnd !== null) {
    jumps.push(
      { label: 'Last handshakes', at: lastEnd + INTO_SEGMENT_MS },
      { label: 'Last post-match show', at: lastEnd + settings.segments.handshakeMinutes * MIN + INTO_SEGMENT_MS },
    );
  }
  if (pos.next) {
    jumps.push(
      { label: 'Next walk-out', at: pos.next.kickoff - settings.segments.walkOutMinutes * MIN + INTO_SEGMENT_MS },
      { label: `Next match (${pos.next.stage}${pos.next.round ? ` round ${pos.next.round}` : ''})`, at: pos.next.kickoff + INTO_MATCH_MS },
    );
  }
  jumps.push(
    { label: `S${pos.season} opening match`, at: slots[0].kickoff + INTO_MATCH_MS },
    { label: `S${pos.season} final day card`, at: finalRound.kickoff - BEFORE_MS },
    { label: `S${pos.season} final round (live)`, at: finalRound.kickoff + INTO_FINAL_ROUND_MS },
  );
  slots.filter((s) => s.stage !== 'regular').forEach((s, i, ko) => {
    const label = s.stage === 'final' ? 'final' : ko.filter((k) => k.stage === 'semifinal').length > 1 ? `semifinal ${i + 1}` : 'semifinal';
    jumps.push({ label: `S${pos.season} ${label}`, at: s.kickoff + INTO_MATCH_MS });
  });
  jumps.push(
    { label: `S${pos.season} trophy lift`, at: finalEnd === null ? null : finalEnd + INTO_SEGMENT_MS },
    { label: `S${pos.season} the cup lifted`, at: finalEnd === null ? null : finalEnd + lift.closeUpAt - 3000 },
    { label: `S${pos.season} champions`, at: championFrom === null ? null : championFrom + INTO_SEGMENT_MS },
    // The awards (Task 191) after the champions: their talk (sized to its lines, so about), then each award.
    { label: `S${pos.season} awards`, at: championFrom === null ? null : championFrom + settings.segments.championMinutes * MIN + INTO_SEGMENT_MS },
    { label: `S${pos.season} off-season`, at: championFrom === null ? null : championFrom + settings.segments.championMinutes * MIN + awardsMs + INTO_SEGMENT_MS },
    { label: `S${pos.season + 1} countdown`, at: calendar.seasonStart(pos.season + 1) - BEFORE_MS },
    { label: `S${pos.season + 1} opening match`, at: nextOpener.kickoff + INTO_MATCH_MS },
  );
  return jumps;
}
