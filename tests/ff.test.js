import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseJsonLines } from '../src/chronicle/eventLog.js';
import { fastForward, outputDir, parseCliArgs } from '../src/cli/ff.js';

test('parseCliArgs uses defaults when no flags are given', () => {
  assert.deepEqual(parseCliArgs([]), { seasons: 1, seed: 'flareball', quiet: false, events: true });
});

test('parseCliArgs reads every flag', () => {
  assert.deepEqual(
    parseCliArgs(['--seasons', '10', '--seed', '42', '--quiet', '--no-events']),
    { seasons: 10, seed: '42', quiet: true, events: false },
  );
});

test('parseCliArgs rejects invalid season counts', () => {
  assert.throws(() => parseCliArgs(['--seasons', '0']), /positive integer/);
  assert.throws(() => parseCliArgs(['--seasons', 'abc']), /positive integer/);
});

test('parseCliArgs rejects unknown flags', () => {
  assert.throws(() => parseCliArgs(['--bogus']));
});

test('outputDir makes a safe folder name from the seed', () => {
  assert.equal(outputDir('my seed/../x', 'root'), join('root', 'ff-my_seed____x'));
});

/** Run fast-forward into a temp folder, capturing printed lines. @param {Partial<import('../src/cli/ff.js').FfOptions>} opts */
async function runInTemp(opts) {
  const root = mkdtempSync(join(tmpdir(), 'sim-league-ff-'));
  /** @type {string[]} */
  const lines = [];
  const result = await fastForward(
    { seasons: 2, seed: 'ff-test', quiet: false, events: true, ...opts },
    { print: (l) => lines.push(l), outputRoot: root },
  );
  return { root, lines, result };
}

test('fast-forward writes a complete event log and summary', async () => {
  const { root, lines, result } = await runInTemp({});
  try {
    const events = parseJsonLines(readFileSync(join(result.dir, 'events.jsonl'), 'utf8'));
    assert.equal(events.length, result.events);
    assert.deepEqual(events.map((e) => e.seq), Array.from({ length: events.length }, (_, i) => i + 1));
    assert.equal(events.filter((e) => e.type === 'season_end').length, 2);

    const summary = JSON.parse(readFileSync(join(result.dir, 'summary.json'), 'utf8'));
    assert.equal(summary.seed, 'ff-test');
    assert.equal(summary.history.length, 2);
    assert.equal(summary.history[1].championId, result.league.history[1].championId);

    assert.ok(lines.includes('=== Season 1 ===') && lines.includes('=== Season 2 ==='));
    assert.ok(lines.some((l) => l.startsWith('Champion: ')));
    assert.ok(lines.includes('=== Honours ==='));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the same seed prints the same report', async () => {
  const a = await runInTemp({ events: false });
  const b = await runInTemp({ events: false });
  try {
    const strip = (/** @type {string[]} */ ls) => ls.filter((l) => !/ in \d+\.\ds\. Output:/.test(l));
    assert.deepEqual(strip(a.lines), strip(b.lines));
  } finally {
    rmSync(a.root, { recursive: true, force: true });
    rmSync(b.root, { recursive: true, force: true });
  }
});

test('quiet mode prints one line per season; --no-events skips the log file', async () => {
  const { root, lines, result } = await runInTemp({ quiet: true, events: false, seasons: 3 });
  try {
    assert.equal(lines.filter((l) => /^S +\d+ {2}Champion/.test(l)).length, 3);
    assert.ok(!lines.includes('=== Season 1 ==='));
    assert.ok(!existsSync(join(result.dir, 'events.jsonl')));
    assert.ok(existsSync(join(result.dir, 'summary.json')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
