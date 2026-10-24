// How many Fan Coins a viewer earns (Fan Coins, plan step 1; docs/tasks.md): the air split by what earns, then a day's
// coins for a viewer watching an hour, a few hours or all day, at Tom's first rates and a few studio rates, to set the
// daily cap, the prices and the time limits. A developer tool.
// Usage: npm run coins -- [--from 2] [--seasons 2] [--seed S] [--hours 1,3,24] [--studio 2,5,10] [--samples 40] [--json]
import { parseArgs } from 'node:util';
import { createRng } from '../sim/rng.js';
import { AIR_KINDS, airOf, coinsFor, watcher } from '../channel/coinCount.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

const HOUR = 3_600_000;
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

if (import.meta.main) {
  const { values } = parseArgs({ options: {
    from: { type: 'string', default: '2' }, seasons: { type: 'string', default: '2' }, seed: { type: 'string' },
    hours: { type: 'string', default: '1,3,24' }, studio: { type: 'string', default: '2,5,10' },
    samples: { type: 'string', default: '40' }, json: { type: 'boolean', default: false },
  } });
  const config = await loadConfigFromDisk();
  const seed = values.seed ?? config.settings.live.seed;
  const hoursList = values.hours.split(',').map(Number);
  const studioRates = values.studio.split(',').map(Number);
  const samples = Number(values.samples);
  const t0 = Date.now();
  const air = airOf(config, seed, Number(values.from), Number(values.seasons));
  const watch = watcher(air);
  const rng = createRng(`coins-${seed}`);
  const pct = (/** @type {number[]} */ xs, /** @type {number} */ p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];

  // Each viewer's day: `hours` from a random start (all day: midnight to midnight), at each studio rate.
  /** @type {Record<string, any>} */
  const results = {};
  for (const hours of hoursList) {
    // The same viewers at every studio rate.
    const seen = [];
    for (let d = 0; d < air.days; d++) {
      const n = hours >= 24 ? 1 : samples;
      for (let s = 0; s < n; s++) {
        const a = hours >= 24 ? air.dayStarts[d] : air.dayStarts[d] + rng.next() * (air.dayStarts[d + 1] - air.dayStarts[d]);
        seen.push(watch(a, a + hours * HOUR));
      }
    }
    for (const studioMinutes of studioRates) {
      const days = seen.map((w) => coinsFor(w, { liveMinutes: 1, offseasonMinutes: config.settings.fanCoins.offseasonMinutes, studioMinutes }));
      const totals = days.map((c) => c.total).sort((x, y) => x - y);
      const mean = (/** @type {keyof ReturnType<typeof coinsFor>} */ k) => days.reduce((sum, c) => sum + c[k], 0) / days.length;
      results[`${hours}h@${studioMinutes}`] = {
        hours, studioMinutes,
        mean: { live: mean('live'), offseason: mean('offseason'), highlights: mean('highlights'), other: mean('other'), total: mean('total') },
        p10: pct(totals, 0.1), p50: pct(totals, 0.5), p90: pct(totals, 0.9), min: totals[0], max: totals.at(-1),
      };
    }
  }
  // All day, by day of the week (averaged over the seasons), at each studio rate.
  /** @type {Record<string, number[]>} */
  const byWeekday = {};
  for (const studioMinutes of studioRates) {
    byWeekday[studioMinutes] = WEEKDAYS.map((_, w) => {
      const ds = Array.from({ length: air.days }, (_, d) => d).filter((d) => d % 7 === w);
      return ds.reduce((sum, d) => sum + coinsFor(watch(air.dayStarts[d], air.dayStarts[d + 1]), { liveMinutes: 1, offseasonMinutes: config.settings.fanCoins.offseasonMinutes, studioMinutes }).total, 0) / ds.length;
    });
  }
  // The air: hours a day of each kind.
  const all = watch(air.dayStarts[0], air.dayStarts[air.days]);
  /** @type {Record<string, number>} */
  const airHours = Object.fromEntries(AIR_KINDS.map((k) => [k, all.ms[k] / HOUR / air.days]));
  const perDay = { halves: all.halves / air.days, packages: all.packages / air.days };

  if (values.json) { console.log(JSON.stringify({ days: air.days, airHours, perDay, results, byWeekday })); process.exit(0); }
  const f = (/** @type {number} */ x, w = 6, dp = 0) => x.toFixed(dp).padStart(w);
  console.log(`Seasons ${values.from}–${Number(values.from) + Number(values.seasons) - 1}, seed "${seed}": ${air.days} days, ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  console.log('Rates: a live minute 1; an off-season minute as it airs 1; a highlights package watched whole 1; everything else 1 every N minutes.\n');
  console.log('The air, hours a day:');
  for (const k of AIR_KINDS) console.log(`  ${k.padEnd(12)}${f(airHours[k], 6, 1)} h${k === 'reair' ? `   (${perDay.halves.toFixed(1)} halves)` : k === 'highlights' ? `   (${perDay.packages.toFixed(1)} packages)` : ''}`);
  console.log('\nAll day (midnight to midnight), by day of the week:');
  console.log(`  studio every${WEEKDAYS.map((w) => w.padStart(6)).join('')}`);
  for (const sm of studioRates) console.log(`  ${`${sm} min`.padEnd(12)}${byWeekday[sm].map((x) => f(x)).join('')}`);
  console.log(`\nA day's coins, from a random start (${samples} a day; all day from midnight): the mean by kind, then the spread of totals.`);
  console.log(`  ${'watching'.padEnd(10)}${'every'.padStart(7)}${'live'.padStart(7)}${'off'.padStart(5)}${'hl'.padStart(5)}${'other'.padStart(7)}${'mean'.padStart(7)}${'min'.padStart(6)}${'p10'.padStart(6)}${'p50'.padStart(6)}${'p90'.padStart(6)}${'max'.padStart(6)}`);
  for (const hours of hoursList) {
    for (const sm of studioRates) {
      const r = results[`${hours}h@${sm}`];
      console.log(`  ${(sm === studioRates[0] ? `${hours} h` : '').padEnd(10)}${`/${sm}m`.padStart(7)}${f(r.mean.live, 7, 1)}${f(r.mean.offseason, 5, 1)}${f(r.mean.highlights, 5, 1)}${f(r.mean.other, 7, 1)}${f(r.mean.total, 7, 1)}${f(r.min)}${f(r.p10)}${f(r.p50)}${f(r.p90)}${f(r.max)}`);
    }
  }
}
