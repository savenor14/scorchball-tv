// The off-season's music, the draft lottery's sounds and the ads' effects (the off-season show, Task 203: sound-board
// auditions; docs/tasks.md). Pure data in soundRecipes.js's layer format, so audio.js plays them like any other
// sound, the same on every screen. Everything is synthesized: oscillators and filtered noise with envelopes.
//
// The music is a loop of a few bars, written so its end runs into its start (the next pass is scheduled exactly one
// loop on, its first notes under the last ones' tails). Styles to audition: mellow synth (Tom: the closest of the first
// three; lounge and bossa dropped), then pulse, chillhop and tropical, more modern and upbeat, still background.
// The lottery's sound is one draw, from the drum spinning up to the ball landing and the reveal, at the lottery's own
// beats (the ball drops at `dropAt`). The effects are the ads' small sounds.
import { createRng } from '../sim/rng.js';

/** @typedef {import('./soundRecipes.js').Layer} Layer */

/** @param {number} midi */
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

/** @param {number} start @param {number} attack @param {number} hold @param {number} release @param {number} gain */
const env = (start, attack, hold, release, gain) => ({ start, attack, hold, release, gain });
/** The sprinkler (Tom's note 14): its ticks a take, and the time between them (s); takes are played back to back. */
export const SPRINKLER_TICKS = 14;
export const SPRINKLER_TICK = 0.13;
/** The crickets (Tom's note 14): how many chirps a take, and the time between them (s). */
const CRICKET_CHIRPS = 5;
const CRICKET_GAP = 1;

/**
 * @typedef {object} Style  A loop's ingredients.
 * @property {number} bpm
 * @property {number} swing  How late the off-beat eighths fall (0 straight, 1/3 a triplet swing).
 * @property {{ root: number, notes: number[] }[]} chords  One a bar: the root (MIDI, the bass's octave) and the chord's
 *   notes (MIDI, the comping's octave).
 * @property {number[][]} melody  Per bar, the melody's notes (MIDI, 0 a rest) on eighths.
 * @property {{ plucks?: 'stabs' | 'run', halfTime?: boolean, hookBoth?: boolean }} [feel]  Pulse's variations (Task 278h):
 *   the plucked chords as syncopated stabs (pulse's) or a running arpeggio; half-time (the kick on 1 and 3, a clap on
 *   3, a held pad, the bass on the beat); the hook both times round, not just the second.
 */

/** The music's styles (Task 203). @type {Record<string, Style>} */
const STYLES = {
  // C: mellow synth. E-flat major, soft pads that swell into each bar, a bell arpeggio, a soft kick and hats.
  synth: {
    bpm: 84,
    swing: 0,
    chords: [
      { root: 39, notes: [55, 58, 62, 63] }, { root: 36, notes: [55, 58, 60, 63] }, { root: 44, notes: [55, 60, 63, 67] }, { root: 46, notes: [55, 58, 62, 65] },
      { root: 39, notes: [55, 58, 62, 63] }, { root: 36, notes: [55, 58, 60, 63] }, { root: 44, notes: [56, 60, 63, 67] }, { root: 46, notes: [58, 62, 65, 70] },
    ],
    melody: [
      [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0],
      [79, 0, 0, 0, 75, 0, 0, 0], [77, 0, 0, 0, 72, 0, 0, 0], [75, 0, 0, 0, 79, 0, 0, 0], [77, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  // D: pulse (Task 203, Tom: C was closest; more modern and upbeat, still background). E-flat's vi–IV–I–V at 112 bpm:
  // a soft four-on-the-floor, claps, offbeat hats, a pad that pumps with the beat, plucked chords, an offbeat bass, a
  // bell hook the second time round.
  pulse: {
    bpm: 112,
    swing: 0,
    chords: [
      { root: 36, notes: [60, 63, 67, 70] }, { root: 44, notes: [56, 60, 63, 67] }, { root: 39, notes: [55, 58, 63, 67] }, { root: 46, notes: [58, 62, 65, 70] },
      { root: 36, notes: [60, 63, 67, 70] }, { root: 44, notes: [56, 60, 63, 67] }, { root: 39, notes: [55, 58, 63, 67] }, { root: 46, notes: [58, 62, 65, 70] },
    ],
    melody: [
      [75, 0, 77, 0, 79, 0, 77, 75], [72, 0, 0, 0, 0, 0, 70, 72], [75, 0, 74, 0, 72, 0, 70, 0], [70, 0, 0, 0, 0, 0, 0, 0],
      [79, 0, 77, 0, 75, 0, 77, 79], [80, 0, 0, 0, 79, 0, 77, 0], [75, 0, 77, 0, 79, 0, 82, 0], [79, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  // Task 278h (Tom: pulse re-invented a couple of ways, in its style, to take turns with it under the studio cards).
  // B: new chords. Pulse's sounds and groove over E-flat's IV–V–iii–vi (Ab, Bb, Gm, Cm), home to E-flat at the end of
  // each eight, with a new hook the second time round.
  pulseB: {
    bpm: 112,
    swing: 0,
    chords: [
      { root: 44, notes: [56, 60, 63, 67] }, { root: 46, notes: [58, 62, 65, 68] }, { root: 43, notes: [55, 58, 62, 65] }, { root: 36, notes: [60, 63, 67, 70] },
      { root: 44, notes: [56, 60, 63, 67] }, { root: 46, notes: [58, 62, 65, 68] }, { root: 39, notes: [55, 58, 63, 67] }, { root: 39, notes: [55, 58, 63, 67] },
    ],
    melody: [
      [72, 0, 75, 0, 79, 0, 77, 0], [74, 0, 0, 77, 0, 0, 74, 0], [70, 0, 74, 0, 77, 0, 79, 0], [75, 0, 0, 0, 0, 0, 72, 74],
      [75, 0, 79, 0, 84, 0, 82, 0], [80, 0, 79, 0, 77, 0, 74, 0], [75, 0, 77, 0, 79, 0, 0, 0], [75, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  // C: a new hook and running plucks. Pulse's chords, the plucked chords as a quick arpeggio, and a catchier bell hook
  // both times round.
  pulseC: {
    bpm: 112,
    swing: 0,
    feel: { plucks: 'run', hookBoth: true },
    chords: [
      { root: 36, notes: [60, 63, 67, 70] }, { root: 44, notes: [56, 60, 63, 67] }, { root: 39, notes: [55, 58, 63, 67] }, { root: 46, notes: [58, 62, 65, 70] },
      { root: 36, notes: [60, 63, 67, 70] }, { root: 44, notes: [56, 60, 63, 67] }, { root: 39, notes: [55, 58, 63, 67] }, { root: 46, notes: [58, 62, 65, 70] },
    ],
    melody: [
      [79, 0, 0, 79, 0, 77, 75, 0], [72, 0, 0, 0, 75, 0, 77, 0], [79, 0, 0, 79, 0, 82, 79, 0], [77, 0, 0, 0, 0, 0, 0, 0],
      [79, 0, 0, 79, 0, 77, 75, 0], [72, 0, 0, 0, 75, 0, 77, 79], [82, 0, 79, 0, 77, 0, 75, 0], [74, 0, 0, 0, 70, 0, 0, 0],
    ],
  },
  // D: laid back. Pulse's chords and hook at half-time: the kick on 1 and 3, a clap on 3, a held pad, a few plucks.
  pulseD: {
    bpm: 112,
    swing: 0,
    feel: { halfTime: true },
    chords: [
      { root: 36, notes: [60, 63, 67, 70] }, { root: 44, notes: [56, 60, 63, 67] }, { root: 39, notes: [55, 58, 63, 67] }, { root: 46, notes: [58, 62, 65, 70] },
      { root: 36, notes: [60, 63, 67, 70] }, { root: 44, notes: [56, 60, 63, 67] }, { root: 39, notes: [55, 58, 63, 67] }, { root: 46, notes: [58, 62, 65, 70] },
    ],
    melody: [
      [75, 0, 77, 0, 79, 0, 77, 75], [72, 0, 0, 0, 0, 0, 70, 72], [75, 0, 74, 0, 72, 0, 70, 0], [70, 0, 0, 0, 0, 0, 0, 0],
      [79, 0, 77, 0, 75, 0, 77, 79], [80, 0, 0, 0, 79, 0, 77, 0], [75, 0, 77, 0, 79, 0, 82, 0], [79, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
  // E: chillhop. F major sevenths at 86 bpm, swung: warm detuned keys, a soft boom-bap, a little vinyl crackle, a gentle
  // lead the second time round.
  chillhop: {
    bpm: 86,
    swing: 1 / 4,
    chords: [
      { root: 41, notes: [57, 60, 64, 65] }, { root: 40, notes: [55, 59, 62, 64] }, { root: 38, notes: [57, 60, 62, 65] }, { root: 36, notes: [55, 59, 62, 64] },
      { root: 41, notes: [57, 60, 64, 65] }, { root: 40, notes: [55, 59, 62, 64] }, { root: 38, notes: [57, 60, 62, 65] }, { root: 43, notes: [53, 59, 62, 65] },
    ],
    melody: [
      [76, 0, 0, 77, 0, 76, 72, 0], [74, 0, 0, 0, 71, 0, 0, 0], [72, 0, 0, 74, 0, 72, 69, 0], [71, 0, 0, 0, 0, 0, 67, 0],
      [76, 0, 0, 79, 0, 77, 76, 0], [74, 0, 0, 0, 76, 0, 74, 0], [72, 0, 74, 0, 72, 0, 69, 0], [71, 0, 0, 0, 74, 0, 0, 0],
    ],
  },
  // F: tropical. E-flat's IV–V–iii–vi at 102 bpm: marimba arpeggios, a light dancehall beat, a soft pad, a flute-like
  // lead the second time round.
  tropical: {
    bpm: 102,
    swing: 0,
    chords: [
      { root: 44, notes: [56, 60, 63, 67] }, { root: 46, notes: [58, 62, 65, 70] }, { root: 43, notes: [55, 58, 62, 65] }, { root: 36, notes: [55, 58, 60, 63] },
      { root: 44, notes: [56, 60, 63, 67] }, { root: 46, notes: [58, 62, 65, 70] }, { root: 43, notes: [55, 58, 62, 67] }, { root: 46, notes: [58, 62, 65, 70] },
    ],
    melody: [
      [79, 0, 0, 80, 0, 79, 75, 0], [77, 0, 0, 0, 74, 0, 0, 0], [74, 0, 0, 75, 0, 77, 79, 0], [75, 0, 0, 0, 0, 0, 0, 0],
      [79, 0, 0, 80, 0, 82, 80, 0], [79, 0, 0, 77, 0, 0, 74, 0], [77, 0, 75, 0, 74, 0, 70, 0], [72, 0, 0, 0, 0, 0, 0, 0],
    ],
  },
};

/** The music's styles, in the sound board's order. */
export const MUSIC_STYLES = /** @type {const} */ (['synth', 'pulse', 'pulseB', 'pulseC', 'pulseD', 'chillhop', 'tropical']);

/**
 * One pass of the off-season's music: the style's eight bars twice (the tune the second time round, or both times for
 * synth's sparse one), as layers, and how long one pass lasts (the next starts exactly then).
 * @param {string} style @returns {{ layers: Layer[], duration: number }}
 */
export function musicLayers(style) {
  const s = STYLES[style] ?? STYLES.synth;
  const beat = 60 / s.bpm;
  const bar = 4 * beat;
  const bars = s.chords.length * 2;
  /** Where an eighth note falls, swung. @param {number} k  Eighths from the bar's start. */
  const eighth = (k) => (Math.floor(k / 2) + (k % 2 ? 0.5 + s.swing / 2 : 0)) * beat;
  const rng = createRng(`music|${style}`);
  /** @type {Layer[]} */
  const layers = [];
  for (let b = 0; b < bars; b++) {
    const t0 = b * bar;
    const c = s.chords[b % s.chords.length];
    const next = s.chords[(b + 1) % s.chords.length];
    const tune = s.melody[b % s.melody.length];
    // The melody plays on the second time through, or both for synth (its tune is sparse anyway).
    const feel = s.feel ?? {};
    const withTune = style === 'synth' || b >= s.chords.length || Boolean(feel.hookBoth);
    if (style.startsWith('pulse')) {
      const half = Boolean(feel.halfTime);
      // A soft four-on-the-floor, claps on 2 and 4, open hats on the off-beats; half-time: the kick on 1 and 3, a clap
      // on 3, softer hats.
      for (const i of half ? [0, 2] : [0, 1, 2, 3]) layers.push({ source: 'osc', wave: 'sine', freq: 62, freqEnd: 40, ...env(t0 + i * beat, 0.002, 0.03, 0.16, 0.26) });
      for (const i of half ? [2] : [1, 3]) {
        for (const d of [0, 0.012]) layers.push({ source: 'noise', filter: 'bandpass', freq: 1500, q: 1.1, ...env(t0 + i * beat + d, 0.001, 0.01, 0.12, 0.06) });
      }
      for (const k of [1, 3, 5, 7]) layers.push({ source: 'noise', filter: 'highpass', freq: 7500, q: 0.5, ...env(t0 + eighth(k), 0.003, 0.02, 0.1, half ? 0.018 : 0.03) });
      if (half) {
        // A held pad, swelling into each half bar.
        for (const i of [0, 2]) {
          for (const n of c.notes) layers.push({ source: 'osc', wave: 'triangle', freq: hz(n), ...env(t0 + i * beat, beat * 0.6, beat * 0.9, beat * 0.5, 0.024) });
        }
      } else {
        // A pad that pumps with the kick: the chord swelling back in after each beat.
        for (let i = 0; i < 4; i++) {
          for (const n of c.notes) layers.push({ source: 'osc', wave: 'triangle', freq: hz(n), ...env(t0 + i * beat + 0.03, beat * 0.4, beat * 0.25, beat * 0.3, 0.022) });
        }
      }
      if (feel.plucks === 'run') {
        // A running arpeggio up and down the chord on the eighths, an octave up.
        [0, 1, 2, 3, 2, 1, 0, 1].forEach((j, k) => layers.push({ source: 'osc', wave: 'sine', freq: hz(c.notes[j] + 12), ...env(t0 + eighth(k), 0.002, 0.01, 0.14, 0.04) }));
      } else {
        // Plucked chords, syncopated, an octave up (half-time: once a bar).
        for (const k of half ? [3] : b % 2 ? [0, 3, 5] : [0, 3, 6]) {
          for (const n of c.notes) layers.push({ source: 'osc', wave: 'sine', freq: hz(n + 12), ...env(t0 + eighth(k), 0.002, 0.01, 0.16, 0.035) });
        }
      }
      // The bass on the off-beats; half-time, on 1 and 3, held.
      for (const k of half ? [0, 4] : [1, 3, 5, 7]) {
        const hold = half ? beat * 0.8 : beat * 0.2;
        layers.push({ source: 'osc', wave: 'sine', freq: hz(c.root + 12), ...env(t0 + eighth(k), 0.005, hold, beat * 0.15, half ? 0.2 : 0.3) });
        layers.push({ source: 'osc', wave: 'triangle', freq: hz(c.root + 12), ...env(t0 + eighth(k), 0.005, half ? beat * 0.6 : beat * 0.15, beat * 0.1, 0.06) });
      }
      if (withTune) {
        tune.forEach((n, k) => {
          if (!n) return;
          layers.push({ source: 'osc', wave: 'sine', freq: hz(n), ...env(t0 + eighth(k), 0.003, 0.05, 0.35, 0.09) });
          layers.push({ source: 'osc', wave: 'sine', freq: hz(n + 12), ...env(t0 + eighth(k), 0.002, 0.01, 0.15, 0.025) });
        });
      }
    } else if (style === 'chillhop') {
      // Warm keys, the chord's two notes a hair apart (a slow tape wobble), on 1 and the and of 2.
      for (const at of [0, eighth(3)]) {
        for (const n of c.notes) {
          layers.push({ source: 'osc', wave: 'sine', freq: hz(n), vibrato: { rate: 0.6, depth: 1.2 }, ...env(t0 + at, 0.01, 0.1, 1.3, 0.05) });
          layers.push({ source: 'osc', wave: 'sine', freq: hz(n) * 1.006, ...env(t0 + at, 0.01, 0.1, 1.1, 0.03) });
        }
      }
      // A soft boom-bap: the kick on 1 and the and of 2 (and the and of 3 every other bar), the snare on 2 and 4,
      // swung hats.
      for (const k of b % 2 ? [0, 3, 5] : [0, 3]) layers.push({ source: 'osc', wave: 'sine', freq: 70, freqEnd: 44, ...env(t0 + eighth(k), 0.003, 0.03, 0.2, 0.28) });
      for (const i of [1, 3]) {
        layers.push({ source: 'noise', filter: 'bandpass', freq: 1700, q: 0.9, ...env(t0 + i * beat, 0.002, 0.02, 0.16, 0.09) });
        layers.push({ source: 'osc', wave: 'sine', freq: 190, freqEnd: 150, ...env(t0 + i * beat, 0.002, 0.01, 0.08, 0.07) });
      }
      for (let k = 0; k < 8; k++) layers.push({ source: 'noise', filter: 'highpass', freq: 6500, q: 0.5, ...env(t0 + eighth(k), 0.002, 0.01, 0.05, k % 2 ? 0.015 : 0.025) });
      // A little vinyl crackle.
      for (let i = 0; i < 10; i++) layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(2000, 5000), q: 3, ...env(t0 + rng.float(0, bar), 0.001, 0.002, 0.01, rng.float(0.01, 0.03)) });
      // The bass on 1 and the and of 2.
      for (const [k, n] of /** @type {[number, number][]} */ ([[0, c.root], [3, c.root + 7]])) {
        layers.push({ source: 'osc', wave: 'sine', freq: hz(n), ...env(t0 + eighth(k), 0.01, beat * 0.8, 0.2, 0.36) });
      }
      if (withTune) {
        tune.forEach((n, k) => {
          if (!n) return;
          layers.push({ source: 'osc', wave: 'triangle', freq: hz(n), vibrato: { rate: 4, depth: 2 }, ...env(t0 + eighth(k), 0.02, beat * 0.5, beat * 0.6, 0.07) });
        });
      }
    } else if (style === 'tropical') {
      // Marimba arpeggios: the chord's notes in turn, bright and quick.
      for (const k of [0, 2, 3, 5, 6]) {
        const n = c.notes[k % c.notes.length] + 12;
        layers.push({ source: 'osc', wave: 'sine', freq: hz(n), ...env(t0 + eighth(k), 0.002, 0.01, 0.25, 0.07) });
        layers.push({ source: 'osc', wave: 'sine', freq: hz(n) * 4, ...env(t0 + eighth(k), 0.001, 0.005, 0.05, 0.015) });
      }
      // A light dancehall beat: the kick on 1 and 3, a rim on the and of 2 and on 4, a shaker on the eighths.
      for (const i of [0, 2]) layers.push({ source: 'osc', wave: 'sine', freq: 64, freqEnd: 42, ...env(t0 + i * beat, 0.002, 0.03, 0.17, 0.25) });
      for (const k of [3, 6]) layers.push({ source: 'noise', filter: 'bandpass', freq: 2000, q: 7, ...env(t0 + eighth(k), 0.001, 0.005, 0.05, 0.13) });
      for (let k = 0; k < 8; k++) layers.push({ source: 'noise', filter: 'highpass', freq: 7000, q: 0.5, ...env(t0 + eighth(k), 0.01, 0.01, 0.05, k % 2 ? 0.02 : 0.03) });
      // A soft pad under it, the bass on 1, the and of 2 (up an octave) and 3.
      for (const n of c.notes) layers.push({ source: 'osc', wave: 'triangle', freq: hz(n), ...env(t0, bar * 0.2, bar * 0.6, bar * 0.3, 0.02) });
      for (const [k, n] of /** @type {[number, number][]} */ ([[0, c.root], [3, c.root + 12], [4, c.root]])) {
        layers.push({ source: 'osc', wave: 'sine', freq: hz(n), ...env(t0 + eighth(k), 0.008, beat * 0.4, 0.12, 0.33) });
      }
      if (withTune) {
        tune.forEach((n, k) => {
          if (!n) return;
          const len = beat * 1.1;
          layers.push({ source: 'osc', wave: 'sine', freq: hz(n), vibrato: { rate: 5, depth: 3 }, ...env(t0 + eighth(k), 0.04, len * 0.5, len * 0.5, 0.1) });
          layers.push({ source: 'noise', filter: 'bandpass', freq: hz(n) * 2, q: 6, ...env(t0 + eighth(k), 0.03, len * 0.3, len * 0.3, 0.008) });
        });
      }
    } else {
      // Pads swelling in over each bar: the chord on triangles, a slightly detuned sine beside each.
      for (const n of c.notes) {
        layers.push({ source: 'osc', wave: 'triangle', freq: hz(n), ...env(t0, bar * 0.35, bar * 0.45, bar * 0.45, 0.045) });
        layers.push({ source: 'osc', wave: 'sine', freq: hz(n) * 1.004, ...env(t0, bar * 0.35, bar * 0.45, bar * 0.45, 0.03) });
      }
      // A bell arpeggio up the chord on eighths, an octave up.
      for (let k = 0; k < 8; k++) {
        const n = c.notes[k % c.notes.length] + 12;
        layers.push({ source: 'osc', wave: 'sine', freq: hz(n), ...env(t0 + eighth(k), 0.002, 0.02, 0.5, k === 0 ? 0.05 : 0.03) });
      }
      // The bass held, a soft kick on 1 and 3, hats on the off-beats.
      layers.push({ source: 'osc', wave: 'sine', freq: hz(c.root), ...env(t0, 0.05, bar * 0.8, bar * 0.15, 0.3) });
      for (const i of [0, 2]) layers.push({ source: 'osc', wave: 'sine', freq: 65, freqEnd: 40, ...env(t0 + i * beat, 0.003, 0.03, 0.2, 0.22) });
      for (const k of [1, 3, 5, 7]) layers.push({ source: 'noise', filter: 'highpass', freq: 8000, q: 0.5, ...env(t0 + eighth(k), 0.002, 0.01, 0.05, 0.025) });
      if (withTune) {
        tune.forEach((n, k) => {
          if (!n) return;
          layers.push({ source: 'osc', wave: 'triangle', freq: hz(n), ...env(t0 + eighth(k), 0.08, beat * 1.4, beat * 1.2, 0.07) });
        });
      }
    }
  }
  return { layers, duration: bars * bar };
}

/** The lottery's sound styles, in the sound board's order. */
export const LOTTERY_STYLES = /** @type {const} */ (['rattle', 'drumroll', 'whirr']);

/**
 * One draw of the lottery: the drum spinning up to `dropAt`, the ball rolling down the chute, landing, and a reveal as
 * its row fills. Three styles to audition.
 * @param {string} style @param {number} dropAt  Seconds into the draw the ball drops (settings.lottery).
 * @returns {Layer[]}
 */
export function lotteryLayers(style, dropAt) {
  const rng = createRng(`lottery|${style}`);
  /** @type {Layer[]} */
  const layers = [];
  const land = dropAt + 0.75;
  if (style === 'drumroll') {
    // A ticking clock, quickening; a timpani roll swelling to the drop; a brass hit as the ball lands.
    for (let t = 0; t < dropAt;) {
      layers.push({ source: 'osc', wave: 'sine', freq: 1300, ...env(t, 0.001, 0.005, 0.03, 0.12) });
      t += 0.5 - 0.3 * (t / dropAt);
    }
    for (let t = dropAt * 0.4; t < dropAt + 0.6; t += 0.07) {
      const f = (t - dropAt * 0.4) / (dropAt * 0.6 + 0.6);
      layers.push({ source: 'osc', wave: 'sine', freq: 72 + rng.float(-2, 2), freqEnd: 60, ...env(t, 0.004, 0.02, 0.18, 0.08 + 0.25 * f) });
      layers.push({ source: 'noise', filter: 'lowpass', freq: 300, q: 0.7, ...env(t, 0.004, 0.01, 0.1, 0.03 + 0.08 * f) });
    }
    for (const n of [48, 55, 60, 64, 67]) {
      layers.push({ source: 'osc', wave: 'sawtooth', freq: hz(n), ...env(land, 0.01, 0.15, 1.2, 0.06) });
      layers.push({ source: 'osc', wave: 'triangle', freq: hz(n), ...env(land, 0.01, 0.2, 1.4, 0.08) });
    }
  } else if (style === 'whirr') {
    // An airy whirr rising as the drum spins up, a soft plop as the ball lands, a chime arpeggio.
    layers.push({ source: 'noise', filter: 'bandpass', freq: 350, freqEnd: 1600, q: 2.5, ...env(0, dropAt * 0.8, dropAt * 0.15, 0.6, 0.22) });
    layers.push({ source: 'osc', wave: 'sine', freq: 90, freqEnd: 160, ...env(0, dropAt * 0.8, dropAt * 0.15, 0.6, 0.08) });
    layers.push({ source: 'noise', filter: 'bandpass', freq: 1500, freqEnd: 600, q: 3, ...env(dropAt, 0.05, 0.4, 0.3, 0.1) });
    layers.push({ source: 'osc', wave: 'sine', freq: 420, freqEnd: 190, ...env(land, 0.002, 0.03, 0.15, 0.3) });
    [84, 88, 91, 96].forEach((n, i) => layers.push({ source: 'osc', wave: 'sine', freq: hz(n), ...env(land + 0.2 + i * 0.09, 0.003, 0.03, 1.4, 0.12) }));
  } else {
    // A mechanical rattle: the balls clattering in the drum, faster as it spins up, over a low rumble; the ball rolling
    // down the chute, a clunk into the tray, a bell.
    for (let t = 0; t < dropAt;) {
      layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(2200, 3800), q: 5, ...env(t, 0.001, 0.004, 0.035, rng.float(0.08, 0.16)) });
      t += 0.24 - 0.17 * (t / dropAt) + rng.float(0, 0.03);
    }
    layers.push({ source: 'noise', filter: 'lowpass', freq: 220, q: 0.8, ...env(0, dropAt * 0.7, dropAt * 0.25, 0.4, 0.12) });
    layers.push({ source: 'noise', filter: 'bandpass', freq: 1300, freqEnd: 650, q: 4, ...env(dropAt, 0.03, 0.55, 0.15, 0.12) });
    layers.push({ source: 'osc', wave: 'sine', freq: 190, freqEnd: 85, ...env(land, 0.002, 0.02, 0.2, 0.4) });
    layers.push({ source: 'noise', filter: 'lowpass', freq: 900, q: 1, ...env(land, 0.001, 0.01, 0.08, 0.2) });
    layers.push({ source: 'osc', wave: 'triangle', freq: hz(91), ...env(land + 0.25, 0.002, 0.02, 1.6, 0.18) });
    layers.push({ source: 'osc', wave: 'sine', freq: hz(96), ...env(land + 0.25, 0.002, 0.02, 1.2, 0.08) });
  }
  return layers;
}

/** The ads' effects: a sample for the sound board (Task 203), then the full set the ads use (Task 205; data/spots.json). */
export const EFFECTS = /** @type {const} */ (['fizz', 'gull', 'splash', 'boot', 'till', 'rise', 'sizzle', 'ignite', 'pour', 'horn', 'chug', 'wave', 'rain', 'thunder', 'roll', 'clunk', 'thump', 'riffle', 'crunch', 'tick', 'squelch', 'splat', 'pop', 'shatter', 'sparkle', 'clink', 'whirl', 'hop', 'swoosh', 'cheer', 'stamp', 'click', 'steps', 'tear', 'mower', 'sprinkler', 'tap', 'broom', 'crickets', 'radio', 'page']);

/**
 * One of the ads' small sounds.
 * @param {string} effect @returns {Layer[]}
 */
export function effectLayers(effect) {
  const rng = createRng(`effect|${effect}`);
  /** @type {Layer[]} */
  const layers = [];
  switch (effect) {
    case 'fizz':
      // A can opening (a pop and a hiss), then bubbles fizzing away.
      layers.push({ source: 'noise', filter: 'bandpass', freq: 1800, q: 1.5, ...env(0, 0.001, 0.01, 0.05, 0.4) });
      layers.push({ source: 'noise', filter: 'highpass', freq: 3500, q: 0.7, ...env(0.01, 0.01, 0.15, 0.5, 0.3) });
      for (let i = 0; i < 40; i++) layers.push({ source: 'osc', wave: 'sine', freq: rng.float(2500, 6000), ...env(0.15 + rng.float(0, 1.3), 0.001, 0.003, 0.02, rng.float(0.02, 0.06)) });
      break;
    case 'gull':
      // Two gull cries: a squawk that falls away, with a rasp.
      for (const at of [0, 0.55]) {
        layers.push({ source: 'osc', wave: 'sawtooth', freq: 1650, freqEnd: 1100, vibrato: { rate: 28, depth: 40 }, ...env(at, 0.02, 0.18, 0.12, 0.08) });
        layers.push({ source: 'osc', wave: 'triangle', freq: 1650, freqEnd: 1100, ...env(at, 0.02, 0.18, 0.12, 0.12) });
      }
      break;
    case 'splash':
      // Into the water, then a few bubbles.
      layers.push({ source: 'noise', filter: 'lowpass', freq: 2200, freqEnd: 500, q: 0.8, ...env(0, 0.005, 0.08, 0.55, 0.45) });
      layers.push({ source: 'osc', wave: 'sine', freq: 140, freqEnd: 70, ...env(0, 0.003, 0.03, 0.2, 0.25) });
      for (let i = 0; i < 7; i++) layers.push({ source: 'osc', wave: 'sine', freq: rng.float(500, 900), freqEnd: rng.float(900, 1400), ...env(0.35 + i * 0.09 + rng.float(0, 0.05), 0.003, 0.02, 0.05, 0.07) });
      break;
    case 'boot':
      // A boot striking a ball hard, and the ball's thump.
      layers.push({ source: 'osc', wave: 'sine', freq: 180, freqEnd: 45, ...env(0, 0.001, 0.01, 0.16, 0.6) });
      layers.push({ source: 'noise', filter: 'bandpass', freq: 1600, q: 0.9, ...env(0, 0.001, 0.005, 0.06, 0.4) });
      break;
    case 'till':
      // A till's bell and its drawer.
      layers.push({ source: 'osc', wave: 'sine', freq: hz(96), ...env(0, 0.001, 0.02, 1.2, 0.25) });
      layers.push({ source: 'osc', wave: 'sine', freq: hz(103), ...env(0, 0.001, 0.02, 0.8, 0.12) });
      layers.push({ source: 'noise', filter: 'bandpass', freq: 900, q: 1.2, ...env(0.15, 0.01, 0.12, 0.08, 0.15) });
      layers.push({ source: 'osc', wave: 'sine', freq: 110, freqEnd: 70, ...env(0.32, 0.002, 0.02, 0.12, 0.3) });
      break;
    case 'rise':
      // Something rising into view: a soft swell sweeping up.
      layers.push({ source: 'noise', filter: 'bandpass', freq: 400, freqEnd: 2400, q: 1.6, ...env(0, 0.9, 0.2, 0.3, 0.18) });
      layers.push({ source: 'osc', wave: 'sine', freq: 220, freqEnd: 660, ...env(0, 0.9, 0.15, 0.3, 0.06) });
      break;
    case 'sizzle':
      // Heat crackling: a hiss with pops through it.
      layers.push({ source: 'noise', filter: 'highpass', freq: 3000, q: 0.6, ...env(0, 0.3, 1.2, 0.5, 0.12) });
      for (let i = 0; i < 18; i++) layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(1500, 4500), q: 4, ...env(rng.float(0, 1.8), 0.001, 0.004, 0.03, rng.float(0.06, 0.15)) });
      break;
    case 'ignite':
      // A burst into flame: a whoomp and a roar of fire.
      layers.push({ source: 'noise', filter: 'lowpass', freq: 600, freqEnd: 2500, q: 0.8, ...env(0, 0.05, 0.3, 0.9, 0.35) });
      layers.push({ source: 'osc', wave: 'sine', freq: 90, freqEnd: 45, ...env(0, 0.01, 0.05, 0.35, 0.3) });
      break;
    case 'pour':
      // A drink poured: a rising gurgle.
      layers.push({ source: 'noise', filter: 'bandpass', freq: 700, freqEnd: 1500, q: 3, ...env(0, 0.1, 2.2, 0.3, 0.14) });
      for (let i = 0; i < 18; i++) layers.push({ source: 'osc', wave: 'sine', freq: rng.float(400, 800) * (1 + i / 18), ...env(i * 0.14, 0.005, 0.02, 0.06, 0.05) });
      break;
    case 'horn':
      // A ferry's horn: two low blasts.
      for (const at of [0, 0.7]) for (const f of [110, 138]) layers.push({ source: 'osc', wave: 'sawtooth', freq: f, ...env(at, 0.05, 0.45, 0.15, 0.07) });
      break;
    case 'chug':
      // An engine chugging along (four seconds of it).
      for (let t = 0; t < 4; t += 0.35) layers.push({ source: 'noise', filter: 'lowpass', freq: 350, q: 1.5, ...env(t, 0.01, 0.04, 0.12, 0.16) });
      break;
    case 'wave':
      // A wave breaking: a swell and a crash of foam.
      layers.push({ source: 'noise', filter: 'lowpass', freq: 400, freqEnd: 3000, q: 0.7, ...env(0, 0.5, 0.2, 0.9, 0.3) });
      break;
    case 'rain':
      // Rain (five seconds), drops spattering.
      layers.push({ source: 'noise', filter: 'highpass', freq: 2500, q: 0.5, ...env(0, 0.3, 4.2, 1.2, 0.1) });
      for (let i = 0; i < 45; i++) layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(2000, 6000), q: 5, ...env(rng.float(0, 5), 0.001, 0.003, 0.02, rng.float(0.04, 0.09)) });
      break;
    case 'thunder':
      // A crack of lightning, then the rumble.
      layers.push({ source: 'noise', filter: 'highpass', freq: 1500, q: 0.6, ...env(0, 0.002, 0.05, 0.2, 0.35) });
      layers.push({ source: 'noise', filter: 'lowpass', freq: 160, q: 0.8, ...env(0.08, 0.2, 0.6, 1.4, 0.4) });
      break;
    case 'roll':
      // A coin rolling along a ledge (two seconds): a ringing rumble.
      layers.push({ source: 'noise', filter: 'bandpass', freq: 2800, q: 6, ...env(0, 0.05, 2.0, 0.2, 0.08) });
      layers.push({ source: 'osc', wave: 'sine', freq: 3300, vibrato: { rate: 14, depth: 40 }, ...env(0, 0.05, 2.0, 0.2, 0.03) });
      break;
    case 'clunk':
      // A heavy door swinging shut: a deep clunk and a rattle of the lock.
      layers.push({ source: 'osc', wave: 'sine', freq: 95, freqEnd: 50, ...env(0, 0.002, 0.04, 0.5, 0.55) });
      layers.push({ source: 'noise', filter: 'lowpass', freq: 700, q: 1, ...env(0, 0.002, 0.03, 0.2, 0.3) });
      layers.push({ source: 'noise', filter: 'bandpass', freq: 2200, q: 5, ...env(0.12, 0.002, 0.01, 0.06, 0.12) });
      break;
    case 'thump':
      // A heavy book dropped on a desk, and its dust.
      layers.push({ source: 'osc', wave: 'sine', freq: 120, freqEnd: 55, ...env(0, 0.002, 0.03, 0.25, 0.55) });
      layers.push({ source: 'noise', filter: 'lowpass', freq: 900, q: 0.8, ...env(0, 0.002, 0.02, 0.15, 0.3) });
      layers.push({ source: 'noise', filter: 'highpass', freq: 3000, q: 0.5, ...env(0.05, 0.1, 0.2, 0.5, 0.04) });
      break;
    case 'riffle':
      // Pages riffling past: one flip every 160 ms for three seconds.
      for (let t = 0; t < 3.1; t += 0.16) layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(2500, 4500), q: 2, ...env(t, 0.002, 0.01, 0.04, 0.07) });
      break;
    case 'crunch':
      // CRUNCH: a crisp bite, a burst of crackles.
      for (let i = 0; i < 16; i++) layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(1200, 3500), q: 2, ...env(rng.float(0, 0.25), 0.001, 0.01, 0.05, rng.float(0.15, 0.3)) });
      layers.push({ source: 'osc', wave: 'sine', freq: 160, freqEnd: 90, ...env(0, 0.002, 0.03, 0.12, 0.25) });
      break;
    case 'tick':
      // A watch's tick.
      layers.push({ source: 'noise', filter: 'bandpass', freq: 4500, q: 8, ...env(0, 0.001, 0.002, 0.02, 0.25) });
      layers.push({ source: 'osc', wave: 'sine', freq: 3200, ...env(0, 0.001, 0.002, 0.015, 0.05) });
      break;
    case 'squelch':
      // Cream squeezed from a tube: a soft squelch.
      layers.push({ source: 'noise', filter: 'bandpass', freq: 500, freqEnd: 900, q: 4, ...env(0, 0.03, 0.1, 0.08, 0.2) });
      break;
    case 'splat':
      // A blob landing.
      layers.push({ source: 'osc', wave: 'sine', freq: 300, freqEnd: 120, ...env(0, 0.004, 0.02, 0.12, 0.25) });
      layers.push({ source: 'noise', filter: 'lowpass', freq: 1200, q: 1, ...env(0, 0.002, 0.02, 0.1, 0.2) });
      break;
    case 'pop':
      // Something popping open (a parasol, a packet).
      layers.push({ source: 'noise', filter: 'bandpass', freq: 1200, q: 1.5, ...env(0, 0.002, 0.01, 0.08, 0.35) });
      layers.push({ source: 'osc', wave: 'sine', freq: 600, freqEnd: 300, ...env(0, 0.002, 0.02, 0.08, 0.15) });
      break;
    case 'shatter':
      // Pastry shattering into flakes: a crackle, then flakes pattering down slowly.
      for (let i = 0; i < 14; i++) layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(2500, 5500), q: 3, ...env(rng.float(0, 0.15), 0.001, 0.008, 0.05, rng.float(0.1, 0.2)) });
      for (let i = 0; i < 20; i++) layers.push({ source: 'noise', filter: 'highpass', freq: 5000, q: 0.5, ...env(0.3 + rng.float(0, 3.5), 0.002, 0.004, 0.03, rng.float(0.02, 0.05)) });
      break;
    case 'sparkle':
      // A glint: a few high chimes.
      [96, 100, 103, 108].forEach((n, i) => layers.push({ source: 'osc', wave: 'sine', freq: hz(n), ...env(i * 0.06, 0.002, 0.01, 0.5, 0.06) }));
      break;
    case 'clink':
      // Glass or metal clinking.
      layers.push({ source: 'osc', wave: 'sine', freq: 2600, ...env(0, 0.001, 0.005, 0.35, 0.18) });
      layers.push({ source: 'osc', wave: 'sine', freq: 4100, ...env(0, 0.001, 0.005, 0.2, 0.08) });
      break;
    case 'whirl':
      // A rack or a swirl spinning (three and a half seconds): a whir rising then slowing, a tick for each shirt.
      layers.push({ source: 'noise', filter: 'bandpass', freq: 600, freqEnd: 1600, q: 3, ...env(0, 0.8, 1.6, 1.1, 0.1) });
      for (let t = 0; t < 3.5;) {
        layers.push({ source: 'noise', filter: 'bandpass', freq: 1400, q: 6, ...env(t, 0.002, 0.005, 0.03, 0.08) });
        // Fastest near the middle, as the rack is.
        t += 0.06 + 0.25 * (Math.abs(t - 1.8) / 1.8) ** 2;
      }
      break;
    case 'hop':
      // A little hop on hot sand: a quick boing and a puff.
      layers.push({ source: 'osc', wave: 'sine', freq: 300, freqEnd: 600, ...env(0, 0.005, 0.03, 0.08, 0.12) });
      layers.push({ source: 'noise', filter: 'lowpass', freq: 1500, q: 0.8, ...env(0.1, 0.005, 0.02, 0.06, 0.1) });
      break;
    case 'swoosh':
      // Something flying past.
      layers.push({ source: 'noise', filter: 'bandpass', freq: 800, freqEnd: 2500, q: 2, ...env(0, 0.15, 0.05, 0.3, 0.22) });
      break;
    case 'cheer':
      // A small crowd's cheer.
      layers.push({ source: 'noise', filter: 'bandpass', freq: 1100, q: 0.8, ...env(0, 0.15, 0.8, 0.9, 0.22) });
      layers.push({ source: 'noise', filter: 'bandpass', freq: 600, q: 1, ...env(0, 0.15, 0.8, 0.9, 0.15) });
      break;
    case 'stamp':
      // Something firm landing: a thunk and a click.
      layers.push({ source: 'osc', wave: 'sine', freq: 180, freqEnd: 90, ...env(0, 0.002, 0.02, 0.12, 0.4) });
      layers.push({ source: 'noise', filter: 'bandpass', freq: 2500, q: 3, ...env(0, 0.001, 0.005, 0.03, 0.2) });
      break;
    case 'click':
      // A turnstile's clack.
      for (const at of [0, 0.18]) layers.push({ source: 'noise', filter: 'bandpass', freq: 1800, q: 5, ...env(at, 0.001, 0.004, 0.04, 0.25) });
      break;
    case 'steps':
      // Footsteps up a stand: one every 160 ms for three seconds.
      for (let t = 0; t < 3; t += 0.16) layers.push({ source: 'noise', filter: 'lowpass', freq: 700, q: 1.2, ...env(t, 0.002, 0.01, 0.05, 0.12) });
      break;
    case 'tear':
      // A calendar page torn off.
      layers.push({ source: 'noise', filter: 'bandpass', freq: 3500, freqEnd: 2000, q: 1.5, ...env(0, 0.01, 0.1, 0.06, 0.14) });
      break;
    // AROUND THE GROUNDS (Tom's note 14): the groundstaff's sounds, played over and over while they work.
    case 'mower':
      // A mower going by: a small engine's putter (a low buzz wobbling fast) and the blades' whine, the grass's hiss;
      // swelling in and out so takes played one after another run together.
      layers.push({ source: 'osc', wave: 'sawtooth', freq: 58, vibrato: { rate: 19, depth: 6 }, ...env(0, 0.6, 1.6, 0.8, 0.16) });
      layers.push({ source: 'osc', wave: 'square', freq: 116, vibrato: { rate: 19, depth: 9 }, ...env(0, 0.6, 1.6, 0.8, 0.05) });
      layers.push({ source: 'osc', wave: 'sine', freq: 640, freqEnd: 660, ...env(0, 0.7, 1.4, 0.9, 0.04) });
      layers.push({ source: 'noise', filter: 'bandpass', freq: 1400, q: 1.4, ...env(0, 0.6, 1.6, 0.8, 0.09) });
      layers.push({ source: 'noise', filter: 'lowpass', freq: 300, q: 0.7, ...env(0, 0.6, 1.6, 0.8, 0.12) });
      break;
    case 'sprinkler':
      // An impact sprinkler's crisp tk-tk-tk as it turns: SPRINKLER_TICKS ticks SPRINKLER_TICK s apart, played back to
      // back (every SPRINKLER_TICKS × SPRINKLER_TICK s, groundScenes.js) so it never stops while the arm turns (Tom).
      for (let i = 0; i < SPRINKLER_TICKS; i++) {
        const at = i * SPRINKLER_TICK + rng.float(-0.008, 0.008);
        layers.push({ source: 'noise', filter: 'highpass', freq: 3800, q: 0.8, ...env(Math.max(0, at), 0.003, 0.01, 0.07, 0.16) });
        layers.push({ source: 'noise', filter: 'bandpass', freq: 1900, q: 2, ...env(Math.max(0, at), 0.002, 0.004, 0.03, 0.08) });
      }
      break;
    case 'tap':
      // A hammer tapping a goalpost's fitting: three light knocks with a short ring, unhurried (Tom).
      for (const [at, f] of [[0, 1180], [0.55, 1240], [1.1, 1150]]) {
        layers.push({ source: 'osc', wave: 'triangle', freq: f, freqEnd: f * 0.97, ...env(at, 0.001, 0.005, 0.18, 0.12) });
        layers.push({ source: 'noise', filter: 'bandpass', freq: 3000, q: 1.5, ...env(at, 0.001, 0.003, 0.02, 0.12) });
      }
      break;
    case 'crickets':
      // Crickets at night (Tom): one cricket, the same low chirp (three quick pulses) CRICKET_CHIRPS times, an unhurried
      // CRICKET_GAP s apart; groundScenes.js plays it now and then under the quieter scenes after dark, a long pause between.
      for (let i = 0; i < CRICKET_CHIRPS; i++) {
        for (let k = 0; k < 3; k++) layers.push({ source: 'osc', wave: 'sine', freq: 4300, ...env(i * CRICKET_GAP + k * 0.05, 0.004, 0.014, 0.012, 0.035) });
      }
      break;
    case 'radio':
      // The night watch's walkie-talkie (Tom): a short burst of crackling static, a muffled voice's buzz under it, then the
      // squelch as it's let go.
      for (let i = 0; i < 14; i++) layers.push({ source: 'noise', filter: 'bandpass', freq: rng.float(1400, 2600), q: 2.5, ...env(i * 0.035 + rng.float(0, 0.02), 0.003, 0.012, 0.02, rng.float(0.05, 0.1)) });
      layers.push({ source: 'osc', wave: 'sawtooth', freq: 180, vibrato: { rate: 9, depth: 25 }, ...env(0.05, 0.02, 0.32, 0.05, 0.025) });
      layers.push({ source: 'noise', filter: 'highpass', freq: 3000, q: 0.7, ...env(0.52, 0.004, 0.06, 0.04, 0.09) });
      break;
    case 'page':
      // A page of the manager's clipboard turned over (Tom: the ads' riffle is a whole book).
      layers.push({ source: 'noise', filter: 'bandpass', freq: 3200, freqEnd: 2200, q: 1.5, ...env(0, 0.03, 0.05, 0.08, 0.08) });
      break;
    case 'broom':
      // A broom: two strokes across a concrete floor.
      for (const at of [0, 0.5]) layers.push({ source: 'noise', filter: 'bandpass', freq: 2300, freqEnd: 3800, q: 0.7, ...env(at, 0.12, 0.08, 0.2, 0.12) });
      break;
    default:
      break;
  }
  return layers;
}
