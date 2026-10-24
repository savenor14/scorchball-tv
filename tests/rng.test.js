import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { Rng, createRng } from '../src/sim/rng.js';
import { seedStreams } from '../src/sim/streams.js';

const createStream = (/** @type {string} */ seed, /** @type {number} */ season, /** @type {string} */ key) => seedStreams(seed).rng(season, key);

/** @param {Rng} rng @param {number} n */
const draws = (rng, n) => Array.from({ length: n }, () => rng.next());

test('golden values: the algorithm must never change silently (it would break replays of old leagues)', () => {
  const r = createRng('flareball');
  assert.deepEqual(
    [r.next(), r.next(), r.next(), r.int(1, 100), r.int(1, 100)],
    [0.9345058407634497, 0.9747136672958732, 0.7697333036921918, 59, 69],
  );
});

test('same seed gives the same sequence', () => {
  assert.deepEqual(draws(createRng('league-42'), 1000), draws(createRng('league-42'), 1000));
});

test('different seeds give different sequences', () => {
  assert.notDeepEqual(draws(createRng('league-42'), 10), draws(createRng('league-43'), 10));
});

test('streams are independent: using one does not change another', () => {
  const untouched = draws(createStream('seed', 1, 's1-r1-m2'), 20);
  const busy = createStream('seed', 1, 's1-r1-m1');
  draws(busy, 5000);
  assert.deepEqual(draws(createStream('seed', 1, 's1-r1-m2'), 20), untouched);
  assert.notDeepEqual(draws(createStream('seed', 1, 's1-r1-m1'), 20), untouched);
});

test('state can be saved and resumed exactly', () => {
  const r = createRng('resume');
  draws(r, 123);
  const saved = r.getState();
  const expected = draws(r, 50);
  assert.deepEqual(draws(Rng.fromState(saved), 50), expected);
  assert.deepEqual(JSON.parse(JSON.stringify(saved)), saved, 'state survives JSON round-trip');
});

test('next() stays in [0, 1)', () => {
  for (const x of draws(createRng('range'), 100_000)) assert.ok(x >= 0 && x < 1);
});

test('int() is inclusive at both ends and roughly uniform', () => {
  const r = createRng('ints');
  const counts = new Map();
  for (let i = 0; i < 60_000; i++) {
    const n = r.int(1, 6);
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  assert.deepEqual([...counts.keys()].sort(), [1, 2, 3, 4, 5, 6]);
  for (const c of counts.values()) assert.ok(Math.abs(c - 10_000) < 500, `count ${c} far from 10000`);
  assert.equal(r.int(7, 7), 7);
  assert.throws(() => r.int(5, 1), RangeError);
  assert.throws(() => r.int(1.5, 3), RangeError);
});

test('chance() matches its probability', () => {
  const r = createRng('chance');
  let hits = 0;
  for (let i = 0; i < 100_000; i++) if (r.chance(0.3)) hits++;
  assert.ok(Math.abs(hits / 100_000 - 0.3) < 0.01);
  assert.equal(r.chance(0), false);
});

test('normal() has the requested mean and spread', () => {
  const r = createRng('normal');
  const xs = Array.from({ length: 50_000 }, () => r.normal(62, 11));
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
  assert.ok(Math.abs(mean - 62) < 0.3, `mean ${mean}`);
  assert.ok(Math.abs(sd - 11) < 0.3, `sd ${sd}`);
});

test('weightedKey() follows the weights and skips comments and zero weights', () => {
  const r = createRng('weights');
  const counts = { K: 0, D: 0, M: 0, S: 0 };
  const weights = { _comment: 'ignored', K: 15, D: 55, M: 25, S: 5, X: 0 };
  for (let i = 0; i < 100_000; i++) counts[/** @type {keyof typeof counts} */ (r.weightedKey(weights))]++;
  assert.ok(Math.abs(counts.K / 1000 - 15) < 1);
  assert.ok(Math.abs(counts.D / 1000 - 55) < 1);
  assert.ok(Math.abs(counts.M / 1000 - 25) < 1);
  assert.ok(Math.abs(counts.S / 1000 - 5) < 1);
});

test('weighted() rejects empty, negative and all-zero weights', () => {
  const r = createRng('bad-weights');
  assert.throws(() => r.weighted([], () => 1), RangeError);
  assert.throws(() => r.weighted(['a', 'b'], () => 0), RangeError);
  assert.throws(() => r.weighted(['a'], () => -1), RangeError);
  assert.equal(r.weighted(['a', 'b'], (x) => (x === 'b' ? 1 : 0)), 'b');
});

test('pick() and shuffle() are deterministic; shuffle returns a permutation and leaves the input alone', () => {
  const items = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);
  const a = createRng('shuffle').shuffle(items);
  assert.deepEqual(a, createRng('shuffle').shuffle(items));
  assert.deepEqual([...a].sort(), [...items]);
  assert.notDeepEqual(a, items);
  assert.equal(createRng('p').pick(items), createRng('p').pick(items));
  assert.throws(() => createRng('p').pick([]), RangeError);
});

test('simulation code never uses Math.random', async () => {
  for (const dir of ['src/sim', 'src/chronicle']) {
    const root = new URL(`../${dir}/`, import.meta.url);
    for (const file of await readdir(root, { recursive: true })) {
      if (!file.endsWith('.js')) continue;
      const code = await readFile(new URL(file.replaceAll('\\', '/'), root), 'utf8');
      assert.ok(!/Math\.random\s*\(/.test(code), `${dir}/${file} calls Math.random(); use src/sim/rng.js instead`);
    }
  }
});
