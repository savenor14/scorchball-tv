// How often each kind of moment airs live (MOMENTS, plan step 1; docs/tasks.md): the counts over some seasons of the
// programme, how often a viewer sees each at a few hours a day, and how long each step of a ladder takes.
// A developer tool. Usage: npm run moments -- [--from 2] [--seasons 4] [--seed S] [--hours 2] [--json]
import { parseArgs } from 'node:util';
import { KINDS, countMoments } from '../channel/momentCount.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

const LADDER = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

if (import.meta.main) {
  const { values } = parseArgs({ options: { from: { type: 'string', default: '2' }, seasons: { type: 'string', default: '4' }, seed: { type: 'string' }, hours: { type: 'string', default: '2' }, json: { type: 'boolean', default: false } } });
  const config = await loadConfigFromDisk();
  const seed = values.seed ?? config.settings.live.seed;
  const hours = Number(values.hours);
  const t0 = Date.now();
  const r = countMoments(config, seed, Number(values.from), Number(values.seasons));
  if (values.json) { console.log(JSON.stringify(r)); process.exit(0); }
  console.log(`Seasons ${values.from}–${Number(values.from) + Number(values.seasons) - 1}, seed "${seed}": ${r.days} days, ${r.liveHours.toFixed(0)} h live (${((100 * r.liveHours) / (24 * r.days)).toFixed(0)}% of the air), ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
  console.log(`Total: seen live by a viewer watching all day. "1st": hours of watching (at random times) to see the first. "days to": days to each step for a viewer watching ${hours} h a day (a day tuned in each day).\n`);
  const hrs = (/** @type {number} */ h) => (h < 1 ? `${Math.round(h * 60)}m` : `${h.toFixed(h < 10 ? 1 : 0)}h`);
  const fmt = (/** @type {number} */ d) => (d < 1 / 24 ? '<1h' : d < 1 ? `${Math.round(d * 24)}h` : d < 100 ? `${d.toFixed(d < 10 ? 1 : 0)}d` : `${Math.round(d / 7)}w`);
  console.log(`kind                   total  a day       1st  days to ${LADDER.slice(1).map((n) => String(n).padStart(6)).join('')}`);
  for (const [group, kinds] of Object.entries(KINDS)) {
    console.log(`-- ${group}`);
    for (const k of kinds) {
      const n = r.counts[k];
      // A viewer's rate: what airs in a day, scaled by the share of the day they watch (days tuned in: one a day).
      const perViewerDay = k === 'day' ? 1 : k === 'opening_and_closing' ? 0 : (n / r.days) * (hours / 24);
      const first = k === 'day' ? '-' : perViewerDay > 0 ? hrs(hours / perViewerDay) : '-';
      const steps = LADDER.slice(1).map((s) => (perViewerDay > 0 ? fmt(s / perViewerDay) : '-').padStart(6)).join('');
      console.log(`${k.padEnd(22)}${String(n).padStart(6)}${(n / r.days).toFixed(n / r.days < 1 ? 2 : 1).padStart(7)}${first.padStart(10)}${''.padStart(9)}${steps}`);
    }
  }
  console.log('\nBy team (goals, matches, wins seen):');
  for (const id of Object.keys(r.byTeam.match).sort()) console.log(`  ${id.padEnd(14)}${String(r.byTeam.goal[id] ?? 0).padStart(6)}${String(r.byTeam.match[id] ?? 0).padStart(6)}${String(r.byTeam.win[id] ?? 0).padStart(6)}`);
}
