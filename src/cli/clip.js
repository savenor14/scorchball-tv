// The clip tool's command line (getting the word out, docs/launch-plan.md; clips.html records).
//
//   npm run clip -- --list [--seed S]          the moments worth a clip from what has aired, the best first, into
//                                              output/clips/moments.json for clips.html (the live league from
//                                              SCORCHBALL_SEED, never printed; --seed for a dev league)
//   npm run clip -- <file.webm> [--tall] [--title "A golden goal"] [--trim 1]
//                                              a recording made on clips.html as an MP4 to post: wide (1920 × 1080) or
//                                              tall (1080 × 1920: the whole picture in the middle, the title above,
//                                              scorchball.tv below, on the channel's panel colour); the first --trim
//                                              seconds cut (the recording starting up)
//
// ffmpeg-static (a dev dependency) does the encoding; nothing here is published or ever on air.
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { clipMoments } from '../channel/clipMoments.js';
import { LiveLeague } from '../channel/liveLeague.js';
import { PALETTE } from '../channel/palette.js';
import { talkContext } from '../channel/talk.js';
import { createTimeline } from '../channel/timeline.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';
import { secretSeed } from './daykey.js';

const ROOT = resolve(import.meta.dirname, '..', '..');
const FONT = 'assets/fonts/VT323.ttf';
/** The tall frame and the picture's place in it. */
const TALL = { w: 1080, h: 1920 };
const WIDE = { w: 1920, h: 1080 };

/** A colour for ffmpeg ("#151924" → "0x151924"). @param {string} hex */
const ff = (hex) => `0x${hex.slice(1)}`;

/**
 * ffmpeg's arguments for one clip (pure, for the tests). The title comes from a text file (no escaping to get wrong),
 * its path relative to the project's folder, where ffmpeg runs (a Windows drive's colon would need escaping in a filter).
 * @param {{ input: string, output: string, tall: boolean, titleFile: string | null, trim: number }} o
 * @returns {string[]}
 */
export function clipArgs({ input, output, tall, titleFile, trim }) {
  const encode = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'];
  const head = ['-y', '-v', 'error', '-ss', String(trim), '-i', input];
  if (!tall) {
    return [...head, '-vf', `scale=${WIDE.w}:${WIDE.h}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${WIDE.w}:${WIDE.h}:(ow-iw)/2:(oh-ih)/2:color=${ff(PALETTE.panel)}`, ...encode, output];
  }
  // The picture across the frame's width, in the middle; the title above it, the address below.
  const picH = Math.round((TALL.w * 9) / 16);
  const top = Math.round((TALL.h - picH) / 2);
  const text = (/** @type {string} */ what, /** @type {string} */ colour, /** @type {number} */ size, /** @type {string} */ y) => `drawtext=fontfile=${FONT}:${what}:fontcolor=${ff(colour)}:fontsize=${size}:line_spacing=12:text_align=C:x=(w-text_w)/2:y=${y}`;
  const filters = [
    `[0:v]scale=${TALL.w}:${picH}:flags=lanczos[pic]`,
    `color=c=${ff(PALETTE.panel)}:s=${TALL.w}x${TALL.h}:r=30[bg]`,
    `[bg][pic]overlay=0:${top}:shortest=1[framed]`,
    `[framed]${[
      ...(titleFile ? [text(`textfile=${titleFile}`, PALETTE.panelInk, 76, `${top}-text_h-90`)] : []),
      text('text=SCORCHBALL.TV', PALETTE.accent, 64, `${top + picH + 90}`),
    ].join(',')}[out]`,
  ];
  return [...head, '-filter_complex', filters.join(';'), '-map', '[out]', '-map', '0:a?', ...encode, output];
}

/** Run ffmpeg from the project's folder (the font's path is relative to it). @param {string[]} args */
function run(args) {
  return new Promise((done, fail) => {
    if (!ffmpeg) return fail(new Error('ffmpeg-static has no binary for this machine'));
    const p = spawn(/** @type {string} */ (/** @type {unknown} */ (ffmpeg)), args, { cwd: ROOT, stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('close', (code) => (code === 0 ? done(undefined) : fail(new Error(`ffmpeg stopped (${code})`))));
  });
}

/** The moments from what has aired, into output/clips/moments.json. @param {string | null} seedArg */
async function list(seedArg) {
  const config = await loadConfigFromDisk();
  const keys = config.settings.live.mode === 'keys' && !seedArg;
  const seed = seedArg ?? (keys ? secretSeed() : config.settings.live.seed);
  if (!seed) throw new Error('No seed: set SCORCHBALL_SEED in .env for the live league, or pass --seed.');
  const now = Date.now();
  const live = new LiveLeague(config, { now, seed });
  /** @type {Map<string, import('../channel/timeline.js').Timeline>} */
  const timelines = new Map();
  const timelineOf = (/** @type {import('../channel/liveLeague.js').LiveMatch} */ m) => timelines.get(m.id) ?? timelines.set(m.id, createTimeline(m, config)).get(m.id);
  const season = live.calendar.seasonAt(now);
  const matches = [season - 1, season].filter((s) => s >= 1).flatMap((s) => live.matchesIn(s));
  const ctx = talkContext(live, timelineOf);
  const moments = clipMoments({ matches, timelineOf, playerName: ctx.playerName, abbr: (id) => live.league.teams[id].abbr, settings: config.settings.clips, now });
  const file = join(ROOT, 'output', 'clips', 'moments.json');
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify({ made: new Date(now).toISOString(), league: keys ? 'live' : seed, moments }, null, 1)}\n`);
  for (const m of moments) console.log(`${new Date(m.at).toISOString().slice(0, 19)}Z  ${String(m.seconds).padStart(3)} s  ${m.label}`);
  console.log(`\n${moments.length} moments into output/clips/moments.json (clips.html lists them).`);
}

/** @param {string[]} argv */
async function main(argv) {
  const flag = (/** @type {string} */ name) => argv.includes(name);
  const value = (/** @type {string} */ name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] ?? null : null; };
  if (flag('--list')) return list(value('--seed'));
  const input = argv.find((a, i) => !a.startsWith('--') && !['--title', '--trim', '--seed'].includes(argv[i - 1] ?? ''));
  if (!input) throw new Error('Usage: npm run clip -- --list | npm run clip -- <file.webm> [--tall] [--title "…"] [--trim 1]');
  const tall = flag('--tall');
  const title = value('--title');
  const trim = Number(value('--trim') ?? 1);
  if (!(trim >= 0)) throw new Error('--trim must be a number of seconds, 0 or more');
  let titleFile = null;
  if (title) {
    titleFile = `output/clips/title-${process.pid}.txt`;
    await mkdir(join(ROOT, 'output', 'clips'), { recursive: true });
    // A line break where the title asks for one ("\n" typed in it), else as it is.
    await writeFile(join(ROOT, titleFile), title.replace(/\\n/g, '\n').toUpperCase());
  }
  const output = join(dirname(resolve(input)), `${basename(input).replace(/\.[^.]+$/, '')}.${tall ? 'tall' : 'wide'}.mp4`);
  try {
    await run(clipArgs({ input: resolve(input), output, tall, titleFile, trim }));
  } finally {
    if (titleFile) await rm(join(ROOT, titleFile), { force: true });
  }
  console.log(`Made ${output}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(String(err.message ?? err));
    process.exit(1);
  });
}
