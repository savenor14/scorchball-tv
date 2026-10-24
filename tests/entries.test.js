// Every script the published pages load parses (2026-10-19: a second import named groundOf in main.js stopped the
// channel at "TUNING IN…" while every unit test passed, since none loads main.js). node --check finds such early errors
// (duplicate names, bad syntax) without running anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ENTRY_SCRIPTS, moduleGraph } from '../src/cli/publish.js';

const root = resolve(import.meta.dirname, '..');

test('every script the published pages load parses', async () => {
  const files = [...(await moduleGraph(root, ENTRY_SCRIPTS))];
  assert.ok(files.length > 20, `${files.length} scripts`);
  for (const f of files) {
    try {
      execFileSync(process.execPath, ['--check', resolve(root, f)], { stdio: 'pipe' });
    } catch (e) {
      assert.fail(`${f}: ${String(/** @type {any} */ (e).stderr ?? e)}`);
    }
  }
});
