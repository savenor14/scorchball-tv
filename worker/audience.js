// The audience service (the launch, Task 276; docs/live.md §7, docs/channel.md §23): a Cloudflare Worker at
// scorchball.tv/api/audience/*, answering the calls the AUDIENCE pane already makes (POST vote, POST note: the dev
// server answered them until now), into a D1 database. Votes count only for a published poll that's open by the real
// clock, one per connection per poll; notes are limited per connection. The Director's desk reads them back with a
// token. The polls are read from the published site itself, so a poll published is known here at once. From Task 277e
// it also counts viewers: the channel's hello (POST hello, a visit's random id) keeps the visit's first and last moment.
// Deployed with npm run worker (wrangler; worker/wrangler.jsonc). Nothing here feeds the sim.
//
// The security pass (2026-10-16): a POST must be JSON (so another site can't send one through a viewer's browser
// without a preflight, which is never answered) and, when the browser says where it comes from, from this site; nothing
// is taken without VOTE_SALT; a household (an IPv6 /64) is one voter for votes and notes too, as it is for visits; a
// household's new visits in a day are capped, so hellos can't flood the visits table; notes and their on-air line lose
// invisible and text-reversing characters. The desk's token is long and random (guessing it isn't feasible); a
// Cloudflare rate-limiting rule on /api/audience/* is the backstop.
import { createCalendar } from '../src/channel/calendar.js';
import { voteAllowed } from '../src/channel/polls.js';
import { sha256 } from '../src/sim/sha256.js';
import { handleCoins } from './coins.js';

/** The largest request body read, bytes (as the dev server). */
const MAX_BODY = 8192;
/** The longest "what was on air" line kept with a note (as the dev server). */
const MAX_ON_AIR = 300;
/** Notes a connection may send in a day. */
const NOTES_A_DAY = 20;
/** A visit's id: the channel's random hex (Task 277e). */
const SESSION = /^[0-9a-f]{16,32}$/;
/** The link a visit came in by (?from=, docs/launch-plan.md): as the channel sends it, anything else dropped. */
const FROM = /^[a-z0-9-]{1,16}$/;
/** Visits kept, days. */
const KEEP_DAYS = 60;
/** Visits the desk is sent, days back. */
const SEND_DAYS = 8;
/** How long the published config is kept before it's read again, ms. */
const CONFIG_MS = 5 * 60_000;
/** New visits a household may start in a day (a visit's hello every few minutes needs one; a flood needs thousands). */
const VISITS_A_DAY = 60;
/** Characters a note never keeps: control characters (but tab and newline), zero-width ones, text-reversing marks. */
const UNSEEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁠-⁩﻿]/g;

/**
 * Whether a POST may be taken: JSON, and from this site when the browser says where it comes from (a browser always
 * does for a POST; the channel's own come from the same origin).
 * @param {Request} request
 */
function fromHere(request) {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) return false;
  if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

/**
 * @typedef {object} Env
 * @property {any} DB  The D1 database (wrangler.jsonc's binding).
 * @property {string} VOTE_SALT  A secret: salts the connection's address before it's hashed.
 * @property {string} DIRECTOR_TOKEN  A secret: the Director's desk sends it to read the votes and notes.
 */

/**
 * One request.
 * @param {Request} request @param {Env} env
 * @param {{ now?: number, getConfig: () => Promise<import('../src/config.js').Config> }} o
 * @returns {Promise<Response>}
 */
export async function handle(request, env, { now = Date.now(), getConfig }) {
  const path = new URL(request.url).pathname.replace(/^\/api\/audience/, '');
  if (request.method === 'POST') {
    if (!fromHere(request)) return reply(403, { error: 'Not from here' });
    // Without its salt every voter's hash would be guessable from their address: take nothing.
    if (!env.VOTE_SALT) return reply(503, { error: 'Not ready' });
  }
  // A viewer's hello (Task 277e): no config needed.
  if (request.method === 'POST' && path === '/hello') {
    const text = await request.text();
    if (text.length > 200) return reply(413, { error: 'Too long' });
    let session;
    let asks = false;
    /** @type {string | null} */
    let from = null;
    try {
      const body = JSON.parse(text);
      session = body?.session;
      asks = body?.watching === true;
      from = typeof body?.from === 'string' && FROM.test(body.from) ? body.from : null;
    } catch {
      return reply(400, { error: 'Not JSON' });
    }
    if (typeof session !== 'string' || !SESSION.test(session)) return reply(400, { error: 'A hello needs its visit' });
    const viewer = sha256(`${env.VOTE_SALT}|${household(request.headers.get('cf-connecting-ip') ?? 'unknown')}`);
    const at = new Date(now).toISOString();
    // A visit already known carries on; a new one only while the household hasn't started VISITS_A_DAY today.
    const known = await env.DB.prepare('SELECT 1 AS k FROM visits WHERE session = ?').bind(session).first();
    if (!known) {
      const today = await env.DB.prepare('SELECT COUNT(*) AS n FROM visits WHERE viewer = ? AND first_at > ?').bind(viewer, new Date(now - 86_400_000).toISOString()).first();
      if (today && today.n >= VISITS_A_DAY) return reply(429, { error: 'Plenty of visits for today' });
    }
    // The tag kept from the first hello that carries one.
    await env.DB.prepare('INSERT INTO visits (session, viewer, first_at, last_at, came_from) VALUES (?, ?, ?, ?, ?) ON CONFLICT(session) DO UPDATE SET last_at = excluded.last_at, came_from = COALESCE(visits.came_from, excluded.came_from)').bind(session, viewer, at, at, from).run();
    if (!asks) return reply(200, { hello: true });
    // How many are watching (Tom, 2026-10-16; the ticker's count, asked for only while it's switched on): households
    // heard from within watchingMinutes, as the desk counts them.
    const { watchingMinutes } = (await getConfig()).settings.audience;
    const row = await env.DB.prepare('SELECT COUNT(DISTINCT viewer) AS n FROM visits WHERE last_at >= ?').bind(new Date(now - watchingMinutes * 60_000).toISOString()).first();
    return reply(200, { hello: true, watching: Number(row?.n ?? 0) });
  }
  // Fan Coins, version 2 (Tom, 2026-10-17; coins.js): the check-in, a spend, the feed.
  if (path.startsWith('/coins/')) {
    const config = await getConfig();
    if (!config.settings.fanCoins.shared || !config.fanCoins) return reply(503, { error: 'Not ready' });
    const home = sha256(`${env.VOTE_SALT}|${household(request.headers.get('cf-connecting-ip') ?? 'unknown')}`);
    const answer = await handleCoins(path, request, env, { now, household: home, config, calendar: createCalendar(config), reply });
    if (answer) return answer;
  }
  if (request.method === 'POST' && (path === '/vote' || path === '/note')) {
    const text = await request.text();
    if (text.length > MAX_BODY) return reply(413, { error: 'Too long' });
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return reply(400, { error: 'Not JSON' });
    }
    // A household is one voter (an IPv6 address's device part rotates: by its /64, as visits are).
    const voter = sha256(`${env.VOTE_SALT}|${household(request.headers.get('cf-connecting-ip') ?? 'unknown')}`);
    const at = new Date(now).toISOString();
    const config = await getConfig();
    return path === '/vote' ? vote(env, config, body, voter, at, now) : note(env, config, body, voter, at, now);
  }
  if (request.method === 'GET' && (path === '/admin/votes' || path === '/admin/notes' || path === '/admin/visits')) {
    if (!env.DIRECTOR_TOKEN || !sameText(request.headers.get('authorization') ?? '', `Bearer ${env.DIRECTOR_TOKEN}`)) return reply(401, { error: 'Not allowed' });
    if (path === '/admin/visits') {
      // The old swept first; then the last SEND_DAYS', each viewer a short tag of their hash (never the address).
      await env.DB.prepare('DELETE FROM visits WHERE last_at < ?').bind(new Date(now - KEEP_DAYS * 86_400_000).toISOString()).run();
      const { results } = await env.DB.prepare('SELECT substr(viewer, 1, 12) AS viewer, first_at AS firstAt, last_at AS lastAt, came_from AS "from" FROM visits WHERE last_at >= ? ORDER BY first_at').bind(new Date(now - SEND_DAYS * 86_400_000).toISOString()).all();
      return reply(200, results);
    }
    if (path === '/admin/votes') {
      const { results } = await env.DB.prepare('SELECT at, poll_id AS pollId, option_id AS optionId FROM votes ORDER BY at').all();
      return reply(200, results);
    }
    const { results } = await env.DB.prepare('SELECT at, text, on_air AS onAir FROM notes ORDER BY id').all();
    return reply(200, results);
  }
  return reply(404, { error: 'Not found' });
}

/** @param {Env} env @param {any} config @param {any} body @param {string} voter @param {string} at @param {number} now */
async function vote(env, config, body, voter, at, now) {
  const { pollId, optionId } = body ?? {};
  if (typeof pollId !== 'string' || typeof optionId !== 'string') return reply(400, { error: 'A vote needs pollId and optionId' });
  if (!voteAllowed(config, createCalendar(config), now, pollId, optionId)) return reply(400, { error: 'No such poll or option open' });
  // A second vote from the same connection is ignored, not refused: the browser's own memory already stops honest ones.
  const { meta } = await env.DB.prepare('INSERT OR IGNORE INTO votes (poll_id, voter, option_id, at) VALUES (?, ?, ?, ?)').bind(pollId, voter, optionId, at).run();
  return reply(200, { counted: meta.changes === 1 });
}

/** @param {Env} env @param {any} config @param {any} body @param {string} voter @param {string} at @param {number} now */
async function note(env, config, body, voter, at, now) {
  const { noteMaxChars, noteCooldownSeconds } = config.settings.audience;
  if (typeof body?.text !== 'string') return reply(400, { error: 'A note needs some text' });
  // Invisible and text-reversing characters never kept (they could disguise a note on the desk).
  const text = body.text.replace(UNSEEN, '');
  const onAir = typeof body.onAir === 'string' ? body.onAir.replace(UNSEEN, '') : '';
  if (!text.trim()) return reply(400, { error: 'A note needs some text' });
  if (text.length > noteMaxChars) return reply(400, { error: `A note is at most ${noteMaxChars} characters` });
  const since = new Date(now - 86_400_000).toISOString();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(at) AS last FROM notes WHERE voter = ? AND at > ?').bind(voter, since).first();
  if (recent && recent.n >= NOTES_A_DAY) return reply(429, { error: 'That\'s plenty of notes for today' });
  if (recent?.last && now - Date.parse(recent.last) < noteCooldownSeconds * 1000) return reply(429, { error: 'A moment before the next note' });
  await env.DB.prepare('INSERT INTO notes (at, text, on_air, voter) VALUES (?, ?, ?, ?)').bind(at, text, onAir.slice(0, MAX_ON_AIR), voter).run();
  return reply(200, { taken: true });
}

/**
 * A viewer's connection as one household (Task 277e): an IPv4 address as it is; an IPv6 address by its network, the
 * first four groups (a /64), since a device's own part rotates (privacy addresses, often daily) and every device in a
 * home shares the network. Votes and notes too, since the security pass (one vote a household, not a device address).
 * @param {string} ip
 */
export function household(ip) {
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.split('::');
  const front = head ? head.split(':') : [];
  const back = ip.includes('::') ? (tail ? tail.split(':') : []) : [];
  const groups = [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill('0'), ...back];
  return `${groups.slice(0, 4).map((g) => (parseInt(g, 16) || 0).toString(16)).join(':')}::/64`;
}

/** @param {number} status @param {any} body @param {Record<string, string>} [headers] */
const reply = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });

/** Compare two strings in time that doesn't depend on where they differ. @param {string} a @param {string} b */
function sameText(a, b) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

/**
 * The files the service needs (the calendar, the polls, the note limits, Fan Coins' choices), read from the published site as they
 * are: not the whole config, checked against this Worker's copy of the rules for it, so the site and the Worker can be
 * deployed in either order (a new setting on one side stopped every vote until the other caught up).
 * @param {string} origin
 */
async function readPublished(origin) {
  /** @param {string} path */
  const read = async (path) => {
    const res = await fetch(`${origin}/${path}`);
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
    return res.json();
  };
  const [settings, rules, teams, polls, fanCoins] = await Promise.all(['config/settings.json', 'data/rules.json', 'data/teams.json', 'data/polls.json', 'data/fanCoins.json'].map(read));
  return /** @type {any} */ ({ settings, rules, teams, polls, fanCoins });
}

/** The published config, read from the site (the same origin), kept a few minutes. @type {{ at: number, config: Promise<any> } | null} */
let cached = null;

export default {
  /** @param {Request} request @param {Env} env */
  async fetch(request, env) {
    const origin = new URL(request.url).origin;
    const now = Date.now();
    if (!cached || now - cached.at > CONFIG_MS) {
      const config = readPublished(origin);
      cached = { at: now, config };
      config.catch(() => { cached = null; });
    }
    const loading = cached.config;
    // The coins' feed is the same for everyone: kept at the edge a few seconds (its cache-control), so a crowd reads D1 once;
    // a finished match's spends for its re-airs, as long as their cache-control says.
    const pathname = new URL(request.url).pathname;
    const feed = request.method === 'GET' && (pathname === '/api/audience/coins/feed' || pathname.startsWith('/api/audience/coins/match/'));
    const edge = /** @type {any} */ (globalThis).caches?.default;
    if (feed && edge) {
      const hit = await edge.match(request);
      if (hit) return hit;
    }
    try {
      const res = await handle(request, env, { now, getConfig: () => loading });
      if (feed && edge && res.ok) await edge.put(request, res.clone());
      return res;
    } catch (err) {
      console.error(err);
      return reply(500, { error: 'Something went wrong' });
    }
  },
};
