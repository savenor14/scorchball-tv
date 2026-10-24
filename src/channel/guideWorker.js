// The TV guide's day, worked out off the drawing thread (Task 115): the channel posts its config, the league's seed
// (or its day keys, Task 271) and a moment; this builds that day from a league of its own (guide.js buildDay, about a quarter of a second) and
// posts the day back, so opening the guide never stutters the picture.
import { buildDay } from './guide.js';
import { keyStreams } from '../sim/streams.js';
import { createTimeline } from './timeline.js';

/** The snapshot the guide starts from (Task 272), fetched once a path. @type {{ path: string, snap: Promise<any> } | null} */
let cached = null;

self.addEventListener('message', async (/** @type {MessageEvent} */ e) => {
  const { config, seed, book, snapshot: path, t, id } = e.data;
  /** @type {Map<string, import('./timeline.js').Timeline>} */
  const timelines = new Map();
  /** @param {import('./liveLeague.js').LiveMatch} m */
  const timelineOf = (m) => {
    let tl = timelines.get(m.id);
    if (!tl) timelines.set(m.id, (tl = createTimeline(m, config)));
    return tl;
  };
  // A day that can't be built (Task 271: a day key not out yet) answers null, so the guide asks again rather than wait.
  try {
    if (path && cached?.path !== path) cached = { path, snap: fetch(path).then((r) => r.json()) };
    const snap = path ? await /** @type {any} */ (cached).snap : undefined;
    self.postMessage({ id, day: buildDay(config, t, seed, timelineOf, book ? keyStreams(book) : undefined, snap) });
  } catch (err) {
    console.error('The TV guide could not build the day:', err);
    self.postMessage({ id, day: null });
  }
});
