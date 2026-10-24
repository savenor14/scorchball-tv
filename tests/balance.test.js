import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TARGETS, formatBalance, parseBalanceArgs, runBalance } from '../src/cli/balance.js';

test('parseBalanceArgs: defaults, flags and overrides', () => {
  assert.deepEqual(parseBalanceArgs([]), { seasons: 30, leagues: 5, seed: 'balance', override: {} });
  assert.deepEqual(
    parseBalanceArgs(['--seasons', '3', '--leagues', '2', '--seed', 'x', '--override', '{"rules":{"match":{"homeBonus":0}}}']),
    { seasons: 3, leagues: 2, seed: 'x', override: { rules: { match: { homeBonus: 0 } } } },
  );
  assert.throws(() => parseBalanceArgs(['--leagues', '0']), /positive integer/);
  assert.throws(() => parseBalanceArgs(['--override', '{oops']), /not valid JSON/);
});

test('runBalance computes every metric on a short run', async () => {
  const metrics = await runBalance({ seasons: 2, leagues: 1, seed: 'balance-test', override: {} });
  for (const key of Object.keys(TARGETS)) assert.ok(key in metrics, `missing metric ${key}`);
  assert.ok(metrics.goalsPerMatch > 0);
  assert.ok(metrics.homeWinRate >= 0 && metrics.homeWinRate <= 100);
  assert.ok(Number.isNaN(metrics.minChampions), 'no 10-season window in a 2-season run');
});

test('overrides are validated like the real config files', async () => {
  await assert.rejects(
    runBalance({ seasons: 1, leagues: 1, seed: 'b', override: { rules: { heat: { burnSecnds: 30 } } } }),
    /heat\.burnSecnds: unknown key/,
  );
});

test('formatBalance flags missed targets and skips info-only metrics', () => {
  const metrics = Object.fromEntries(Object.keys(TARGETS).map((k) => [k, NaN]));
  Object.assign(metrics, { goalsPerMatch: 6.5, burnsPerMatch: 9, drawRate: 12 });
  const { lines, failures } = formatBalance(metrics);
  assert.ok(lines.some((l) => l.startsWith('OK  Goals per match')));
  assert.ok(lines.some((l) => l.startsWith('!!  Burns per match')));
  assert.ok(lines.some((l) => l.startsWith('    Draws (regular season)')));
  assert.ok(failures.includes('Burns per match'));
  assert.ok(!failures.includes('Goals per match'));
  assert.ok(!failures.includes('Draws (regular season)'));
});
