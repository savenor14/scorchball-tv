// How soon each voiced line comes round again (Task 257): runs the channel's programme over a season, as it airs, and
// counts every line the commentators, the desk and the interview say, so new ways go where lines come back soonest.
// A developer tool. Usage: npm run repeats -- [--season 2] [--seed S] [--voice desk|commentary|interview] [--top 40] [--json]
import { parseArgs } from 'node:util';
import { countRepeats } from '../channel/repeats.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

if (import.meta.main) {
  const { values } = parseArgs({ options: { season: { type: 'string', default: '2' }, seed: { type: 'string' }, voice: { type: 'string' }, top: { type: 'string', default: '40' }, json: { type: 'boolean', default: false } } });
  const config = await loadConfigFromDisk();
  const seed = values.seed ?? config.settings.live.seed;
  const t0 = Date.now();
  const { days, groups } = countRepeats(config, seed, Number(values.season));
  const rows = groups.filter((g) => !values.voice || g.voice === values.voice).slice(0, Number(values.top));
  if (values.json) console.log(JSON.stringify({ days, groups }));
  else {
    console.log(`Season ${values.season}, seed "${seed}": ${days} days, ${((Date.now() - t0) / 1000).toFixed(1)} s. Soonest first: on average, hours until the same line is heard again.\n`);
    console.log('voice       group                              heard  a day  lines  hours between  soonest (h)  each line a match');
    for (const g of rows) console.log(`${g.voice.padEnd(12)}${g.group.slice(0, 34).padEnd(35)}${String(g.heard).padStart(5)}${g.perDay.toFixed(1).padStart(7)}${String(g.lines).padStart(7)}${g.hoursBetween.toFixed(1).padStart(15)}${(Number.isFinite(g.soonestHours) ? g.soonestHours.toFixed(2) : '-').padStart(13)}${g.perMatch === null ? '' : g.perMatch.toFixed(1).padStart(19)}`);
  }
}
