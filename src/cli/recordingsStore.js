// Keeping the recordings (phones, 2026-10-13; docs/channel.md §27): recordings.html renders each sound in the browser
// and sends it to the dev server as a WAV, which this compresses to MP3 into assets/sounds/ and notes in its index.
// Dev tool only: viewers just get the files. Each file's name carries its recipe's hash, so a re-recorded sound is a
// new file and the old one can be cached for good.
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
import { catalogue, recipeHash } from '../channel/recordings.js';

export const SOUNDS_DIR = fileURLToPath(new URL('../../assets/sounds/', import.meta.url));
export const INDEX_FILE = join(SOUNDS_DIR, 'index.json');

/**
 * @typedef {{ file: string, hash: string, rate: number, samples: number, channels: number, gain: number, loop?: number }} IndexEntry
 *   file: under assets/sounds/; samples: the recording's length at `rate` before compression (the channel trims a
 *   decoder's extra silence to it); gain: the level it was scaled down by to fit (played back up by it).
 */

/** @returns {Promise<Record<string, IndexEntry>>} */
export async function readIndex() {
  try {
    return JSON.parse(await readFile(INDEX_FILE, 'utf8')).recordings ?? {};
  } catch {
    return {};
  }
}

/**
 * A WAV's bytes as an MP3 file (written to a file, not a pipe, so ffmpeg can go back and write the header that tells a
 * decoder how much silence the encoder added: loops join cleanly).
 * @param {Buffer} wav @param {string} out @param {number} kbps @param {number} channels
 */
function encode(wav, out, kbps, channels) {
  return new Promise((ok, fail) => {
    if (!ffmpeg) return fail(new Error('ffmpeg-static has no binary for this machine'));
    const p = spawn(/** @type {string} */ (/** @type {unknown} */ (ffmpeg)), ['-y', '-v', 'error', '-f', 'wav', '-i', 'pipe:0', '-ac', String(channels), '-b:a', `${kbps * channels}k`, out], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok(undefined) : fail(new Error(`ffmpeg: ${err.trim()}`))));
    p.stdin.end(wav);
  });
}

/** A 16-bit PCM WAV's rate, channels and length in samples. @param {Buffer} wav */
export function wavInfo(wav) {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV');
  const channels = wav.readUInt16LE(22);
  const rate = wav.readUInt32LE(24);
  const bits = wav.readUInt16LE(34);
  if (bits !== 16) throw new Error('Not 16-bit');
  const bytes = wav.readUInt32LE(40);
  return { channels, rate, samples: bytes / (2 * channels) };
}

/** One at a time, so the index is never written by two at once. */
let queue = Promise.resolve();

/**
 * Keep one recording: checked against the catalogue (its key must be one, its hash is worked out here), compressed to
 * assets/sounds/<key>.<hash>.mp3, older files for the key removed, and the index updated.
 * @param {import('../config.js').Config} config @param {string} key @param {Buffer} wav @param {number} gain
 * @returns {Promise<IndexEntry>}
 */
export function saveRecording(config, key, wav, gain) {
  const job = queue.then(async () => {
    const entry = catalogue(config).find((r) => r.key === key);
    if (!entry) throw new Error(`No recording ${key}`);
    const info = wavInfo(wav);
    const hash = recipeHash(entry);
    const file = `${key}.${hash}.mp3`;
    const out = join(SOUNDS_DIR, file);
    await mkdir(dirname(out), { recursive: true });
    const stem = key.split('/').pop();
    for (const old of await readdir(dirname(out))) if (old.startsWith(`${stem}.`) && old !== `${stem}.${hash}.mp3`) await rm(join(dirname(out), old));
    await encode(wav, out, config.settings.sound.recordings.bitrate, info.channels);
    const index = await readIndex();
    /** @type {IndexEntry} */
    const e = { file, hash, rate: info.rate, samples: info.samples, channels: info.channels, gain, ...(entry.loop ? { loop: entry.loop } : {}) };
    index[key] = e;
    const sorted = Object.fromEntries(Object.entries(index).sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(INDEX_FILE, `${JSON.stringify({ _comment: 'The recordings (docs/channel.md §27): written by the dev server as recordings.html records them. Never edit by hand.', recordings: sorted }, null, 1)}\n`);
    return e;
  });
  queue = job.catch(() => {});
  return job;
}
