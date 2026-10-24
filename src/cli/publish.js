// What goes on the host (the launch, Task 269; docs/live.md §7): copies only what the channel needs into dist/, which
// Cloudflare Pages serves. A copy, not a build: the code is served as written. Left out: the dev pages, the Director's
// desk and its code, the CLI, tests, docs, output/, and the desk's own data (rejections, the roadmap).
// Usage: npm run publish [-- --out dist]   (Cloudflare runs `node src/cli/publish.js` on every deploy)
import { access, cp, mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { leagueFingerprint } from '../sim/leagueCheck.js';
import { checkHistory } from './historyCheck.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

/**
 * What the channel loads, relative to the project root: index.html and the folders its modules, config and clips come
 * from; check.html, the every-browser check (Task 270); keys/, the day keys (Task 271), and snapshots/ (Task 272), once
 * there are any; the About page, the write-up (how-it-was-built.html), robots.txt and the sitemap (the SEO basics, docs/launch-plan.md; the host serves
 * about.html at /about; both style from assets/page.css).
 */
export const PUBLISHED = ['index.html', 'manifest.webmanifest', 'check.html', 'about.html', 'how-it-was-built.html', 'robots.txt', 'sitemap.xml', 'src', 'config', 'data', 'assets', 'keys', 'snapshots'];

/** Published only if they exist. */
const OPTIONAL = new Set(['keys', 'snapshots']);

/** Paths under PUBLISHED that stay off the host (forward slashes, relative to the root). */
export const LEFT_OUT = ['src/cli', 'src/director', 'data/rejections.json', 'data/roadmap.json'];

/** The published pages' own scripts: only what these load is published of src/ (the security pass, 2026-10-16). */
export const ENTRY_SCRIPTS = ['src/channel/main.js', 'src/checkPage.js'];

/**
 * Every script the entries load (their imports, and workers started from a `new URL('./x.js', import.meta.url)`),
 * forward-slash paths relative to the root. So the dev pages' scripts (the mock-up sheets, the counting tools) stay off
 * the host. Imports written as types in comments are skipped.
 * @param {string} root @param {string[]} entries
 * @returns {Promise<Set<string>>}
 */
export async function moduleGraph(root, entries) {
  const { readFile } = await import('node:fs/promises');
  const { posix } = await import('node:path');
  const seen = new Set();
  const todo = [...entries];
  while (todo.length) {
    const file = /** @type {string} */ (todo.pop());
    if (seen.has(file)) continue;
    seen.add(file);
    const text = await readFile(resolve(root, file), 'utf8').catch(() => '');
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of code.matchAll(/(?:^|[\s;])(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.{1,2}\/[^'"]+)['"]|(?:^|[\s;])import\s*['"](\.{1,2}\/[^'"]+)['"]|\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)|new URL\(\s*['"](\.{1,2}\/[^'"]+\.js)['"]/gm)) {
      const rel = m[1] ?? m[2] ?? m[3] ?? m[4];
      todo.push(posix.normalize(posix.join(posix.dirname(file), rel)));
    }
  }
  return seen;
}

/**
 * The secrets a published file must never hold (the security pass): every value in the root's .env (8 characters or
 * more), and the live seed and the keys if they're in the environment (Cloudflare's or the daily job's).
 * @param {string} root @returns {Promise<{ name: string, value: string }[]>}
 */
export async function secretsOf(root) {
  const { readFile } = await import('node:fs/promises');
  /** @type {Map<string, string>} */
  const found = new Map();
  const env = await readFile(resolve(root, '.env'), 'utf8').catch(() => '');
  for (const line of env.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) found.set(m[1], m[2].trim().replace(/^(['"])(.*)\1$/, '$2'));
  }
  for (const name of ['SCORCHBALL_SEED', 'ELEVENLABS_API_KEY', 'AUDIENCE_TOKEN', 'DIRECTOR_TOKEN', 'VOTE_SALT']) if (process.env[name]) found.set(name, /** @type {string} */ (process.env[name]));
  return [...found].filter(([, value]) => value.length >= 8).map(([name, value]) => ({ name, value }));
}

/** Text files a secret could hide in (the rest are sounds, fonts and pictures). */
const TEXT = /\.(js|json|html|css|txt|xml|webmanifest|svg|map)$|(^|\/)_headers$/;

/**
 * Published files holding a secret's value: the file and the secret's name, never the value.
 * @param {string} out @param {{ name: string, value: string }[]} secrets
 * @returns {Promise<{ path: string, name: string }[]>}
 */
export async function secretsIn(out, secrets) {
  const { readFile } = await import('node:fs/promises');
  /** @type {{ path: string, name: string }[]} */
  const hits = [];
  if (!secrets.length) return hits;
  await walk(out, async (file) => {
    const path = relative(out, file).split(sep).join('/');
    if (!TEXT.test(path)) return;
    const text = await readFile(file, 'utf8');
    for (const s of secrets) if (text.includes(s.value)) hits.push({ path, name: s.name });
  });
  return hits;
}

/**
 * Without a 404.html, Cloudflare Pages answers every missing path with index.html and a 200 (its single-page-app
 * fallback), so a missing clip or data file would look found. With one, a missing path is a real 404.
 */
export const NOT_FOUND_PAGE = '<!doctype html>\n<meta charset="utf-8">\n<title>Not found</title>\n<p>Nothing here. <a href="/">Back to the channel.</a></p>\n';

/**
 * Names ad blockers and tracker lists block (uBlock Origin stopped check.html at fingerprint.js, Task 270): one blocked
 * module stops the whole page, so no published file may look like an ad or a tracker. The in-universe ads live in
 * spots.js and data/spots.json for this reason.
 */
export const BLOCKED_LOOKING = [
  /(^|[/._-])ads?([/._-]|$)|advert|banner|sponsor|track(er|ing)|analytic|fingerprint|beacon|popup|doubleclick/i,
  /(^|[/._-])ad[A-Z_-]/, // adKit.js, ad_art.js (case matters: address.js is fine)
];

/** Published paths that look like an ad or a tracker to a blocker. @param {string[]} paths */
export function blockedLooking(paths) {
  return paths.filter((p) => BLOCKED_LOOKING.some((re) => re.test(p)));
}

/**
 * The page's content security policy (the security pass): scripts, workers, data and fonts from the site only; styles
 * from it or inline; pictures from it or made in the page (canvas data and blobs); never in another site's frame.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "media-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

/**
 * Cloudflare Pages' _headers (Task 274): code and data are checked on every load (Pages' own default, so a deploy
 * reaches the next load), the voices and the font kept for a day (they rarely change; a remade clip arrives within a
 * day), version.json never kept (the channel's update check asks for it every few minutes). The clips' lengths
 * (lengths.json) are data the talk is timed by: checked each load like the rest (`!` takes off the voices' rule). The
 * recordings (phones) carry their recipe's hash in their names, so a re-recorded sound is a new file: kept a year; their
 * index is checked each load.
 */
export const HEADERS = [
  // The security pass (2026-10-16; docs/live.md §7): everything from the site itself (inline styles allowed: the page
  // and its overlays set them; no inline script), never framed, no sniffing, a quiet referrer, no device features, HTTPS
  // only. The content policy was report-only until the rehearsal showed nothing it would block; enforced from
  // 2026-10-17 (X-Frame-Options kept for older browsers beside frame-ancestors).
  '/*',
  `  Content-Security-Policy: ${CSP}`,
  '  X-Frame-Options: DENY',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  '  Strict-Transport-Security: max-age=31536000',
  '  Cross-Origin-Opener-Policy: same-origin',
  '/assets/voices/*', '  Cache-Control: public, max-age=86400',
  '/assets/voices/lengths.json', '  ! Cache-Control', '  Cache-Control: public, max-age=0, must-revalidate',
  '/assets/fonts/*', '  Cache-Control: public, max-age=86400',
  '/assets/sounds/*', '  Cache-Control: public, max-age=31536000, immutable',
  '/assets/sounds/index.json', '  ! Cache-Control', '  Cache-Control: public, max-age=0, must-revalidate',
  '/version.json', '  Cache-Control: no-store',
  '',
].join('\n');

/**
 * This deploy's version (version.json, Task 274): Cloudflare's commit, else git's, else the time; the channel reloads or
 * offers UPDATE READY when it changes.
 */
export function deployVersion() {
  if (process.env.CF_PAGES_COMMIT_SHA) return process.env.CF_PAGES_COMMIT_SHA;
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return `t${Date.now()}`;
  }
}

/** Cloudflare Pages' limits on the Free plan (developers.cloudflare.com/pages/platform/limits, 2026-10-11). */
export const LIMITS = { files: 20000, fileBytes: 25 * 1024 * 1024 };

/**
 * Copy the published files from `root` into `out` (emptied first), with check.json: Node's fingerprint of the check
 * league, for check.html to compare with the browser's (Task 270).
 * @param {string} root @param {string} out @param {{ fingerprint?: boolean, version?: string }} [options]
 * @returns {Promise<{ files: number, bytes: number, largest: { path: string, bytes: number }, paths: string[] }>}
 */
export async function publish(root, out, options = { fingerprint: true }) {
  // options.version: a fixed version (the tests).
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  const leftOut = new Set(LEFT_OUT.map((p) => resolve(root, p)));
  // Of src/'s scripts, only those the published pages load (the dev pages' sheets and tools stay off the host).
  const loaded = new Set([...(await moduleGraph(root, ENTRY_SCRIPTS))].map((p) => resolve(root, p)));
  const srcDir = resolve(root, 'src') + sep;
  const keep = (/** @type {string} */ src) => {
    const at = resolve(src);
    if (leftOut.has(at)) return false;
    return !(at.startsWith(srcDir) && at.endsWith('.js')) || loaded.has(at);
  };
  for (const p of PUBLISHED) {
    if (OPTIONAL.has(p) && !(await access(resolve(root, p)).then(() => true, () => false))) continue;
    await cp(resolve(root, p), resolve(out, p), { recursive: true, filter: keep });
  }
  await writeFile(resolve(out, '404.html'), NOT_FOUND_PAGE);
  await writeFile(resolve(out, '_headers'), HEADERS);
  await writeFile(resolve(out, 'version.json'), `${JSON.stringify({ version: options.version ?? deployVersion() })}\n`);
  if (options.fingerprint) {
    const config = await loadConfigFromDisk();
    await writeFile(resolve(out, 'check.json'), `${JSON.stringify({ ...leagueFingerprint(config), node: process.version })}\n`);
  }
  const totals = { files: 0, bytes: 0, largest: { path: '', bytes: 0 }, paths: /** @type {string[]} */ ([]) };
  await walk(out, async (file) => {
    const { size } = await stat(file);
    totals.files += 1;
    totals.paths.push(relative(out, file).split(sep).join('/'));
    totals.bytes += size;
    if (size > totals.largest.bytes) totals.largest = { path: relative(out, file).split(sep).join('/'), bytes: size };
  });
  return totals;
}

/** @param {string} dir @param {(file: string) => Promise<void>} visit */
async function walk(dir, visit) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await walk(path, visit);
    else await visit(path);
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { out: { type: 'string', default: 'dist' } } });
  const root = resolve(import.meta.dirname, '..', '..');
  // The history check first (Task 272): new code must play every published day as it was first played.
  const history = checkHistory(await loadConfigFromDisk(), root);
  if (history) {
    if (history.problems.length) {
      console.error(`History check failed: this code plays published days differently (from ${history.from}):\n  ${history.problems.slice(0, 20).join('\n  ')}`);
      process.exit(1);
    }
    console.log(`History check: ${history.checked} matches as first played, from ${history.from}.`);
  }
  const totals = await publish(root, resolve(root, values.out));
  const mb = (/** @type {number} */ b) => (b / 1024 / 1024).toFixed(1);
  console.log(`Published ${totals.files} files, ${mb(totals.bytes)} MB, into ${values.out}/; the largest ${totals.largest.path} (${mb(totals.largest.bytes)} MB).`);
  const over = [];
  if (totals.files > LIMITS.files) over.push(`${totals.files} files, over the host's ${LIMITS.files}`);
  if (totals.largest.bytes > LIMITS.fileBytes) over.push(`${totals.largest.path} is over the host's ${mb(LIMITS.fileBytes)} MB a file`);
  const blocked = blockedLooking(totals.paths);
  if (blocked.length) over.push(`named like an ad or a tracker, which blockers stop: ${blocked.join(', ')}`);
  // No secret's value anywhere on the host (the security pass): named, never printed.
  const leaks = await secretsIn(resolve(root, values.out), await secretsOf(root));
  if (leaks.length) over.push(`a secret's value is in ${leaks.map((l) => `${l.path} (${l.name})`).join(', ')}`);
  if (over.length) {
    console.error(`Can't publish: ${over.join('; ')}.`);
    process.exit(1);
  }
  console.log(`Room left: ${LIMITS.files - totals.files} files.`);
}
