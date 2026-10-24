import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { isPublic, addressesIn, NO_REPLY } from '../src/cli/publicCopy.js';

test('the public copy takes the channel, the code and the design docs, and leaves the internal docs, the voices and the daily job out', () => {
  for (const p of ['index.html', 'about.html', 'how-it-was-built.html', 'director.html', 'src/sim/match.js', 'src/director/watchers.js', 'worker/audience.js', 'tests/publish.test.js', 'assets/voices/lengths.json', 'assets/sounds/index.json', 'docs/vision.md', 'docs/channel.md', 'CLAUDE.md', 'keys/s2d1.json']) assert.ok(isPublic(p), p);
  for (const p of ['docs/roadmap.md', 'docs/launch-plan.md', 'docs/tasks.md', 'docs/live.md', 'docs/moments.md', 'docs/history.md', 'docs/new-project-handoff.md', 'docs/rehearsal-summary.md', 'assets/voices/desk/a.mp3', 'kofi.html', 'src/channel/kofiSheet.js', 'og.html', 'colours.html', '.github/workflows/daykeys.yml', '.claude/launch.json', '.env', 'public/README.md', 'srcx/a.js']) assert.ok(!isPublic(p), p);
});

test('the public copy stops at this computer\'s email or any Gmail address, and commits only as a no-reply one', async () => {
  const out = await mkdtemp(join(tmpdir(), 'public-'));
  try {
    await writeFile(join(out, 'a.md'), 'Written by Someone <Someone.Else@Example.org>.');
    await writeFile(join(out, 'b.js'), `// any@${'gmail'}.com`); // written in two, or the copy's own check would stop at this file
    await writeFile(join(out, 'c.json'), '{"fine": "no address here @ all"}');
    await writeFile(join(out, 'd.png'), 'someone.else@example.org');
    assert.deepEqual(await addressesIn(out, ['a.md', 'b.js', 'c.json', 'd.png'], 'someone.else@example.org'), ['a.md', 'b.js']);
    assert.deepEqual(await addressesIn(out, ['c.json'], ''), []);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
  assert.ok(NO_REPLY.test('12345678+savenor14@users.noreply.github.com'));
  for (const e of ['savenor14@users.noreply.github.com', `someone@${'gmail'}.com`, '1+a@users.noreply.github.com.evil']) assert.ok(!NO_REPLY.test(e), e);
});
