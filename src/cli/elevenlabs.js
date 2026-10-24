// ElevenLabs text-to-speech (Task 127), for making voice clips ahead of time on Tom's machine: never called by the
// channel or by viewers. The key is ELEVENLABS_API_KEY in .env (gitignored), never in code or logs. No dependency:
// Node's own fetch and .env loader.
//
// Terms (Tom, 2026-10-06, from ElevenLabs): clips made during a paid subscription keep a commercial licence for good;
// clips made on the free plan always need attribution. So free-plan clips are for auditioning only (output/), and
// the channel's own clips (assets/) are made during a paid month.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = 'https://api.elevenlabs.io/v1';
const ENV_FILE = fileURLToPath(new URL('../../.env', import.meta.url));
/** Clips come back as raw 16-bit PCM at this rate (available on every plan). */
export const ELEVEN_RATE = 24000;
/** When ElevenLabs is busy (429): how many tries, and the wait before the next (ms, times the try). */
const BUSY_TRIES = 6;
const BUSY_WAIT_MS = 2000;
/** The models tried: the standard one, and v3, which takes delivery tags like [excited]. */
export const ELEVEN_MODELS = /** @type {const} */ ({ v2: 'eleven_multilingual_v2', v3: 'eleven_v3' });

/** @returns {string} */
function apiKey() {
  if (!process.env.ELEVENLABS_API_KEY && existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('No ELEVENLABS_API_KEY: put it in .env in the project folder');
  return key;
}

/** Why a request failed, without echoing anything sent. @param {Response} res */
async function failure(res) {
  const body = await res.text();
  let message = body.slice(0, 200);
  try {
    message = JSON.parse(body).detail?.message ?? message;
  } catch { /* not JSON */ }
  return new Error(`ElevenLabs ${res.status}: ${message}`);
}

/**
 * The voices this account can use.
 * @returns {Promise<{ id: string, name: string, category: string, accent: string, gender: string, age: string }[]>}
 */
export async function elevenVoices() {
  const res = await fetch(`${API}/voices`, { headers: { 'xi-api-key': apiKey() } });
  if (!res.ok) throw await failure(res);
  const { voices } = await res.json();
  return voices.map((/** @type {any} */ v) => ({
    id: v.voice_id, name: v.name, category: v.category, accent: v.labels?.accent ?? '', gender: v.labels?.gender ?? '', age: v.labels?.age ?? '',
  }));
}

/**
 * Speak `text` with a voice: the samples (−1…1) at ELEVEN_RATE. `speed`: 1 is the voice's own pace.
 * @param {string} text @param {string} voiceId @param {keyof typeof ELEVEN_MODELS} model @param {number} [speed]
 * @returns {Promise<Float32Array>}
 */
export async function elevenSpeak(text, voiceId, model, speed = 1) {
  /** @type {Response} */
  let res;
  // Busy (too many requests at once): wait a little longer each time and try again.
  for (let attempt = 1; ; attempt++) {
    res = await fetch(`${API}/text-to-speech/${voiceId}?output_format=pcm_${ELEVEN_RATE}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey(), 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: ELEVEN_MODELS[model], ...(speed === 1 ? {} : { voice_settings: { speed } }) }),
    });
    if (res.status !== 429 || attempt >= BUSY_TRIES) break;
    await new Promise((ok) => setTimeout(ok, BUSY_WAIT_MS * attempt));
  }
  if (!res.ok) throw await failure(res);
  const bytes = Buffer.from(await res.arrayBuffer());
  const samples = new Float32Array(Math.floor(bytes.length / 2));
  for (let i = 0; i < samples.length; i++) samples[i] = bytes.readInt16LE(i * 2) / 32768;
  return samples;
}
