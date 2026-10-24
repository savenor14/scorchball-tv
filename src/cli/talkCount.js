// How often each kind of desk line is heard (Task 246b): runs the channel's programme over a whole season, as it airs,
// and counts every line the desk says by its kind, with the ways it has, so new ways go where repeats come soonest.
// A developer tool. Usage: npm run talk -- [--season 2] [--seed S] [--json]
import { parseArgs } from 'node:util';
import { countTalk } from '../channel/talkCount.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

if (import.meta.main) {
  const { values } = parseArgs({ options: { season: { type: 'string', default: '2' }, seed: { type: 'string' }, json: { type: 'boolean', default: false } } });
  const config = await loadConfigFromDisk();
  const seed = values.seed ?? config.settings.live.seed;
  const t0 = Date.now();
  const { days, byKind, standIns } = countTalk(config, seed, Number(values.season));
  const lines = config.studio.lines;
  const rows = Object.keys(lines).map((kind) => ({ kind, heard: byKind.get(kind) ?? 0, ways: lines[kind].ways.length }))
    .map((r) => ({ ...r, perDay: r.heard / days, perWay: r.heard / days / r.ways }))
    .sort((a, b) => b.perWay - a.perWay);
  if (values.json) console.log(JSON.stringify({ days, rows }));
  else {
    console.log(`Season ${values.season}, seed "${seed}": ${days} days, ${((Date.now() - t0) / 1000).toFixed(1)} s; ${standIns} talks fell back to stand-in lines.\n`);
    console.log('kind                      a day   ways   each way a day');
    for (const r of rows) console.log(`${r.kind.padEnd(24)}${r.perDay.toFixed(1).padStart(7)}${String(r.ways).padStart(7)}${r.perWay.toFixed(2).padStart(15)}`);
  }
}
