import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, access, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { publish, PUBLISHED, LEFT_OUT, blockedLooking } from '../src/cli/publish.js';

const exists = (/** @type {string} */ p) => access(p).then(() => true, () => false);

test('publish copies the channel and leaves the dev pages, the desk and its data off the host', async () => {
  const root = await mkdtemp(join(tmpdir(), 'publish-'));
  try {
    const files = ['index.html', 'manifest.webmanifest', 'check.html', 'about.html', 'how-it-was-built.html', 'robots.txt', 'sitemap.xml', 'kits.html', 'director.html', 'src/channel/main.js', 'src/cli/serve.js', 'src/director/watchers.js', 'config/settings.json', 'data/teams.json', 'data/rejections.json', 'data/roadmap.json', 'assets/voices/a.mp3', 'tests/x.test.js', 'docs/live.md'];
    for (const f of files) {
      await mkdir(join(root, f, '..'), { recursive: true });
      await writeFile(join(root, f), 'x');
    }
    const out = join(root, 'dist');
    const totals = await publish(root, out, { fingerprint: false, version: 'test-version' });
    for (const f of ['index.html', 'manifest.webmanifest', 'check.html', 'about.html', 'how-it-was-built.html', 'robots.txt', 'sitemap.xml', '404.html', '_headers', 'version.json', 'src/channel/main.js', 'config/settings.json', 'data/teams.json', 'assets/voices/a.mp3']) assert.ok(await exists(join(out, f)), f);
    for (const f of ['kits.html', 'director.html', 'tests', 'docs', ...LEFT_OUT]) assert.ok(!(await exists(join(out, f))), f);
    assert.equal(totals.files, 14);
    assert.deepEqual(JSON.parse(await (await import('node:fs/promises')).readFile(join(out, 'version.json'), 'utf8')), { version: 'test-version' });
    assert.ok(PUBLISHED.includes('index.html'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('no published name looks like an ad or a tracker to a blocker', () => {
  assert.deepEqual(blockedLooking(['src/channel/ads.js', 'src/channel/adKit.js', 'data/ads.json', 'src/sim/fingerprint.js', 'src/x/tracking.js']), ['src/channel/ads.js', 'src/channel/adKit.js', 'data/ads.json', 'src/sim/fingerprint.js', 'src/x/tracking.js']);
  assert.deepEqual(blockedLooking(['src/channel/broadcastSheet.js', 'src/channel/spots.js', 'data/spots.json', 'src/channel/headline.js', 'src/channel/loading.js']), []);
});

test('the host sends the security headers on every page, and the published pages run no inline script', async () => {
  const { HEADERS, CSP } = await import('../src/cli/publish.js');
  const { headersFor } = await import('../src/cli/serve.js');
  const { readFile } = await import('node:fs/promises');
  for (const path of ['/', '/index.html', '/check.html', '/about', '/how-it-was-built', '/src/channel/main.js', '/assets/sounds/index.json']) {
    const h = headersFor(HEADERS, path);
    assert.equal(h['x-frame-options'], 'DENY', path);
    assert.equal(h['x-content-type-options'], 'nosniff', path);
    assert.ok(h['strict-transport-security'], path);
    assert.equal(h['content-security-policy'], CSP, path);
    assert.equal(h['content-security-policy-report-only'], undefined, `${path}: enforced, not report-only`);
  }
  assert.match(CSP, /script-src 'self'(;|$)/);
  assert.match(CSP, /frame-ancestors 'none'/);
  // Caching still applies where it did.
  assert.match(headersFor(HEADERS, '/assets/sounds/a.mp3')['cache-control'], /immutable/);
  // A script with no src would be blocked by script-src 'self'.
  for (const page of ['index.html', 'check.html', 'about.html', 'how-it-was-built.html']) {
    const html = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
    for (const tag of html.match(/<script\b[^>]*>/g) ?? []) assert.match(tag, /\bsrc=/, `${page}: an inline script`);
  }
});

test('the security pass: only the scripts the pages load are published, and a secret in a published file stops it', async () => {
  const { moduleGraph, secretsIn, ENTRY_SCRIPTS } = await import('../src/cli/publish.js');
  // The real channel: everything it loads, the SCHEDULE worker too, and no dev page's sheet.
  const graph = await moduleGraph(join(import.meta.dirname, '..'), ENTRY_SCRIPTS);
  for (const f of ['src/channel/main.js', 'src/channel/guideWorker.js', 'src/config.js', 'src/checkPage.js', 'src/sim/leagueCheck.js']) assert.ok(graph.has(f), f);
  assert.ok(![...graph].some((f) => /Sheet\.js$|^src\/(cli|director)\//.test(f)), 'a dev script in the graph');
  // A fake site: main.js loads a.js, which loads b.js; sheet.js is never loaded.
  const root = await mkdtemp(join(tmpdir(), 'publish-'));
  try {
    const files = { 'index.html': 'x', 'check.html': 'x', 'about.html': 'x', 'how-it-was-built.html': 'x', 'robots.txt': 'x', 'sitemap.xml': 'x', 'manifest.webmanifest': 'x', 'config/settings.json': 'x', 'assets/a.mp3': 'x', 'src/channel/main.js': "import './a.js';", 'src/channel/a.js': "export { b } from './b.js';", 'src/channel/b.js': 'export const b = 1;', 'src/channel/sheet.js': "import './a.js';", 'data/teams.json': '{"secret":"s3cret-value-here"}' };
    for (const [f, text] of Object.entries(files)) {
      await mkdir(join(root, f, '..'), { recursive: true });
      await writeFile(join(root, f), text);
    }
    const out = join(root, 'dist');
    await publish(root, out, { fingerprint: false, version: 'v' });
    for (const f of ['src/channel/main.js', 'src/channel/a.js', 'src/channel/b.js']) assert.ok(await exists(join(out, f)), f);
    assert.ok(!(await exists(join(out, 'src/channel/sheet.js'))), 'sheet.js published');
    assert.deepEqual(await secretsIn(out, [{ name: 'A_KEY', value: 's3cret-value-here' }]), [{ path: 'data/teams.json', name: 'A_KEY' }]);
    assert.deepEqual(await secretsIn(out, [{ name: 'B_KEY', value: 'never-in-there' }]), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
