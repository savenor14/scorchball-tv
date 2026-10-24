// The voice audition on the sound board (Task 122): every commentary line in every candidate voice, made ahead of
// time by `npm run voices` into output/voices/ (Kokoro and Piper), plus the browser's own speech for reference.
// Clips play through the board's Web Audio, optionally evened out in loudness, put "on air" (a TV band, or that
// plus pixel grit: a low sample rate and few bits), and with the crowd roaring underneath. Dev page only.
// The same grid shows a voice tried as a commentator (Task 126, `npm run voices -- --try <voice>`): its versions of
// each line, listed in output/voices/tries.json. A try with a `conversation` (OFF THE BALL, 2026-10-20) plays each voice's
// lines in turn with the other seat's voiced clips, so a voice is heard against its partner.

const INDEX = 'output/voices/index.json';
const TRIES = 'output/voices/tries.json';
/** Peak a clip is evened out to, when "even loudness" is ticked. */
const NORMAL_PEAK = 0.9;
/** On air: the band a TV speaker passes, Hz. */
const TV_BAND = { low: 250, high: 5000 };
/** Pixel grit: the sample rate and bits a clip is crushed to. */
const PIXEL = { rate: 8000, bits: 6 };
/** Gap between clips when playing a whole row or column, seconds. */
const RUN_GAP = 0.35;

/**
 * @typedef {{ id: string, text: string, say: string }} Line
 * @typedef {{ engine?: 'kokoro' | 'piper', id?: string, dir?: string, path?: string, ext?: string, group?: string, label: string, accent: string, licence?: string }} Voice
 *   dir: its clips' folder under output/voices/ (otherwise engine/id); path: a folder from the site's root instead, its
 *   clips .ext (the voice on air today). group: its column heading (otherwise the engine).
 * @typedef {{ id?: string, clip?: string, text?: string }} Turn  A conversation's turn: a line of the grid's (by id), or
 *   the other seat's voiced clip.
 * @typedef {{ title?: string, lines: Line[], voices: Voice[], conversation?: Turn[] }} Index
 */

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Every voice tried as a commentator (Task 126), newest first, each as its own grid; nothing if none yet.
 * @param {HTMLElement} root @param {ReturnType<typeof import('./audio.js').createAudio>} audio @param {any} ui
 */
export async function voiceTries(root, audio, ui) {
  /** @type {string[]} */
  let tries = [];
  try {
    tries = await fetchJson(TRIES);
  } catch {
    return;
  }
  for (const dir of [...tries].reverse()) {
    const box = ui.el('div');
    root.append(box);
    await voiceAudition(box, audio, ui, `output/voices/${dir}/index.json`);
  }
}

/**
 * Crush a clip to PIXEL's sample rate and bits (rendered offline, then played back at the context's rate).
 * @param {AudioBuffer} buffer @returns {Promise<AudioBuffer>}
 */
async function pixelate(buffer) {
  const off = new OfflineAudioContext(1, Math.ceil(buffer.duration * PIXEL.rate), PIXEL.rate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.connect(off.destination);
  src.start();
  const low = await off.startRendering();
  const data = low.getChannelData(0);
  const steps = 2 ** (PIXEL.bits - 1);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(data[i] * steps) / steps;
  return low;
}

/** @param {AudioBuffer} buffer */
function peakOf(buffer) {
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    for (const s of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(s));
  }
  return peak || 1;
}

/**
 * Build the Voices section into `root`.
 * @param {HTMLElement} root
 * @param {ReturnType<typeof import('./audio.js').createAudio>} audio
 * @param {{ el: (tag: string, cls?: string, children?: (Node | string)[]) => HTMLElement,
 *   button: (label: string, click: () => void) => HTMLElement,
 *   slider: (value: number, change: (v: number) => void) => HTMLElement }} ui
 */
export async function voiceAudition(root, audio, { el, button, slider }, path = INDEX) {
  const main = path === INDEX;
  /** @type {Index} */
  let index;
  try {
    index = await fetchJson(path);
  } catch {
    root.append(el('h2', '', ['Voices (Task 122)']), el('p', 'bad', ['No voice clips yet: run npm.cmd run voices, then reload.']));
    return;
  }
  root.append(el('h2', '', [index.title ?? 'Voices (Task 122)']));
  if (!main) root.append(el('p', 'muted', ['Every commentary line in each version: speeds, and how the line ends (an end mark shapes the delivery). Tidied as the channel\'s clips are.']));
  else root.append(el('p', 'muted', ['Each commentary line in each candidate voice, made ahead of time on this machine (Kokoro and Piper); viewers would only get the chosen clips. The last column is this browser\'s own speech, which differs on every machine. Click a cell to play it, a line to hear it in every voice in turn, or a voice to hear all its lines.']));

  let level = 0.8;
  const opt = (/** @type {string} */ label, checked = false) => {
    const box = /** @type {HTMLInputElement} */ (el('input'));
    box.type = 'checkbox';
    box.checked = checked;
    return { box, node: el('label', '', [box, ` ${label}`]) };
  };
  const even = opt('even loudness', true);
  const crowd = opt('crowd roar underneath');
  const treatment = /** @type {HTMLSelectElement} */ (el('select'));
  for (const [value, label] of [['clean', 'clean'], ['tv', 'on air: TV band'], ['pixel', 'on air: TV band + pixel grit']]) {
    const o = /** @type {HTMLOptionElement} */ (el('option', '', [label]));
    o.value = value;
    treatment.append(o);
  }
  root.append(el('p', '', ['Voice level ', slider(level, (v) => { level = v; }), ' · ', even.node, ' · ', crowd.node, ' · ', treatment]));

  /** @type {Map<string, Promise<AudioBuffer>>} */
  const decoded = new Map();
  /** @param {string} url */
  const load = (url) => {
    const ctx = audio.context;
    if (!ctx) throw new Error('Start sound first');
    if (!decoded.has(url)) decoded.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)));
    return /** @type {Promise<AudioBuffer>} */ (decoded.get(url));
  };
  /** @type {HTMLElement | null} */
  let lit = null;
  /** @type {AudioScheduledSourceNode[]} */
  let playing = [];
  const stop = () => {
    for (const s of playing) { try { s.stop(); } catch { /* already over */ } }
    playing = [];
    speechSynthesis.cancel();
  };

  /**
   * Play one clip `delay` seconds from now through the chosen treatment; resolves to its length.
   * @param {string} url @param {number} delay @param {HTMLElement} cell
   */
  async function playClip(url, delay, cell) {
    const ctx = audio.context;
    const out = audio.output;
    if (!ctx || !out || !audio.on) return 0;
    let buffer = await load(url);
    const gain = level * (even.box.checked ? NORMAL_PEAK / peakOf(buffer) : 1);
    if (treatment.value === 'pixel') buffer = await pixelate(buffer);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    /** @type {AudioNode} */
    let into = g;
    if (treatment.value !== 'clean') {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = TV_BAND.low;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = TV_BAND.high;
      const squash = ctx.createDynamicsCompressor();
      g.connect(hp).connect(lp).connect(squash);
      into = squash;
    }
    into.connect(out);
    const at = ctx.currentTime + delay;
    src.connect(g);
    src.start(at);
    src.onended = () => into.disconnect();
    playing.push(src);
    if (crowd.box.checked) audio.play('roar', { seed: url, power: 0.8, delay: Math.max(0, delay - 0.15) });
    setTimeout(() => {
      lit?.classList.remove('lit');
      cell.classList.add('lit');
      lit = cell;
    }, delay * 1000);
    return buffer.duration;
  }
  /** Play several clips one after another. @param {[string, HTMLElement][]} clips */
  async function run(clips) {
    stop();
    let at = 0;
    for (const [url, cell] of clips) at += (await playClip(url, at, cell)) + RUN_GAP;
  }

  // The browser's own speech, with a voice picker (English voices only).
  const picker = /** @type {HTMLSelectElement} */ (el('select'));
  const fillPicker = () => {
    const voices = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
    picker.replaceChildren(...voices.map((v) => {
      const o = /** @type {HTMLOptionElement} */ (el('option', '', [`${v.name} (${v.lang})`]));
      o.value = v.name;
      return o;
    }));
  };
  fillPicker();
  speechSynthesis.addEventListener('voiceschanged', fillPicker);
  /** @param {Line} line @param {HTMLElement} cell */
  const speak = (line, cell) => {
    stop();
    const u = new SpeechSynthesisUtterance(line.say);
    u.voice = speechSynthesis.getVoices().find((v) => v.name === picker.value) ?? null;
    u.volume = level;
    speechSynthesis.speak(u);
    lit?.classList.remove('lit');
    cell.classList.add('lit');
    lit = cell;
  };

  const url = (/** @type {Voice} */ v, /** @type {Line} */ l) => (v.path ? `${v.path}/${l.id}.${v.ext ?? 'wav'}` : `output/voices/${v.dir ?? `${v.engine}/${v.id}`}/${l.id}.wav`);
  /** @type {Map<string, HTMLElement>} */
  const cells = new Map();
  const table = el('table', 'voices');
  // Column headings: each run of voices in the same group (Kokoro, Piper, or a try's versions).
  const groupOf = (/** @type {Voice} */ v) => v.group ?? (v.engine === 'piper' ? 'Piper' : 'Kokoro');
  /** @type {[string, number][]} */
  const groups = [];
  for (const v of index.voices) {
    const last = groups.at(-1);
    if (last && last[0] === groupOf(v)) last[1]++;
    else groups.push([groupOf(v), 1]);
  }
  table.append(el('tr', '', [
    el('th'),
    ...groups.map(([name, span]) => {
      const th = el('th', 'engine', [name]);
      th.setAttribute('colspan', String(span));
      return th;
    }),
    ...(main ? [el('th', 'engine', ['Browser'])] : []),
  ]));
  table.append(el('tr', '', [
    el('th', '', ['Line']),
    ...index.voices.map((v) => {
      const b = button(v.label, () => void run(index.lines.map((l) => [url(v, l), /** @type {HTMLElement} */ (cells.get(url(v, l)))])));
      b.title = `Play all its lines. ${v.licence ?? ''}`;
      // The whole discussion, this voice's lines between the other seat's.
      const talk = index.conversation ? [button('CONVERSATION', () => void run(/** @type {Turn[]} */ (index.conversation).map((x) => {
        const line = index.lines.find((l) => l.id === x.id);
        return line ? [url(v, line), /** @type {HTMLElement} */ (cells.get(url(v, line)))] : [/** @type {string} */ (x.clip), b];
      })))] : [];
      return el('th', '', [b, ...talk, el('div', 'muted small', [v.accent])]);
    }),
    ...(main ? [el('th', '', [picker])] : []),
  ]));
  for (const line of index.lines) {
    const row = el('tr');
    row.append(el('td', 'name', [button(line.text, () => void run(index.voices.map((v) => [url(v, line), /** @type {HTMLElement} */ (cells.get(url(v, line)))])))]));
    for (const v of index.voices) {
      const cell = el('td', 'cell');
      cell.append(button('▶', () => { stop(); void playClip(url(v, line), 0, cell); }));
      cells.set(url(v, line), cell);
      row.append(cell);
    }
    if (main) {
      const own = el('td', 'cell');
      own.append(button('▶', () => speak(line, own)));
      row.append(own);
    }
    table.append(row);
  }
  root.append(table, el('p', '', [button('Stop', stop)]));
}
