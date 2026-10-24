// How an update reaches viewers (the launch, Task 274; src/channel/updates.js, docs/live.md §3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reloadForUpdate, resumed, switchedOn, updateAction } from '../src/channel/updates.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';
import { validateConfig } from '../src/config.js';

const config = await loadConfigFromDisk();

test('a new version reloads a hidden or silent channel, and only offers itself to one playing sound', () => {
  assert.equal(updateAction({ hidden: true, soundOn: true }), 'reload');
  assert.equal(updateAction({ hidden: false, soundOn: false }), 'reload');
  assert.equal(updateAction({ hidden: false, soundOn: true }), 'notice');
});

test('a switch is on from its time in the league\'s zone, the same moment on every screen', () => {
  const at = (/** @type {Record<string, string>} */ switches) => ({ ...config, settings: { ...config.settings, switches } });
  const c = at({ _comment: 'x', newLook: '2026-11-02 00:00' });
  // 2026-11-02 00:00 in New York is 05:00 UTC (the clocks went back on 1 November).
  assert.ok(!switchedOn(c, 'newLook', Date.parse('2026-11-02T04:59:59Z')));
  assert.ok(switchedOn(c, 'newLook', Date.parse('2026-11-02T05:00:00Z')));
  assert.ok(!switchedOn(c, 'notListed', Date.parse('2030-01-01T00:00:00Z')));
  // Summer time: 2026-10-20 18:00 in New York is 22:00 UTC.
  assert.ok(switchedOn(at({ s: '2026-10-20 18:00' }), 's', Date.parse('2026-10-20T22:00:00Z')));
  assert.ok(!switchedOn(at({ s: '2026-10-20 18:00' }), 's', Date.parse('2026-10-20T21:59:59Z')));
});

test('switches are checked with the settings: a time like "2026-11-02 00:00"', () => {
  const bad = { ...config, settings: { ...config.settings, switches: { s: '2026-11-02T00:00' } } };
  assert.ok(validateConfig(/** @type {any} */ (bad)).some((e) => e.includes('switches.s')));
  assert.deepEqual(validateConfig(config), []);
});

test('a reload for an update keeps the layout and whether sound was on, once', () => {
  /** @type {Map<string, string>} */
  const store = new Map();
  const g = /** @type {any} */ (globalThis);
  g.sessionStorage = { getItem: (/** @type {string} */ k) => store.get(k) ?? null, setItem: (/** @type {string} */ k, /** @type {string} */ v) => store.set(k, v), removeItem: (/** @type {string} */ k) => store.delete(k) };
  let reloads = 0;
  g.location = { reload: () => reloads++ };
  try {
    assert.equal(resumed(), null);
    reloadForUpdate({ layout: 'broadcast', sound: true });
    assert.equal(reloads, 1);
    assert.deepEqual(resumed(), { layout: 'broadcast', sound: true });
    assert.equal(resumed(), null, 'forgotten once read');
  } finally {
    delete g.sessionStorage;
    delete g.location;
  }
});
