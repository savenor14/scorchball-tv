// The phone readout (phones, step 1; ?perf=1, on the live site too): perf.js's numbers in a small box in the bottom-left
// corner, with COPY (to paste the numbers to Claude), RESET (start "since" afresh, one test at a time) and a tap on its
// head to fold it away. It only shows numbers; nothing else changes. See docs/channel.md §27.
import { tallyLines } from '../perf.js';
import { PALETTE } from '../palette.js';
import { el } from './dom.js';

/** How often the box is redrawn, ms (not every frame: it's the DOM). */
const REFRESH_MS = 500;

/** Main-thread stalls over 50 ms, where the browser reports them (Chrome's long tasks; not Firefox). */
let longTasks = /** @type {number | null} */ (null);
let longWorstMs = 0;
try {
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      longTasks = (longTasks ?? 0) + 1;
      longWorstMs = Math.max(longWorstMs, e.duration);
    }
  }).observe({ type: 'longtask', buffered: true });
  longTasks = 0;
} catch {
  // Not reported here.
}

/** @param {number | null | undefined} n @param {number} [d] */
const num = (n, d = 0) => (typeof n === 'number' && Number.isFinite(n) ? n.toFixed(d) : '-');

/**
 * The readout's lines above the numbers: the browser and screen, the picture's sizes, what's on, the sound's state.
 * @param {AudioContext | null} ac
 * @param {{ layout: string, on: string, sound: boolean, rendering: number, crowdReadyMs: number | null, recorded: boolean, lead: number, built: number, trimmed: number, buildMs: number, sharp: HTMLCanvasElement, switches: string }} o
 */
export function perfInfo(ac, o) {
  const dpr = window.devicePixelRatio || 1;
  const lines = [
    navigator.userAgent,
    `screen ${innerWidth}×${innerHeight} css px @${num(dpr, 2)} · sharp text layer ${o.sharp.width}×${o.sharp.height} (${num((o.sharp.width * o.sharp.height) / 1e6, 1)} Mpx) · league built in ${num(o.buildMs)} ms`,
    `layout ${o.layout} · on air: ${o.on} · tab ${document.visibilityState} · switches: ${o.switches}`,
  ];
  if (!ac) lines.push('sound: not started (tap the speaker)');
  else {
    // Chrome's playback stats, where it has them (underruns: the sound card ran dry, a pop or a drop).
    const stats = /** @type {any} */ (ac).playbackStats;
    const st = stats ? Object.entries(Object.getOwnPropertyDescriptors(Object.getPrototypeOf(stats))).filter(([, d]) => d.get).map(([k]) => `${k} ${num(stats[k], 3)}`).join(', ') : null;
    lines.push(`sound ${o.sound ? 'on' : 'off'} · context ${ac.state} ${ac.sampleRate} Hz · base latency ${num(ac.baseLatency * 1000)} ms · output latency ${num(/** @type {any} */ (ac).outputLatency * 1000)} ms`);
    lines.push(`sounds started ${num(o.lead * 1000)} ms ahead of the picture (to be heard on time) · from ${o.recorded ? `recordings (built here ${o.built}, trimmed ${o.trimmed})` : 'the browser'}`);
    lines.push(`renders waiting ${o.rendering} · crowd takes ready ${o.crowdReadyMs === null ? 'not yet' : `after ${num(o.crowdReadyMs / 1000, 1)} s`}${st ? ` · playback: ${st}` : ''}`);
  }
  lines.push(longTasks === null ? 'long tasks: not reported by this browser' : `long tasks (over 50 ms) ${longTasks}, worst ${num(longWorstMs)} ms`);
  return lines;
}

/**
 * @param {ReturnType<typeof import('../perf.js').createPerf>} perf
 * @param {() => string[]} info  The lines above the numbers: the device, the layout, what's on, the sound.
 */
export function createPerfView(perf, info) {
  const text = el('pre', 'perf-text');
  const copy = el('button', '', ['COPY']);
  const reset = el('button', '', ['RESET']);
  const head = el('div', 'perf-head', ['PERF ', copy, ' ', reset]);
  const box = el('div', 'perf', [head, text]);
  box.style.cssText = 'position:fixed;left:4px;bottom:4px;z-index:9999;max-width:calc(100vw - 8px);max-height:calc(75vh);overflow:auto;'
    + `background:rgba(0,0,0,0.8);color:#d8ffd8;font:11px/1.25 monospace;padding:4px 6px;border:1px solid ${PALETTE.accent};`;
  text.style.cssText = 'margin:4px 0 0;white-space:pre-wrap;';
  for (const b of [copy, reset]) b.style.cssText = `font:11px monospace;padding:4px 8px;background:${PALETTE.accent};color:#000;border:0;margin-left:4px;`;
  head.style.cssText = 'cursor:pointer;';
  // Its clicks and keys are its own: nothing on the channel behind it reacts.
  box.addEventListener('pointerdown', (e) => e.stopPropagation());
  box.addEventListener('click', (e) => e.stopPropagation());
  head.addEventListener('click', (e) => {
    if (e.target === head) text.hidden = !text.hidden;
  });
  const report = () => [...info(), ...tallyLines(perf.recent, 'NOW (last 5 s)'), ...tallyLines(perf.total, 'SINCE START/RESET')].join('\n');
  copy.addEventListener('click', async () => {
    const all = report();
    try {
      await navigator.clipboard.writeText(all);
      copy.textContent = 'COPIED';
    } catch {
      // No clipboard (an old browser, or refused): the text selected, to copy by hand.
      const range = document.createRange();
      range.selectNodeContents(text);
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(range);
      copy.textContent = 'SELECTED';
    }
    setTimeout(() => { copy.textContent = 'COPY'; }, 1500);
  });
  reset.addEventListener('click', () => perf.reset());
  document.body.append(box);
  setInterval(() => {
    if (!text.hidden) text.textContent = report();
  }, REFRESH_MS);
}
