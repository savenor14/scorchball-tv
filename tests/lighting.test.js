import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { loadConfig } from '../src/config.js';
import { lightAt, lightLevel } from '../src/channel/lighting.js';

const config = await loadConfig((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const s = config.settings.lighting;
const at = (/** @type {string} */ hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

test('the light: day, dusk and night by the clock, dawn a dusk too (Tom\'s note 14)', () => {
  assert.equal(lightLevel(at('12:00'), s), 0);
  assert.equal(lightLevel(at('18:30'), s), 1);
  assert.equal(lightLevel(at('23:00'), s), 2);
  assert.equal(lightLevel(at('02:00'), s), 2);
  assert.equal(lightLevel(at('06:00'), s), 1);
});

test('the light eases from one band to the next over easeMinutes, centred on the change', () => {
  const half = s.easeMinutes / 2;
  const dusk = at(s.duskFrom);
  assert.equal(lightLevel(dusk - half - 1, s), 0);
  assert.ok(Math.abs(lightLevel(dusk, s) - 0.5) < 1e-9);
  assert.equal(lightLevel(dusk + half + 1, s), 1);
  // Rising all the way through, never jumping.
  let last = lightLevel(dusk - half, s);
  for (let m = dusk - half; m <= dusk + half; m++) {
    const l = lightLevel(m, s);
    assert.ok(l >= last && l - last < 0.1);
    last = l;
  }
  // Through midnight's side too (dawn: night to dusk).
  assert.ok(Math.abs(lightLevel(at(s.dawnFrom), s) - 1.5) < 1e-9);
});

test('by day nothing is tinted and the lamps are off; at night the tint is eased by strength', () => {
  const noonUtc = Date.UTC(2026, 9, 20, 12, 0);
  const day = lightAt(noonUtc, 0, s);
  assert.equal(day.ground, null);
  assert.equal(day.lamps, 0);
  const night = lightAt(Date.UTC(2026, 9, 20, 23, 0), 0, s);
  assert.equal(night.lamps, 1);
  const full = lightAt(Date.UTC(2026, 9, 20, 23, 0), 0, { ...s, strength: 1 });
  assert.equal(full.ground, s.night.ground.toLowerCase());
  const none = lightAt(Date.UTC(2026, 9, 20, 23, 0), 0, { ...s, strength: 0 });
  assert.equal(none.ground, '#ffffff');
  assert.notEqual(night.ground, full.ground);
});

test('the light follows the league\'s clock: the offset moves the hour', () => {
  const t = Date.UTC(2026, 9, 20, 23, 0);
  assert.equal(lightAt(t, 0, s).level, 2);
  assert.equal(lightAt(t, -10 * 3_600_000, s).level, 0);
});

test('a re-air or highlights is lit as when the match was played; everything else by the hour now', async () => {
  const { litMoment } = await import('../src/channel/daylight.js');
  const match = { kickoff: Date.UTC(2026, 9, 20, 1, 0) };
  const now = Date.UTC(2026, 9, 20, 18, 0);
  assert.equal(litMoment({ kind: 'reair', match, elapsed: 600_000 }, now), match.kickoff + 600_000);
  assert.equal(litMoment({ kind: 'highlights', match, elapsed: 90_000 }, now), match.kickoff + 90_000);
  assert.equal(litMoment({ kind: 'live', match, elapsed: 600_000 }, now), now);
  assert.equal(litMoment({ kind: 'grounds' }, now), now);
});
