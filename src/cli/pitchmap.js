// The pitch map in Node (Task 78): samples the first matches of a fresh league as the channel shows them and prints
// where the ball and the players spend their time, against the targets in docs/channel.md §15.2. A developer tool.
// Usage: npm run pitchmap -- [--matches 12] [--seed baseline] [--override '{"settings":{"play":{...}}}']
// --override deep-merges into the loaded config (as in npm run balance) and is validated, to try values without
// editing config/settings.json.
import { parseArgs } from 'node:util';
import { ConfigError, validateConfig } from '../config.js';
import { deepMerge } from '../util.js';
import { addMatch, emptyMap, firstMatches, formatMeasure, formatTarget, GRID, measures, meets, TARGETS } from '../channel/pitchmap.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

const { values } = parseArgs({ options: { matches: { type: 'string', default: '12' }, seed: { type: 'string', default: 'baseline' }, override: { type: 'string' } } });
const count = Number(values.matches);
const seed = /** @type {string} */ (values.seed);

const config = structuredClone(await loadConfigFromDisk());
if (values.override) {
  deepMerge(config, JSON.parse(values.override));
  const errors = validateConfig(config);
  if (errors.length > 0) throw new ConfigError(errors);
  console.log(`Override: ${values.override}`);
}
const started = Date.now();
const map = emptyMap();
for (const m of firstMatches(config, seed, count)) addMatch(map, m.timeline, m.motion, { homeId: m.homeId, keeperSlot: config.positions.keeper, shotMs: config.settings.animation.shotMs });

console.log(`Pitch map: ${map.matches} matches of seed "${seed}", ${map.samples} moments of play (${((Date.now() - started) / 1000).toFixed(1)} s)\n`);
const m = measures(map, config.settings.play.tether);
const width = Math.max(...Object.values(TARGETS).map((t) => t.label.length));
for (const [key, t] of Object.entries(TARGETS)) {
  const ok = meets(key, m[key]);
  const mark = ok === null ? '  ' : ok ? 'ok' : '--';
  console.log(`${mark}  ${t.label.padEnd(width)}  ${formatMeasure(key, m[key]).padStart(7)}   ${formatTarget(key)}`);
}

// The ball's grid, attacking left to right, as shares of play.
console.log('\nThe ball (attacking →), % of play, top to bottom:');
for (let j = 0; j < GRID.across; j++) {
  const row = [];
  for (let i = 0; i < GRID.along; i++) row.push(((100 * map.ball[i * GRID.across + j]) / (map.samples || 1)).toFixed(1).padStart(5));
  console.log(`  ${row.join(' ')}`);
}
