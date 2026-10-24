import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARITY_TARGETS, formatParity, luckMetrics, parseParityArgs, runParity, summarise, tableMetrics } from '../src/cli/parity.js';

/** @param {string} order @param {string} champion */
const season = (order, champion) => ({ order: order.split(''), shieldId: order[0], championId: champion });

test('parseParityArgs: defaults, flags and bad values', () => {
  assert.deepEqual(parseParityArgs([]), { seasons: 40, leagues: 5, seed: 'parity', override: {} });
  assert.deepEqual(parseParityArgs(['--seasons', '10', '--leagues', '2', '--seed', 'x']), { seasons: 10, leagues: 2, seed: 'x', override: {} });
  assert.throws(() => parseParityArgs(['--seasons', '1']), /2 or more/);
  assert.throws(() => parseParityArgs(['--override', '{oops']), /not valid JSON/);
});

test('tableMetrics counts Cups, Pennants, droughts, bottom-half runs and place moves', () => {
  const m = tableMetrics([
    season('abcd', 'a'),
    season('abdc', 'b'),
    season('badc', 'a'),
    season('dcab', 'a'),
  ]);
  assert.equal(m.maxCups, 3);
  assert.equal(m.minCups, 0);
  assert.equal(m.maxPennants, 2);
  assert.equal(m.champions, 2);
  // c and d never win: a drought of every season, open at the end.
  assert.equal(m.longestDrought, 4);
  // c and d are in the bottom half (places 3–4) in seasons 1–3, then top two.
  assert.equal(m.longestBottomRun, 3);
  // Places moved: s2 c and d swap (2); s3 a and b swap (2); s4 b 3, a 1, d 2, c 2 (8) → 12 over 12 team-seasons.
  assert.equal(m.placeMove, 1);
});

test('a drought is the longest gap between Cups, not the total without one', () => {
  // a wins s1 and s5, b s2–s4: a's gap is 3 (s2–s4) though it goes 3 of 5 seasons without a Cup; b's gaps are 1 and 1.
  const m = tableMetrics([season('ab', 'a'), season('ab', 'b'), season('ab', 'b'), season('ab', 'b'), season('ab', 'a')]);
  assert.equal(m.longestDrought, 3);
});

test('summarise takes the worst by each target direction', () => {
  const { mean, worst } = summarise([
    { maxCups: 8, twoClubShare: 60, champions: 7 },
    { maxCups: 12, twoClubShare: 40, champions: 8 },
  ]);
  assert.equal(mean.maxCups, 10);
  assert.equal(worst.maxCups, 12);
  assert.equal(worst.twoClubShare, 40);
  assert.equal(worst.champions, 7);
});

test('luckMetrics is seeded and looks like a fair league', () => {
  const a = luckMetrics(8, 40, 's', 50);
  assert.deepEqual(a, luckMetrics(8, 40, 's', 50));
  assert.ok(a.mean.maxCups > 5 && a.mean.maxCups < 12);
  assert.equal(a.mean.champions <= 8, true);
});

test('runParity measures every metric on a short run', async () => {
  const { leagues, teams } = await runParity({ seasons: 3, leagues: 1, seed: 'parity-test', override: {} });
  assert.equal(teams, 8);
  for (const key of Object.keys(PARITY_TARGETS)) assert.ok(key in leagues[0], `missing metric ${key}`);
  const { lines, failures } = formatParity(leagues, luckMetrics(teams, 3, 'parity-test', 10));
  assert.equal(lines.length, Object.keys(PARITY_TARGETS).length + 1);
  assert.ok(Array.isArray(failures));
});

test('formatParity flags missed targets and skips info-only metrics', () => {
  const league = Object.fromEntries(Object.keys(PARITY_TARGETS).map((k) => [k, 0]));
  Object.assign(league, { maxCups: 12, longestDrought: 30, twoClubShare: 55, movesPerOffseason: 3, longestBottomRun: 5, placeMove: 2.4 });
  const { lines, failures } = formatParity([league], { mean: {}, worst: {} });
  assert.deepEqual(failures, ['Most Cups by one team']);
  assert.ok(lines.some((l) => l.startsWith('!!  Most Cups by one team')));
  assert.ok(lines.some((l) => l.startsWith('OK  Places a team moves')));
  assert.ok(lines.some((l) => l.startsWith('    Longest Cup drought')));
  assert.ok(lines.some((l) => l.startsWith('    Fewest Cups by one team')));
});
