// The recordings (phones, 2026-10-13; vision §12, docs/channel.md §27): every synthesized sound rendered once on our
// side into a file (assets/sounds/), so the channel only plays them; building them in the browser made the crowd and
// the music chop on a phone. Pure and DOM-free: which recording a sound asked for plays (recordingOf), and every
// recording there is (catalogue), for the dev page that makes them (recordings.html) and the tests that keep them fresh.
//
// A sound varied by its seed (each kick a little different) plays one of `variants` takes, picked by the seed, alike on
// every screen, so a re-air still sounds like the live match; a kick's strength is rounded to one of `kickLevels`, a
// roar's size to one of `roarSizes`. Sounds whose recipe ignores the seed (the music, the jingles, the anthems) have one.
import { createRng } from '../sim/rng.js';
import { sha256 } from '../sim/sha256.js';
import { EFFECTS, LOTTERY_STYLES, MUSIC_STYLES, musicLayers } from './musicRecipes.js';
import { recipe, roarCheer } from './soundRecipes.js';
import { ceremonyCues } from './crowd.js';
import { liftCues } from './trophyLift.js';
import { sceneRect } from './scene.js';
import { identTrack } from './spotArt.js';

/**
 * @typedef {object} RecordingSettings  settings.sound.recordings
 * @property {boolean} enabled  Play the recordings (?recordings=off builds every sound in the browser, as before).
 * @property {number} variants  Takes of a sound that varies by its seed.
 * @property {number} crowdVariants  Takes of each of the crowd's sounds.
 * @property {number} roarSizes  A roar's sizes.
 * @property {number} kickLevels  A kick's strengths, from 0 to 1.
 * @property {number[]} shotPowers  A shot's strengths (the sim's: a shot, a shootout kick, a scorcher or breakaway).
 * @property {number} rate  Samples a second (the crowd's: crowdRate).
 * @property {number} crowdRate
 * @property {number} bitrate  kbps, mono (the music's too).
 * @typedef {{ key: string, kind: import('./soundRecipes.js').SoundKind, seed: string, opts: import('./soundRecipes.js').SoundOptions, rate: number, loop?: number }} Recording
 *   key: the file's path under assets/sounds/, without .mp3; seed and opts: what to render it with; loop: recorded as a
 *   seamless loop this many seconds long (the music: each pass's tail folded onto the start, as the passes overlap live).
 */

/** The crowd's sounds (audio.js CROWD_KINDS). */
const CROWD = new Set(['roar', 'groan', 'ooh', 'applause', 'jeer', 'murmur', 'chant']);
/** Sounds that vary by their seed, played from takes. */
const SEEDED = new Set(['whistle', 'kick', 'shot', 'net', 'save', 'post', 'block', 'burn', 'sub', 'whoosh', 'swish', 'sting', 'ident', 'fire']);
/** The murmur as one seamless loop (?murmur=bed), recorded too. */
export const MURMUR_BED = 'murmur/bed';

/**
 * A short, stable name for something's options (a jingle, the fire's course) or a recipe: its numbers rounded to 8
 * significant figures first, since Node and the browsers can differ in a calculation's last decimal place.
 * @param {unknown} v
 */
export const shapeId = (v) => sha256(JSON.stringify(v, (_, x) => (typeof x === 'number' ? Number(x.toPrecision(8)) : x))).slice(0, 10);

/** The nearest of `list` to `v`. @param {number[]} list @param {number} v */
const nearest = (list, v) => list.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));

/**
 * The recording a sound plays: its file and what it's rendered with. null if there's none for it (the channel then
 * builds it, and the readout counts it).
 * @param {import('./soundRecipes.js').SoundKind} kind @param {string} seed
 * @param {import('./soundRecipes.js').SoundOptions} opts @param {RecordingSettings} rs
 * @returns {Recording | null}
 */
export function recordingOf(kind, seed, opts, rs) {
  const n = takesOf(kind, rs);
  return recordingAt(kind, n > 1 ? createRng(`take|${seed}`).int(0, n - 1) : 0, opts, rs);
}

/** How many takes a kind has. @param {string} kind @param {RecordingSettings} rs */
const takesOf = (kind, rs) => (CROWD.has(kind) ? rs.crowdVariants : SEEDED.has(kind) ? rs.variants : 1);

/**
 * Take `i` of a sound with these options.
 * @param {import('./soundRecipes.js').SoundKind} kind @param {number} i
 * @param {import('./soundRecipes.js').SoundOptions} opts @param {RecordingSettings} rs
 * @returns {Recording | null}
 */
export function recordingAt(kind, i, opts, rs) {
  if (CROWD.has(kind)) {
    // The takes' seeds as audio.js crowdTakes named them, so the recordings are the takes heard before.
    if (kind === 'roar') {
      const size = Math.max(1, Math.round(Math.min(1, Math.max(0, opts.power ?? 0.5)) * rs.roarSizes));
      // Some takes are cheers of other kinds (roarCheer; Tom, 2026-10-20), mixed in wherever a roar plays.
      const cheer = roarCheer(size / rs.roarSizes, i);
      return { key: `roar/s${size}-v${i}`, kind, seed: `take|${kind}|${i}`, opts: { power: size / rs.roarSizes, ...(cheer ? { cheer } : {}) }, rate: rs.crowdRate };
    }
    // A Fan Coins chant (docs/channel.md §29): its own takes, named by its tune; the olé as before.
    if (kind === 'chant' && opts.tune) return { key: `chant/${shapeId(opts.tune)}-v${i}`, kind, seed: `take|${kind}|${i}`, opts: { tune: opts.tune }, rate: rs.crowdRate };
    return { key: `${kind}/v${i}`, kind, seed: `take|${kind}|${i}`, opts: {}, rate: rs.crowdRate };
  }
  if (SEEDED.has(kind)) {
    const base = { kind, seed: `take|${kind}|${i}`, rate: rs.rate };
    switch (kind) {
      case 'whistle': return { ...base, key: `whistle/${opts.blast ?? 'short'}-v${i}`, opts: { blast: opts.blast ?? 'short' } };
      case 'kick': {
        const level = Math.round(Math.min(1, Math.max(0, opts.power ?? 0.5)) * (rs.kickLevels - 1));
        return { ...base, key: `kick/p${level}-v${i}`, opts: { power: level / (rs.kickLevels - 1) } };
      }
      case 'shot': {
        const power = nearest(rs.shotPowers, opts.power ?? 0.5);
        return { ...base, key: `shot/p${Math.round(power * 100)}-v${i}`, opts: { power } };
      }
      case 'save': return { ...base, key: `save/${opts.held ? 'held' : 'parried'}-v${i}`, opts: { held: Boolean(opts.held) } };
      case 'sting': return { ...base, key: `sting/${opts.sting ?? 'show'}-v${i}`, opts: { sting: opts.sting ?? 'show' } };
      case 'fire': {
        if (!opts.track) return null;
        const style = opts.style ?? 'crackle';
        return { ...base, key: `fire/${style}-${shapeId(opts.track)}-v${i}`, opts: { style, track: opts.track } };
      }
      default: return { ...base, key: `${kind}/v${i}`, opts: {} };
    }
  }
  switch (kind) {
    case 'music': return { key: `music/${opts.style ?? 'lounge'}`, kind, seed: 'music', opts: { style: opts.style }, rate: rs.rate, loop: musicLayers(opts.style ?? 'lounge').duration };
    case 'jingle': return opts.jingle ? { key: `jingle/${shapeId(opts.jingle)}`, kind, seed: 'jingle', opts: { jingle: opts.jingle }, rate: rs.rate } : null;
    case 'effect': return { key: `effect/${opts.effect ?? 'fizz'}`, kind, seed: 'effect', opts: { effect: opts.effect ?? 'fizz' }, rate: rs.rate };
    case 'lottery': return { key: `lottery/${opts.style ?? 'rattle'}-${opts.dropAt ?? 6}`, kind, seed: 'lottery', opts: { style: opts.style ?? 'rattle', dropAt: opts.dropAt ?? 6 }, rate: rs.rate };
    case 'anthem': return opts.team ? { key: `anthem/${opts.team}-${Math.round((opts.fit ?? 0) * 1000)}`, kind, seed: 'anthem', opts: { team: opts.team, fit: opts.fit ?? 0 }, rate: rs.rate } : null;
    default: return null;
  }
}

/**
 * Every recording the channel can ask for: each kind's takes with each of its options as the channel plays them (the
 * anthems' lengths from the walk-out's and the lift's own cues, the ident's fire over Full's and Broadcast's scene).
 * @param {import('../config.js').Config} config
 * @returns {Recording[]}
 */
export function catalogue(config) {
  const s = config.settings.sound;
  const rs = /** @type {RecordingSettings} */ (s.recordings);
  /** @type {Map<string, Recording>} */
  const all = new Map();
  /** @param {import('./soundRecipes.js').SoundKind} kind @param {import('./soundRecipes.js').SoundOptions} [opts] */
  const add = (kind, opts = {}) => {
    for (let i = 0; i < takesOf(kind, rs); i++) {
      const r = recordingAt(kind, i, opts, rs);
      if (r) all.set(r.key, r);
    }
  };
  for (const blast of /** @type {const} */ (['short', 'long', 'full_time'])) add('whistle', { blast });
  for (let l = 0; l < rs.kickLevels; l++) add('kick', { power: l / (rs.kickLevels - 1) });
  for (const power of rs.shotPowers) add('shot', { power });
  for (const held of [true, false]) add('save', { held });
  for (const kind of /** @type {const} */ (['net', 'post', 'block', 'burn', 'sub', 'whoosh', 'swish', 'ident'])) add(kind);
  for (const sting of /** @type {const} */ (['show', 'highlights', 'replay'])) add('sting', { sting });
  for (const slide of [0, 1]) add('fire', { style: s.identFire, track: identTrack(sceneRect(slide)) });
  for (const kind of /** @type {const} */ (['murmur', 'ooh', 'groan', 'applause', 'jeer', 'chant'])) add(kind);
  for (let size = 1; size <= rs.roarSizes; size++) add('roar', { power: size / rs.roarSizes });
  // Fan Coins' chants with tunes of their own (data/fanCoins.json).
  for (const c of config.fanCoins.chants) if (c.tune) add('chant', { tune: c.tune });
  for (const style of MUSIC_STYLES) add('music', { style });
  for (const j of [config.studio.jingle, config.studio.bumpers.in, config.studio.bumpers.out, ...config.ads.ads.map((a) => a.jingle)]) add('jingle', { jingle: j });
  for (const effect of EFFECTS) add('effect', { effect });
  for (const style of LOTTERY_STYLES) add('lottery', { style, dropAt: config.settings.lottery.dropAt });
  // The anthems as the walk-out and the lift play them (their length is part of the tune).
  const tunes = [...new Set(Object.values(config.teams.teams).map((t) => t.anthem))];
  const anthems = [
    ...ceremonyCues('walk_out', 10 * 60_000, config.settings.ceremonies, 'catalogue', { homeId: 'a', awayId: 'b' }),
    ...liftCues(config.settings.trophyLift, 'catalogue', 'a'),
  ].filter((c) => c.kind === 'anthem');
  for (const fit of new Set(anthems.map((c) => c.fit))) for (const team of tunes) add('anthem', { team, fit });
  // The murmur as one loop (?murmur=bed; audio.js renderMurmurBed).
  all.set(MURMUR_BED, { key: MURMUR_BED, kind: 'murmur', seed: 'bed', opts: {}, rate: rs.crowdRate });
  return [...all.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * What a recording is made from, as a short hash: a recipe changed (a sound redesigned) changes it, so the tests know
 * the file is stale. @param {Recording} r
 */
export function recipeHash(r) {
  return shapeId(recipe(r.kind, r.seed, r.opts));
}
