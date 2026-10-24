// Facts report (Talk that remembers, Task 243): fast-forwards a league and counts how often each kind of fact turns up
// after a match (and before one), so the desk's and the interview's lines can be sized: a rare fact needs few ways of
// saying it, a common one many. A developer tool. See docs/simulation.md §12c.
// Usage: npm run facts -- [--seasons 20] [--seed facts] [--samples 2]
import { parseArgs } from 'node:util';
import { collectFacts } from '../chronicle/factsLeague.js';
import { loadConfigFromDisk } from './loadConfigFromDisk.js';

async function main() {
  const { values } = parseArgs({
    options: { seasons: { type: 'string', default: '20' }, seed: { type: 'string', default: 'facts' }, samples: { type: 'string', default: '2' } },
  });
  const config = await loadConfigFromDisk();
  const seasons = Number(values.seasons);
  const t0 = Date.now();
  const { chronicle, after, before } = collectFacts(config, String(values.seed), seasons);
  const name = (/** @type {string | undefined} */ id) => {
    const p = id ? chronicle.players.get(id) : undefined;
    return p ? `${p.firstName[0]}. ${p.lastName}` : '';
  };
  const matches = after.length;
  console.log(`${seasons} seasons, seed ${values.seed}: ${matches} matches (${(matches / seasons).toFixed(0)} a season), ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  const weights = config.chronicle.facts.weights;
  for (const [label, list] of /** @type {const} */ ([['AFTER A MATCH', after], ['BEFORE A MATCH', before]])) {
    /** @type {Map<string, import('../chronicle/facts.js').Fact[]>} */
    const byKind = new Map();
    for (const x of list) for (const f of x.facts) byKind.set(f.kind, [...(byKind.get(f.kind) ?? []), f]);
    console.log(`${label}   kind                  weight   total  a season  per 100 matches   e.g.`);
    const kinds = [...byKind.keys()].sort((a, b) => weights[b] - weights[a] || /** @type {any} */ (byKind.get(b)).length - /** @type {any} */ (byKind.get(a)).length);
    for (const k of kinds) {
      const fs = /** @type {import('../chronicle/facts.js').Fact[]} */ (byKind.get(k));
      const eg = fs.slice(0, Number(values.samples)).map((f) => [name(f.playerId), f.teamId, f.opponentId && `v ${f.opponentId}`, f.stat, f.value, f.how, f.decider].filter((x) => x !== undefined && x !== '' && x !== null).join(' ')).join(' | ');
      console.log(`                ${k.padEnd(22)}${String(weights[k]).padStart(6)}${String(fs.length).padStart(8)}${(fs.length / seasons).toFixed(1).padStart(10)}${(100 * fs.length / list.length).toFixed(1).padStart(17)}   ${eg}`);
    }
    const any = list.filter((x) => x.facts.length).length;
    const big = list.filter((x) => (x.facts[0]?.weight ?? 0) >= 7).length;
    console.log(`                matches with a fact: ${(100 * any / list.length).toFixed(0)}%; with one weighing 7 or more: ${(100 * big / list.length).toFixed(0)}%\n`);
  }
}

if (import.meta.main) await main();
