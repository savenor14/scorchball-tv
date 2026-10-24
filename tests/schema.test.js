import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrayOf, check, int, num, obj, oneOf, optional, range, recordOf } from '../src/schema.js';

test('valid values produce no errors', () => {
  const spec = obj({ a: num(0, 10), b: arrayOf(int(1), { minLength: 1 }), c: oneOf('x', 'y') });
  assert.deepEqual(check({ a: 5, b: [1, 2], c: 'x' }, spec), []);
});

test('reports wrong types, bounds and whole numbers with paths', () => {
  const spec = obj({ a: num(0, 10), nested: obj({ n: int(1) }) });
  const errors = check({ a: 'five', nested: { n: 1.5 } }, spec);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /^a: expected a number, got string "five"/);
  assert.match(errors[1], /^nested\.n: expected a whole number/);
  assert.match(check({ a: 11, nested: { n: 1 } }, spec)[0], /^a: expected a number from 0 to 10, got 11/);
});

test('reports missing and unknown keys but ignores "_" comments', () => {
  const spec = obj({ a: num(), b: optional(num()) });
  assert.deepEqual(check({ a: 1, _comment: 'hi' }, spec), []);
  assert.deepEqual(check({}, spec), ['a: missing']);
  assert.deepEqual(check({ a: 1, typo: 2 }, spec), ['typo: unknown key (typo?)']);
});

test('records check every value', () => {
  const errors = check({ x: 1, y: -1, _note: 'skip' }, recordOf(num(0)));
  assert.deepEqual(errors, ['y: expected a number ≥ 0, got -1']);
});

test('ranges require min ≤ max', () => {
  assert.deepEqual(check({ min: 1, max: 3 }, range(0, 10)), []);
  assert.match(check({ min: 4, max: 3 }, range(0, 10))[0], /min \(4\) must not be greater than max \(3\)/);
  assert.match(check({ min: 1.5, max: 3 }, range(0, 10, true))[0], /whole number/);
});

test('arrays check length, uniqueness and items', () => {
  const spec = arrayOf(oneOf('a', 'b'), { minLength: 1, unique: true });
  assert.match(check([], spec)[0], /expected 1\+ items/);
  assert.match(check(['a', 'a'], spec)[0], /must not repeat/);
  assert.match(check(['c'], spec)[0], /^\[0\]: expected one of "a", "b"/);
});
