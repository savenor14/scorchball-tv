// Dev page (rulebook.html; Tasks 163–164): the Rulebook and About as the channel shows them, opened by its own buttons
// in the real pane (86 px, Tom's pick), with how many screens each page fills, to check after the words change.
// Task 163's choices (contents list, one page, capitals, the 226 px pane) were decided: tabs, mixed case, 86 px.
import { loadConfig } from '../config.js';
import { rulebook } from './rulebook.js';

/** @param {string} path */
async function fetchText(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}

const book = rulebook(await loadConfig(fetchText));
const frame = /** @type {HTMLIFrameElement} */ (document.getElementById('channel'));
const doc = () => /** @type {Document} */ (frame.contentDocument);
const ready = () => !!doc()?.getElementById('pane') && !doc().getElementById('stage')?.hidden && doc().querySelectorAll('#buttons .icon-btn').length === 5;
/** The channel's own button for a pane. @param {'rulebook' | 'about'} id */
const button = (id) => /** @type {HTMLElement} */ (doc().querySelectorAll('#buttons .icon-btn')[id === 'rulebook' ? 1 : 4]);
const openTitle = () => (doc().getElementById('pane')?.hidden ? null : doc().querySelector('.pane-title')?.textContent);
/** Open a pane with the channel's own button, unless it's the one open. @param {'rulebook' | 'about'} id */
function open(id) {
  if (openTitle() !== (id === 'about' ? 'INFO' : 'RULEBOOK')) button(id).click();
}

/** How many screens of the pane's body each page fills: each tab, then About. */
function measure() {
  const body = /** @type {HTMLElement} */ (doc().querySelector('.pane-body'));
  const screens = () => (body.scrollHeight / body.clientHeight).toFixed(1);
  open('rulebook');
  const tabs = /** @type {HTMLElement[]} */ ([...doc().querySelectorAll('.pane-bar .guide-filter')]);
  const rows = tabs.map((t) => { t.click(); return [`Rulebook: ${t.textContent}`, screens()]; });
  tabs[0]?.click();
  open('about');
  const aboutTabs = /** @type {HTMLElement[]} */ ([...doc().querySelectorAll('.pane-bar .guide-filter')]);
  aboutTabs[0]?.click();
  rows.push(['About', screens()]);
  aboutTabs[1]?.click();
  rows.push(['About: guide', screens()]);
  aboutTabs[0]?.click();
  open('rulebook');
  /** @type {HTMLElement} */ (document.getElementById('measure')).innerHTML = `<tr><th>Page</th><th>Screens at 86 px</th></tr>${rows.map(([n, s]) => `<tr><td>${n}</td><td>${s}</td></tr>`).join('')}`;
}

for (const b of document.querySelectorAll('[data-open]')) {
  b.addEventListener('click', () => open(/** @type {'rulebook' | 'about'} */ (/** @type {HTMLElement} */ (b).dataset.open)));
}

// The picture takes a moment to build its league; measured once its font is in (the fallback font runs longer).
const timer = setInterval(() => {
  if (!ready()) return;
  clearInterval(timer);
  doc().fonts.load('10px VT323').then(measure);
}, 300);
