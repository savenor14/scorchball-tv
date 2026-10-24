// Dev page (clipends.html; Tom, 2026-10-14; docs/tasks.md): the voice clips the scan flagged as ending with sound still
// going (node src/cli/clipEnds.js, output/clip-ends.json), grouped by how much is left in the last 50 ms against the
// clip's speech, a sample of each group to play and mark CUT or FINE, so the line between a clip cut off and one that
// only sounds a little abrupt is set by ear before any re-voicing. Marks are kept in this browser; COPY MARKS to send.
import { createRng } from '../sim/rng.js';

/** The groups, by the scan's score. */
const BANDS = [[0.04, 0.06], [0.06, 0.08], [0.08, 0.1], [0.1, 0.15], [0.15, 0.2], [0.2, 0.3], [0.3, 2]];
/** Clips sampled a group. */
const SAMPLE = 12;
const MARKS_KEY = 'scorchball.clipMarks';

/** @param {string} path */
async function getJson(path) {
  const res = await fetch(path, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

/** @param {string} tag @param {string} [cls] @param {(Node | string)[]} [children] */
function el(tag, cls = '', children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children);
  return node;
}

const status = /** @type {HTMLElement} */ (document.getElementById('status'));
try {
  const [scan, studio, interviews, commentary, redo, before] = await Promise.all([
    getJson('output/clip-ends.json'), getJson('data/studio.json'), getJson('data/interviews.json'), getJson('data/commentary.json'),
    getJson('output/clip-redo.json').catch(() => []), getJson('output/clip-ends-before.json').catch(() => ({ cut: [] })),
  ]);
  /** @type {Record<string, 'cut' | 'fine'>} */
  let marks = {};
  try { marks = JSON.parse(localStorage.getItem(MARKS_KEY) ?? '{}'); } catch { /* not kept */ }
  const save = () => { try { localStorage.setItem(MARKS_KEY, JSON.stringify(marks)); } catch { /* not kept */ } };

  /** A clip's words, where the data has them (best effort). @param {string} clip */
  const wordsOf = (clip) => {
    const [top, who, rawName] = clip.split('/');
    const name = rawName ?? who;
    const ways = (/** @type {any} */ list, /** @type {number} */ i) => list?.[i]?.say ?? list?.[i] ?? '';
    if (top === 'desk') {
      const m = /^([A-Za-z]+)-(\d+)(?:-(.+))?$/.exec(name);
      if (!m) return '';
      const say = ways(studio.lines?.[m[1]]?.ways, Number(m[2]));
      return m[3] ? `${say}  [${m[3]}]` : say;
    }
    if (top === 'interview') {
      const r = /^reaction-(\w+)-(\d+)$/.exec(name);
      if (r) return ways(interviews.reactions?.[r[1]], Number(r[2]));
      const f = /^fact-([a-z_]+)(?:-[a-z_]+)?-(\d+)$/.exec(name);
      if (f) return ways(interviews.facts?.[f[1]], Number(f[2]));
      return '';
    }
    const id = top.startsWith('el_') && who === 'names' ? (rawName ?? '').replace(/-[a-z]+$/, '') : who;
    const line = commentary.lines?.find((/** @type {any} */ l) => l.id === id);
    return line?.say ?? '';
  };

  /** @type {HTMLAudioElement | null} */
  let playing = null;
  const root = /** @type {HTMLElement} */ (document.getElementById('bands'));
  const summary = () => {
    const counts = BANDS.map(([lo, hi]) => {
      const inBand = scan.cut.filter((/** @type {any} */ c) => c.share >= lo && c.share < hi);
      const marked = inBand.filter((/** @type {any} */ c) => marks[c.clip]);
      const cut = marked.filter((/** @type {any} */ c) => marks[c.clip] === 'cut').length;
      return `${lo.toFixed(2)}–${hi > 1 ? '…' : hi.toFixed(2)}: ${cut} cut of ${marked.length} marked`;
    });
    status.textContent = `${scan.clips} clips scanned, ${scan.cut.length} flagged. ${counts.join(' · ')}`;
  };
  // The re-voiced clips (2026-10-14): each old take (kept in output/clip-redo-backup/) beside the new, Hedrek's
  // wrap-ups first, then the rest from the worst before.
  if (redo.length) {
    const was = new Map(before.cut.map((/** @type {any} */ c) => [c.clip, c.share]));
    const now = new Map(scan.cut.map((/** @type {any} */ c) => [c.clip, c.share]));
    const first = ['desk/hedrek/wrapUp-1', 'desk/hedrek/wrapUp-3'];
    const order = [...first, ...redo.filter((/** @type {string} */ c) => !first.includes(c)).sort((a, b) => (was.get(b) ?? 0) - (was.get(a) ?? 0))];
    root.append(el('h2', '', [`RE-VOICED: ${redo.length} clips, the old take beside the new (score before → after)`]));
    const table = el('table');
    for (const clip of order.slice(0, 60)) {
      /** @param {string} label @param {string} url */
      const play = (label, url) => {
        const b = el('button', '', [label]);
        b.addEventListener('click', () => {
          playing?.pause();
          playing = new Audio(url);
          void playing.play();
        });
        return b;
      };
      table.append(el('tr', '', [
        el('td', 'p', [play('▶ OLD', `output/clip-redo-backup/${clip}.mp3`), play('▶ NEW', `assets/voices/${clip}.mp3?new`)]),
        el('td', 's', [`${(was.get(clip) ?? 0).toFixed(2)} → ${(now.get(clip) ?? 0).toFixed(2)}`]),
        el('td', 'c', [clip]),
        el('td', 'w', [wordsOf(clip)]),
      ]));
    }
    root.append(table, el('h2', '', ['STILL FLAGGED, BY SCORE (a sample of each)']));
  }
  for (const [lo, hi] of BANDS) {
    const inBand = scan.cut.filter((/** @type {any} */ c) => c.share >= lo && c.share < hi);
    const rng = createRng(`clipends|${lo}`);
    const pick = [...inBand].sort(() => 0).map((c) => ({ c, k: rng.float(0, 1) })).sort((a, b) => a.k - b.k).slice(0, SAMPLE).map((x) => x.c);
    root.append(el('h2', '', [`${lo.toFixed(2)} to ${hi > 1 ? 'the top' : hi.toFixed(2)}: ${inBand.length} clips (${pick.length} shown)`]));
    const table = el('table');
    for (const c of pick) {
      const play = el('button', '', ['▶']);
      play.addEventListener('click', () => {
        playing?.pause();
        playing = new Audio(`assets/voices/${c.clip}.mp3`);
        void playing.play();
      });
      /** @param {'cut' | 'fine'} m @param {string} label */
      const mark = (m, label) => {
        const b = el('button', marks[c.clip] === m ? `on ${m}` : '', [label]);
        b.addEventListener('click', () => {
          if (marks[c.clip] === m) delete marks[c.clip];
          else marks[c.clip] = m;
          save();
          row.querySelectorAll('.m button').forEach((x) => x.classList.remove('on', 'cut', 'fine'));
          if (marks[c.clip]) b.classList.add('on', m);
          summary();
        });
        return b;
      };
      const row = el('tr', '', [
        el('td', 'p', [play]),
        el('td', 'm', [mark('cut', 'CUT'), mark('fine', 'FINE')]),
        el('td', 's', [c.share.toFixed(3)]),
        el('td', 'c', [c.clip]),
        el('td', 'w', [wordsOf(c.clip)]),
      ]);
      table.append(row);
    }
    root.append(table);
  }
  const copy = /** @type {HTMLElement} */ (document.getElementById('copy'));
  copy.addEventListener('click', async () => {
    const text = `${status.textContent}\n${Object.entries(marks).map(([k, v]) => `${v.toUpperCase()} ${k}`).join('\n')}`;
    try { await navigator.clipboard.writeText(text); copy.textContent = 'COPIED'; } catch { copy.textContent = 'COPY FAILED'; }
    setTimeout(() => { copy.textContent = 'COPY MARKS'; }, 1500);
  });
  summary();
} catch (err) {
  status.textContent = `Could not start: ${err instanceof Error ? err.message : err} (run node src/cli/clipEnds.js first).`;
}
