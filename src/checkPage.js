// The every-browser check's page (check.html; the launch, Task 270, docs/live.md §6): plays the throwaway check league
// and compares its fingerprint with Node's (check.json, written by npm run publish). In a file of its own, not inline,
// so the site's content security policy can allow scripts from the site only (the security pass, 2026-10-16).
import { loadConfig } from './config.js';
import { leagueFingerprint } from './sim/leagueCheck.js';

const facts = /** @type {HTMLElement} */ (document.getElementById('facts'));
const verdict = /** @type {HTMLElement} */ (document.getElementById('verdict'));
/** @param {string} k @param {string} v */
const row = (k, v) => facts.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
try {
  const expected = await (await fetch('check.json', { cache: 'no-store' })).json();
  const config = await loadConfig(async (p) => (await fetch(p, { cache: 'no-store' })).text());
  await new Promise((r) => setTimeout(r, 50));
  const t0 = performance.now();
  const got = leagueFingerprint(config, { seed: expected.seed, seasons: expected.seasons });
  const ok = got.hash === expected.hash && got.events === expected.events;
  verdict.textContent = ok ? 'PASS' : 'FAIL';
  verdict.className = ok ? 'pass' : 'fail';
  row('This browser', navigator.userAgent);
  row('Seasons', `${got.seasons} (seed "${got.seed}") in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  row('Events', `${got.events.toLocaleString('en-US')} (Node: ${expected.events.toLocaleString('en-US')})`);
  row('Fingerprint', `${got.hash} (Node ${expected.node}: ${expected.hash})`);
} catch (err) {
  verdict.textContent = 'COULD NOT RUN';
  verdict.className = 'fail';
  row('Error', String(err));
}
