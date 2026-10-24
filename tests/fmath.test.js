import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cos, exp, log, pow, COS_MAX } from '../src/sim/fmath.js';
import { createRng } from '../src/sim/rng.js';

/** How many ulps apart a and b are (by their bits, same sign). @param {number} a @param {number} b */
function ulps(a, b) {
  if (a === b) return 0;
  const v = new DataView(new ArrayBuffer(16));
  v.setFloat64(0, a);
  v.setFloat64(8, b);
  return Number(BigInt.asIntN(64, v.getBigInt64(0) - v.getBigInt64(8)) < 0n ? -(v.getBigInt64(0) - v.getBigInt64(8)) : v.getBigInt64(0) - v.getBigInt64(8));
}

const rng = createRng('fmath-test');
const samples = (/** @type {number} */ lo, /** @type {number} */ hi, n = 20000) => Array.from({ length: n }, () => lo + (hi - lo) * rng.next());

test('exp is within an ulp of Math.exp', () => {
  for (const x of [...samples(-20, 20), ...samples(-700, 700, 5000), 0, -0, 1, -1, 1e-300, 0.5, 709, -744]) {
    assert.ok(ulps(exp(x), Math.exp(x)) <= 1, `exp(${x}): ${exp(x)} vs ${Math.exp(x)}`);
  }
  assert.equal(exp(1000), Infinity);
  assert.equal(exp(-1000), 0);
  assert.ok(Number.isNaN(exp(NaN)));
});

test('log is within an ulp of Math.log', () => {
  for (const x of [...samples(1e-6, 1), ...samples(1, 1e6), 1, 2, 0.5, Math.E, 1e-310, 5e-324, Number.MAX_VALUE]) {
    assert.ok(ulps(log(x), Math.log(x)) <= 1, `log(${x}): ${log(x)} vs ${Math.log(x)}`);
  }
  assert.equal(log(0), -Infinity);
  assert.equal(log(Infinity), Infinity);
  assert.ok(Number.isNaN(log(-1)));
});

test('cos is within an ulp of Math.cos, or a hair from it near zero', () => {
  for (const x of [...samples(0, 2 * Math.PI), ...samples(-1000, 1000, 5000), 0, Math.PI, Math.PI / 2, 2 * Math.PI, 1e-9]) {
    const a = cos(x), b = Math.cos(x);
    assert.ok(ulps(a, b) <= 1 || Math.abs(a - b) < 1e-16, `cos(${x}): ${a} vs ${b}`);
  }
  assert.throws(() => cos(COS_MAX * 2));
});

test('pow is close to Math.pow over the wages\' range', () => {
  for (const b of samples(-40, 40, 5000)) {
    const a = 1.05, p = pow(a, b), q = Math.pow(a, b);
    assert.ok(Math.abs(p - q) / q < 1e-14, `pow(${a}, ${b}): ${p} vs ${q}`);
  }
  assert.throws(() => pow(-2, 0.5));
});

test('the fingerprints of a few values never change (every engine computes these alike)', () => {
  // Pinned once, on Node 24: if one moves, fmath.js changed, and with it every league's results.
  const values = [exp(0.3), exp(-7.25), log(0.37), log(123.456), cos(1.234), cos(5.9), pow(1.08, 13.5)];
  assert.deepEqual(values, PINNED);
});

const PINNED = [1.3498588075760032, 0.0007101743888425491, -0.994252273343867, 4.815884817283264, 0.33046510807172985, 0.9274784307440359, 2.82631588271202];
