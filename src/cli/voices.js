// The voice audition (Task 122): speaks each commentary line with each candidate voice, Kokoro (the npm dev
// dependency kokoro-js) and Piper (its standalone Windows program, kept outside the repo), into output/voices/,
// with an index.json the sound board (sounds.html) reads. A dev tool: viewers never run a speech model.
// With --assets (Task 123) it makes the channel's own clips instead: each commentator in data/commentary.json says
// each line, trimmed of silence, evened out in loudness and saved as small 16-bit clips in assets/voices/<id>/.
// Usage: npm run voices [-- --only kokoro|piper] [--piper C:\Users\Tom\tools\piper]
//        npm run voices -- --assets [--who el_george,el_daniel] [--count] [--paid]   (ElevenLabs commentators only
//            with --paid: their clips go on air, so they're made during a paid month; vision §12. Only the lines each
//            commentator speaks, and only clips not made yet (Task 150); --count totals the characters still to make)
//        npm run voices -- --desk --interviews [--count] --paid   (Task 135: the desk's and the interview's clips;
//            --count only totals the characters still to make)
//        npm run voices -- --names [--count] --paid   (Task 247b: the commentators' calls naming the scorer, every surname)
//        npm run voices -- --analyst [--count] --paid   (the playoff analyst, 2026-10-17: data/analyst.json's lines, the
//            analyst's in his voice into assets/voices/desk/<his id>/, the host's in hers into desk/<her id>/)
//        npm run voices -- --podcast [--count] --paid   (OFF THE BALL, 2026-10-20: data/podcast.json's hooks, discussions and
//            interjections, each in the voice of who says it (pair.<who>.voice), into assets/voices/podcast/<who>/)
//        ... --redo <pattern>   (with --desk, --interviews, --names or --analyst: clips whose path matches are made again
//            though they exist, e.g. --analyst --redo hostIntro for the host's lines naming the analyst, renamed 2026-10-18)
//        npm run voices -- --compress   (Task 136: every WAV in assets/voices/ to MP3; new clips are made as MP3)
//        npm run voices -- --lengths    (Task 187: every desk and interview clip's length into assets/voices/lengths.json)
//        npm run voices -- --try bm_daniel   (Task 126: a Kokoro voice tried as a commentator, every line six ways)
//        npm run voices -- --list-11         (Task 127: the ElevenLabs voices this account can use)
//        npm run voices -- --try-11 "Daniel,<id>=Announcer" [--all]   (Task 127: ElevenLabs voices, by name, or a
//            shared Library voice as id=Name, tried as commentators: a sample of lines, or --all of them, on v3 [tagged];
//            with --quotes, as players: the interview's quotes, Task 133; with --teams, each team's name in a desk
//            line, Task 134; with --analyst, as the playoff analyst: a sample of data/analyst.json's lines, the playoff
//            analyst's try-out, 2026-10-17); with --podcast --who tamsin|samir, as one of OFF THE BALL's pair: a few
//            hooks, their half of a discussion and interjections (2026-10-20); --count totals a run without speaking;
//            --talk only their half of the discussion, the sound board playing it as a conversation with the other's clips
//        npm run voices -- --try-names [--count]   (Task 244: twelve surnames voiced on their own, to join to lines
//            already made, beside a few whole sentences; the sound board's Names joined grid)
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { ELEVEN_RATE, elevenSpeak, elevenVoices } from './elevenlabs.js';
import { toMp3 } from './mp3.js';
import { mp3Seconds } from './mp3Length.js';
import { linesFor } from '../channel/commentary.js';

const OUT_DIR = fileURLToPath(new URL('../../output/voices/', import.meta.url));
const ASSETS_DIR = fileURLToPath(new URL('../../assets/voices/', import.meta.url));
const COMMENTARY = fileURLToPath(new URL('../../data/commentary.json', import.meta.url));
/**
 * A clip's quiet start and end are trimmed, keeping a little either side (s). Sound is a `window`-long stretch whose
 * loudness (RMS) is at least `floor` of the loudest stretch's, so a soft last sound ("ff", "s", "th") counts (Tom,
 * 2026-10-14: Hedrek's "Great stuff there." lost its end when single samples under 2% of the peak were silence).
 */
const TRIM = { window: 0.01, floor: 0.01, before: 0.03, after: 0.15, fadeOut: 0.06 };
/** Every clip is evened out to this peak. */
const PEAK = 0.9;
/** ElevenLabs requests at once when making the desk and interview clips (small plans allow a few). */
const SPEECH_AT_ONCE = 3;
/** ffmpeg runs at once when compressing clips. */
const COMPRESS_AT_ONCE = 4;

/** The lines: `text` as shown, `say` as spoken (all capitals can read as letters). */
export const LINES = [
  { id: 'goal', text: 'GOAL!', say: 'Goal!' },
  { id: 'its_in', text: "IT'S IN!", say: "It's in!" },
  { id: 'scorcher_its', text: "IT'S A SCORCHER!", say: "It's a scorcher!" },
  { id: 'scorcher_what', text: 'WHAT A SCORCHER!', say: 'What a scorcher!' },
  { id: 'what_a_hit', text: 'WHAT A HIT!', say: 'What a hit!' },
  { id: 'save', text: 'WHAT A SAVE!', say: 'What a save!' },
  { id: 'blocked', text: 'BLOCKED!', say: 'Blocked!' },
  { id: 'post', text: 'OFF THE POST!', say: 'Off the post!' },
  { id: 'wide', text: 'WIDE!', say: 'Wide!' },
  { id: 'burned', text: 'BURNED!', say: 'Burned!' },
  { id: 'breakaway', text: 'BREAKAWAY!', say: 'Breakaway!' },
];

/** The candidate voices, all free to use (Piper voices checked one by one: no non-commercial datasets). */
const VOICES = [
  { engine: 'kokoro', id: 'am_michael', label: 'Michael', accent: 'US male', licence: 'Apache-2.0' },
  { engine: 'kokoro', id: 'am_fenrir', label: 'Fenrir', accent: 'US male', licence: 'Apache-2.0' },
  { engine: 'kokoro', id: 'am_puck', label: 'Puck', accent: 'US male', licence: 'Apache-2.0' },
  { engine: 'kokoro', id: 'bm_george', label: 'George', accent: 'UK male', licence: 'Apache-2.0' },
  { engine: 'kokoro', id: 'bm_lewis', label: 'Lewis', accent: 'UK male', licence: 'Apache-2.0' },
  { engine: 'kokoro', id: 'bm_daniel', label: 'Daniel', accent: 'UK male', licence: 'Apache-2.0' },
  { engine: 'kokoro', id: 'af_heart', label: 'Heart', accent: 'US female', licence: 'Apache-2.0' },
  { engine: 'kokoro', id: 'bf_emma', label: 'Emma', accent: 'UK female', licence: 'Apache-2.0' },
  { engine: 'piper', id: 'en_US-joe-medium', label: 'Joe', accent: 'US male', licence: 'CC0' },
  { engine: 'piper', id: 'en_US-norman-medium', label: 'Norman', accent: 'US male', licence: 'public domain' },
  { engine: 'piper', id: 'en_US-bryce-medium', label: 'Bryce', accent: 'US male', licence: 'public domain' },
  { engine: 'piper', id: 'en_GB-northern_english_male-medium', label: 'Northern', accent: 'UK male', licence: 'CC-BY-SA-4.0 (credit)' },
  { engine: 'piper', id: 'en_GB-cori-medium', label: 'Cori', accent: 'UK female', licence: 'public domain' },
];

/** Speak `say` into `file` with Piper's program. @param {string} dir @param {string} voice @param {string} say @param {string} file */
function piperSay(dir, voice, say, file) {
  return new Promise((ok, fail) => {
    const p = spawn(join(dir, 'piper', 'piper.exe'), ['--model', join(dir, 'voices', `${voice}.onnx`), '--output_file', file, '--quiet'], { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok(undefined) : fail(new Error(`piper ${voice}: ${err.trim()}`))));
    p.stdin.end(say);
  });
}

/**
 * Trim a clip's silence (keeping TRIM's margins, fading out the end) and even it out to PEAK.
 * @param {Float32Array} samples @param {number} rate @returns {Float32Array}
 */
export function tidyClip(samples, rate) {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak === 0) return samples;
  // Each stretch's loudness; sound is any stretch at least TRIM.floor of the loudest.
  const win = Math.max(1, Math.round(TRIM.window * rate));
  const rms = [];
  for (let at = 0; at < samples.length; at += win) {
    let s = 0;
    const end = Math.min(samples.length, at + win);
    for (let i = at; i < end; i++) s += samples[i] * samples[i];
    rms.push(Math.sqrt(s / (end - at)));
  }
  const top = Math.max(...rms);
  const sound = (/** @type {number} */ w) => rms[w] >= top * TRIM.floor;
  let first = 0;
  while (first < rms.length && !sound(first)) first++;
  let last = rms.length - 1;
  while (last > first && !sound(last)) last--;
  const from = Math.max(0, first * win - Math.round(TRIM.before * rate));
  const to = Math.min(samples.length, (last + 1) * win + Math.round(TRIM.after * rate));
  const out = samples.slice(from, to);
  const fade = Math.min(out.length, Math.round(TRIM.fadeOut * rate));
  for (let i = 0; i < out.length; i++) {
    const tail = out.length - 1 - i;
    out[i] = (out[i] / peak) * PEAK * (tail < fade ? tail / fade : 1);
  }
  return out;
}

/** A mono 16-bit PCM WAV file. @param {Float32Array} samples @param {number} rate */
export function wav16(samples, rate) {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), 44 + i * 2));
  return buf;
}

/**
 * The channel's clips: each commentator (or those named in `who`) says each line they speak (a line with `voices` only
 * by those; every moment's, on air or not), with its engine. Clips already made are skipped (Task 150: a run made
 * every line again, overwriting approved clips and paying twice), so a run can resume and new lines only cost
 * themselves. ElevenLabs commentators only with `paid` (Tom's word that the account is on a paid plan: only
 * paid-month clips go on air); `count` just totals what's still to make.
 * @param {{ who?: string, paid: boolean, count?: boolean }} o
 */
async function makeAssets({ who, paid, count = false }) {
  const data = JSON.parse(await readFile(COMMENTARY, 'utf8'));
  const named = who?.split(',').map((w) => w.trim()).filter(Boolean);
  const unknown = named?.filter((id) => !data.commentators.some((/** @type {any} */ c) => c.id === id)) ?? [];
  if (unknown.length) throw new Error(`No commentator ${unknown.join(', ')} in data/commentary.json`);
  /** @type {any} */
  let kokoro = null;
  let bytes = 0;
  let chars = 0;
  let made = 0;
  for (const c of data.commentators.filter((/** @type {any} */ c) => !named || named.includes(c.id))) {
    const dir = join(ASSETS_DIR, c.id);
    const todo = linesFor(data, c.id, { all: true }).filter((l) => !existsSync(join(dir, `${l.id}.mp3`)));
    if (count) {
      const n = c.engine === 'elevenlabs' ? todo.reduce((t, l) => t + v3Tag(l.say).length, 0) : 0;
      console.log(`${c.name.padEnd(30)} ${String(todo.length).padStart(3)} clips to make${n ? `, about ${n} characters` : ''}${todo.length ? `: ${todo.map((l) => l.id).join(', ')}` : ''}`);
      chars += n;
      continue;
    }
    if (c.engine === 'elevenlabs' && !paid) {
      console.log(`${c.name}: skipped (ElevenLabs clips for the channel are made during a paid month: add --paid)`);
      continue;
    }
    await mkdir(dir, { recursive: true });
    for (const line of todo) {
      /** @type {{ samples: Float32Array, rate: number }} */
      let clip;
      if (c.engine === 'elevenlabs') {
        const text = v3Tag(line.say);
        chars += text.length;
        clip = { samples: await elevenSpeak(text, c.voice, 'v3', c.speed), rate: ELEVEN_RATE };
      } else {
        if (!kokoro) {
          const { KokoroTTS } = await import('kokoro-js');
          kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
        }
        const raw = await kokoro.generate(line.say, { voice: c.voice, speed: c.speed });
        clip = { samples: raw.audio, rate: raw.sampling_rate };
      }
      const file = wav16(tidyClip(clip.samples, clip.rate), clip.rate);
      await writeFile(join(dir, `${line.id}.mp3`), await toMp3(file));
      bytes += file.length;
      made++;
    }
    console.log(`${c.name.padEnd(20)} ${todo.length} new clips`);
  }
  if (count) return console.log(`About ${chars} characters of ElevenLabs credit in all (nothing made: --count)`);
  console.log(`${made} clips: wrote ${ASSETS_DIR} (${Math.round(bytes / 1024)} KB${chars ? `; about ${chars} characters of ElevenLabs credit` : ''})`);
}

/**
 * The desk's and the interview's clips (Task 135; vision §12), on ElevenLabs v3, into assets/voices/desk/<presenter>/
 * and assets/voices/interview/<region>-<man|woman>/. Each desk wording once per presenter, or once per team for a
 * wording that names one (spoken as data/studio.json's sayAs or spokenTeam says); each quote once per voice, with its
 * result's mood. Clips already made are skipped, so a run can resume and new lines only cost themselves. Only with
 * \`paid\` (only paid-month clips go on air); \`count\` just totals the characters still to make.
 * With `names` (Task 247b), the commentators' calls naming the scorer: each line with {surname}, once per surname in
 * the regions' pools, by each commentator in data/commentary.json names.voices, into assets/voices/<commentator>/names/.
 * Made in order of importance (Task 248): the interview, the desk's lines without a surname, the commentators' names,
 * the desk's lines with one; `limit` stops a run after that many (a batch in sittings).
 * @param {{ desk: boolean, interviews: boolean, names?: boolean, paid: boolean, count: boolean, limit?: number }} o
 */
async function makeSpeech({ desk, interviews, names = false, analyst = false, podcast = false, paid, count, limit = Infinity, redo = /** @type {RegExp | null} */ (null) }) {
  const read = async (/** @type {string} */ f) => JSON.parse(await readFile(fileURLToPath(new URL(`../../data/${f}`, import.meta.url)), 'utf8'));
  /** @type {{ file: string, text: string, voice: string, named?: boolean }[]} */
  const jobs = [];
  if (desk) {
    const studio = await read('studio.json');
    const { teams } = await read('teams.json');
    /** Every surname in the regions' pools (Task 246a). @type {string[]} */
    const surnames = (await read('regions.json')).regions.flatMap((/** @type {any} */ r) => r.lastNames);
    const spoken = (/** @type {any} */ t) => studio.sayAs?.[t.id] ?? studio.spokenTeam.replace('{name}', t.shortName);
    for (const p of studio.presenters) {
      for (const [kind, k] of Object.entries(/** @type {Record<string, any>} */ (studio.lines))) {
        k.ways.forEach((/** @type {any} */ w, /** @type {number} */ way) => {
          const each = w.say.includes('{team}') ? teams : [null];
          // A way with {surname} (Task 246a): one clip per surname in the regions' pools.
          const names = w.say.includes('{surname}') ? surnames : [null];
          for (const t of each) {
            for (const n of names) {
              const said = (t ? w.say.replace(/\{team\}/g, spoken(t)) : w.say).replace(/\{surname\}/g, n ?? '');
              const text = said.charAt(0).toUpperCase() + said.slice(1);
              jobs.push({ file: join(ASSETS_DIR, 'desk', p.id, `${kind}-${way}${t ? `-${t.id}` : ''}${n ? `-${n.toLowerCase()}` : ''}.mp3`), text: v3Tag(text), voice: p.voice, named: !!n });
            }
          }
        });
      }
    }
  }
  if (analyst) {
    // The playoff analyst (data/analyst.json): each line by who says it, keyed as the desk's (speech.js deskClipKey).
    const draft = await read('analyst.json');
    const studio = await read('studio.json');
    const { teams } = await read('teams.json');
    const spoken = (/** @type {any} */ t) => studio.sayAs?.[t.id] ?? studio.spokenTeam.replace('{name}', t.shortName);
    const him = draft.candidates.find((/** @type {any} */ c) => c.id === draft.pick);
    const host = studio.presenters.find((/** @type {any} */ x) => x.id === draft.host);
    if (!him?.voice || !host) throw new Error('data/analyst.json: the pick needs a voice, and the host a presenter in data/studio.json');
    for (const [kind, k] of Object.entries(/** @type {Record<string, any>} */ (draft.lines))) {
      const by = k.who === 'analyst' ? { id: him.id, voice: him.voice } : { id: host.id, voice: host.voice };
      k.ways.forEach((/** @type {any} */ w, /** @type {number} */ way) => {
        for (const t of w.say.includes('{team}') ? teams : [null]) {
          const said = (t ? w.say.replace(/\{team\}/g, spoken(t)) : w.say).replace(/\{analyst\}/g, him.name);
          jobs.push({ file: join(ASSETS_DIR, 'desk', by.id, `${kind}-${way}${t ? `-${t.id}` : ''}.mp3`), text: v3Tag(said.charAt(0).toUpperCase() + said.slice(1)), voice: by.voice });
        }
      });
    }
  }
  if (podcast) {
    // OFF THE BALL (data/podcast.json, 2026-10-20), each line in the voice of who says it, into assets/voices/podcast/<who>/:
    // the hooks keyed as the desk's (<kind>-<way>[-<team>], v3's tag by the end mark), the discussions' lines
    // (<discussion>-<line>, only their own tags) and the interjections (interjection-<i>).
    const draft = await read('podcast.json');
    const studio = await read('studio.json');
    const { teams } = await read('teams.json');
    const spoken = (/** @type {any} */ t) => studio.sayAs?.[t.id] ?? studio.spokenTeam.replace('{name}', t.shortName);
    const voiceOf = (/** @type {string} */ who) => {
      const v = draft.pair[who]?.voice;
      if (!v) throw new Error(`data/podcast.json: no voice for ${who}`);
      return v;
    };
    const dir = (/** @type {string} */ who) => join(ASSETS_DIR, 'podcast', who);
    for (const [kind, k] of Object.entries(/** @type {Record<string, any>} */ (draft.lines)).filter(([key]) => !key.startsWith('_'))) {
      k.ways.forEach((/** @type {any} */ w, /** @type {number} */ way) => {
        for (const t of w.say.includes('{team}') ? teams : [null]) {
          const said = t ? w.say.replace(/\{team\}/g, spoken(t)) : w.say;
          jobs.push({ file: join(dir(k.who), `${kind}-${way}${t ? `-${t.id}` : ''}.mp3`), text: v3Tag(said.charAt(0).toUpperCase() + said.slice(1)), voice: voiceOf(k.who) });
        }
      });
    }
    for (const [id, d] of Object.entries(/** @type {Record<string, any>} */ (draft.discussions))) {
      d.lines.forEach((/** @type {any} */ l, /** @type {number} */ i) => jobs.push({ file: join(dir(l.who), `${id}-${i}.mp3`), text: l.tag ? `[${l.tag}] ${l.say}` : l.say, voice: voiceOf(l.who) }));
    }
    for (const [who, list] of Object.entries(/** @type {Record<string, string[]>} */ (draft.interjections))) {
      list.forEach((say, i) => jobs.push({ file: join(dir(who), `interjection-${i}.mp3`), text: say, voice: voiceOf(who) }));
    }
  }
  if (interviews) {
    const data = await read('interviews.json');
    const mood = /** @type {Record<string, string>} */ ({ win: '[cheerful] ', draw: '', loss: '[disappointed] ' });
    for (const [region, both] of Object.entries(/** @type {Record<string, any>} */ (data.voices))) {
      for (const sex of ['man', 'woman']) {
        for (const [role, byResult] of Object.entries(/** @type {Record<string, Record<string, string[]>>} */ (data.quotes))) {
          for (const [result, list] of Object.entries(byResult)) {
            list.forEach((q, i) => jobs.push({ file: join(ASSETS_DIR, 'interview', `${region}-${sex}`, `${role}-${result}-${i}.mp3`), text: `${mood[result]}${q}`, voice: both[sex].voice }));
          }
        }
        // Talk that remembers (Tasks 245, 247b): the reactions by result, and the fact sentences, each with the mood of
        // the one result it fits, or none when it fits more than one.
        const dir = join(ASSETS_DIR, 'interview', `${region}-${sex}`);
        for (const [result, list] of Object.entries(/** @type {Record<string, string[]>} */ (data.reactions))) {
          list.forEach((q, i) => jobs.push({ file: join(dir, `reaction-${result}-${i}.mp3`), text: `${mood[result]}${q}`, voice: both[sex].voice }));
        }
        for (const [key, ways] of Object.entries(/** @type {Record<string, { say: string, results: string[] }[]>} */ (data.facts))) {
          ways.forEach((w, i) => jobs.push({ file: join(dir, `fact-${key.replace('.', '-')}-${i}.mp3`), text: `${w.results.length === 1 ? mood[w.results[0]] : ''}${w.say}`, voice: both[sex].voice }));
        }
      }
    }
  }
  if (names) {
    const commentary = JSON.parse(await readFile(COMMENTARY, 'utf8'));
    const pool = (await read('regions.json')).regions.flatMap((/** @type {any} */ r) => r.lastNames);
    for (const id of commentary.names.voices) {
      const c = commentary.commentators.find((/** @type {any} */ x) => x.id === id);
      for (const line of commentary.names.lines.filter((/** @type {any} */ l) => l.say)) {
        for (const n of pool) jobs.push({ file: join(ASSETS_DIR, id, 'names', `${line.id}-${n.toLowerCase()}.mp3`), text: v3Tag(line.say.replace('{surname}', n)), voice: c.voice, named: true });
      }
    }
  }
  const rank = (/** @type {{ file: string, named?: boolean }} */ j) => (/[\\/]interview[\\/]/.test(j.file) ? 0 : !j.named ? 1 : /[\\/]desk[\\/]/.test(j.file) ? 3 : 2);
  const todo = jobs.filter((j) => !existsSync(j.file) || redo?.test(j.file.replace(/\\/g, '/'))).map((j, i) => ({ j, i })).sort((a, b) => rank(a.j) - rank(b.j) || a.i - b.i).map((x) => x.j);
  if (todo.length > limit) {
    const rest = todo.splice(limit);
    console.log(`This run: the first ${limit} (--limit); ${rest.length} left for later, about ${rest.reduce((n, j) => n + j.text.length, 0)} characters.`);
  }
  const chars = todo.reduce((n, j) => n + j.text.length, 0);
  console.log(`${todo.length} of ${jobs.length} clips to make, about ${chars} characters of ElevenLabs credit (about ${Math.round(chars * 0.43)} credits at Tom's rate).`);
  const named = todo.filter((j) => j.named);
  if (named.length) console.log(`  of which ${named.length} say a surname (Task 246a), about ${named.reduce((n, j) => n + j.text.length, 0)} characters.`);
  if (count || !todo.length) return;
  if (!paid) throw new Error('These clips go on air, so they are made during a paid month (vision §12): add --paid');
  // A few requests at once (v3 takes about 4 s a clip, so one at a time ran over two hours).
  let done = 0;
  let next = 0;
  let spent = 0;
  /** @type {unknown} */
  let failed = null;
  const worker = async () => {
    while (next < todo.length && !failed) {
      const j = todo[next++];
      try {
        await mkdir(join(j.file, '..'), { recursive: true });
        const samples = await elevenSpeak(j.text, j.voice, 'v3');
        spent += j.text.length;
        await writeFile(j.file, await toMp3(wav16(tidyClip(samples, ELEVEN_RATE), ELEVEN_RATE)));
      } catch (err) {
        // Stop the batch (out of credit, the key, the network): what's made is kept, a rerun picks up the rest.
        failed = err;
        return;
      }
      if (++done % 50 === 0) console.log(`${done} of ${todo.length} (${new Date().toLocaleTimeString()})`);
    }
  };
  await Promise.all(Array.from({ length: SPEECH_AT_ONCE }, worker));
  console.log(`Made ${done} clips, about ${spent} characters.`);
  await writeLengths();
  if (failed) throw failed;
}

/**
 * Every desk and interview clip's length (Task 187) into assets/voices/lengths.json, which the channel times the
 * desk's lines and the interview by. Run after any batch of clips (makeSpeech does it itself).
 */
async function writeLengths() {
  /** @type {Record<string, number>} */
  const lengths = {};
  for (const top of ['desk', 'interview', 'podcast'].filter((t) => existsSync(join(ASSETS_DIR, t)))) {
    const files = (await readdir(join(ASSETS_DIR, top), { recursive: true })).filter((f) => f.endsWith('.mp3')).map((f) => f.replace(/\\/g, '/')).sort();
    for (const f of files) lengths[`${top}/${f.replace(/\.mp3$/, '')}`] = Math.round(mp3Seconds(await readFile(join(ASSETS_DIR, top, f))) * 100) / 100;
  }
  const comment = 'How long each desk and interview clip plays, in seconds (Task 187): written by npm run voices -- --lengths (and after any --desk/--interviews batch); the channel times the desk\'s lines and the interview by it.';
  await writeFile(join(ASSETS_DIR, 'lengths.json'), `${JSON.stringify({ _comment: comment, ...lengths }, null, 0).replace(/,"/g, ',\n"')}\n`);
  console.log(`Wrote the lengths of ${Object.keys(lengths).length} clips to assets/voices/lengths.json.`);
}

/** A try-out's versions of each line (Task 126): speeds, and how the line ends (an end mark shapes the delivery). */
const TRY_VERSIONS = [
  { id: 'plain-1', label: 'as written', speed: 1, end: null },
  { id: 'plain-115', label: 'as written', speed: 1.15, end: null },
  { id: 'plain-13', label: 'as written', speed: 1.3, end: null },
  { id: 'bang2-115', label: 'ends "!!"', speed: 1.15, end: '!!' },
  { id: 'stop-115', label: 'ends "."', speed: 1.15, end: '.' },
  { id: 'none-115', label: 'no end mark', speed: 1.15, end: '' },
];

/**
 * Try a Kokoro voice as a commentator (Task 126): every commentary line in each of TRY_VERSIONS, tidied as the
 * channel's clips are, into output/voices/try-<voice>/ with an index the sound board shows.
 * @param {string} voice
 */
async function tryVoice(voice) {
  const data = JSON.parse(await readFile(COMMENTARY, 'utf8'));
  const { KokoroTTS } = await import('kokoro-js');
  const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  const top = `try-${voice}`;
  for (const v of TRY_VERSIONS) {
    const dir = join(OUT_DIR, top, v.id);
    await mkdir(dir, { recursive: true });
    for (const line of data.lines) {
      const say = v.end === null ? line.say : `${line.say.replace(/[.!?]+$/, '')}${v.end}`;
      const raw = await tts.generate(say, { voice, speed: v.speed });
      await writeFile(join(dir, `${line.id}.wav`), wav16(tidyClip(raw.audio, raw.sampling_rate), raw.sampling_rate));
    }
    console.log(`${v.label.padEnd(12)} ×${v.speed}  ${data.lines.length} lines`);
  }
  const index = {
    title: `Trying ${voice} (Task 126)`,
    lines: data.lines,
    voices: TRY_VERSIONS.map((v) => ({ group: v.end === null ? 'As written' : 'Endings, ×1.15', dir: `${top}/${v.id}`, label: v.label, accent: `×${v.speed}` })),
  };
  await writeFile(join(OUT_DIR, top, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  await listTry(top);
  console.log(`Wrote ${join(OUT_DIR, top)}`);
}

/** Add a try to the list the sound board shows (output/voices/tries.json). @param {string} top */
async function listTry(top) {
  const triesFile = join(OUT_DIR, 'tries.json');
  const tries = existsSync(triesFile) ? JSON.parse(await readFile(triesFile, 'utf8')) : [];
  await writeFile(triesFile, `${JSON.stringify([...tries.filter((/** @type {string} */ t) => t !== top), top])}\n`);
}

/** The ElevenLabs try-out's versions of each line: v3 with a delivery tag (Tom ruled out the standard model: "a bit dry"). */
const ELEVEN_VERSIONS = /** @type {const} */ ([
  { id: 'v3', label: 'v3 [tagged]', model: 'v3', tag: true },
]);
/** The interview's quotes as try-out lines (Task 133): a scorer's win, a keeper's draw, an outfield player's loss (all of
 * them with --all), each with v3's mood for its result (cheerful for a win, disappointed for a loss). */
async function quoteLines() {
  const q = JSON.parse(await readFile(fileURLToPath(new URL('../../data/interviews.json', import.meta.url)), 'utf8')).quotes;
  const mood = /** @type {Record<string, string>} */ ({ win: '[cheerful] ', draw: '', loss: '[disappointed] ' });
  const sample = new Set(['scorer-win-1', 'keeper-draw-2', 'other-loss-1']);
  const lines = Object.entries(q).flatMap(([role, byResult]) => Object.entries(/** @type {Record<string, string[]>} */ (byResult)).flatMap(([result, list]) => list.map((text, i) => ({ id: `${role}-${result}-${i}`, text: `${role}, ${result}: ${text}`, say: `${mood[result]}${text}` }))));
  // Each sample line its own "moment", so the try-out's sample (the first two of each) keeps all three.
  return { lines, moments: Object.fromEntries([...sample].map((id) => [id, { lines: [id] }])) };
}

/** Each team's name in a desk line (Task 134), as data/studio.json's spokenTeam says it, and the welcome's "Scorchball",
 * so mispronunciations show. */
async function teamLines() {
  const studio = JSON.parse(await readFile(fileURLToPath(new URL('../../data/studio.json', import.meta.url)), 'utf8'));
  const teams = JSON.parse(await readFile(fileURLToPath(new URL('../../data/teams.json', import.meta.url)), 'utf8')).teams;
  const lines = teams.map((/** @type {any} */ t) => {
    const name = (studio.sayAs?.[t.id] ?? studio.spokenTeam.replace('{name}', t.shortName));
    return { id: t.id, text: `${t.shortName}`, say: `That's another win for ${name}.` };
  });
  // And the channel's own name, said in the welcome.
  lines.push({ id: 'scorchball', text: 'Scorchball', say: 'Hello, and welcome to Scorchball.' });
  return { lines, moments: Object.fromEntries(lines.map((l) => [l.id, { lines: [l.id] }])) };
}

/**
 * The playoff analyst's lines as try-out lines (data/analyst.json, a draft): each of the analyst's kinds said its first
 * way, a team named where the line names one (a different team each, as data/studio.json's spokenTeam says it); a
 * sample of seven kinds, or every kind with --all.
 */
async function analystLines() {
  const draft = JSON.parse(await readFile(fileURLToPath(new URL('../../data/analyst.json', import.meta.url)), 'utf8'));
  const studio = JSON.parse(await readFile(fileURLToPath(new URL('../../data/studio.json', import.meta.url)), 'utf8'));
  const teams = JSON.parse(await readFile(fileURLToPath(new URL('../../data/teams.json', import.meta.url)), 'utf8')).teams;
  const spoken = (/** @type {any} */ t) => studio.sayAs?.[t.id] ?? studio.spokenTeam.replace('{name}', t.shortName);
  const kinds = Object.entries(draft.lines).filter(([, d]) => /** @type {any} */ (d).who === 'analyst');
  const lines = kinds.map(([kind, d], i) => {
    const say = /** @type {any} */ (d).ways[0].say.replace('{team}', spoken(teams[i % teams.length]));
    const said = say.charAt(0).toUpperCase() + say.slice(1);
    return { id: kind, text: said, say: said };
  });
  const sample = ['analystHello', 'caseTop', 'caseScraped', 'favourite', 'upset', 'keeper', 'analystClose'];
  return { lines, moments: Object.fromEntries(sample.map((id) => [id, { lines: [id] }])) };
}

/**
 * OFF THE BALL's lines as try-out lines for one seat (data/podcast.json, 2026-10-20): a few hooks (one naming a team,
 * as data/studio.json's spokenTeam says it), that seat's half of the first discussion with its delivery tags, and three
 * of their interjections. Every line is in the sample. With `talk` (Tom, 2026-10-20: a voice must be heard against the
 * other's), only their half of the discussion, and the whole of it in order with the other's voiced clips
 * (assets/voices/podcast/<other>/) for the sound board to play as a conversation.
 * @param {'tamsin' | 'samir'} who @param {boolean} [talk]
 */
async function podcastLines(who, talk = false) {
  const draft = JSON.parse(await readFile(fileURLToPath(new URL('../../data/podcast.json', import.meta.url)), 'utf8'));
  const studio = JSON.parse(await readFile(fileURLToPath(new URL('../../data/studio.json', import.meta.url)), 'utf8'));
  const teams = JSON.parse(await readFile(fileURLToPath(new URL('../../data/teams.json', import.meta.url)), 'utf8')).teams;
  const spoken = (/** @type {any} */ t) => studio.sayAs?.[t.id] ?? studio.spokenTeam.replace('{name}', t.shortName);
  const hooks = { tamsin: ['open', 'tableTopReply', 'hotTakeCup'], samir: ['openReply', 'tableTop', 'pickWrongSamir'] }[who];
  const asSaid = (/** @type {string} */ s) => s.charAt(0).toUpperCase() + s.slice(1);
  const lines = hooks.map((kind, i) => {
    const say = asSaid(draft.lines[kind].ways[0].say.replace('{team}', spoken(teams[(i * 3) % teams.length])));
    return { id: kind, text: say, say };
  });
  const [first, discussion] = Object.entries(draft.discussions)[0];
  if (talk) lines.length = 0;
  discussion.lines.forEach((/** @type {any} */ l, i) => {
    if (l.who === who) lines.push({ id: `${first}-${i}`, text: l.tag ? `[${l.tag}] ${l.say}` : l.say, say: l.tag ? `[${l.tag}] ${l.say}` : l.say });
  });
  if (talk) {
    // The discussion in order: this seat's lines by id, the other's from their voiced clips.
    const conversation = discussion.lines.map((/** @type {any} */ l, /** @type {number} */ i) => (l.who === who ? { id: `${first}-${i}` } : { clip: `assets/voices/podcast/${l.who}/${first}-${i}.mp3`, text: l.say }));
    // Today's voice for the seat, as a column to compare with.
    const today = { group: 'Today', path: `assets/voices/podcast/${who}`, ext: 'mp3', label: draft.pair[who]._voice?.split(', an ')[0] ?? 'today', accent: 'voiced' };
    return { lines, moments: Object.fromEntries(lines.map((l) => [l.id, { lines: [l.id] }])), conversation, today };
  }
  const picks = { tamsin: ['Mm-hm.', 'Ha! No.', 'Oh, here we go.'], samir: ['Exactly.', 'Hold on.', 'Oh, come on.'] }[who];
  picks.forEach((say, i) => lines.push({ id: `interjection-${i}`, text: say, say }));
  return { lines, moments: Object.fromEntries(lines.map((l) => [l.id, { lines: [l.id] }])), podcast: true };
}

/** v3's delivery tag for a line: excited for "!", none for a calmer line. @param {string} say */
const v3Tag = (say) => (say.trim().endsWith('!') ? `[excited] ${say}` : say);

/**
 * Try ElevenLabs voices as commentators (Task 127): a sample of the commentary lines (the first two of each
 * moment), or all of them, in each of ELEVEN_VERSIONS, tidied as the channel's clips are, into
 * output/voices/try-11/<voice>/<version>/. One grid on the sound board; a later run adds its voices to it.
 * Free-plan clips are for auditioning only (see elevenlabs.js).
 * @param {string} wanted  Voice names or ids, comma-separated. @param {boolean} all
 */
async function tryEleven(wanted, all, quotes = false, teams = false, analyst = false, podcast = /** @type {'tamsin' | 'samir' | null} */ (null), count = false, talk = false) {
  const data = podcast ? await podcastLines(podcast, talk) : analyst ? await analystLines() : teams ? await teamLines() : quotes ? await quoteLines() : JSON.parse(await readFile(COMMENTARY, 'utf8'));
  const known = await elevenVoices();
  const voices = wanted.split(',').map((w) => w.trim()).filter(Boolean).map((w) => {
    // A shared Library voice by its id, named for the grid: "gU0LNdkMOQCOrPrwtbee=Announcer".
    const [id, name] = w.split('=');
    if (name) return { id, name, category: 'library', accent: 'library', gender: '', age: '' };
    const v = known.find((k) => k.id === w) ?? known.find((k) => k.name.toLowerCase().startsWith(w.toLowerCase()));
    if (!v) throw new Error(`No ElevenLabs voice "${w}" (npm run voices -- --list-11 lists them; a Library voice is id=Name)`);
    return v;
  });
  const sample = new Set(Object.values(data.moments).flatMap((/** @type {any} */ m) => m.lines.slice(0, 2)));
  const lines = data.lines.filter((/** @type {any} */ l) => all || sample.has(l.id));
  const top = podcast ? `try-11-podcast-${podcast}${talk ? '-talk' : ''}` : analyst ? 'try-11-analyst' : teams ? 'try-11-teams' : quotes ? 'try-11-players' : 'try-11';
  const asSaid = (/** @type {any} */ line, /** @type {any} */ version) => (quotes || teams || podcast ? line.say : version.tag ? v3Tag(line.say) : line.say);
  if (count) {
    // What a run would make: the clips not made yet, never calling ElevenLabs to speak.
    let clips = 0;
    let chars = 0;
    for (const v of voices) {
      const slug = quotes || teams ? v.id : v.name.split(/[ –-]/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || v.id;
      for (const version of ELEVEN_VERSIONS) {
        for (const line of lines.filter((/** @type {any} */ l) => !existsSync(join(OUT_DIR, top, slug, version.id, `${l.id}.wav`)))) {
          clips++;
          chars += asSaid(line, version).length;
        }
      }
    }
    console.log(`${clips} clips to make for ${voices.length} voices, about ${chars} characters (about ${Math.round(chars * 0.43)} credits at Tom's rate).`);
    return;
  }
  const indexFile = join(OUT_DIR, top, 'index.json');
  const index = existsSync(indexFile) ? JSON.parse(await readFile(indexFile, 'utf8'))
    : podcast && talk ? { title: `OFF THE BALL, ${podcast === 'tamsin' ? 'Tamsin' : 'Samir'} in conversation (2026-10-20): his half of a discussion; CONVERSATION plays it all with the other's voiced clips`, lines: [], voices: [data.today], conversation: data.conversation }
      : { title: podcast ? `OFF THE BALL, ${podcast === 'tamsin' ? 'Tamsin Tregarrow (a former keeper from the Gullcoast, a career backup)' : 'Samir Haddani (a data analyst from Sunreach)'} (2026-10-20): a few hooks, their half of a discussion, interjections` : analyst ? 'The playoff analyst, Radomir Brodek (Krenn until 2026-10-18; 2026-10-17): a sample of his lines' : teams ? 'Team names at the desk (Task 134)' : quotes ? 'Trying player voices for the interview (Task 133)' : 'Trying ElevenLabs voices (Task 127; free-plan clips, for auditioning only)', lines: [], voices: [] };
  // Lines: any new ones join, in the order data/commentary.json has them.
  const have = new Set([...index.lines.map((/** @type {any} */ l) => l.id), ...lines.map((/** @type {any} */ l) => l.id)]);
  index.lines = data.lines.filter((/** @type {any} */ l) => have.has(l.id));
  let chars = 0;
  for (const v of voices) {
    const slug = quotes || teams ? v.id : v.name.split(/[ –-]/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || v.id;
    for (const version of ELEVEN_VERSIONS) {
      const dir = join(OUT_DIR, top, slug, version.id);
      await mkdir(dir, { recursive: true });
      for (const line of lines) {
        // Already made (an earlier run): never paid for twice.
        if (existsSync(join(dir, `${line.id}.wav`))) continue;
        const text = asSaid(line, version);
        chars += text.length;
        const samples = await elevenSpeak(text, v.id, version.model);
        await writeFile(join(dir, `${line.id}.wav`), wav16(tidyClip(samples, ELEVEN_RATE), ELEVEN_RATE));
      }
      const entry = { group: v.name.split(/ [–-] /)[0], dir: `${top}/${slug}/${version.id}`, label: quotes || teams ? (v.name.split(/ [–-] /)[1] ?? v.name) : version.label, accent: `${v.accent} ${v.gender}`.trim() };
      index.voices = [...index.voices.filter((/** @type {any} */ e) => e.dir !== entry.dir), entry];
      // Saved as each version finishes, so the sound board fills in while a long run goes on.
      await writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`);
      await listTry(top);
      console.log(`${v.name.slice(0, 40).padEnd(40)} ${version.label.padEnd(12)} ${lines.length} lines`);
    }
  }
  console.log(`About ${chars} characters of ElevenLabs credit used. Wrote ${join(OUT_DIR, top)}`);
}

/**
 * The surname try-out (Task 244): can a player's surname, voiced on its own, be joined to the lines already made? Twelve
 * surnames from the four regions' pools (data/regions.json), easy and tricky, in two commentators' voices (shouted, to
 * follow a goal call or open one) and both presenters' (calm, to end a line or open one); a carrier line for the desk
 * to end on a name and one to follow a name; and a few whole sentences with the name inside, to hear the joins beside
 * what a single take sounds like. Into output/voices/try-names/<voice>/, with an index the sound board's "Names
 * joined" grid reads. Clips already made are skipped. `count` only totals the characters.
 * @param {{ count: boolean }} o
 */
async function tryNames({ count }) {
  const names = ['Penhallow', 'Trebilcock', 'Polkinghorn', 'Bonnefoy', 'Hautecoeur', 'Chanteloup', 'Prochazka', 'Halvorsk', 'Zahradnik', 'Qadesh', 'Bakhtiar', 'Esfahani'];
  const regions = JSON.parse(await readFile(fileURLToPath(new URL('../../data/regions.json', import.meta.url)), 'utf8')).regions;
  const regionOf = (/** @type {string} */ n) => regions.find((/** @type {any} */ r) => r.lastNames.includes(n))?.name ?? '?';
  const commentary = JSON.parse(await readFile(COMMENTARY, 'utf8'));
  const studio = JSON.parse(await readFile(fileURLToPath(new URL('../../data/studio.json', import.meta.url)), 'utf8'));
  const caller = (/** @type {string} */ id) => commentary.commentators.find((/** @type {any} */ c) => c.id === id);
  const voices = [
    { id: 'el_george', label: caller('el_george').name, voice: caller('el_george').voice, role: 'commentator' },
    { id: 'el_announcer', label: caller('el_announcer').name, voice: caller('el_announcer').voice, role: 'commentator' },
    ...studio.presenters.map((/** @type {any} */ p) => ({ id: p.id, label: p.name, voice: p.voice, role: 'desk' })),
  ];
  // The whole sentences: the first three names only, to hear the difference without paying for every name.
  const whole = names.slice(0, 3);
  const carriers = { into: 'Our player of the match,', after: 'What a game they had.' };
  /** @type {{ file: string, text: string, voice: string }[]} */
  const jobs = [];
  for (const v of voices) {
    const dir = join(OUT_DIR, 'try-names', v.id);
    const job = (/** @type {string} */ id, /** @type {string} */ text) => jobs.push({ file: join(dir, `${id}.wav`), text, voice: v.voice });
    for (const n of names) job(n, v.role === 'commentator' ? v3Tag(`${n}!`) : `${n}.`);
    if (v.role === 'desk') {
      job('carrier-into', carriers.into);
      job('carrier-after', carriers.after);
      for (const n of whole) job(`whole-into-${n}`, `${carriers.into} ${n}.`);
      for (const n of whole.slice(0, 2)) job(`whole-after-${n}`, `${n}. ${carriers.after}`);
    } else {
      for (const n of whole) job(`whole-goal-${n}`, v3Tag(`Goal! ${n}!`));
    }
  }
  const todo = jobs.filter((j) => !existsSync(j.file));
  const chars = todo.reduce((t, j) => t + j.text.length, 0);
  console.log(`${todo.length} of ${jobs.length} clips to make, about ${chars} characters (about ${Math.round(chars * 0.43)} credits at Tom's rate).`);
  if (count) return;
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const j = todo[next++];
      await mkdir(join(j.file, '..'), { recursive: true });
      await writeFile(j.file, wav16(tidyClip(await elevenSpeak(j.text, j.voice, 'v3'), ELEVEN_RATE), ELEVEN_RATE));
      done++;
    }
  };
  await Promise.all(Array.from({ length: SPEECH_AT_ONCE }, worker));
  const index = {
    title: 'Names joined (Task 244)',
    names: names.map((n) => ({ name: n, region: regionOf(n) })),
    whole, carriers,
    voices: voices.map(({ id, label, role }) => ({ id, label, role })),
  };
  await writeFile(join(OUT_DIR, 'try-names', 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`Made ${done} clips. Wrote ${join(OUT_DIR, 'try-names')}`);
}

/**
 * Turn every WAV under assets/voices/ into an MP3 beside it, then remove the WAV (Task 136): the channel's clips at
 * about a ninth of the size. Already-compressed clips are left alone.
 */
async function compress() {
  /** @param {string} dir @returns {Promise<string[]>} */
  const wavs = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map((e) => (e.isDirectory() ? wavs(join(dir, e.name)) : e.name.endsWith('.wav') ? [join(dir, e.name)] : [])))).flat();
  const files = await wavs(ASSETS_DIR);
  let before = 0;
  let after = 0;
  let done = 0;
  let next = 0;
  const worker = async () => {
    while (next < files.length) {
      const f = files[next++];
      const wav = await readFile(f);
      const mp3 = await toMp3(wav);
      await writeFile(f.replace(/\.wav$/, '.mp3'), mp3);
      await rm(f);
      before += wav.length;
      after += mp3.length;
      if (++done % 200 === 0) console.log(`${done} of ${files.length}`);
    }
  };
  await Promise.all(Array.from({ length: COMPRESS_AT_ONCE }, worker));
  console.log(`Compressed ${done} clips: ${Math.round(before / 1048576)} MB to ${Math.round(after / 1048576)} MB.`);
}

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      assets: { type: 'boolean', default: false }, who: { type: 'string' }, paid: { type: 'boolean', default: false }, try: { type: 'string' }, 'list-11': { type: 'boolean', default: false }, 'try-11': { type: 'string' },
      all: { type: 'boolean', default: false }, desk: { type: 'boolean', default: false }, interviews: { type: 'boolean', default: false }, count: { type: 'boolean', default: false }, compress: { type: 'boolean', default: false }, lengths: { type: 'boolean', default: false }, quotes: { type: 'boolean', default: false }, teams: { type: 'boolean', default: false }, analyst: { type: 'boolean', default: false }, podcast: { type: 'boolean', default: false }, talk: { type: 'boolean', default: false }, 'try-names': { type: 'boolean', default: false }, names: { type: 'boolean', default: false }, limit: { type: 'string' }, redo: { type: 'string' }, only: { type: 'string' }, piper: { type: 'string', default: join(homedir(), 'tools', 'piper') },
    },
    strict: true,
  });
  if (values.compress) return compress();
  if (values.lengths) return writeLengths();
  if (values.desk || values.interviews || values.names || ((values.analyst || values.podcast) && !values['try-11'])) return makeSpeech({ desk: values.desk, interviews: values.interviews, names: values.names, analyst: values.analyst, podcast: values.podcast, paid: values.paid, count: values.count, limit: values.limit ? Number(values.limit) : Infinity, redo: values.redo ? new RegExp(values.redo) : null });
  if (values.assets) return makeAssets({ who: values.who, paid: values.paid, count: values.count });
  if (values.try) return tryVoice(values.try);
  if (values['list-11']) {
    for (const v of await elevenVoices()) console.log(`${v.id}  ${v.name.slice(0, 50).padEnd(50)} ${v.category.padEnd(12)} ${v.accent} ${v.gender} ${v.age}`);
    return;
  }
  if (values['try-names']) return tryNames({ count: values.count });
  if (values['try-11']) {
    if (values.podcast && values.who !== 'tamsin' && values.who !== 'samir') throw new Error('--podcast needs --who tamsin or --who samir');
    return tryEleven(values['try-11'], values.all, values.quotes, values.teams, values.analyst, values.podcast ? /** @type {'tamsin' | 'samir'} */ (values.who) : null, values.count, values.talk);
  }
  const voices = VOICES.filter((v) => !values.only || v.engine === values.only);
  if (voices.some((v) => v.engine === 'piper') && !existsSync(join(values.piper, 'piper', 'piper.exe'))) {
    throw new Error(`Piper not found in ${values.piper} (pass --piper <folder>, or --only kokoro)`);
  }
  /** @type {any} */
  let kokoro = null;
  if (voices.some((v) => v.engine === 'kokoro')) {
    const { KokoroTTS } = await import('kokoro-js');
    kokoro = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
  }
  for (const v of voices) {
    const dir = join(OUT_DIR, v.engine, v.id);
    await mkdir(dir, { recursive: true });
    const started = Date.now();
    for (const line of LINES) {
      const file = join(dir, `${line.id}.wav`);
      if (v.engine === 'kokoro') (await kokoro.generate(line.say, { voice: v.id })).save(file);
      else await piperSay(values.piper, v.id, line.say, file);
    }
    console.log(`${v.engine.padEnd(6)} ${v.label.padEnd(9)} ${LINES.length} lines in ${((Date.now() - started) / 1000).toFixed(1)} s`);
  }
  await writeFile(join(OUT_DIR, 'index.json'), `${JSON.stringify({ lines: LINES, voices: VOICES }, null, 2)}\n`);
  console.log(`Wrote ${OUT_DIR}`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}
