// The recordings' dev page (recordings.html; phones, 2026-10-13; docs/channel.md §27): every sound the channel plays,
// rendered here from its recipe (the same graph the channel built live) and sent to the dev server, which keeps it as an
// MP3 in assets/sounds/. Each row says whether its recording is there and fresh (its recipe unchanged since), with ▶
// LIVE (built now) and ▶ FILE (the recording, as the channel plays it) to compare by ear.
import { loadConfig } from '../config.js';
import { MURMUR_BED, catalogue, recipeHash } from './recordings.js';
import { noiseBuffer, renderMurmurBed, renderRecipe } from './audio.js';
import { recipe } from './soundRecipes.js';

/** Rendered a little past a sound's end, as the channel's own renders were (audio.js rendered). */
const TAIL_SECONDS = 0.05;

/** @param {string} path */
async function fetchText(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/** @param {string} tag @param {string} [cls] @param {(Node | string)[]} [children] */
function el(tag, cls = '', children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children);
  return node;
}

/** @returns {Promise<Record<string, import('../cli/recordingsStore.js').IndexEntry>>} */
async function readIndex() {
  try {
    return JSON.parse(await fetchText('assets/sounds/index.json')).recordings ?? {};
  } catch {
    return {};
  }
}

/**
 * Render one recording: the recipe (or the murmur's bed) offline at its rate; the music folded to its loop length, each
 * pass's tail laid over the start as the passes overlap when played back to back.
 * @param {import('./recordings.js').Recording} r @param {AudioBuffer} noise
 * @returns {Promise<AudioBuffer>}
 */
export async function renderRecording(r, noise) {
  if (r.key === MURMUR_BED) return renderMurmurBed(noise, r.rate);
  const rec = recipe(r.kind, r.seed, r.opts);
  const channels = rec.layers.some((l) => l.pan) ? 2 : 1;
  const off = new OfflineAudioContext(channels, Math.ceil((rec.duration + TAIL_SECONDS) * r.rate), r.rate);
  renderRecipe(off, off.destination, noise, rec, 1, 0, r.seed);
  const long = await off.startRendering();
  if (!r.loop) return long;
  const n = Math.round(r.loop * r.rate);
  const loop = new AudioBuffer({ length: n, numberOfChannels: channels, sampleRate: r.rate });
  for (let c = 0; c < channels; c++) {
    const from = long.getChannelData(c);
    const to = loop.getChannelData(c);
    for (let i = 0; i < from.length; i++) to[i % n] += from[i];
  }
  return loop;
}

/**
 * A buffer as a 16-bit WAV, scaled down to fit if it peaks above full scale; the scale comes back as its gain.
 * @param {AudioBuffer} b @returns {{ wav: ArrayBuffer, gain: number }}
 */
export function toWav(b) {
  const ch = b.numberOfChannels;
  const data = Array.from({ length: ch }, (_, c) => b.getChannelData(c));
  let peak = 0;
  for (const d of data) for (const v of d) peak = Math.max(peak, Math.abs(v));
  const gain = Math.max(1, peak / 0.98);
  const out = new ArrayBuffer(44 + b.length * ch * 2);
  const v = new DataView(out);
  const str = (/** @type {number} */ at, /** @type {string} */ s) => { for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + b.length * ch * 2, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, ch, true); v.setUint32(24, b.sampleRate, true); v.setUint32(28, b.sampleRate * ch * 2, true); v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, b.length * ch * 2, true);
  let at = 44;
  for (let i = 0; i < b.length; i++) {
    for (let c = 0; c < ch; c++) {
      v.setInt16(at, Math.round(Math.max(-1, Math.min(1, data[c][i] / gain)) * 32767), true);
      at += 2;
    }
  }
  return { wav: out, gain };
}

async function main() {
  const config = await loadConfig(fetchText);
  const list = catalogue(config);
  let index = await readIndex();
  const status = /** @type {HTMLElement} */ (document.getElementById('status'));
  const table = /** @type {HTMLElement} */ (document.getElementById('list'));
  /** @type {AudioContext | null} */
  let ctx = null;
  const play = () => {
    if (!ctx) ctx = new AudioContext();
    return ctx;
  };
  const noise = noiseBuffer(new OfflineAudioContext(1, 1, 48_000));
  /** @param {import('./recordings.js').Recording} r */
  const state = (r) => (!index[r.key] ? 'missing' : index[r.key].hash !== recipeHash(r) ? 'stale' : 'fresh');
  /** @type {Map<string, HTMLElement>} */
  const cells = new Map();
  const summary = () => {
    const counts = { fresh: 0, stale: 0, missing: 0 };
    for (const r of list) counts[state(r)]++;
    status.textContent = `${list.length} recordings: ${counts.fresh} fresh, ${counts.stale} stale, ${counts.missing} missing`;
    for (const r of list) {
      const c = cells.get(r.key);
      if (c) { c.textContent = state(r); c.className = state(r); }
    }
  };
  /** @param {import('./recordings.js').Recording} r */
  const record = async (r) => {
    const { wav, gain } = toWav(await renderRecording(r, noise));
    const res = await fetch(`/api/recordings?key=${encodeURIComponent(r.key)}&gain=${gain}`, { method: 'POST', headers: { 'x-recordings': '1' }, body: wav });
    if (!res.ok) throw new Error(`${r.key}: ${await res.text()}`);
    index[r.key] = await res.json();
  };
  /** @param {(r: import('./recordings.js').Recording) => boolean} which */
  const recordAll = async (which) => {
    const todo = list.filter(which);
    let done = 0;
    for (const r of todo) {
      status.textContent = `Recording ${++done} of ${todo.length}: ${r.key}`;
      try {
        await record(r);
      } catch (err) {
        status.textContent = String(err);
        return;
      }
    }
    index = await readIndex();
    summary();
  };
  /** @param {import('./recordings.js').Recording} r */
  const playLive = async (r) => {
    const c = play();
    const b = await renderRecording(r, noise);
    const src = c.createBufferSource();
    src.buffer = b;
    src.connect(c.destination);
    src.start();
  };
  /** @param {import('./recordings.js').Recording} r */
  const playFile = async (r) => {
    const e = index[r.key];
    if (!e) return;
    const c = play();
    const b = await c.decodeAudioData(await (await fetch(`assets/sounds/${e.file}`)).arrayBuffer());
    const src = c.createBufferSource();
    src.buffer = b;
    const g = c.createGain();
    g.gain.value = e.gain;
    src.connect(g).connect(c.destination);
    src.start();
  };
  /** @param {string} label @param {() => void} f */
  const button = (label, f) => {
    const b = el('button', '', [label]);
    b.addEventListener('click', f);
    return b;
  };
  /** @type {HTMLElement} */ (document.getElementById('actions')).append(
    button('RECORD MISSING AND STALE', () => recordAll((r) => state(r) !== 'fresh')),
    button('RECORD ALL', () => recordAll(() => true)),
  );
  for (const r of list) {
    const cell = el('td', state(r), [state(r)]);
    cells.set(r.key, cell);
    table.append(el('tr', '', [
      el('td', 'name', [r.key]),
      cell,
      el('td', '', [button('▶ LIVE', () => playLive(r)), button('▶ FILE', () => playFile(r)), button('RECORD', () => record(r).then(summary).catch((err) => { status.textContent = String(err); }))]),
    ]));
  }
  summary();
}

// Only on recordings.html (chants.html borrows renderRecording).
if (document.getElementById('actions')) {
  main().catch((err) => {
    /** @type {HTMLElement} */ (document.getElementById('status')).textContent = `Could not start: ${err instanceof Error ? err.message : err}`;
  });
}
