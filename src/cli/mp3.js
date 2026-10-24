// Compressing voice clips to MP3 (Task 136; docs/channel.md §18.11): with ffmpeg-static, a dev dependency (a copy of
// ffmpeg inside the project, nothing installed on the machine). MP3 because every browser decodes it; mono at
// MP3_BITRATE keeps speech clear at about a ninth of a 16-bit WAV's size. Dev tool only: viewers just get the files.
import { spawn } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';

/** The clips' bitrate: plenty for a voice. */
const MP3_BITRATE = '40k';

/**
 * A WAV file's bytes as MP3 bytes.
 * @param {Buffer} wav @returns {Promise<Buffer>}
 */
export function toMp3(wav) {
  return new Promise((ok, fail) => {
    if (!ffmpeg) return fail(new Error('ffmpeg-static has no binary for this machine'));
    const p = spawn(/** @type {string} */ (/** @type {unknown} */ (ffmpeg)), ['-v', 'error', '-f', 'wav', '-i', 'pipe:0', '-ac', '1', '-b:a', MP3_BITRATE, '-f', 'mp3', 'pipe:1'], { stdio: ['pipe', 'pipe', 'pipe'] });
    /** @type {Buffer[]} */
    const out = [];
    let err = '';
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok(Buffer.concat(out)) : fail(new Error(`ffmpeg: ${err.trim()}`))));
    p.stdin.end(wav);
  });
}
