// What each sound is made of (Task 50): pure data, so it's testable in Node and the same on every screen. audio.js
// turns a recipe into Web Audio nodes. See docs/channel.md §14.2. Every sound is synthesized: oscillators and filtered
// noise with envelopes, no recordings. Small variations (pitch, loudness, timing) come from the seeded RNG, keyed by
// the caller (usually the match and the moment), so a re-air sounds exactly like the live match.
import { createRng } from '../sim/rng.js';
import { effectLayers, lotteryLayers, musicLayers } from './musicRecipes.js';

/**
 * One layer of a sound. Times are seconds from the sound's start; gains are 0–1 before the master and kind levels.
 * @typedef {object} Envelope
 * @property {number} start  When the layer begins.
 * @property {number} attack  Rise to full gain.
 * @property {number} hold  Stay at full gain.
 * @property {number} release  Fall to silence.
 * @property {number} gain
 * @property {number} [pan]  Left (−1) to right (1) (Task 249: the ident's fire follows the ball).
 * @property {'linear'} [fade]  Fall to silence in a straight line (an even taper, for the crowd) rather than a curve that
 *   lingers (right for knocks and rings).
 *
 * @typedef {Envelope & { source: 'osc', wave: OscillatorType, freq: number, freqEnd?: number, vibrato?: { rate: number, depth: number }, formants?: number[] }} OscLayer
 *   freqEnd: glide to this frequency over the layer. vibrato: a wobble of `depth` Hz at `rate` Hz (a whistle's trill,
 *   a voice's waver). formants: pass the tone through resonances at these frequencies, which shape a buzz into a vowel
 *   (a crowd's voices).
 * @typedef {Envelope & { source: 'noise', filter: BiquadFilterType, freq: number, freqEnd?: number, q: number }} NoiseLayer
 *   White noise through a filter at `freq` (gliding to freqEnd), resonance q.
 * @typedef {OscLayer | NoiseLayer} Layer
 * @typedef {{ kind: SoundKind, layers: Layer[], duration: number }} Recipe
 * @typedef {{ t: number, pan: number, near: number, speed: number }[]} FireTrack  The ident's ball every step: seconds
 *   from its entry, left−right (−1…1), how near the front of the oval (0 the back, 1 the front), how fast (about 0–1.5).
 *
 * @typedef {'whistle' | 'kick' | 'shot' | 'net' | 'save' | 'post' | 'block' | 'burn' | 'sub' | 'roar' | 'groan' | 'ooh' | 'applause' | 'jeer' | 'anthem' | 'sting' | 'murmur' | 'chant' | 'whoosh' | 'swish' | 'jingle' | 'ident' | 'fire' | 'music' | 'lottery' | 'effect'} SoundKind
 * @typedef {object} SoundOptions
 * @property {'short' | 'long' | 'full_time'} [blast]  whistle: a short blast (kick-offs, goals, fouls), a long one (half-time), or three (full time).
 * @property {number} [power]  kick, shot, save, roar: 0–1, how hard or how big.
 * @property {boolean} [held]  save: caught rather than parried.
 * @property {string} [team]  anthem: whose (the tune comes from the team, not the seed).
 * @property {number} [fit]  anthem: repeat the tune as many times as fit in this many seconds (at least once).
 * @property {'show' | 'highlights' | 'replay'} [sting]  sting: the post-match show opening, a highlights package, a re-air.
 * @property {Jingle} [jingle]  jingle: an ad's tune (data/spots.json).
 * @property {string} [style]  music: the off-season's loop (musicRecipes.js MUSIC_STYLES); lottery: the draw's sounds (LOTTERY_STYLES).
 * @property {number} [dropAt]  lottery: when the ball drops, seconds into the draw (settings.lottery).
 * @property {string} [effect]  effect: which of the ads' small sounds (musicRecipes.js EFFECTS).
 * @property {FireTrack} [track]  fire: the ball's course (spotArt.js identTrack), which the fire follows.
 * @property {string[]} [tune]  chant: a Fan Coins chant's tune (data/fanCoins.json; parseTune); the olé without one.
 * @property {typeof CHEERS[number]} [cheer]  roar: a cheer of another kind on top of the roar (CHEERS; Tom, 2026-10-20); a plain roar without one.
 * @typedef {{ instrument: string, bpm: number, notes: { note?: number, with?: number[], rest?: boolean, beats: number }[] }} Jingle
 *   with: other notes sounded with it (a chord); rest: a pause (Task 137).
 */

/** The murmur is a roar this big, played quietly and overlapping (audio.js, main.js). */
const MURMUR_POWER = 0.2;
/** A jingle for when none is given (the sound board's tests): four notes up, on bells. */
const DEFAULT_JINGLE = Object.freeze({ instrument: 'bells', bpm: 120, notes: [{ note: 72, beats: 0.5 }, { note: 76, beats: 0.5 }, { note: 79, beats: 0.5 }, { note: 84, beats: 1 }] });
/** How many voices sing a chant. */
const CHANT_VOICES = 12;
/**
 * The olé chant: each syllable's vowel, its note (semitones above the chant's root) and length (seconds).
 * @type {readonly [keyof typeof VOWELS, number, number][]}
 */
export const OLE = Object.freeze([
  ['oh', 0, 0.28], ['eh', 4, 0.62],
  ['oh', 0, 0.28], ['eh', 4, 0.34], ['oh', 2, 0.28], ['eh', 5, 0.34], ['oh', 2, 0.28], ['eh', 4, 0.62],
  ['oh', 0, 0.28], ['eh', 2, 0.62],
  ['oh', -3, 0.28], ['eh', 0, 0.9],
]);

/**
 * A chant's tune from data/fanCoins.json (Fan Coins, docs/channel.md §29): each syllable "vowel note seconds" (a "!"
 * before the vowel shouts it: short and breathy, Tom on HERE WE GO), a clap of every hand "* seconds" or a breath
 * "- seconds".
 * @param {string[]} tune
 * @returns {{ vowel: keyof typeof VOWELS | 'clap' | 'rest', note: number, len: number, shout: boolean }[]}
 */
export function parseTune(tune) {
  return tune.map((x) => {
    const parts = x.split(' ');
    if (parts[0] === '*' || parts[0] === '-') return { vowel: parts[0] === '*' ? 'clap' : 'rest', note: 0, len: Number(parts[1]), shout: false };
    const shout = parts[0].startsWith('!');
    return { vowel: /** @type {keyof typeof VOWELS} */ (shout ? parts[0].slice(1) : parts[0]), note: Number(parts[1]), len: Number(parts[2]), shout };
  });
}

/** Every cue kind, in the order the sound board lists them. */
export const SOUND_KINDS = /** @type {const} */ (['whistle', 'kick', 'shot', 'net', 'save', 'post', 'block', 'burn', 'sub', 'roar', 'groan', 'ooh', 'applause', 'jeer', 'anthem', 'sting', 'murmur', 'chant', 'whoosh', 'swish', 'jingle', 'ident', 'fire', 'music', 'lottery', 'effect']);

/**
 * Vowels as their first two formants (Hz). A crowd is many voices: a buzz at a voice's pitch through these resonances
 * sounds like people rather than the filtered noise of surf (Tom, 2026-10-04).
 */
export const VOWELS = Object.freeze({ ah: [800, 1200], eh: [550, 1800], oh: [500, 850], oo: [330, 800] });

/**
 * The recipe for one sound.
 * @param {SoundKind} kind
 * @param {string} seed  Varies the details; the same seed always gives the same sound.
 * @param {SoundOptions} [opts]
 * @returns {Recipe}
 */
export function recipe(kind, seed, opts = {}) {
  const rng = createRng(`sound|${kind}|${seed}`);
  /** A value varied by up to ±f of itself. @param {number} v @param {number} f */
  const vary = (v, f) => v * (1 + rng.float(-f, f));
  const power = Math.min(1, Math.max(0, opts.power ?? 0.5));
  /** @type {Layer[]} */
  const layers = [];
  const env = (/** @type {number} */ start, /** @type {number} */ attack, /** @type {number} */ hold, /** @type {number} */ release, /** @type {number} */ gain) => ({ start, attack, hold, release, gain });

  switch (kind) {
    case 'whistle': {
      // A pea whistle: two close tones beating, with a fast trill, and a little breath.
      const blasts = opts.blast === 'full_time' ? [[0, 0.32], [0.45, 0.32], [0.9, 0.9]] : opts.blast === 'long' ? [[0, 1.0]] : [[0, 0.28]];
      const f = vary(2900, 0.03);
      for (const [start, len] of blasts) {
        const vib = { rate: vary(28, 0.1), depth: vary(90, 0.15) };
        layers.push({ source: 'osc', wave: 'sine', freq: f, vibrato: vib, ...env(start, 0.012, len - 0.06, 0.05, 0.5) });
        layers.push({ source: 'osc', wave: 'sine', freq: f * 1.018, vibrato: vib, ...env(start, 0.012, len - 0.06, 0.05, 0.3) });
        layers.push({ source: 'noise', filter: 'bandpass', freq: f, q: 4, ...env(start, 0.01, len - 0.05, 0.05, 0.15) });
      }
      break;
    }
    case 'kick':
    case 'shot': {
      // A thump that drops in pitch, and a short click of the boot.
      const hard = kind === 'shot' ? 0.7 + 0.3 * power : 0.35 + 0.35 * power;
      layers.push({ source: 'osc', wave: 'sine', freq: vary(kind === 'shot' ? 160 : 125, 0.08), freqEnd: 48, ...env(0, 0.002, 0.01, kind === 'shot' ? 0.14 : 0.09, hard) });
      layers.push({ source: 'noise', filter: kind === 'shot' ? 'bandpass' : 'lowpass', freq: vary(kind === 'shot' ? 1800 : 900, 0.15), q: 0.8, ...env(0, 0.001, 0.004, kind === 'shot' ? 0.05 : 0.03, hard * 0.6) });
      break;
    }
    case 'whoosh': {
      // The glass sweep (Task 97): air rising past, swelling and falling away, with a faint low hum under it.
      layers.push({ source: 'noise', filter: 'bandpass', freq: vary(450, 0.15), freqEnd: vary(3200, 0.1), q: 0.9, ...env(0, 0.3, 0.1, 0.4, 0.6) });
      layers.push({ source: 'osc', wave: 'sine', freq: vary(110, 0.05), freqEnd: 160, ...env(0, 0.25, 0.1, 0.35, 0.12) });
      break;
    }
    case 'swish': {
      // The diagonal band (Task 97): a quick bright swish.
      layers.push({ source: 'noise', filter: 'bandpass', freq: vary(2400, 0.1), freqEnd: vary(5200, 0.1), q: 1.2, ...env(0, 0.03, 0.04, 0.16, 0.5) });
      break;
    }
    case 'net': {
      // The ball hitting the net: a soft swish that falls in pitch, with a low thump.
      layers.push({ source: 'noise', filter: 'bandpass', freq: vary(2600, 0.1), freqEnd: 1100, q: 0.7, ...env(0, 0.01, 0.05, 0.35, 0.55) });
      layers.push({ source: 'osc', wave: 'sine', freq: vary(80, 0.1), freqEnd: 50, ...env(0, 0.004, 0.02, 0.12, 0.4) });
      break;
    }
    case 'save': {
      // A glove: a dull thud, fuller when held.
      const g = opts.held ? 0.8 : 0.55;
      layers.push({ source: 'noise', filter: 'lowpass', freq: vary(opts.held ? 500 : 750, 0.1), q: 1, ...env(0, 0.003, 0.02, opts.held ? 0.16 : 0.1, g) });
      layers.push({ source: 'osc', wave: 'sine', freq: vary(95, 0.08), freqEnd: 60, ...env(0, 0.002, 0.01, 0.1, g * 0.7) });
      break;
    }
    case 'post': {
      // A metallic ring: a few inharmonic partials decaying at different rates.
      const base = vary(520, 0.05);
      for (const [mul, gain, rel] of [[1, 0.5, 0.7], [2.52, 0.3, 0.5], [4.2, 0.18, 0.35], [6.3, 0.1, 0.2]]) {
        layers.push({ source: 'osc', wave: 'sine', freq: base * mul, ...env(0, 0.001, 0.005, rel, gain) });
      }
      layers.push({ source: 'noise', filter: 'highpass', freq: 3000, q: 0.7, ...env(0, 0.001, 0.003, 0.03, 0.3) });
      break;
    }
    case 'block': {
      layers.push({ source: 'osc', wave: 'sine', freq: vary(105, 0.08), freqEnd: 55, ...env(0, 0.002, 0.01, 0.08, 0.6) });
      layers.push({ source: 'noise', filter: 'lowpass', freq: vary(420, 0.1), q: 1, ...env(0, 0.002, 0.01, 0.06, 0.4) });
      break;
    }
    case 'burn': {
      // A low fizz as the ball burns out.
      layers.push({ source: 'noise', filter: 'bandpass', freq: vary(420, 0.1), freqEnd: 180, q: 1.2, ...env(0, 0.03, 0.2, 0.45, 1) });
      layers.push({ source: 'osc', wave: 'sawtooth', freq: vary(58, 0.05), freqEnd: 40, ...env(0, 0.02, 0.15, 0.4, 0.25) });
      break;
    }
    case 'sub': {
      // A soft two-note board chime.
      const f = vary(880, 0.02);
      layers.push({ source: 'osc', wave: 'triangle', freq: f, ...env(0, 0.005, 0.12, 0.25, 0.7) });
      layers.push({ source: 'osc', wave: 'triangle', freq: f * 1.5, ...env(0.18, 0.005, 0.15, 0.35, 0.7) });
      break;
    }
    case 'murmur':
    case 'roar': {
      // The crowd at a goal: many voices on "ahh" and "ehh", rising a little, bigger and longer with power, then an
      // even fade like the groan's (a long lingering tail sounded metallic). The murmur is a small roar, played quietly
      // over and over, overlapping (Tom, 2026-10-04: a small roar at a low level makes a decent murmur).
      const p = kind === 'murmur' ? MURMUR_POWER : power;
      const hold = 0.6 + 1.4 * p;
      const release = 1 + 0.4 * p;
      // A bigger roar is mostly more breath (shouting is breathy), not more voices, which buzzed (Tom, 2026-10-04).
      voices(layers, rng, { count: 24 + Math.round(4 * p), vowels: [VOWELS.ah, VOWELS.eh], glide: kind === 'murmur' ? 1 : 1.1, spread: 0.2, attack: 0.25, hold, release, gain: 0.6 - 0.15 * p });
      layers.push({ source: 'noise', filter: 'bandpass', freq: vary(1100, 0.1), q: 0.9, fade: 'linear', ...env(0, 0.3, hold, release, 0.2 + 0.45 * p) });
      layers.push({ source: 'noise', filter: 'bandpass', freq: vary(650, 0.1), q: 0.9, fade: 'linear', ...env(0.05, 0.3, hold, release, 0.15 + 0.4 * p) });
      layers.push({ source: 'noise', filter: 'bandpass', freq: vary(2200, 0.1), q: 1.2, fade: 'linear', ...env(0.05, 0.35, hold * 0.9, release, 0.08 + 0.2 * p) });
      // Cheers of other kinds (Tom, 2026-10-20: a few more, mixed in), each on top of the roar above (so a roar
      // without one is as before, its recordings unchanged).
      if (kind === 'roar' && opts.cheer) cheerExtras(layers, rng, opts.cheer, p, hold, release, env);
      break;
    }
    case 'chant': {
      // "O-lé, o-lé o-lé o-lé, o-lé, o-lé": the crowd singing, each syllable a crowd of voices on its vowel and note,
      // a little ragged (voices come in at slightly different moments, slightly off pitch), with breath under it.
      // A Fan Coins chant (Tom, 2026-10-15: from the crowd's own sounds) sings its own tune the same way, with claps
      // (every hand at once, a little ragged) and breaths; the olé's recordings are unchanged.
      const root = vary(233, 0.04);
      let t = 0;
      const syllables = opts.tune ? parseTune(opts.tune).map((x) => /** @type {const} */ ([x.vowel, x.note, x.len, x.shout])) : OLE;
      for (const [vowel, semitones, len, shout] of syllables) {
        if (vowel === 'rest') { t += len; continue; }
        if (vowel === 'clap') {
          for (let i = 0; i < 40; i++) layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(1200, 3200), q: 0.9, ...env(t + rng.float(0, 0.035), 0.002, 0.004, rng.float(0.02, 0.05), rng.float(0.5, 1)) });
          t += len;
          continue;
        }
        const freq = root * 2 ** (semitones / 12);
        if (shout) {
          // Shouted: every voice hits it at once and stops short, hardly a note at all, with a lot of breath.
          for (let v = 0; v < CHANT_VOICES; v++) {
            const f = freq * rng.float(0.96, 1.04) * (v % 4 === 3 ? 2 : 1);
            layers.push({
              source: 'osc', wave: 'sawtooth', freq: f, vibrato: { rate: rng.float(4, 6), depth: f * 0.004 },
              formants: VOWELS[vowel].map((x) => x * rng.float(0.9, 1.1)), fade: 'linear',
              start: t + rng.float(0, 0.03), attack: 0.015, hold: len * 0.22, release: len * 0.18, gain: 0.6 / Math.sqrt(CHANT_VOICES) * rng.float(0.7, 1),
            });
          }
          layers.push({ source: 'noise', filter: 'bandpass', freq: 1300, q: 0.8, fade: 'linear', ...env(t, 0.015, len * 0.22, len * 0.18, 0.32) });
          layers.push({ source: 'noise', filter: 'bandpass', freq: 650, q: 0.9, fade: 'linear', ...env(t, 0.015, len * 0.22, len * 0.18, 0.22) });
          t += len;
          continue;
        }
        for (let v = 0; v < CHANT_VOICES; v++) {
          const f = freq * rng.float(0.98, 1.02) * (v % 4 === 3 ? 2 : 1);
          layers.push({
            source: 'osc', wave: 'sawtooth', freq: f, vibrato: { rate: rng.float(4, 6), depth: f * 0.012 },
            formants: VOWELS[vowel].map((x) => x * rng.float(0.92, 1.08)), fade: 'linear',
            start: t + rng.float(0, 0.04), attack: 0.04, hold: len * 0.55, release: len * 0.4, gain: 0.55 / Math.sqrt(CHANT_VOICES) * rng.float(0.7, 1),
          });
        }
        layers.push({ source: 'noise', filter: 'bandpass', freq: 1300, q: 0.8, fade: 'linear', ...env(t, 0.04, len * 0.55, len * 0.4, 0.12) });
        t += len;
      }
      break;
    }
    case 'groan': {
      // A miss near goal: voices on "ohh" sliding down.
      voices(layers, rng, { count: 22, vowels: [VOWELS.oh], glide: 0.72, spread: 0.12, attack: 0.12, hold: 0.25, release: 0.9, gain: 1.1 });
      break;
    }
    case 'ooh': {
      // A big save: voices on "ooh" swooping up.
      voices(layers, rng, { count: 22, vowels: [VOWELS.oo], glide: 1.3, spread: 0.1, attack: 0.18, hold: 0.3, release: 0.8, gain: 0.8 });
      break;
    }
    case 'applause': {
      // A wash of hands (Tom, 2026-10-18, C ripple on the sound board: the scattered claps out, the hiss kept): many
      // short overlapping swells of hiss, so it flutters like many hands, over a soft steady hiss, easing out at the end.
      const len = 3;
      for (let i = 0; i < 40; i++) {
        const start = rng.float(0, len * 0.85);
        const fade = Math.min(1, (len - start) / 1.4);
        layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(1600, 2600), q: 0.7, ...env(start, 0.08, rng.float(0.05, 0.2), rng.float(0.2, 0.4), rng.float(0.12, 0.2) * fade) });
      }
      layers.push({ source: 'noise', filter: 'bandpass', freq: 2000, q: 0.6, ...env(0, 0.3, len * 0.5, len * 0.5, 0.35) });
      break;
    }
    case 'ident': {
      // The opening ident (Task 106), as the comet lands as the O: a bright rising chord on bells over a soft brass
      // swell, and a crackle of fire.
      [72, 76, 79, 84].forEach((n, i) => {
        layers.push({ source: 'osc', wave: 'triangle', freq: hz(n), ...env(i * 0.07, 0.005, 0.05, 1.6, 0.45) });
        layers.push({ source: 'osc', wave: 'sine', freq: hz(n + 12), ...env(i * 0.07, 0.005, 0.02, 0.9, 0.12) });
      });
      layers.push({ source: 'osc', wave: 'sawtooth', freq: hz(60), ...env(0, 0.25, 0.6, 0.9, 0.12) });
      layers.push({ source: 'osc', wave: 'sawtooth', freq: hz(67), ...env(0, 0.25, 0.6, 0.9, 0.1) });
      layers.push({ source: 'noise', filter: 'bandpass', freq: vary(2600, 0.1), q: 1.2, ...env(0, 0.01, 0.15, 1.1, 0.25) });
      break;
    }
    case 'fire': {
      // The ident's fire (Task 249, Tom): from the comet's entry to its landing, following it round SCORCHBALL: panned
      // with it, louder and brighter across the front and with speed, fading as the landing chord comes. Short
      // overlapping pieces, one per step of the track, each with its own pan. Styles: crackle (a fire's crackles and pops
      // over a low rumble), torch (a roaring flame that swells with speed), comet (a fizzing hiss and sparks).
      // Without a course (the tests, a plain play): a sweep left to right across the front over about four seconds.
      const track = opts.track ?? Array.from({ length: 50 }, (_, i) => ({ t: i * 0.08, pan: -1 + i / 24.5, near: 0.7, speed: 1 }));
      const step = track.length > 1 ? track[1].t - track[0].t : 0.08;
      const end = track.at(-1)?.t ?? 0;
      const style = opts.style ?? 'crackle';
      for (const p of track) {
        const fade = Math.min(1, p.t / 0.15, Math.max(0, (end - p.t) / 0.35));
        // (Silent at the very start and end: nothing to play, and Web Audio's ramps need gains above zero.)
        if (fade < 0.02) continue;
        const body = (0.55 + 0.45 * p.near) * fade;
        const piece = (/** @type {number} */ gain) => env(p.t, step * 0.6, step * 0.5, step * 0.9, gain * body);
        if (style === 'crackle') {
          layers.push({ source: 'noise', filter: 'lowpass', freq: vary(420, 0.15), q: 0.7, pan: p.pan, ...piece(0.22) });
          const pops = Math.round(1 + 2.5 * p.speed + rng.float(0, 1.5));
          for (let k = 0; k < pops; k++) layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(1800, 6000), q: 3, pan: Math.max(-1, Math.min(1, p.pan + rng.float(-0.15, 0.15))), ...env(p.t + rng.float(0, step), 0.001, 0, rng.float(0.008, 0.04), rng.float(0.25, 0.6) * body) });
        } else if (style === 'torch') {
          layers.push({ source: 'noise', filter: 'bandpass', freq: 450 + 1100 * Math.min(1.5, p.speed), q: 0.8, pan: p.pan, ...piece(0.42) });
          layers.push({ source: 'noise', filter: 'lowpass', freq: 220, q: 0.7, pan: p.pan, ...piece(0.25) });
          if (rng.next() < 0.35) layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(2500, 5000), q: 3, pan: p.pan, ...env(p.t + rng.float(0, step), 0.001, 0, 0.02, 0.3 * body) });
        } else {
          layers.push({ source: 'noise', filter: 'bandpass', freq: 3200 + 2600 * Math.min(1.5, p.speed), q: 2.2, pan: p.pan, ...piece(0.16) });
          layers.push({ source: 'noise', filter: 'lowpass', freq: 300, q: 0.7, pan: p.pan, ...piece(0.1) });
          const sparks = Math.round(1 + 2 * p.speed + rng.float(0, 1));
          for (let k = 0; k < sparks; k++) layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(6000, 9500), q: 5, pan: Math.max(-1, Math.min(1, p.pan + rng.float(-0.25, 0.25))), ...env(p.t + rng.float(0, step), 0.001, 0, rng.float(0.004, 0.012), rng.float(0.3, 0.7) * body) });
        }
      }
      break;
    }
    case 'jingle': {
      layers.push(...jingleLayers(opts.jingle ?? DEFAULT_JINGLE));
      break;
    }
    // The off-season show's sound (Task 203): its music (one pass of the loop), the lottery's draw, the ads' effects.
    case 'music': {
      layers.push(...musicLayers(opts.style ?? 'lounge').layers);
      break;
    }
    case 'lottery': {
      layers.push(...lotteryLayers(opts.style ?? 'rattle', opts.dropAt ?? 6));
      break;
    }
    case 'effect': {
      layers.push(...effectLayers(opts.effect ?? 'fizz'));
      break;
    }
    case 'anthem': {
      layers.push(...anthemLayers(opts.team ?? seed, opts.fit ?? 0));
      break;
    }
    case 'sting': {
      // A short, bright fanfare: up for the post-match show, a quick "ta-da" for highlights, down and up for a replay.
      const notes = opts.sting === 'replay' ? [84, 79, 76, 72, 79] : opts.sting === 'highlights' ? [79, 84] : [72, 76, 79, 84];
      const step = opts.sting === 'replay' ? 0.07 : 0.11;
      notes.forEach((midi, i) => {
        const last = i === notes.length - 1;
        const len = last ? 0.55 : step;
        layers.push({ source: 'osc', wave: 'triangle', freq: hz(midi), ...env(i * step, 0.008, len * 0.6, len * 0.6 + (last ? 0.3 : 0.05), 0.55) });
        layers.push({ source: 'osc', wave: 'square', freq: hz(midi), ...env(i * step, 0.008, len * 0.4, len * 0.5, 0.12) });
      });
      // A swish under it: rising into the show and highlights, falling for a replay.
      const [from, to] = opts.sting === 'replay' ? [3500, 700] : [700, 3500];
      layers.push({ source: 'noise', filter: 'bandpass', freq: from, freqEnd: to, q: 1.5, ...env(0, 0.1, notes.length * step * 0.6, 0.25, 0.25) });
      break;
    }
    case 'jeer': {
      // A foul by the away side: low voices booing on "ooo", sagging slightly.
      voices(layers, rng, { count: 18, vowels: [VOWELS.oo], pitch: [85, 150], glide: 0.93, spread: 0.3, attack: 0.25, hold: 0.7, release: 0.6, gain: 1.3 });
      break;
    }
  }
  const duration = Math.max(0, ...layers.map((l) => l.start + l.attack + l.hold + l.release));
  return { kind, layers, duration };
}

/**
 * Add a crowd of voices to a recipe: each a buzz at its own pitch through a vowel's formants, with a waver of its own,
 * starting a little apart, gliding by `glide` over its length and fading out evenly with the rest (all together, so
 * no lone voices ring on at the end). Cheering voices sit in the upper register without going into falsetto (Tom,
 * 2026-10-04): lower voices 180–300 Hz, higher ones 280–420 Hz, unless `pitch` says otherwise (the boo).
 * @param {Layer[]} layers @param {import('../sim/rng.js').Rng} rng
 * @param {{ count: number, vowels: readonly number[][], glide: number, spread: number, attack: number, hold: number, release: number, gain: number, pitch?: [number, number] }} o
 *   spread: start times are spread over this many seconds. gain: the whole crowd's loudness (shared out over the voices).
 */
function voices(layers, rng, o) {
  const each = Math.min(1, o.gain / Math.sqrt(o.count));
  for (let i = 0; i < o.count; i++) {
    const freq = o.pitch ? rng.float(o.pitch[0], o.pitch[1]) : i % 5 < 3 ? rng.float(180, 300) : rng.float(280, 420);
    layers.push({
      source: 'osc', wave: 'sawtooth', freq, freqEnd: freq * o.glide * rng.float(0.93, 1.07),
      vibrato: { rate: rng.float(3, 8), depth: freq * rng.float(0.02, 0.05) },
      formants: o.vowels[rng.int(0, o.vowels.length - 1)].map((f) => f * rng.float(0.9, 1.1)),
      start: rng.float(0, o.spread), attack: o.attack * rng.float(0.7, 1.3), hold: o.hold * rng.float(0.95, 1.05), release: o.release * rng.float(0.95, 1.05),
      gain: each * rng.float(0.6, 1), fade: 'linear',
    });
  }
  // Breath under the voices, so they blend into one crowd rather than a chord.
  layers.push({ source: 'noise', filter: 'bandpass', freq: 1400, q: 0.8, fade: 'linear', start: 0, attack: o.attack, hold: o.hold, release: o.release, gain: Math.min(1, o.gain * 0.12) });
}

/** The cheers beside the plain roar (Tom, 2026-10-20), as SoundOptions.cheer names them. */
export const CHEERS = /** @type {const} */ (['whoops', 'whistles', 'hey', 'clapping']);

/**
 * The cheer a roar's take carries (Tom, 2026-10-20): the small roar's takes half plain, then whoops and clapping (no
 * hey: it didn't suit a small one); the bigger roars' a third plain, then hey, whoops and clapping. No whistles (Tom,
 * 2026-10-21: they sounded strange; the recipe kept). None: a plain roar.
 * @param {number} power  The take's size (0–1). @param {number} take  Which take.
 * @returns {typeof CHEERS[number] | undefined}
 */
export function roarCheer(power, take) {
  const list = power < 0.5 ? [null, null, 'whoops', 'clapping'] : [null, 'hey', 'whoops', 'clapping', null, 'hey', 'whoops', 'clapping', null];
  return /** @type {typeof CHEERS[number] | null} */ (list[take % list.length]) ?? undefined;
}

/**
 * What a cheer adds to the roar. whoops: a few high voices whooping up ("woo!") through it, one after another;
 * whistles: fingers-in-the-mouth whistles, each a rise and a fall, here and there; hey: a shout as one ("hey!") on the
 * moment, the roar swelling behind it; clapping: hands under the roar, fluttering like the applause, fading with it.
 * @param {Layer[]} layers @param {ReturnType<typeof createRng>} rng @param {typeof CHEERS[number]} cheer
 * @param {number} p  The roar's power. @param {number} hold @param {number} release
 * @param {(start: number, attack: number, hold: number, release: number, gain: number) => { start: number, attack: number, hold: number, release: number, gain: number }} env
 */
function cheerExtras(layers, rng, cheer, p, hold, release, env) {
  const len = hold + release;
  if (cheer === 'whoops') {
    const n = 4 + Math.round(4 * p);
    for (let i = 0; i < n; i++) {
      const at = rng.float(0.1, len * 0.6);
      const f = rng.float(380, 620);
      const up = rng.float(0.35, 0.55);
      layers.push({ source: 'osc', wave: 'sawtooth', freq: f, freqEnd: f * rng.float(1.6, 2), vibrato: { rate: rng.float(5, 7), depth: f * 0.015 },
        formants: VOWELS.oo.map((x) => x * rng.float(1, 1.3)), fade: 'linear', ...env(at, 0.06, up * 0.6, up, rng.float(0.1, 0.16)) });
    }
  } else if (cheer === 'whistles') {
    const n = 2 + Math.round(3 * p);
    for (let i = 0; i < n; i++) {
      const at = rng.float(0.05, len * 0.55);
      const f = rng.float(2300, 3200);
      const rise = rng.float(0.12, 0.2);
      // A rise, then a longer fall (the wolf whistle's shape), thin and pure.
      layers.push({ source: 'osc', wave: 'sine', freq: f * 0.8, freqEnd: f, ...env(at, 0.02, rise, 0.03, rng.float(0.08, 0.13)) });
      layers.push({ source: 'osc', wave: 'sine', freq: f * 1.05, freqEnd: f * 0.6, ...env(at + rise + 0.08, 0.02, rng.float(0.25, 0.4), 0.12, rng.float(0.08, 0.13)) });
    }
  } else if (cheer === 'hey') {
    // Every voice at once, short and shouted, a lot of breath, over the roar's start.
    for (let v = 0; v < 18; v++) {
      const f = rng.float(170, 330);
      layers.push({ source: 'osc', wave: 'sawtooth', freq: f, freqEnd: f * 0.9, formants: VOWELS.eh.map((x) => x * rng.float(0.9, 1.1)), fade: 'linear',
        ...env(rng.float(0, 0.04), 0.015, 0.16, 0.14, (0.5 + 0.3 * p) / Math.sqrt(18) * rng.float(0.7, 1)) });
    }
    layers.push({ source: 'noise', filter: 'bandpass', freq: 1400, q: 0.8, fade: 'linear', ...env(0, 0.015, 0.16, 0.16, 0.3 + 0.2 * p) });
  } else if (cheer === 'clapping') {
    for (let i = 0; i < 50; i++) {
      const start = rng.float(0.1, len * 0.85);
      const fade = Math.min(1, (len - start) / 1.2);
      layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(1600, 2600), q: 0.7, ...env(start, 0.08, rng.float(0.05, 0.2), rng.float(0.2, 0.4), rng.float(0.08, 0.14) * fade) });
    }
  }
}

/** A MIDI note's frequency (69 = A, 440 Hz). @param {number} midi */
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

const SCALES = Object.freeze([
  Object.freeze([0, 2, 4, 5, 7, 9, 11]), // major
  Object.freeze([0, 2, 3, 5, 7, 8, 10]), // minor
  Object.freeze([0, 2, 4, 5, 7, 9, 10]), // mixolydian
  Object.freeze([0, 2, 3, 5, 7, 9, 10]), // dorian
]);
/** Note lengths in beats for one phrase (each adds to 8 beats, ending on a long note). */
const RHYTHMS = Object.freeze([
  Object.freeze([1, 1, 1, 1, 1, 1, 2]),
  Object.freeze([1.5, 0.5, 1, 1, 1.5, 0.5, 2]),
  Object.freeze([2, 1, 1, 2, 1, 1]),
  Object.freeze([1, 0.5, 0.5, 1, 1, 1, 1, 2]),
]);
/** The instruments: the melody's waves (and their mix), and how notes end (held like brass or an organ, or rung like bells). */
const INSTRUMENTS = Object.freeze([
  Object.freeze({ name: 'brass', waves: /** @type {[OscillatorType, number][]} */ ([['sawtooth', 0.18], ['triangle', 0.4]]), rung: false }),
  Object.freeze({ name: 'organ', waves: /** @type {[OscillatorType, number][]} */ ([['square', 0.12], ['sine', 0.34]]), rung: false }),
  Object.freeze({ name: 'bells', waves: /** @type {[OscillatorType, number][]} */ ([['triangle', 0.55], ['sine', 0.25]]), rung: true }),
]);

/**
 * A team's anthem (Task 53): a short tune made from the team, the same every time. Two phrases of 8 beats on one
 * seeded scale, rhythm and instrument; the second phrase starts like the first and comes home to the keynote, the
 * first ends on the fifth. A bass note under each half phrase. Repeated to fill `fit` seconds.
 * @param {string} team @param {number} fit
 * @returns {Layer[]}
 */
export function anthemLayers(team, fit) {
  const rng = createRng(`anthem|${team}`);
  const scale = SCALES[rng.int(0, SCALES.length - 1)];
  const rhythm = RHYTHMS[rng.int(0, RHYTHMS.length - 1)];
  const instrument = INSTRUMENTS[rng.int(0, INSTRUMENTS.length - 1)];
  const root = rng.int(57, 64);
  const beat = 60 / rng.int(84, 104);
  /** A scale degree (may go below 0 or past 7) as a MIDI note. @param {number} d */
  const note = (d) => root + 12 * Math.floor(d / 7) + scale[((d % 7) + 7) % 7];
  // Phrase 1: a walk from the keynote, third or fifth, ending on the fifth.
  const first = [rng.pick([0, 2, 4])];
  for (let i = 1; i < rhythm.length - 1; i++) first.push(Math.max(-2, Math.min(9, first[i - 1] + rng.pick([-2, -1, 1, 1, 2, 3]))));
  first.push(4);
  // Phrase 2: the same opening, then home to the keynote (or its octave).
  const half = Math.floor(rhythm.length / 2);
  const second = first.slice(0, half);
  for (let i = half; i < rhythm.length - 1; i++) second.push(Math.max(-2, Math.min(9, second[i - 1] + rng.pick([-2, -1, -1, 1, 2]))));
  second.push(second[second.length - 1] > 4 ? 7 : 0);
  const tune = 16 * beat;
  const times = Math.max(1, Math.floor(fit / tune));
  /** @type {Layer[]} */
  const layers = [];
  for (let r = 0; r < times; r++) {
    [first, second].forEach((degrees, p) => {
      let t = r * tune + p * 8 * beat;
      degrees.forEach((d, i) => {
        const len = rhythm[i] * beat;
        for (const [wave, gain] of instrument.waves) {
          layers.push(instrument.rung
            ? { source: 'osc', wave, freq: hz(note(d)), start: t, attack: 0.005, hold: 0.02, release: len * 1.3, gain }
            : { source: 'osc', wave, freq: hz(note(d)), start: t, attack: 0.03, hold: len * 0.7, release: len * 0.3, gain });
        }
        t += len;
      });
      // The bass: the keynote under the first half of each phrase, the fifth (then the keynote) under the second.
      for (const [half2, d] of [[0, 0], [1, p === 0 ? 4 : 0]]) {
        layers.push({ source: 'osc', wave: 'sine', freq: hz(note(d) - 12), start: r * tune + p * 8 * beat + half2 * 4 * beat, attack: 0.04, hold: 4 * beat * 0.8, release: 4 * beat * 0.2, gain: 0.4 });
      }
    });
  }
  return layers;
}

/**
 * An ad's jingle (Task 105): its notes in turn on one of the anthems' instruments, the last one held a little longer.
 * The tune is data (data/spots.json), so it's the same every break.
 * @param {Jingle} j
 * @returns {Layer[]}
 */
export function jingleLayers(j) {
  const instrument = INSTRUMENTS.find((x) => x.name === j.instrument) ?? INSTRUMENTS[0];
  const beat = 60 / j.bpm;
  /** @type {Layer[]} */
  const layers = [];
  let t = 0;
  j.notes.forEach((n, i) => {
    const len = n.beats * beat * (i === j.notes.length - 1 ? 1.5 : 1);
    // A rest just takes its time; a chord (Task 137) sounds its other notes with it, each a little quieter so the
    // chord isn't louder than one note.
    const pitches = n.rest || n.note === undefined ? [] : [n.note, ...(n.with ?? [])];
    const share = 1 / Math.sqrt(Math.max(1, pitches.length));
    for (const pitch of pitches) {
      for (const [wave, gain] of instrument.waves) {
        layers.push(instrument.rung
          ? { source: 'osc', wave, freq: hz(pitch), start: t, attack: 0.005, hold: 0.02, release: len * 1.3, gain: gain * share }
          : { source: 'osc', wave, freq: hz(pitch), start: t, attack: 0.02, hold: len * 0.75, release: len * 0.25, gain: gain * share });
      }
    }
    t += n.beats * beat;
  });
  return layers;
}

/** The name of a team's anthem instrument (for the sound board). @param {string} team */
export const anthemInstrument = (team) => {
  const rng = createRng(`anthem|${team}`);
  rng.int(0, SCALES.length - 1);
  rng.int(0, RHYTHMS.length - 1);
  return INSTRUMENTS[rng.int(0, INSTRUMENTS.length - 1)].name;
};
