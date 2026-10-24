// The running order for a day (Task 95; docs/channel.md §16.14): every part of the programme with its start time and
// length, as the channel would show it, then the day's totals (ads, re-airs, highlights, talk, cards, match share).
// A developer tool for checking the timings in seconds.
// Usage: npm run rundown -- [--day 2] [--season 1] [--seed S] [--all]
// Studio cards in a row are folded into one line unless --all. Each ad is named (its gap's order, Task 158).
import { parseArgs } from 'node:util';
import { adIndex, adOrder, promoStage } from '../channel/spots.js';
import { createCalendar } from '../channel/calendar.js';
import { LiveLeague } from '../channel/liveLeague.js';
import { createProgramme } from '../channel/programme.js';
import { createTimeline } from '../channel/timeline.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

const { values } = parseArgs({ options: { day: { type: 'string', default: '2' }, season: { type: 'string', default: '1' }, seed: { type: 'string' }, all: { type: 'boolean', default: false } } });
const config = await loadConfigFromDisk();
const day = Number(values.day);
const season = Number(values.season);
const seed = values.seed ?? config.settings.live.seed;
const calendar = createCalendar(config);
const from = calendar.instant(season, (day - 1) * 1440);
const to = calendar.instant(season, day * 1440);

const live = new LiveLeague(config, { now: from, seed });
/** @type {Map<string, import('../channel/timeline.js').Timeline>} */
const timelines = new Map();
const timelineOf = (/** @type {import('../channel/liveLeague.js').LiveMatch} */ m) => timelines.get(m.id) ?? /** @type {any} */ (timelines.set(m.id, createTimeline(m, config)).get(m.id));
const programme = createProgramme(live, timelineOf);
const clock = new Intl.DateTimeFormat('en-GB', { timeZone: config.settings.live.timeZone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const length = (/** @type {number} */ ms) => {
  const s = Math.round(ms / 1000);
  return s >= 3600 ? `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * An ad's label with its brand, as main.js picks it: the gap's order, the promo's window as the break began.
 * @param {string} label @param {import('../channel/programme.js').Segment} seg
 */
const adNamed = (label, seg) => {
  if (seg.kind !== 'ads' || seg.part !== 'ad') return label;
  const { bumperSeconds, adSeconds, perBreak, promoFromShare } = config.settings.ads;
  const breakStart = seg.from - bumperSeconds * 1000 - seg.ad * adSeconds * 1000;
  const ads = adOrder(config.ads.ads, seed, seg.gap, promoStage(calendar, breakStart, promoFromShare));
  return `${label} · ${ads[adIndex(seg.brk, seg.ad, perBreak, ads.length)].brand}`;
};

/** @type {{ label: string, from: number, until: number }[]} */
const rows = [];
for (let t = from; t < to;) {
  live.advanceTo(t);
  const p = programme.pieceAt(t);
  const start = Math.max(p.from, from);
  const until = Math.min(p.until, to);
  rows.push({ label: adNamed(p.label, programme.at(Math.max(p.from, t))), from: start, until });
  t = until > t ? until : t + 1000;
}

/** Totals by what's on. @type {Record<string, number>} */
const totals = {};
const category = (/** @type {string} */ label) => (label.startsWith('live') ? 'live matches'
  : label.includes('· match') ? 're-airs (the match)'
    : label.startsWith('re-air') ? 're-airs (around the match)'
      : label.startsWith('highlights') ? 'highlights'
        : label.startsWith('ads') ? 'ads'
          : label.startsWith('talk') ? 'talk'
            : label.startsWith('card') || label === 'cards' ? 'studio cards'
              : label.startsWith('opening') ? 'the opening'
                : label.startsWith('grounds') ? 'around the grounds'
                  : label.startsWith('vault') ? 'from the vault'
                  : label.startsWith('podcast') ? 'off the ball'
                  : 'ceremonies, cards and the interview');
for (const r of rows) totals[category(r.label)] = (totals[category(r.label)] ?? 0) + (r.until - r.from);

console.log(`Running order: season ${season}, day ${day}, seed "${seed}" (times in ${config.settings.live.timeZone})\n`);
for (let i = 0; i < rows.length; i++) {
  const r = rows[i];
  if (!values.all && r.label.startsWith('card')) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].label.startsWith('card')) j++;
    const n = j - i + 1;
    console.log(`${clock.format(new Date(r.from))}  ${length(rows[j].until - r.from).padStart(6)}  ${n > 1 ? `cards ×${n}` : r.label}`);
    i = j;
    continue;
  }
  console.log(`${clock.format(new Date(r.from))}  ${length(r.until - r.from).padStart(6)}  ${r.label}`);
}
const dayMs = to - from;
console.log('\nThe day:');
for (const [k, ms] of Object.entries(totals).sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(36)} ${length(ms).padStart(7)}  ${((100 * ms) / dayMs).toFixed(1).padStart(5)}%`);
const share = ((totals['live matches'] ?? 0) + (totals['re-airs (the match)'] ?? 0)) / dayMs;
const breaks = rows.filter((r) => r.label === 'ads · bumper in').length;
console.log(`  ${'a match on screen'.padEnd(36)} ${''.padStart(7)}  ${(100 * share).toFixed(1).padStart(5)}%`);
console.log(`  ${'play on screen (with highlights)'.padEnd(36)} ${''.padStart(7)}  ${(100 * (share + (totals.highlights ?? 0) / dayMs)).toFixed(1).padStart(5)}%`);
console.log(`  ${'ad breaks'.padEnd(36)} ${String(breaks).padStart(7)}`);
