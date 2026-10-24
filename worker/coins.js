// Fan Coins, version 2 on the audience service (Tom, 2026-10-17; docs/channel.md §29.6): the check-in that banks a
// viewer's coins, a spend joining its queue, and the feed of what's waiting and showing, the same for everyone. The
// rules are src/channel/coinRules.js; this keeps them in D1 (migrations/0003_coins.sql). audience.js routes here.
import { MATCH, bank, boardBlocked, checkInProblem, feedOf, place, readSpend } from '../src/channel/coinRules.js';

/**
 * @param {string} path  After /api/audience: /coins/checkin, /coins/spend, /coins/feed, /coins/match/<s2-13>.
 * @param {Request} request @param {import('./audience.js').Env} env
 * @param {{ now: number, household: string, config: any, calendar: import('../src/channel/calendar.js').Calendar, reply: (status: number, body: any, headers?: Record<string, string>) => Response }} o
 * @returns {Promise<Response | null>}  null: not a coins call.
 */
export async function handleCoins(path, request, env, { now, household, config, calendar, reply }) {
  const s = config.settings.fanCoins;
  if (!s.enabled) return path.startsWith('/coins/') ? reply(404, { error: 'Not found' }) : null;
  if (request.method === 'GET' && path === '/coins/feed') {
    const { results } = await env.DB.prepare('SELECT id, kind, side, choice, player, match, starts, until FROM spends WHERE until > ? ORDER BY starts, id').bind(now).all();
    return reply(200, { now, spends: feedOf(results) }, { 'cache-control': `public, max-age=${Math.round(s.shared.feedCacheSeconds)}` });
  }
  // A match's chants, flags and shouts, for its re-airs (2026-10-18): only once its window is over, when they never change.
  const replay = request.method === 'GET' ? /^\/coins\/match\/(s\d{1,5}-\d{1,3})$/.exec(path) : null;
  if (replay) {
    const key = replay[1];
    const m = MATCH.exec(key);
    const slot = m ? calendar.slots(Number(m[1]))[Number(m[2])] : null;
    if (!slot) return reply(404, { error: 'No such match' });
    const over = now > slot.kickoff + s.shared.matchWindowMinutes * 60_000;
    const { results } = over ? await env.DB.prepare('SELECT id, kind, side, choice, player, match, starts, until FROM spends WHERE match = ? ORDER BY starts, id').bind(key).all() : { results: [] };
    const keep = over ? s.shared.replayCacheHours * 3600 : s.shared.feedCacheSeconds;
    return reply(200, { match: key, over, spends: feedOf(results) }, { 'cache-control': `public, max-age=${Math.round(keep)}` });
  }
  if (request.method !== 'POST' || (path !== '/coins/checkin' && path !== '/coins/spend')) return null;
  const text = await request.text();
  if (text.length > 2000) return reply(413, { error: 'Too long' });
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400, { error: 'Not JSON' });
  }

  if (path === '/coins/checkin') {
    const problem = checkInProblem(body, now);
    if (problem) return reply(400, { error: problem });
    const wallet = await env.DB.prepare('SELECT balance, credited FROM wallets WHERE viewer = ?').bind(body.viewer).first();
    const earned = await env.DB.prepare('SELECT coins FROM earnings WHERE household = ? AND day = ?').bind(household, body.day).first();
    const today = Number(earned?.coins ?? 0);
    const { grant, credited } = bank(s, { coins: body.coins, credited: wallet ? Number(wallet.credited) : null, today, now });
    if (!wallet) await env.DB.prepare('INSERT INTO wallets (viewer, household, balance, credited, first_at) VALUES (?, ?, ?, ?, ?)').bind(body.viewer, household, grant, credited, new Date(now).toISOString()).run();
    else await env.DB.prepare('UPDATE wallets SET balance = balance + ?, credited = ?, household = ? WHERE viewer = ?').bind(grant, credited, household, body.viewer).run();
    if (grant > 0) await env.DB.prepare('INSERT INTO earnings (household, day, coins) VALUES (?, ?, ?) ON CONFLICT(household, day) DO UPDATE SET coins = coins + excluded.coins').bind(household, body.day, grant).run();
    return reply(200, { banked: grant, balance: Number(wallet?.balance ?? 0) + grant, today: today + grant, cap: s.dailyCap, ...(await mine(env, body.viewer, now)) });
  }

  // A spend: checked, placed in its queue, paid for.
  const pictures = [...config.fanCoins.pictures.map((/** @type {any} */ p) => p.id), ...config.teams.teams.map((/** @type {any} */ t) => t.id)];
  const ask = readSpend(config, calendar, body, now, pictures);
  if ('error' in ask) return reply(400, { error: ask.error });
  const price = s.prices[ask.kind];
  // One of a kind waiting or showing a viewer (fair shares while queues are short).
  const own = await env.DB.prepare('SELECT 1 AS k FROM spends WHERE viewer = ? AND kind = ? AND until > ?').bind(ask.viewer, ask.kind, now).first();
  if (own) return reply(409, { error: 'YOURS IS QUEUED' });
  const { results: queue } = await env.DB.prepare('SELECT id, kind, queue, slot, starts, until FROM spends WHERE queue = ? AND until > ?').bind(ask.queue, now).all();
  const spot = place(s, ask.kind, queue, now, ask.halves, ask.kind === 'screen' ? boardBlocked(config, calendar, now) : []);
  if ('error' in spot) return reply(409, { error: spot.error });
  // Paid first, only from enough; then the slot taken (refunded if someone took it a moment before).
  const paid = await env.DB.prepare('UPDATE wallets SET balance = balance - ? WHERE viewer = ? AND balance >= ?').bind(price, ask.viewer, price).run();
  if (!paid.meta.changes) return reply(402, { error: 'NOT ENOUGH COINS' });
  try {
    const made = await env.DB.prepare('INSERT INTO spends (viewer, household, kind, queue, slot, side, choice, player, match, starts, until, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id')
      .bind(ask.viewer, household, ask.kind, ask.queue, spot.slot, ask.side, ask.choice, ask.player, ask.match, spot.starts, spot.until, new Date(now).toISOString()).first();
    const wallet = await env.DB.prepare('SELECT balance FROM wallets WHERE viewer = ?').bind(ask.viewer).first();
    return reply(200, { id: Number(made?.id), starts: spot.starts, until: spot.until, ahead: spot.ahead, balance: Number(wallet?.balance ?? 0) });
  } catch {
    await env.DB.prepare('UPDATE wallets SET balance = balance + ? WHERE viewer = ?').bind(price, ask.viewer).run();
    return reply(409, { error: 'TRY AGAIN' });
  }
}

/** A viewer's own spends still waiting or showing (the channel marks them and counts down). @param {any} env @param {string} viewer @param {number} now */
async function mine(env, viewer, now) {
  const { results } = await env.DB.prepare('SELECT id FROM spends WHERE viewer = ? AND until > ? ORDER BY starts, id').bind(viewer, now).all();
  return { mine: results.map((/** @type {any} */ r) => Number(r.id)) };
}
