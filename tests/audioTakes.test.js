// Heavy sounds rendered ahead (Task 278b; src/channel/audio.js): which sounds, and which take each plays.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crowdTakes, recipeNodes, takeOf } from '../src/channel/audio.js';
import { recipe } from '../src/channel/soundRecipes.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();
const p = /** @type {import('../src/channel/audio.js').Prerender} */ (config.settings.sound.prerender);

test('the crowd, the music and the anthems are rendered ahead; the match\'s small sounds stay live', () => {
  const heavy = (/** @type {any} */ kind, opts = {}) => recipeNodes(recipe(kind, 's', opts)) >= p.minNodes;
  for (const kind of ['roar', 'groan', 'ooh', 'applause', 'jeer', 'murmur', 'chant', 'music', 'fire', 'lottery']) assert.ok(heavy(kind), kind);
  assert.ok(heavy('anthem', { team: config.teams.teams[0].id }));
  for (const kind of ['whistle', 'kick', 'shot', 'net', 'save', 'post', 'block', 'sub', 'swish', 'whoosh']) assert.ok(!heavy(kind), kind);
});

test('the crowd plays from a few takes per kind, alike on every screen; anything else as asked', () => {
  const seeds = Array.from({ length: 200 }, (_, i) => `m1|crowd|roar|${i}`);
  assert.equal(new Set(seeds.map((s) => takeOf('murmur', s, {}, p).key)).size, p.variants);
  assert.deepEqual(takeOf('roar', 'x', { power: 0.62, gain: 0.3, delay: 1, from: 2, fadeIn: 0.5 }, p), takeOf('roar', 'x', { power: 0.6 }, p));
  assert.deepEqual([0, 0.1, 0.4, 0.62, 0.9, 1].map((power) => takeOf('roar', 'x', { power }, p).opts.power), [1 / 3, 1 / 3, 1 / 3, 2 / 3, 1, 1]);
  assert.deepEqual(takeOf('music', 'music', { style: 'pulse', delay: 3, loop: 34 }, p), { seed: 'music', opts: { style: 'pulse' }, key: 'music|music|{"style":"pulse"}' });
});

test('every take the crowd can play is among those rendered as sound starts, the murmur first', () => {
  const all = crowdTakes(p);
  assert.equal(all.length, p.variants * (6 + p.roarSizes));
  assert.equal(all[0].kind, 'murmur');
  const keys = new Set(all.map((t) => t.key));
  for (let i = 0; i < 300; i++) {
    for (const kind of ['murmur', 'ooh', 'groan', 'applause', 'jeer', 'chant']) assert.ok(keys.has(takeOf(kind, `s${i}`, { gain: 0.5 }, p).key), kind);
    assert.ok(keys.has(takeOf('roar', `s${i}`, { power: (i % 11) / 10 }, p).key), 'roar');
  }
});

test('a match\'s cue plays a take kept by its sound alone, not its moment (Task 278b: every cheer was rendered anew)', () => {
  const cue = { kind: 'roar', at: 61_234, seed: 'm7|crowd|roar|61234', power: 0.7, gain: 0.8 };
  const later = { ...cue, at: 900_000 };
  assert.equal(takeOf('roar', cue.seed, cue, p).key, takeOf('roar', cue.seed, later, p).key);
  assert.ok(crowdTakes(p).some((t) => t.key === takeOf('roar', cue.seed, cue, p).key));
});
