// The surname try-out on the sound board (Task 244): each surname voiced on its own (`npm run voices -- --try-names`),
// played alone, joined to a line already made (a commentator's goal call, a desk line ending on the name or following
// it), and beside a whole sentence with the name inside, to judge whether joined clips pass for one take. The gap
// between the two clips is a slider. Dev page only.

const INDEX = 'output/voices/try-names/index.json';
/** How loud the clips play (they're evened out to the same peak when made). */
const LEVEL = 0.8;

/**
 * @typedef {{ id: string, label: string, role: 'commentator' | 'desk' }} TryVoice
 * @typedef {{ title: string, names: { name: string, region: string }[], whole: string[], carriers: { into: string, after: string }, voices: TryVoice[] }} TryIndex
 */

/**
 * Build the Names joined section into `root`; a note if the clips aren't made yet.
 * @param {HTMLElement} root @param {ReturnType<typeof import('./audio.js').createAudio>} audio
 * @param {{ el: (tag: string, cls?: string, children?: (Node | string)[]) => HTMLElement,
 *   button: (label: string, click: () => void) => HTMLElement,
 *   slider: (value: number, change: (v: number) => void) => HTMLElement }} ui
 */
export async function nameTryout(root, audio, { el, button, slider }) {
  root.append(el('h2', '', ['Names joined (Task 244)']));
  /** @type {TryIndex} */
  let index;
  try {
    const res = await fetch(INDEX, { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    index = await res.json();
  } catch {
    root.append(el('p', 'bad', ['No name clips yet: run npm.cmd run voices -- --try-names, then reload.']));
    return;
  }
  root.append(el('p', 'muted', [
    'Can a surname voiced on its own be joined to a line already made? Each name alone, then joined: after the commentator\'s "Goal!", opening "What a scorcher!", ending the desk\'s "',
    index.carriers.into, '", opening the desk\'s "', index.carriers.after, '". "whole" is the same said in one take (the first names only), to hear the joins beside it. Click Start sound first.',
  ]));
  let gap = 0.15;
  const gapLabel = el('span', '', [`${Math.round(gap * 1000)} ms`]);
  // The slider's 0..1 maps to 0..0.6 s.
  root.append(el('p', '', ['Gap between the clips ', slider(gap / 0.6, (v) => { gap = v * 0.6; gapLabel.textContent = `${Math.round(gap * 1000)} ms`; }), ' ', gapLabel]));

  /** @type {Map<string, Promise<AudioBuffer>>} */
  const decoded = new Map();
  const load = (/** @type {string} */ url) => {
    const ctx = /** @type {AudioContext} */ (audio.context);
    if (!decoded.has(url)) decoded.set(url, fetch(url).then((r) => r.arrayBuffer()).then((b) => ctx.decodeAudioData(b)));
    return /** @type {Promise<AudioBuffer>} */ (decoded.get(url));
  };
  /** @type {AudioScheduledSourceNode[]} */
  let playing = [];
  /** Play clips one after another, `gap` apart. @param {string[]} urls */
  const play = async (urls) => {
    const ctx = audio.context;
    const out = audio.output;
    if (!ctx || !out || !audio.on) return;
    for (const s of playing) { try { s.stop(); } catch { /* over */ } }
    playing = [];
    const buffers = await Promise.all(urls.map(load));
    let at = ctx.currentTime + 0.05;
    for (const b of buffers) {
      const src = ctx.createBufferSource();
      src.buffer = b;
      const g = ctx.createGain();
      g.gain.value = LEVEL;
      src.connect(g).connect(out);
      src.start(at);
      playing.push(src);
      at += b.duration + gap;
    }
  };

  const mine = (/** @type {TryVoice} */ v, /** @type {string} */ id) => `output/voices/try-names/${v.id}/${id}.wav`;
  const theirs = (/** @type {TryVoice} */ v, /** @type {string} */ line) => `assets/voices/${v.id}/${line}.mp3`;
  /** The ways each voice is heard: [heading, the clips for a name, or null for none]. */
  const ways = (/** @type {TryVoice} */ v) => /** @type {[string, (n: string) => string[] | null][]} */ (v.role === 'commentator'
    ? [
      ['alone', (n) => [mine(v, n)]],
      ['Goal! + name', (n) => [theirs(v, 'goal'), mine(v, n)]],
      ['whole', (n) => (index.whole.includes(n) ? [mine(v, `whole-goal-${n}`)] : null)],
      ['name + What a scorcher!', (n) => [mine(v, n), theirs(v, 'scorcher_what')]],
    ]
    : [
      ['alone', (n) => [mine(v, n)]],
      ['…match, + name', (n) => [mine(v, 'carrier-into'), mine(v, n)]],
      ['whole', (n) => (index.whole.includes(n) ? [mine(v, `whole-into-${n}`)] : null)],
      ['name + What a game…', (n) => [mine(v, n), mine(v, 'carrier-after')]],
      ['whole', (n) => (index.whole.slice(0, 2).includes(n) ? [mine(v, `whole-after-${n}`)] : null)],
    ]);

  const table = el('table', 'voices');
  table.append(el('tr', '', [el('th'), ...index.voices.map((v) => {
    const th = el('th', 'engine', [v.label]);
    th.setAttribute('colspan', String(ways(v).length));
    return th;
  })]));
  table.append(el('tr', '', [el('th', '', ['Name']), ...index.voices.flatMap((v) => ways(v).map(([h]) => el('th', 'small', [h])))]));
  for (const { name, region } of index.names) {
    table.append(el('tr', '', [
      el('td', 'name', [name, el('div', 'muted small', [region])]),
      ...index.voices.flatMap((v) => ways(v).map(([, clips]) => {
        const urls = clips(name);
        return el('td', 'cell', urls ? [button('▶', () => void play(urls))] : []);
      })),
    ]));
  }
  root.append(table);
}
