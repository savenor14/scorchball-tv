// The audience module (Task 260; docs/channel.md §23): the one place the channel sends anything out. Votes and notes
// (Task 261) go to config/settings.json's audience.endpoint: the dev server's /api/audience until the launch,
// then a small hosted service answering the same calls (vision §8, docs/live.md), so going live changes an address,
// not the channel. Each vote is remembered in this browser, by poll, so a viewer votes once (the service adds its own
// check at the launch); a note can't follow another from the same browser within noteCooldownSeconds. Each note
// carries a line saying what was on air (onAirLine), so Tom can find the moment again. From Task 277e the channel also
// says hello (startHellos), so the desk can count viewers: a random id for the visit, nothing about the viewer (the
// service keeps a salted hash of the connection, never the address). Nothing here ever feeds the sim.

const STORE_KEY = 'scorchball.votes';
const NOTE_KEY = 'scorchball.noteAt';

/**
 * @param {object} o
 * @param {string} o.endpoint  Where to send: "/api/audience", or the service's address.
 * @param {number} [o.noteCooldownSeconds]  The least time between two notes from this browser.
 * @param {typeof fetch} [o.send]  For tests.
 * @param {Pick<Storage, 'getItem' | 'setItem'> | null} [o.storage]  For tests; the browser's localStorage by default.
 */
export function createAudience({ endpoint, noteCooldownSeconds = 0, send = (...a) => fetch(...a), storage = browserStorage() }) {
  /** The votes remembered in this browser, by poll id. @returns {Record<string, string>} */
  const votes = () => {
    try {
      const saved = JSON.parse(storage?.getItem(STORE_KEY) ?? '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  };

  /** POST a small JSON body; true if the endpoint took it. @param {string} path @param {object} body */
  async function post(path, body) {
    return (await postFor(path, body)) !== null;
  }

  /** POST a small JSON body; the endpoint's answer if it took it (an empty one as {}), else null. @param {string} path @param {object} body */
  async function postFor(path, body) {
    try {
      const res = await send(`${endpoint}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) return null;
      // A 204, or an answer that isn't JSON, is still taken.
      try {
        return await res.json();
      } catch {
        return {};
      }
    } catch {
      return null;
    }
  }

  return {
    /**
     * Count this visit (Task 277e): its random id, and the link it came in by if tagged (`?from=`; the service keeps
     * it with the visit's first hello). Asking (the ticker's count, Tom 2026-10-16) hears how many are watching.
     * @param {string} visit @param {boolean} [ask] @param {string | null} [from]
     * @returns {Promise<number | null>} How many are watching, if asked and answered; else null.
     */
    async hello(visit, ask = false, from = null) {
      const answer = await postFor('hello', { session: visit, ...(ask ? { watching: true } : {}), ...(from ? { from } : {}) });
      return typeof answer?.watching === 'number' ? answer.watching : null;
    },
    /** The option this browser voted for in a poll, if it has. @param {string} pollId @returns {string | null} */
    votedFor(pollId) {
      return votes()[pollId] ?? null;
    },
    /**
     * Send a vote; remembered only once the endpoint has taken it. A browser that has voted can't vote again.
     * @param {string} pollId @param {string} optionId
     * @returns {Promise<boolean>} Whether it was taken.
     */
    async vote(pollId, optionId) {
      if (votes()[pollId]) return false;
      if (!(await post('vote', { pollId, optionId }))) return false;
      try {
        storage?.setItem(STORE_KEY, JSON.stringify({ ...votes(), [pollId]: optionId }));
      } catch { /* storage blocked: the vote counts, it just isn't remembered */ }
      return true;
    },
    /**
     * How long before this browser can send another note, seconds (0: now).
     * @param {number} [now]  Epoch ms (the real clock: the wait is real time, whatever moment the channel shows).
     */
    noteWait(now = Date.now()) {
      let last = 0;
      try {
        last = Number(storage?.getItem(NOTE_KEY) ?? 0) || 0;
      } catch { /* storage blocked: no wait remembered */ }
      return Math.max(0, Math.ceil(noteCooldownSeconds - (now - last) / 1000));
    },
    /**
     * Send a note with the line saying what was on air.
     * @param {string} text @param {string} onAir
     * @returns {Promise<boolean>} Whether it was taken.
     */
    async note(text, onAir) {
      if (!text.trim() || this.noteWait() > 0) return false;
      if (!(await post('note', { text, onAir }))) return false;
      try {
        storage?.setItem(NOTE_KEY, String(Date.now()));
      } catch { /* storage blocked: no wait remembered */ }
      return true;
    },
  };
}

/**
 * The line sent with a note: when (the season, the league's day and time, and the instant, for ?at=), what was on
 * air, and the layout. "S2 WED 06:17 · LIVE R6 VAR 0-1 WRS 1H 8:04 · FULL · 2026-10-14T10:17:03Z".
 * @param {object} o
 * @param {number} o.t  Epoch ms: the channel's clock.
 * @param {number} o.season
 * @param {string} o.timeZone
 * @param {string} o.kind  The segment on screen (live, highlights, reair, talk, ad…).
 * @param {{ stage: string, round: number | null, home: string, away: string } | null} o.match  The match it's about, if any (letters).
 * @param {{ score: [number, number], period: string, clock: string } | null} o.play  The match as played on screen, if one is.
 * @param {'full' | 'broadcast'} o.layout
 */
export function onAirLine({ t, season, timeZone, kind, match, play, layout }) {
  const when = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t)).toUpperCase().replace(',', '');
  const stage = !match ? '' : match.stage === 'final' ? 'F' : match.stage === 'semifinal' ? 'SF' : `R${match.round}`;
  const what = [kind.toUpperCase().replace(/_/g, ' '), stage, match && (play ? `${match.home} ${play.score[0]}-${play.score[1]} ${match.away}` : `${match.home} v ${match.away}`), play && `${play.period} ${play.clock}`.trim()].filter(Boolean).join(' ');
  return `S${season} ${when} · ${what} · ${layout.toUpperCase()} · ${new Date(t).toISOString().slice(0, 19)}Z`;
}

/**
 * Say hello as the channel starts, every `minutes` while it's showing, and on coming back to it after a while (Task
 * 277e): a hidden tab isn't counted as watching. The visit's id is random, fresh each page load, kept nowhere.
 * @param {{ hello: (visit: string, ask?: boolean, from?: string | null) => Promise<number | null> }} audience @param {number} minutes
 * @param {Document} doc
 * @param {((watching: number) => void) | null} [onWatching]  Asks how many are watching with each hello, and hears it.
 * @param {string | null} [from]  The link the visit came in by (`?from=`), sent with every hello (the service keeps
 *   the first it hears, so a first hello lost on the way doesn't lose it).
 */
export function startHellos(audience, minutes, doc = document, onWatching = null, from = null) {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const visit = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  const every = minutes * 60_000;
  let last = -Infinity;
  const hello = () => {
    if (doc.visibilityState !== 'visible') return;
    last = Date.now();
    audience.hello(visit, Boolean(onWatching), from).then((n) => { if (n !== null) onWatching?.(n); });
  };
  hello();
  setInterval(() => { if (Date.now() - last >= every - 1000) hello(); }, 30_000);
  doc.addEventListener('visibilitychange', () => { if (Date.now() - last >= 60_000) hello(); });
  return visit;
}

/** localStorage, or null where it's blocked (a private window, cleared site data). */
function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
