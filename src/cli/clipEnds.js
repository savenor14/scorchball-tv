// Voice clips cut off at the end (Tom, 2026-10-14: Hedrek's "Great stuff there." stopped short; docs/tasks.md): every
// clip in assets/voices/ decoded and its last 50 ms measured against its speech. A clean clip fades to near silence; one
// whose soft ending ("ff", "s", "th") was trimmed away by an older voices.js still has sound when the file ends.
// Dev tool. Usage: node src/cli/clipEnds.js [--limit 0.04] [--json]   (writes output/clip-ends.json)
import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import ffmpeg from 'ffmpeg-static';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const VOICES = join(ROOT, 'assets', 'voices');
/** Decoded at this rate (plenty for speech). */
const RATE = 24_000;
/** The ending measured, seconds. */
const END_SECONDS = 0.05;
/** Clips decoded at once. */
const PARALLEL = 8;

/** A clip's samples, mono. @param {string} file @returns {Promise<Int16Array>} */
function decode(file) {
  return new Promise((ok, fail) => {
    if (!ffmpeg) return fail(new Error('ffmpeg-static has no binary for this machine'));
    const p = spawn(/** @type {string} */ (/** @type {unknown} */ (ffmpeg)), ['-v', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(RATE), 'pipe:1']);
    /** @type {Buffer[]} */
    const out = [];
    p.stdout.on('data', (d) => out.push(d));
    p.on('error', fail);
    p.on('close', (code) => {
      if (code !== 0) return fail(new Error(`ffmpeg failed on ${file}`));
      const b = Buffer.concat(out);
      ok(new Int16Array(b.buffer, b.byteOffset, Math.floor(b.length / 2)));
    });
  });
}

/**
 * How loud a clip's end is against its speech: the last END_SECONDS' RMS over the RMS of its loud part (samples above a
 * tenth of the peak). About 0.01 or less for a clean ending.
 * @param {Int16Array} d
 */
export function endShare(d) {
  const n = Math.round(END_SECONDS * RATE);
  if (d.length < 2 * n) return 0;
  let peak = 0;
  for (const v of d) peak = Math.max(peak, Math.abs(v));
  let s = 0;
  let c = 0;
  for (const v of d) if (Math.abs(v) > peak / 10) { s += v * v; c++; }
  const speech = Math.sqrt(s / Math.max(1, c));
  let e = 0;
  for (let i = d.length - n; i < d.length; i++) e += d[i] * d[i];
  return speech ? Math.sqrt(e / n) / speech : 0;
}

/** Every .mp3 under a folder. @param {string} dir @returns {Promise<string[]>} */
async function clips(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await clips(p)));
    else if (e.name.endsWith('.mp3')) out.push(p);
  }
  return out;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { limit: { type: 'string', default: '0.04' }, json: { type: 'boolean', default: false } } });
  const limit = Number(values.limit);
  const files = await clips(VOICES);
  /** @type {{ clip: string, share: number }[]} */
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (next < files.length) {
      const f = files[next++];
      results.push({ clip: relative(VOICES, f).replaceAll('\\', '/').replace(/\.mp3$/, ''), share: endShare(await decode(f)) });
    }
  }));
  results.sort((a, b) => b.share - a.share);
  const cut = results.filter((r) => r.share > limit);
  await mkdir(join(ROOT, 'output'), { recursive: true });
  await writeFile(join(ROOT, 'output', 'clip-ends.json'), JSON.stringify({ limit, clips: results.length, cut }, null, 1));
  if (values.json) console.log(JSON.stringify(cut));
  else {
    const byFolder = /** @type {Record<string, number>} */ ({});
    for (const r of cut) byFolder[r.clip.split('/').slice(0, -1).join('/')] = (byFolder[r.clip.split('/').slice(0, -1).join('/')] ?? 0) + 1;
    console.log(`${results.length} clips; ${cut.length} end with sound still going (over ${limit} of their speech in the last ${END_SECONDS * 1000} ms).`);
    for (const [folder, n] of Object.entries(byFolder).sort((a, b) => b[1] - a[1])) console.log(`  ${folder}: ${n}`);
    console.log('The worst:');
    for (const r of cut.slice(0, 15)) console.log(`  ${r.share.toFixed(3)}  ${r.clip}`);
  }
}
