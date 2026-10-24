// Fan Coins, version 2 in the browser (Tom, 2026-10-17; docs/channel.md §29.6): the channel's side of the audience
// service. Coins are counted here by version 1's rates (fanCoins.js createEarner) into `pending` and banked at each
// check-in (every checkInSeconds while the channel runs, and as the page goes); the service's answer is the truth for
// the balance and today's count. The feed (every spend still waiting or showing, the same for everyone) is read every
// feedSeconds; a spend goes to the service, which queues it. No DOM; `fetch` is passed in, so the tests give their own.

/** @typedef {{ id: number, kind: import('./fanCoins.js').SpendKind, side: 'home' | 'away' | null, choice: string, player: string | null, match: string | null, starts: number, until: number }} FeedRow */

/** A fresh viewer id: 32 random hex characters (an id, not a sim input, so the browser's own randomness). */
export function newViewer() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {object} o
 * @param {any} o.config
 * @param {import('./fanCoins.js').CoinData} o.data  Kept by the store: the viewer, the balance, today, what's pending.
 * @param {string} o.endpoint  The audience service (settings.audience.endpoint).
 * @param {(url: string, init?: RequestInit) => Promise<Response>} o.fetch
 * @param {() => string} o.day  The viewer's own date.
 * @param {() => void} [o.onChange]  The balance, the feed or the viewer's own spends changed.
 */
export function createCoinBank({ config, data, endpoint, fetch, day, onChange }) {
  const s = config.settings.fanCoins.shared;
  const base = `${endpoint}/coins`;
  /** The feed's spends, and the viewer's own (from check-ins and spends) still waiting or showing. */
  const state = { feed: /** @type {FeedRow[]} */ ([]), mine: /** @type {Set<number>} */ (new Set()), reachable: true, sending: false };
  /** Spends made here not yet in the feed (it's kept at the edge for a few seconds). @type {FeedRow[]} */
  let fresh = [];
  /** This viewer's spends held back after a switch to Broadcast (ms, by id). @type {Map<number, number>} */
  const delays = new Map();
  /**
   * Finished matches' spends, for their re-airs (2026-10-18), by the match's key: the rows once the service has them,
   * or when it was last asked (asked again after feedSeconds if it failed or the match wasn't over yet).
   * @type {Map<string, FeedRow[] | { asked: number }>}
   */
  const replays = new Map();

  /** @param {string} key */
  async function askReplay(key) {
    replays.set(key, { asked: Date.now() });
    try {
      const res = await call(`${base}/match/${key}`);
      if (!res.ok) throw new Error(`match: ${res.status}`);
      const answer = await res.json();
      if (!answer.over) return;
      replays.set(key, answer.spends);
      onChange?.();
    } catch {
      // Asked again later; a re-air simply shows none meanwhile.
    }
  }

  /**
   * A call to the service, given up after requestSeconds (2026-10-18, Tom: a check-in that never answered left the bank
   * waiting on it for good, so nothing more was banked and the balance shown ran ahead of the service's).
   * @param {string} url @param {RequestInit} [init]
   */
  const call = (url, init = {}) => fetch(url, { ...init, signal: AbortSignal.timeout(s.requestSeconds * 1000) });
  /** @param {string} path @param {any} body */
  const post = (path, body, keepalive = false) => call(`${base}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive });

  /** The check-in under way, if any: another waits for it rather than being skipped. @type {Promise<void> | null} */
  let checking = null;
  /** Bank what's pending; the answer sets the balance, today and the viewer's own spends. */
  function checkIn(keepalive = false) {
    // As the page goes, sent whatever else is under way (the page may not live to hear the answer).
    if (keepalive) return send(true);
    checking ??= send(false).finally(() => { checking = null; });
    return checking;
  }

  /** @param {boolean} keepalive */
  async function send(keepalive) {
    state.sending = true;
    const sent = data.pending;
    try {
      const res = await post('checkin', { viewer: data.viewer, coins: sent, day: day() }, keepalive);
      if (!res.ok) throw new Error(`check-in: ${res.status}`);
      const answer = await res.json();
      // What was sent is settled (banked, or past the limits); what came in meanwhile waits for the next.
      data.pending = Math.max(0, data.pending - sent);
      data.balance = answer.balance + data.pending;
      data.today = answer.today + data.pending;
      state.mine = new Set(answer.mine);
      state.reachable = true;
    } catch {
      state.reachable = false;
    } finally {
      state.sending = false;
      onChange?.();
    }
  }

  async function readFeed() {
    try {
      const res = await call(`${base}/feed`);
      if (!res.ok) throw new Error(`feed: ${res.status}`);
      const answer = await res.json();
      state.feed = answer.spends;
      fresh = fresh.filter((x) => !state.feed.some((y) => y.id === x.id) && x.until > Date.now());
      state.reachable = true;
    } catch {
      state.reachable = false;
    }
    onChange?.();
  }

  return {
    state,
    /** Every spend waiting or showing: the feed and any made here since it was read. @returns {FeedRow[]} */
    spends() { return [...state.feed, ...fresh]; },
    /**
     * A finished match's chants, flags and shouts, for its re-air: what the service sent, or none while it's asked
     * (onChange says when they come). @param {string} key  The match's key (s<season>-<slot>). @returns {FeedRow[]}
     */
    replayOf(key) {
      const got = replays.get(key);
      if (Array.isArray(got)) return got;
      if (!got || Date.now() - got.asked > s.feedSeconds * 1000) void askReplay(key);
      return [];
    },
    /** Hold one of this viewer's spends back (it started at once and the channel is sliding to Broadcast). @param {number} id @param {number} ms */
    delay(id, ms) { delays.set(id, ms); },
    /** How long a spend is held back here (ms). @param {number} id */
    delayOf(id) { return delays.get(id) ?? 0; },
    checkIn,
    readFeed,
    /**
     * Spend: the service queues it (or says why not). The balance comes back with it.
     * @param {any} body  The kind, the choice, and in a match the end, the match and its halves.
     * @returns {Promise<{ ok: true, row: FeedRow, ahead: number } | { ok: false, why: string }>}
     */
    async spend(body) {
      try {
        // Bank what's pending first, so the coins just earned count.
        if (data.pending > 0) await checkIn();
        const res = await post('spend', { ...body, viewer: data.viewer });
        const answer = await res.json().catch(() => ({}));
        if (!res.ok) return { ok: false, why: String(answer.error ?? 'TRY AGAIN') };
        /** @type {FeedRow} */
        const row = { id: answer.id, kind: body.kind, side: body.side ?? null, choice: body.choice ?? '', player: body.player ?? null, match: body.match ?? null, starts: answer.starts, until: answer.until };
        fresh.push(row);
        state.mine.add(row.id);
        data.balance = answer.balance + data.pending;
        onChange?.();
        return { ok: true, row, ahead: answer.ahead };
      } catch {
        state.reachable = false;
        onChange?.();
        return { ok: false, why: "CAN'T REACH THE LEAGUE" };
      }
    },
    /** Check in and read the feed now and every so often; bank as the page goes. */
    start() {
      void checkIn();
      void readFeed();
      setInterval(() => void checkIn(), s.checkInSeconds * 1000);
      setInterval(() => void readFeed(), s.feedSeconds * 1000);
      addEventListener('pagehide', () => { if (data.pending > 0) void checkIn(true); });
    },
  };
}
