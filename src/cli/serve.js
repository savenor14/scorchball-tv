// Dev static server for the channel: ES modules won't load from file://, so the page needs http://.
// Serves the project folder read-only on this computer only (127.0.0.1). No dependencies.
// From Task 260 it also stands in for the audience service until the launch (docs/channel.md §23; vision §8): POST
// /api/audience/vote and /api/audience/note append to output/audience/votes.jsonl and notes.jsonl, and (Task 277e)
// /api/audience/hello to hellos.jsonl. Fan Coins version 2 (2026-10-17): /api/audience/coins/* answered by the audience
// service's own code (worker/audience.js) over a local SQLite database, output/audience/coins.db (localD1.js).
// Usage: npm run channel [-- --port 8080]
import { appendFile, mkdir, readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { createCalendar } from '../channel/calendar.js';
import { allPolls } from '../channel/polls.js';
import { sha256 } from '../sim/sha256.js';
import { approve, deskPaths, deskState, markNote, markViewer, reject, runDirectorProcess, todayPosts, updateIdea } from './directorDesk.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';
import { saveRecording } from './recordingsStore.js';
import { localD1 } from './localD1.js';
import { handle as serviceHandle } from '../../worker/audience.js';

/** A recording's WAV can be this large (the longest music loop, stereo at 48 kHz, is about 9 MB). */
const MAX_WAV = 32 * 1024 * 1024;

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** @type {Record<string, string>} */
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

/**
 * Map a request path to a file inside `root`, or null if it isn't allowed: outside the root, or under a
 * dot-folder such as .git. "/" and folders map to their index.html.
 * @param {string} root  Absolute folder path.
 * @param {string} urlPath  The URL's pathname, still percent-encoded.
 * @returns {string | null}
 */
export function resolveRequest(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const file = resolve(root, `.${decoded.endsWith('/') ? `${decoded}index.html` : decoded}`);
  const rel = relative(resolve(root), file);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null;
  if (rel.split(sep).some((part) => part.startsWith('.'))) return null;
  return file;
}

/** The largest request body the audience endpoints read, bytes. */
const MAX_BODY = 8192;
/** The longest "what was on air" line kept with a note. */
const MAX_ON_AIR = 300;

/**
 * Check an audience request and turn it into the line to keep, or say what's wrong.
 * @param {'vote' | 'note' | 'hello'} kind
 * @param {any} body  The parsed JSON.
 * @param {import('../config.js').Config} config  Read fresh for each request, so a poll added while the server runs counts.
 * @param {number} now  Epoch ms, stamped on the line.
 * @param {string} [viewer]  A hello's viewer: a short hash of the connection.
 * @returns {{ line: object } | { error: string }}
 */
export function audienceLine(kind, body, config, now, viewer = 'local') {
  const at = new Date(now).toISOString();
  if (kind === 'hello') {
    // A visit's hello (Task 277e): its random id, and the viewer as the service keeps them (a tag, never the address).
    const session = body?.session;
    if (typeof session !== 'string' || !/^[0-9a-f]{16,32}$/.test(session)) return { error: 'A hello needs its visit' };
    // The link it came in by (?from=), as the service keeps it.
    const from = typeof body?.from === 'string' && /^[a-z0-9-]{1,16}$/.test(body.from) ? body.from : null;
    return { line: { at, session, viewer, ...(from ? { from } : {}) } };
  }
  if (kind === 'vote') {
    const { pollId, optionId } = body ?? {};
    if (typeof pollId !== 'string' || typeof optionId !== 'string') return { error: 'A vote needs pollId and optionId' };
    // Only a known poll and one of its options. Whether it's open isn't checked here: the channel can be watched at
    // any moment with ?at=, so the dev server can't tell; the hosted service checks it against the real clock.
    const poll = allPolls(config, createCalendar(config), now).find((p) => p.id === pollId);
    if (!poll || !poll.options.some((o) => o.id === optionId)) return { error: 'No such poll or option' };
    return { line: { at, pollId, optionId } };
  }
  const { text, onAir } = body ?? {};
  if (typeof text !== 'string' || !text.trim()) return { error: 'A note needs some text' };
  if (text.length > config.settings.audience.noteMaxChars) return { error: `A note is at most ${config.settings.audience.noteMaxChars} characters` };
  return { line: { at, text, onAir: typeof onAir === 'string' ? onAir.slice(0, MAX_ON_AIR) : '' } };
}

/**
 * The headers a `_headers` file (Cloudflare Pages' format, written by npm run publish) gives a path: every rule whose
 * pattern matches (`*` any run of characters), in order; "Name: value" sets a header, "! Name" takes one off. Names in
 * lower case. So --root dist serves the security headers as the host will (the security pass, 2026-10-16).
 * @param {string} text @param {string} urlPath
 * @returns {Record<string, string>}
 */
export function headersFor(text, urlPath) {
  /** @type {Record<string, string>} */
  const out = {};
  let on = false;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      const pattern = raw.trim().split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, (c) => `\\${c}`)).join('.*');
      on = new RegExp(`^${pattern}$`).test(urlPath);
      continue;
    }
    if (!on) continue;
    const line = raw.trim();
    if (line.startsWith('!')) delete out[line.slice(1).trim().toLowerCase()];
    else {
      const i = line.indexOf(':');
      if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    }
  }
  return out;
}

/**
 * Whether a request's Host names this computer (localhost, 127.0.0.1 or [::1], any port, or a name under .localhost).
 * @param {string | undefined} host
 */
export function localHost(host) {
  if (!host) return false;
  const name = host.toLowerCase().replace(/:\d+$/, '');
  return name === 'localhost' || name === '127.0.0.1' || name === '[::1]' || name.endsWith('.localhost');
}

/**
 * A static file server for `root`. GET and HEAD, plus the audience endpoints' POSTs and the Director's desk (Task 264:
 * /api/director/state, run, approve, reject, note, roadmap, viewer; only with the x-director header, which a page from another site
 * can't send, so nothing else can approve). Nothing is cached, so edits show on reload.
 * @param {string} [root]
 * @param {{ audienceDir?: string, loadConfig?: () => Promise<import('../config.js').Config>, desk?: import('./directorDesk.js').DeskPaths, coinsDb?: string }} [o]
 *   Where votes and notes are kept (output/audience/ by default), how the config is read and where the desk works
 *   (tests pass their own).
 */
export function createStaticServer(root = PROJECT_ROOT, { audienceDir = join(PROJECT_ROOT, 'output', 'audience'), loadConfig = loadConfigFromDisk, desk = deskPaths(), coinsDb } = {}) {
  /** Fan Coins' database, opened on first use. @type {ReturnType<typeof localD1> | null} */
  let coins = null;
  /** @type {Map<string, number>} When each viewer was last heard from, for the ticker's count as the service gives it. */
  const heard = new Map();
  return createServer(async (req, res) => {
    /** @param {number} status @param {string} text */
    const fail = (status, text) => {
      res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
      res.end(text);
    };
    /** @param {any} value */
    const json = (value) => {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      res.end(JSON.stringify(value));
    };
    /** The request's JSON body, or undefined (having answered) if it's too large or not JSON. */
    const readBody = async () => {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > MAX_BODY) return void fail(413, 'Too large');
      }
      try {
        return JSON.parse(raw || '{}');
      } catch {
        return void fail(400, 'Not JSON');
      }
    };
    // Only a page that asked for this computer by name (the security pass, task 5): a site whose name was pointed at
    // 127.0.0.1 (DNS rebinding) still sends its own name, and is refused.
    if (!localHost(req.headers.host)) return fail(403, 'This computer only');
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path.startsWith('/api/director/')) {
      if (req.headers['x-director'] !== '1') return fail(403, 'The Director\'s desk only');
      const action = path.slice('/api/director/'.length);
      try {
        if (action === 'state' && req.method === 'GET') return json(await deskState(desk));
        if (action === 'today' && req.method === 'GET') return json(await todayPosts(desk));
        if (req.method !== 'POST') return fail(405, 'Method not allowed');
        const body = await readBody();
        if (body === undefined) return;
        if (action === 'run') return json({ printed: await runDirectorProcess(desk, typeof body.at === 'string' && body.at ? body.at : null) });
        if (action === 'approve') return json(await approve(desk, String(body.id), typeof body.reason === 'string' ? body.reason : undefined));
        if (action === 'reject') return json((await reject(desk, String(body.id), String(body.note ?? '')), {}));
        if (action === 'note') return json((await markNote(desk, String(body.at), body), {}));
        if (action === 'viewer') return json((await markViewer(desk, String(body.viewer), body.me === true), {}));
        if (action === 'roadmap') return json((await updateIdea(desk, String(body.id), body), {}));
        return fail(404, 'Not found');
      } catch (err) {
        return fail(400, err instanceof Error ? err.message : String(err));
      }
    }
    // The recordings (phones; recordings.html): a sound rendered in the browser, as a WAV, kept as an MP3 in assets/sounds/.
    if (path === '/api/recordings' && req.method === 'POST') {
      // Guarded as the desk is: a page from another site can't send this header (it would need the server's leave).
      if (req.headers['x-recordings'] !== '1') return fail(403, 'recordings.html only');
      const q = new URL(req.url ?? '/', 'http://localhost').searchParams;
      /** @type {Buffer[]} */
      const parts = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_WAV) return fail(413, 'Too large');
        parts.push(chunk);
      }
      try {
        return json(await saveRecording(await loadConfig(), String(q.get('key')), Buffer.concat(parts), Number(q.get('gain') ?? 1) || 1));
      } catch (err) {
        return fail(400, err instanceof Error ? err.message : String(err));
      }
    }
    // Fan Coins version 2: the service's own code, so the dev server answers exactly as the hosted one.
    if (path.startsWith('/api/audience/coins/')) {
      try {
        if (!coins) {
          await mkdir(audienceDir, { recursive: true });
          coins = localD1(coinsDb ?? join(audienceDir, 'coins.db'));
        }
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > MAX_BODY) return fail(413, 'Too large');
          chunks.push(chunk);
        }
        // ?coins=rich (the dev server only): a viewer given 500 to spend.
        if (path === '/api/audience/coins/dev-rich' && req.method === 'POST') {
          const viewer = String(JSON.parse(Buffer.concat(chunks).toString() || '{}').viewer ?? '');
          if (!/^[0-9a-f]{32}$/.test(viewer)) return fail(400, 'A viewer');
          await coins.prepare('INSERT INTO wallets (viewer, household, balance, credited, first_at) VALUES (?, ?, 500, ?, ?) ON CONFLICT(viewer) DO UPDATE SET balance = 500').bind(viewer, 'dev', Date.now(), new Date().toISOString()).run();
          res.writeHead(204);
          return res.end();
        }
        /** @type {Record<string, string>} */
        const headers = { 'cf-connecting-ip': req.socket.remoteAddress ?? '' };
        for (const h of ['content-type', 'origin', 'sec-fetch-site']) if (typeof req.headers[h] === 'string') headers[h] = /** @type {string} */ (req.headers[h]);
        const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers, body: req.method === 'POST' ? Buffer.concat(chunks) : undefined });
        const answer = await serviceHandle(request, { DB: coins, VOTE_SALT: 'dev', DIRECTOR_TOKEN: '' }, { getConfig: loadConfig });
        res.writeHead(answer.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        return res.end(await answer.text());
      } catch (err) {
        console.error(err instanceof Error ? err.message : err);
        return fail(500, 'Coins went wrong');
      }
    }
    const kind = path === '/api/audience/vote' ? 'vote' : path === '/api/audience/note' ? 'note' : path === '/api/audience/hello' ? 'hello' : null;
    if (kind && req.method === 'POST') {
      const body = await readBody();
      if (body === undefined) return;
      try {
        const checked = audienceLine(kind, body, await loadConfig(), Date.now(), sha256(`dev|${req.socket.remoteAddress ?? ''}`).slice(0, 12));
        if ('error' in checked) return fail(400, checked.error);
        await mkdir(audienceDir, { recursive: true });
        await appendFile(join(audienceDir, `${kind}s.jsonl`), `${JSON.stringify(checked.line)}\n`);
        if (kind === 'hello') {
          const now = Date.now();
          heard.set(/** @type {any} */ (checked.line).viewer, now);
          // A hello that asks hears how many are watching (Tom, 2026-10-16), as the service answers it.
          if (body?.watching === true) {
            const within = (await loadConfig()).settings.audience.watchingMinutes * 60_000;
            return json({ hello: true, watching: [...heard.values()].filter((at) => now - at <= within).length });
          }
        }
      } catch (err) {
        // A config that doesn't load (edited while the server runs), or a file that can't be written.
        console.error(err instanceof Error ? err.message : err);
        return fail(500, 'Could not keep it');
      }
      res.writeHead(204);
      return res.end();
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(405, 'Method not allowed');

    let file = resolveRequest(root, path);
    if (!file) return fail(403, 'Forbidden');
    try {
      // A page without its .html, as the host serves it (/about is about.html).
      if (!extname(file) && !(await stat(file).catch(() => null))) file = `${file}.html`;
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      // The host's own headers when serving what it serves (dist's _headers), but never cached here.
      const hosted = await readFile(join(root, '_headers'), 'utf8').then((t) => headersFor(t, path)).catch(() => ({}));
      res.writeHead(200, {
        ...hosted,
        'content-type': CONTENT_TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'cache-control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch {
      fail(404, 'Not found');
    }
  });
}

if (import.meta.main) {
  try {
    const { values } = parseArgs({ args: process.argv.slice(2), options: { port: { type: 'string', default: '8080' }, root: { type: 'string' } }, strict: true });
    const port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`--port must be 1–65535 (got "${values.port}")`);
    // --root dist serves what the host serves (npm run publish, Task 269).
    const server = createStaticServer(values.root ? resolve(values.root) : undefined);
    server.on('error', (err) => {
      console.error(err.message);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Scorchball channel: http://localhost:${port}/  (Ctrl+C to stop; votes and notes go to output/audience/)`);
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
