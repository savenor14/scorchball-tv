// The channel's sound (Task 50): turns the recipes in soundRecipes.js into Web Audio.
// Browser only: never imported by tests, the sim or the Node tools. See docs/channel.md §14.2.
//
// Browsers only allow audio after the viewer clicks or presses a key, so nothing is created until start() is called
// from such an event. Volumes come from settings.sound: a master level and a level per cue kind. (A continuous crowd
// murmur was tried and dropped, Tom 2026-10-04: it sounded like violins, and the reactions carry the crowd.)
// Noise comes from one buffer filled by the seeded RNG (no Math.random); each layer starts at a seeded point in it.
import { createRng } from '../sim/rng.js';
import { recipe, roarCheer } from './soundRecipes.js';
import { MURMUR_BED, recordingOf } from './recordings.js';

/** The silence an MP3 encoder adds at the start (LAME's 576 + the decoder's 529), in the file's samples: trimmed if a
 * decoder leaves it in. */
const ENCODER_DELAY = 1105;
/** How often the device's delay to the speaker is looked at again (audio.lead), ms. */
const LEAD_CHECK_MS = 5000;
/** The most of the device's delay a sound is started early by, seconds (a strange report can't push sounds far ahead). */
const MAX_DELAY = 0.5;
/** The recordings loaded as sound is switched on (the rest as first played): the crowd and the play's own sounds. */
const EAGER = /^(murmur|ooh|groan|roar|applause|jeer|chant|whistle|kick|shot|net|save|post|block|burn|sub)\//;

/** Length of the shared noise buffer, seconds. */
const NOISE_SECONDS = 3;
/** The murmur's bed (phones, ?murmur=bed): this long before it repeats, seconds. */
const BED_SECONDS = 12;
/** A take begins every this many to this many seconds in the bed, as the murmur's do (main.js murmur). */
const BED_GAP = [0.6, 1.1];
/** How quickly the bed follows the crowd's level (setTargetAtTime's time constant, s). */
const BED_EASE = 0.25;
/** A loop's pass asked for this close (seconds) to where the last one ends starts exactly there (Task 278b). */
const LOOP_SNAP_SECONDS = 0.25;
/** How sharp a voice's formants are (filter Q): higher is a clearer vowel. */
const FORMANT_Q = 3.5;
/** Formant filters let little of a buzz through, so voices are lifted by this much to match the other sounds. */
const FORMANT_BOOST = 2.5;
/**
 * @typedef {object} SoundSettings  settings.sound
 * @property {number} master  0–1.
 * @property {Record<string, number>} levels  0–1 per cue kind.
 * @property {Prerender} [prerender]  Task 278b: heavy sounds rendered ahead and played as recordings (none: all live).
 * @property {number} [ahead]  Every sound and voice starts this many seconds after it's asked for, on the audio clock
 *   (phones, ?ahead=: Firefox seemed to apply a sound's start late, so a short one like a pass lost its loud start).
 * @property {AudioContextLatencyCategory | number} [latency]  The AudioContext's latencyHint (Task 278b; seconds, ?latency=, phones).
 * @typedef {{ minNodes: number, variants: number, roarSizes: number, cacheMB: number, crowdRate: number, lateSeconds: number }} Prerender
 * @typedef {{ add: (part: string, ms: number) => void, rendered: (lateMs: number) => void, dropped: () => void }} Meter  The phone readout's (perf.js).
 * @typedef {{ duckLevel: number, duckFadeMs: number, breathMs: number }} DuckSettings  settings.commentary: the rest dips
 *   under a voice; breathMs: the least gap after one voice clip before a queued one (Task 179).
 */

/**
 * The shared noise: NOISE_SECONDS of white noise from the seeded RNG.
 * @param {BaseAudioContext} ctx
 */
export function noiseBuffer(ctx) {
  const buffer = ctx.createBuffer(1, Math.round(NOISE_SECONDS * ctx.sampleRate), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const rng = createRng('audio|noise');
  for (let i = 0; i < data.length; i++) data[i] = rng.float(-1, 1);
  return buffer;
}

/**
 * Build one recipe's nodes into `destination`, starting at t0 (seconds, the context's clock). Works with an
 * OfflineAudioContext too, so a sound can be rendered and measured without playing it.
 * @param {BaseAudioContext} ctx @param {AudioNode} destination @param {AudioBuffer} noise
 * @param {import('./soundRecipes.js').Recipe} r @param {number} level  Its kind's level times any extra gain.
 * @param {number} t0 @param {string} seed  Where in the noise each layer starts.
 * @param {number} [from]  Start this many seconds into the sound (Task 62: turning sound on part-way through an
 *   anthem): layers already over are left out, and the rest join where they would be by then.
 * @param {number} [fadeIn]  Swell in over this many seconds (Task 181: a sound joined part-way came in at full
 *   strength at once, a jolt when switching into a cheering match).
 * @returns {GainNode}  The sound's own output (disconnect it once it's done).
 */
export function renderRecipe(ctx, destination, noise, r, level, t0, seed, from = 0, fadeIn = 0) {
  const out = ctx.createGain();
  out.gain.value = level;
  if (fadeIn > 0) {
    out.gain.setValueAtTime(0, t0);
    out.gain.linearRampToValueAtTime(level, t0 + fadeIn);
  }
  out.connect(destination);
  const rng = createRng(`audio|offsets|${r.kind}|${seed}`);
  for (const l of r.layers) {
    // Where the layer would begin, and the moment it actually joins (t0 if it's already under way).
    const begin = t0 - from + l.start;
    const peak = begin + l.attack;
    const fall = peak + l.hold;
    const end = fall + l.release;
    const noiseAt = rng.float(0, NOISE_SECONDS);
    if (end <= t0) continue;
    const join = Math.max(begin, t0);
    const g = ctx.createGain();
    if (join < peak) {
      g.gain.setValueAtTime(l.gain * (join - begin) / l.attack, join);
      g.gain.linearRampToValueAtTime(l.gain, peak);
    }
    if (join < fall) g.gain.setValueAtTime(l.gain, Math.max(join, fall));
    else {
      const f = (join - fall) / l.release;
      g.gain.setValueAtTime(l.fade === 'linear' ? l.gain * (1 - f) : l.gain * (0.0001 / l.gain) ** f, join);
    }
    if (l.fade === 'linear') g.gain.linearRampToValueAtTime(0, end);
    else g.gain.exponentialRampToValueAtTime(0.0001, end);
    // Panned (Task 249: the ident's fire follows the ball).
    if (l.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = l.pan;
      g.connect(p).connect(out);
    } else g.connect(out);
    /** A frequency gliding from `a` at begin to `b` at end (exponentially), as it is at `join`. @param {number} a @param {number} [b] */
    const glideAt = (a, b) => (b ? a * (b / a) ** ((join - begin) / (end - begin)) : a);
    if (l.source === 'osc') {
      const o = ctx.createOscillator();
      o.type = l.wave;
      o.frequency.setValueAtTime(glideAt(l.freq, l.freqEnd), join);
      if (l.freqEnd) o.frequency.exponentialRampToValueAtTime(l.freqEnd, end);
      if (l.vibrato) {
        const lfo = ctx.createOscillator();
        const depth = ctx.createGain();
        lfo.frequency.value = l.vibrato.rate;
        depth.gain.value = l.vibrato.depth;
        lfo.connect(depth).connect(o.frequency);
        lfo.start(join);
        lfo.stop(end);
      }
      if (l.formants) voiceInto(ctx, o, g, l.formants);
      else o.connect(g);
      o.start(join);
      o.stop(end + 0.02);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = noise;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = l.filter;
      f.Q.value = l.q;
      f.frequency.setValueAtTime(glideAt(l.freq, l.freqEnd), join);
      if (l.freqEnd) f.frequency.exponentialRampToValueAtTime(l.freqEnd, end);
      src.connect(f).connect(g);
      src.start(join, noiseAt);
      src.stop(end + 0.02);
    }
  }
  return out;
}

/**
 * A voice: the buzz through each formant (a resonant band-pass) into `to`, which shapes it into a vowel.
 * @param {BaseAudioContext} ctx @param {AudioNode} from @param {AudioNode} to @param {number[]} formants
 */
function voiceInto(ctx, from, to, formants) {
  const lift = ctx.createGain();
  lift.gain.value = FORMANT_BOOST / formants.length;
  lift.connect(to);
  for (const freq of formants) {
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = FORMANT_Q;
    from.connect(f).connect(lift);
  }
}

/** The crowd's sounds, which the levels pane's Crowd switch silences (Task 129). */
export const CROWD_KINDS = new Set(['roar', 'groan', 'ooh', 'applause', 'jeer', 'murmur', 'chant']);

/**
 * How many audio nodes a recipe builds (renderRecipe's, the master's own gain included): what a phone has to run live
 * (Task 278b; the crowd's reactions about 130–200, the music about 800, a kick 6).
 * @param {import('./soundRecipes.js').Recipe} r
 */
export function recipeNodes(r) {
  let n = 1;
  for (const l of r.layers) n += 1 + (l.pan ? 1 : 0) + (l.source === 'osc' ? 1 + (l.vibrato ? 2 : 0) + (l.formants ? l.formants.length + 1 : 0) : 2);
  return n;
}

/** The options that shape a sound (soundRecipes.js SoundOptions), so the ones a take is kept by. */
const SHAPES = new Set(['blast', 'power', 'held', 'team', 'fit', 'sting', 'jingle', 'style', 'dropAt', 'effect', 'track', 'tune', 'cheer']);

/**
 * The take a heavy sound is rendered as (Task 278b): the crowd's sounds, a new seed every cheer, come from `variants`
 * takes per kind (the seed picks one, alike on every screen), a roar in `roarSizes` sizes (its power rounded up to the
 * nearest, never below the smallest); anything else as asked. Returns the seed and options to render with, and the key
 * it's kept under.
 * @param {string} kind @param {string} seed @param {import('./soundRecipes.js').SoundOptions} opts @param {Prerender} p
 */
export function takeOf(kind, seed, opts, p) {
  // Only what shapes the sound: a match's cues carry their moment and more besides, which made every cheer a take of its own.
  const shape = /** @type {any} */ (Object.fromEntries(Object.entries(opts).filter(([k]) => SHAPES.has(k))));
  if (!CROWD_KINDS.has(kind)) return { seed, opts: /** @type {import('./soundRecipes.js').SoundOptions} */ (shape), key: `${kind}|${seed}|${JSON.stringify(shape)}` };
  if (typeof shape.power === 'number') shape.power = Math.max(1, Math.round(shape.power * p.roarSizes)) / p.roarSizes;
  return crowdTake(kind, createRng(`take|${seed}`).int(0, p.variants - 1), shape);
}

/**
 * One of the crowd's takes: its seed, options and key (takeOf's).
 * @param {string} kind @param {number} i  Which take. @param {import('./soundRecipes.js').SoundOptions} shape
 */
function crowdTake(kind, i, shape) {
  const seed = `take|${kind}|${i}`;
  // A roar's take may be a cheer of another kind, as its recording is (roarCheer).
  const cheer = kind === 'roar' && typeof shape.power === 'number' && !shape.cheer ? roarCheer(shape.power, i) : undefined;
  if (cheer) shape = { ...shape, cheer };
  return { seed, opts: shape, key: `${kind}|${seed}|${JSON.stringify(shape)}` };
}

/**
 * Every take of the crowd's (Task 278b), rendered as sound is switched on so a reaction is ready when it comes: the
 * murmur first (it plays all through a match), then the reactions, each roar size.
 * @param {Prerender} p
 */
export function crowdTakes(p) {
  const kinds = ['murmur', 'ooh', 'groan', 'roar', 'applause', 'jeer', 'chant'];
  return kinds.flatMap((kind) => {
    const shapes = kind === 'roar' ? Array.from({ length: p.roarSizes }, (_, s) => ({ power: (s + 1) / p.roarSizes })) : [{}];
    return shapes.flatMap((shape) => Array.from({ length: p.variants }, (_, i) => ({ kind, ...crowdTake(kind, i, shape) })));
  });
}

/**
 * The murmur as one seamless loop (phones, ?murmur=bed: the crowd popped in Firefox on a phone, perhaps from its many
 * overlapping takes): murmur takes every 0.6–1.1 s over BED_SECONDS, as main.js plays them, each one's tail running past
 * the end folded back onto the start, so the loop has no seam. At gain 1 a take; its loudness is the overlapping takes'.
 * @param {AudioBuffer} noise @param {number} rate
 * @returns {Promise<AudioBuffer>}
 */
export async function renderMurmurBed(noise, rate) {
  const rng = createRng('audio|murmur-bed');
  const starts = [];
  for (let t = 0; t < BED_SECONDS; t += rng.float(BED_GAP[0], BED_GAP[1])) starts.push(t);
  const takes = starts.map((_, i) => recipe('murmur', `bed|${i}`, {}));
  const tail = Math.max(...takes.map((r) => r.duration));
  const off = new OfflineAudioContext(1, Math.ceil((BED_SECONDS + tail) * rate), rate);
  takes.forEach((r, i) => renderRecipe(off, off.destination, noise, r, 1, starts[i], `bed|${i}`));
  const long = await off.startRendering();
  const n = Math.round(BED_SECONDS * rate);
  const bed = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate: rate });
  const from = long.getChannelData(0);
  const to = bed.getChannelData(0);
  for (let i = 0; i < from.length; i++) to[i % n] += from[i];
  return bed;
}

/**
 * @param {SoundSettings} settings
 * @param {DuckSettings} [duck]  How the other sounds dip while a voice clip plays (Task 123); no dip without it.
 * @param {Recordings | null} [recordings]  The recordings to play in place of building sounds (phones); none: all built.
 * @typedef {{ index: Record<string, import('../cli/recordingsStore.js').IndexEntry>, settings: import('./recordings.js').RecordingSettings, base: string }} Recordings
 */
export function createAudio(settings, duck, recordings = null) {
  /** @type {AudioContext | null} */
  let ctx = null;
  /** @type {GainNode | null} */
  let master = null;
  /** @type {GainNode | null} Every synthesized sound goes through this into the master, so a voice can duck them. */
  let rest = null;
  /** @type {GainNode | null} Between rest and the master: dips as the viewer switches matches (Task 181). */
  let entry = null;
  /** @type {Record<'roar' | 'murmur' | 'music', GainNode | null>} The crowd's roars and the murmur each on their own way into rest, to hush on a switch (Task 181); the off-season's music, to fade in and out (Task 204). */
  const buses = { roar: null, murmur: null, music: null };
  /** @type {Map<string, AudioBuffer | null>} Voice clips by URL: null while loading or if it failed. */
  const clips = new Map();
  /** When the last voice clip ends (the context's clock), so overlapping ducks join up. */
  let voiceUntil = 0;
  /** The levels pane's switches (Task 129). */
  let crowdOn = true;
  /** Task 256: the commentators apart from the studio (the desk and the interview, kind 'speech'). */
  let commentaryOn = true;
  let studioOn = true;
  /** @type {AudioBuffer | null} */
  let noise = null;
  let on = false;
  /** The tab is hidden (Task 181): the channel goes quiet until it's back. */
  let hidden = false;
  let volume = settings.master;
  const ahead = settings.ahead ?? 0;
  /** The lead (audio.lead): ahead plus the device's delay to the speaker, looked at every few seconds, kept steady. */
  let lead = ahead;
  let leadAt = -Infinity;
  /** What the master should be at now. */
  const masterLevel = () => (on && !hidden ? volume : 0);
  /** @type {Record<string, number>} */
  const levels = { ...settings.levels };
  /** How many sounds have played (the dev panel shows it). */
  let played = 0;
  /** @type {{ kind: string, out: AudioNode, key: string, stop: () => void }[]} The sounds still sounding, so they can be stopped (Task 203: the sound board's Stop). */
  let sounding = [];
  /** @type {Map<string, Promise<AudioBuffer | null>>} Heavy sounds rendered (Task 278b), by takeOf's key, oldest first. */
  const takes = new Map();
  /** @type {Map<string, number>} Each rendered take's size in bytes. */
  const takeBytes = new Map();
  /** One render at a time, so a phone isn't swamped. */
  let renders = Promise.resolve();
  /** @type {Map<string, number>} Where each loop's next pass should start (the context's clock), by kind (Task 278b). */
  const loops = new Map();
  /** @type {Map<string, Promise<AudioBuffer | null>>} The recordings' sounds, by file. */
  const files = new Map();
  /** Sounds built in the browser (none had a recording) and recordings whose decoder left the encoder's silence at the start (the readout). */
  let built = 0;
  let trimmed = 0;
  /** Renders not yet done (the phone readout, ?perf=1). */
  let rendering = 0;
  /** How long the crowd's takes took to render after sound was switched on, ms (null until done). */
  let crowdReadyMs = /** @type {number | null} */ (null);
  /** @type {{ gain: GainNode, ready: boolean, target: number } | null} The murmur's bed (?murmur=bed), once asked for. */
  let bed = null;
  /** @type {Meter | null} The phone readout's (?perf=1), told how late renders start and how long building sounds takes. */
  let meter = null;

  /**
   * A heavy sound's recording: rendered once in the background (an OfflineAudioContext, the same graph as live), kept
   * until the cache is full, the oldest dropped first. null if it couldn't be rendered.
   * @param {string} key @param {import('./soundRecipes.js').Recipe} r @param {string} seed
   * @param {number} [rate]  Samples a second (the crowd's lower: Task 278b); the context's own by default.
   * @returns {Promise<AudioBuffer | null>}
   */
  function rendered(key, r, seed, rate = ctx?.sampleRate ?? 48_000) {
    const have = takes.get(key);
    if (have) {
      takes.delete(key); // to the back: the newest used
      takes.set(key, have);
      return have;
    }
    rendering++;
    const job = renders.then(async () => {
      const off = new OfflineAudioContext(r.layers.some((l) => l.pan) ? 2 : 1, Math.ceil((r.duration + 0.05) * rate), rate);
      renderRecipe(off, off.destination, /** @type {AudioBuffer} */ (noise), r, 1, 0, seed);
      const buffer = await off.startRendering();
      takeBytes.set(key, buffer.length * buffer.numberOfChannels * 4);
      let total = [...takeBytes.values()].reduce((a, b) => a + b, 0);
      for (const old of takes.keys()) {
        if (total <= (settings.prerender?.cacheMB ?? 0) * 1e6 || old === key) break;
        total -= takeBytes.get(old) ?? 0;
        takes.delete(old);
        takeBytes.delete(old);
      }
      return buffer;
    }).catch(() => null).finally(() => { rendering--; });
    renders = job;
    takes.set(key, job);
    return job;
  }

  /**
   * Play a heavy sound's recording into `into` at `level`, from t0 (`from` s into it, swelling in over opts.fadeIn), once
   * it's rendered; if that takes past t0, it joins part-way, where it would be by then, so it keeps its time; a crowd
   * reaction more than lateSeconds late is left out (Tom, on a smart TV: only its quiet tail was heard).
   * @param {import('./soundRecipes.js').SoundKind} kind @param {{ seed?: string, fadeIn?: number } & import('./soundRecipes.js').SoundOptions} opts
   * @param {Prerender} p @param {AudioNode} into @param {number} level @param {number} t0 @param {number} from
   * @returns {GainNode}  The sound's own output (disconnected to stop it).
   */
  function playTake(kind, opts, p, into, level, t0, from) {
    const c = /** @type {AudioContext} */ (ctx);
    const take = takeOf(kind, opts.seed ?? '0', opts, p);
    const out = c.createGain();
    const fadeIn = opts.fadeIn ?? 0;
    out.gain.value = fadeIn > 0 ? 0 : level;
    if (fadeIn > 0) {
      out.gain.setValueAtTime(0, t0);
      out.gain.linearRampToValueAtTime(level, t0 + fadeIn);
    }
    out.connect(into);
    const crowd = CROWD_KINDS.has(kind);
    void rendered(take.key, recipe(kind, take.seed, take.opts), take.seed, crowd ? p.crowdRate : undefined).then((buffer) => {
      const at = Math.max(t0, c.currentTime);
      const offset = from + (at - t0);
      if (!buffer || offset >= buffer.duration) return;
      if (crowd && kind !== 'murmur' && at - t0 > p.lateSeconds) {
        meter?.dropped();
        return;
      }
      meter?.rendered((at - t0) * 1000);
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.connect(out);
      src.start(at, offset);
    });
    return out;
  }

  /** Create the audio graph: call from a click or key press. */
  function start() {
    if (ctx) return;
    ctx = new AudioContext({ latencyHint: settings.latency ?? 'interactive' });
    master = ctx.createGain();
    master.gain.value = masterLevel();
    master.connect(ctx.destination);
    rest = ctx.createGain();
    entry = ctx.createGain();
    rest.connect(entry).connect(master);
    for (const k of /** @type {const} */ (['roar', 'murmur', 'music'])) (buses[k] = ctx.createGain()).connect(rest);
    noise = noiseBuffer(ctx);
    // Every one of the crowd's takes, before anything asked for later (Task 278b), so a reaction is ready when it comes.
    const p = settings.prerender;
    if (recordings) {
      // The crowd's and the play's recordings now, so they're ready when they come; the rest as first played.
      const began = performance.now();
      const eager = Object.entries(recordings.index).filter(([key]) => EAGER.test(key)).map(([, e]) => loadFile(e));
      void Promise.all(eager).then(() => { crowdReadyMs = performance.now() - began; });
    } else if (p) {
      const began = performance.now();
      const all = crowdTakes(p).map((t) => rendered(t.key, recipe(/** @type {import('./soundRecipes.js').SoundKind} */ (t.kind), t.seed, t.opts), t.seed, p.crowdRate));
      void Promise.all(all).then(() => { crowdReadyMs = performance.now() - began; });
    }
  }

  /**
   * Fetch and decode voice clips ahead of use (after start()); each URL once. Failures stay silent.
   * @param {string[]} urls
   */
  function loadClips(urls) {
    const c = ctx;
    if (!c) return;
    for (const url of urls) {
      if (clips.has(url)) continue;
      clips.set(url, null);
      fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((b) => c.decodeAudioData(b))
        .then((buffer) => clips.set(url, buffer))
        .catch(() => {});
    }
  }

  /**
   * Play a loaded voice clip now (or `delay` s from now) at `kind`'s level (or `level`), dipping every other sound
   * under it. A clip not loaded yet isn't played (it's fetched, so a caller can try again in a moment). With `queue`, it
   * never talks over another voice (Task 179): 'wait' starts it `breathMs` after the one still speaking ends; 'skip'
   * leaves it out then (passes in a row, holding the ball: late, they'd be wrong).
   *   With `joined` (Task 247b), a 'wait' starts it straight after the voice before, with no breath ("Bonnefoy! What a
 *   scorcher!").
 * @param {string} url @param {{ kind?: string, level?: number, delay?: number, queue?: 'wait' | 'skip', joined?: boolean }} [opts]
   * @returns {boolean}  Whether it played (or was silenced on purpose: sound off, or its voices off: the studio's for
   *   kind 'speech', the commentators' otherwise), so it needn't be tried again.
   */
  function playClip(url, opts = {}) {
    if (!ctx || !master || !rest || !on) return false;
    if ((opts.kind === 'speech' ? !studioOn : !commentaryOn) || hidden) return true;
    const buffer = clips.get(url);
    if (!buffer) {
      loadClips([url]);
      return false;
    }
    let t0 = ctx.currentTime + ahead + Math.max(0, opts.delay ?? 0);
    const free = voiceUntil + (opts.joined ? 0 : (duck?.breathMs ?? 0) / 1000);
    if (opts.queue && t0 < free) {
      if (opts.queue === 'skip') return true;
      t0 = free;
    }
    played++;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = opts.level ?? levels[opts.kind ?? 'commentary'] ?? 0.5;
    src.connect(g).connect(master);
    src.start(t0);
    src.onended = () => g.disconnect();
    const end = t0 + buffer.duration;
    if (duck) {
      const fade = duck.duckFadeMs / 1000 / 3;
      // Still ducked for an earlier clip: drop its return and come back after this one instead.
      if (t0 <= voiceUntil) rest.gain.cancelScheduledValues(t0);
      else rest.gain.setTargetAtTime(duck.duckLevel, t0, fade);
      rest.gain.setTargetAtTime(1, end, fade);
    }
    voiceUntil = Math.max(voiceUntil, end);
    return true;
  }

  /**
   * Play one sound now (or `delay` seconds from now), from its start or `from` seconds into it, swelling in over
   * `fadeIn` seconds. Nothing while the tab is hidden (Task 181). Returns whether it played.
   * @param {import('./soundRecipes.js').SoundKind} kind
   * @param {{ seed?: string, gain?: number, delay?: number, from?: number, fadeIn?: number, loop?: number } & import('./soundRecipes.js').SoundOptions} [opts]  loop: a loop pass this long (s), started where the last ends (Task 278b).
   */
  function play(kind, opts = {}) {
    if (!ctx || !master || !rest || !noise || !on || hidden || (!crowdOn && CROWD_KINDS.has(kind))) return false;
    const began = meter ? performance.now() : 0;
    played++;
    const from = Math.max(0, opts.from ?? 0);
    const into = (kind === 'roar' || kind === 'murmur' || kind === 'music' ? buses[kind] : null) ?? rest;
    const level = (levels[kind] ?? 0.5) * (opts.gain ?? 1);
    let t0 = ctx.currentTime + ahead + Math.max(0, opts.delay ?? 0);
    // Its recording, if it has one (phones): nothing built here.
    const rec = recordings ? recordingOf(kind, opts.seed ?? '0', opts, recordings.settings) : null;
    const file = rec ? recordings?.index[rec.key] : undefined;
    if (rec && file) {
      playFile(kind, file, rec.key, opts, into, level, t0, from);
      meter?.add('sound', performance.now() - began);
      return true;
    }
    const r = recipe(kind, opts.seed ?? '0', opts);
    // A loop's next pass (the music, Task 278b: pops on a phone) starts exactly where the last one ends by the audio
    // clock; asked for by the frame clock, it was a frame or more off, a gap or an overlap at every join.
    if (opts.loop) {
      const next = loops.get(kind);
      if (next !== undefined && Math.abs(t0 - from - next) < LOOP_SNAP_SECONDS) t0 = next + from;
      loops.set(kind, t0 - from + opts.loop);
    }
    const p = settings.prerender;
    const out = p && recipeNodes(r) >= p.minNodes ? playTake(kind, opts, p, into, level, t0, from) : renderRecipe(ctx, into, noise, r, level, t0, opts.seed ?? '0', from, opts.fadeIn ?? 0);
    built++;
    const item = { kind, out, key: '', stop: () => {} };
    sounding.push(item);
    setTimeout(() => {
      out.disconnect();
      sounding = sounding.filter((x) => x !== item);
    }, (r.duration - from + (opts.delay ?? 0) + 1) * 1000); // a second over: a crowd take can run a little longer than the sound asked for
    meter?.add('sound', performance.now() - began);
    return true;
  }

  /**
   * A recording's sound (phones; recordings.js): fetched and decoded once, kept. A decoder that left the encoder's
   * silence in (longer than recorded) has it trimmed off the start, so loops still join.
   * @param {import('../cli/recordingsStore.js').IndexEntry} e @returns {Promise<AudioBuffer | null>}
   */
  function loadFile(e) {
    const have = files.get(e.file);
    if (have) return have;
    const c = /** @type {AudioContext} */ (ctx);
    const job = fetch(`${recordings?.base ?? ''}${e.file}`)
      .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((bytes) => c.decodeAudioData(bytes))
      .then((b) => {
        const want = Math.round((e.samples * c.sampleRate) / e.rate);
        if (b.length <= want + 2) return b;
        // A decoder that ignored the encoder's note left its whole delay at the start; a few samples over are at the end
        // (Chrome, some files), so the start stays.
        const delay = Math.round((ENCODER_DELAY * c.sampleRate) / e.rate);
        const front = b.length - want >= delay ? delay : 0;
        if (front) trimmed++;
        const cut = new AudioBuffer({ length: want, numberOfChannels: b.numberOfChannels, sampleRate: b.sampleRate });
        for (let ch = 0; ch < b.numberOfChannels; ch++) cut.copyToChannel(b.getChannelData(ch).subarray(front, front + want), ch);
        return cut;
      })
      .catch(() => null);
    files.set(e.file, job);
    return job;
  }

  /**
   * Play a sound from its recording (phones): as playTake did with a render, waiting for it if it isn't loaded yet and
   * then joining part-way (a crowd reaction too late left out); a loop (the music) as one looping source, which later
   * passes leave alone while it plays.
   * @param {import('./soundRecipes.js').SoundKind} kind @param {import('../cli/recordingsStore.js').IndexEntry} e
   * @param {string} key @param {{ fadeIn?: number, delay?: number }} opts @param {AudioNode} into @param {number} level
   * @param {number} t0 @param {number} from
   */
  function playFile(kind, e, key, opts, into, level, t0, from) {
    const c = /** @type {AudioContext} */ (ctx);
    if (e.loop && sounding.some((x) => x.key === key)) return;
    const out = c.createGain();
    const gain = level * e.gain;
    const fadeIn = opts.fadeIn ?? 0;
    out.gain.value = fadeIn > 0 ? 0 : gain;
    if (fadeIn > 0) {
      out.gain.setValueAtTime(0, t0);
      out.gain.linearRampToValueAtTime(gain, t0 + fadeIn);
    }
    out.connect(into);
    /** @type {AudioBufferSourceNode | null} */
    let source = null;
    let stopped = false;
    const item = { kind, out, key, stop: () => { stopped = true; source?.stop(); } };
    sounding.push(item);
    const crowd = CROWD_KINDS.has(kind);
    void loadFile(e).then((buffer) => {
      if (!buffer || stopped) return;
      const at = Math.max(t0, c.currentTime);
      const late = at - t0;
      const offset = e.loop ? (from + late) % e.loop : from + late;
      if (!e.loop && offset >= buffer.duration) return;
      if (crowd && kind !== 'murmur' && late > (settings.prerender?.lateSeconds ?? 0.3)) {
        meter?.dropped();
        return;
      }
      meter?.rendered(late * 1000);
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.loop = Boolean(e.loop);
      src.connect(out);
      src.start(at, offset);
      source = src;
    });
    if (!e.loop) {
      setTimeout(() => {
        out.disconnect();
        sounding = sounding.filter((x) => x !== item);
      }, (e.samples / e.rate - from + (opts.delay ?? 0) + ahead + 2) * 1000);
    }
  }

  /**
   * Fade the music's bus to `to` (0–1) over `ms` (Task 204: in as a run of the off-season's scenes starts, out for
   * the desk and the lottery).
   * @param {number} to @param {number} ms
   */
  function fadeMusic(to, ms) {
    const g = buses.music?.gain;
    if (!ctx || !g) return;
    const now = ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(to, now + Math.max(0.01, ms / 1000));
  }

  /**
   * The murmur's bed (?murmur=bed) at `gain` (0: silent), each frame: rendered the first time (after the crowd's takes),
   * then one loop that only changes loudness. @param {number} gain
   */
  function murmurBed(gain) {
    if (!ctx || !buses.murmur || !noise) return;
    if (!bed) {
      const c = ctx;
      const g = c.createGain();
      g.gain.value = 0;
      g.connect(buses.murmur);
      const b = { gain: g, ready: false, target: 0 };
      bed = b;
      const recorded = recordings?.index[MURMUR_BED];
      rendering++;
      renders = renders.then(() => (recorded ? loadFile(recorded) : renderMurmurBed(/** @type {AudioBuffer} */ (noise), settings.prerender?.crowdRate ?? c.sampleRate))).then((buffer) => {
        if (!buffer) return null;
        const src = c.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        // A recording was scaled down to fit (its index's gain): back up by it.
        const fit = c.createGain();
        fit.gain.value = recorded?.gain ?? 1;
        src.connect(fit).connect(g);
        src.start();
        b.ready = true;
        return null;
      }).catch(() => null).finally(() => { rendering--; });
    }
    const target = crowdOn ? gain * (levels.murmur ?? 0.5) : 0;
    // Only a real change, not every frame's (each would add to the gain's schedule).
    if (Math.abs(target - bed.target) < 0.01 && (target > 0 || bed.target === 0)) return;
    bed.target = target;
    bed.gain.gain.setTargetAtTime(target, ctx.currentTime, BED_EASE);
  }

  /** Sound on or off (on needs start() first, from a click or key). @param {boolean} value */
  function setOn(value) {
    on = value;
    if (!ctx || !master) return;
    if (on) void ctx.resume();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.05);
  }

  /** Stop every sound of a kind now (Task 203: the sound board's Stop for the long music loops). @param {string} kind */
  function stop(kind) {
    for (const x of sounding.filter((y) => y.kind === kind)) {
      x.stop();
      x.out.disconnect();
    }
    sounding = sounding.filter((y) => y.kind !== kind);
  }

  return {
    start,
    play,
    murmurBed,
    stop,
    fadeMusic,
    loadClips,
    playClip,
    setOn,
    get on() { return on; },
    /**
     * Switched to another match (Task 181, Tom: a home goal's cheer on the feed switched to sounded too loud): every
     * sound but the voices drops to `level` and comes back over `returnMs`, so the new feed eases in.
     * @param {number} level @param {number} returnMs
     */
    enter(level, returnMs) {
      if (!ctx || !entry) return;
      const now = ctx.currentTime;
      entry.gain.cancelScheduledValues(now);
      entry.gain.setValueAtTime(level, now);
      entry.gain.linearRampToValueAtTime(1, now + returnMs / 1000);
    },
    /**
     * Silence the crowd's roars, the murmur or both for `holdMs`, then fade them in over `fadeMs` (Task 181, Tom: to
     * find which one spikes on switching matches).
     * @param {('roar' | 'murmur')[]} kinds @param {number} holdMs @param {number} fadeMs
     */
    hush(kinds, holdMs, fadeMs) {
      if (!ctx) return;
      const now = ctx.currentTime;
      for (const k of kinds) {
        const g = buses[k]?.gain;
        if (!g) continue;
        g.cancelScheduledValues(now);
        g.setValueAtTime(0, now);
        g.setValueAtTime(0, now + holdMs / 1000);
        g.linearRampToValueAtTime(1, now + (holdMs + fadeMs) / 1000);
      }
    },
    /** Sound is on and the tab is showing: what's played is heard. */
    get audible() { return on && !hidden; },
    /**
     * The tab hidden or back (Task 181): browsers slow or stop a hidden tab's frames, so sounds due over a stretch came
     * out together in bursts. Hidden, it fades out over `fadeMs` and plays nothing new; back, it fades in again (the
     * channel picks up what's under way, as after any jump). @param {boolean} value @param {number} fadeMs
     */
    setHidden(value, fadeMs) {
      hidden = value;
      if (ctx && master) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, fadeMs / 1000 / 3);
    },
    /** The crowd's sounds on or off (Task 129). @param {boolean} value */
    setCrowd(value) { crowdOn = value; },
    /** The commentators on or off (Task 256). @param {boolean} value */
    setCommentary(value) { commentaryOn = value; },
    /** The studio's voices on or off: the desk and the interview (Task 256). @param {boolean} value */
    setStudio(value) { studioOn = value; },
    /** A loaded clip's length in seconds, or null (Task 135: the typing keeps pace with the voice). @param {string} url */
    clipSeconds(url) { return clips.get(url)?.duration ?? null; },
    get played() { return played; },
    /** The phone readout (?perf=1): renders not yet done, and how long the crowd's took. */
    get rendering() { return rendering; },
    get crowdReadyMs() { return crowdReadyMs; },
    /**
     * How long after it's started a sound leaves the speaker, in seconds: the start ahead (settings.ahead) and the
     * device's delay (about 0.05 s on a desktop, 0.25 on Chrome on a phone, where it keeps more sound ready). The channel
     * starts the play's sounds this much early (main.js leadMs), so they're heard as the picture shows them. Changed only
     * when the device's delay moves by more than 20 ms, so the cues' windows stay put.
     */
    get lead() {
      if (!ctx) return ahead;
      const now = performance.now();
      if (now - leadAt > LEAD_CHECK_MS) {
        leadAt = now;
        const c = /** @type {any} */ (ctx);
        const next = ahead + Math.min(MAX_DELAY, Math.max(0, c.outputLatency || c.baseLatency || 0));
        if (Math.abs(next - lead) > 0.02) lead = next;
      }
      return lead;
    },
    /** Sounds built in the browser for want of a recording, and recordings trimmed of a decoder's silence. */
    get built() { return built; },
    get trimmed() { return trimmed; },
    get recorded() { return Boolean(recordings); },
    /** Report to the phone readout (?perf=1). @param {Meter} m */
    setMeter(m) { meter = m; },
    /** The master volume (0–1). @param {number} v */
    setVolume(v) {
      volume = v;
      if (ctx && master) master.gain.setTargetAtTime(masterLevel(), ctx.currentTime, 0.05);
    },
    /** One kind's level (0–1), for the sound board. @param {string} kind @param {number} v */
    setLevel(kind, v) {
      levels[kind] = v;
    },
    levels,
    /** The audio context and master output (null before start()), for the sound board's voice audition (Task 122). */
    get context() { return ctx; },
    get output() { return master; },
  };
}
