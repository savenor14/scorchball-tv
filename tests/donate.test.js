import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateConfig } from '../src/config.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { CSP } from '../src/cli/publish.js';

const real = await loadConfigFromDisk();

test('donations: SUPPORT THE CHANNEL links to the Ko-fi page, and only an https address passes', () => {
  assert.equal(real.settings.audience.donateUrl, 'https://ko-fi.com/scorchballtv');
  for (const bad of ['javascript:alert(1)', 'http://ko-fi.com/scorchballtv', 'https://ko-fi.com/a"b', '']) {
    const c = structuredClone(real);
    c.settings.audience.donateUrl = bad;
    assert.ok(validateConfig(c).some((e) => e.includes('audience.donateUrl')), bad);
  }
});

test('donations: a plain link out in a new tab, nothing loaded from Ko-fi', async () => {
  const pane = await readFile(new URL('../src/channel/overlays/audiencePane.js', import.meta.url), 'utf8');
  assert.match(pane, /target = '_blank'/);
  assert.match(pane, /rel = 'noopener noreferrer'/);
  // The policy lets the site load only its own things: no Ko-fi script, frame or picture.
  assert.doesNotMatch(CSP, /ko-fi/i);
  for (const page of ['index.html', 'src/channel/overlays/audiencePane.js']) {
    const text = await readFile(new URL(`../${page}`, import.meta.url), 'utf8');
    assert.doesNotMatch(text, /<(script|iframe|img)[^>]+ko-fi/i, page);
  }
});
