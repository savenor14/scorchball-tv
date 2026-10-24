// Rules by season (Task 229b; the eras' foundation): data/rules.json is season 1's rules, and data/ruleChanges.json
// lists dated changes on top. Each season is played, and the off-season before it run, under its own rules.
// See docs/simulation.md §2a.
import { deepMerge } from '../util.js';

/**
 * @typedef {object} RuleChange
 * @property {string} id        A lower-case id, unique: how the history and chronicle name it.
 * @property {number} season    The first season played under it (2 or later).
 * @property {string} reason    The League's reason, in-universe (for the log, HISTORY and the desk).
 * @property {any} changes      A partial data/rules.json, merged over the rules before it (arrays replace).
 */

/** @type {WeakMap<object, Map<number, any>>} Each config's seasons' configs, so a season's rules are merged once. */
const cache = new WeakMap();

/**
 * The changes that take effect at a season, in the order listed.
 * @param {import('../config.js').Config} config @param {number} season
 * @returns {RuleChange[]}
 */
export function changesAt(config, season) {
  return (config.ruleChanges?.changes ?? []).filter((/** @type {RuleChange} */ c) => c.season === season);
}

/**
 * Every change in effect at a season (taken effect at it or before), in the order they took effect.
 * @param {import('../config.js').Config} config @param {number} season
 * @returns {RuleChange[]}
 */
export function changesInEffect(config, season) {
  return [...(config.ruleChanges?.changes ?? [])].filter((/** @type {RuleChange} */ c) => c.season <= season)
    .sort((/** @type {RuleChange} */ a, /** @type {RuleChange} */ b) => a.season - b.season);
}

/**
 * Season `season`'s rules: data/rules.json with every change in effect merged over it, in order.
 * @param {any} baseRules @param {RuleChange[]} inEffect
 */
export function mergeRules(baseRules, inEffect) {
  const rules = structuredClone(baseRules);
  for (const c of inEffect) deepMerge(rules, structuredClone(c.changes));
  return rules;
}

/**
 * The config to play a season under: the same config with that season's rules. When no change is in effect it's the
 * config itself, so a league with no changes plays exactly as before. The same season always gives the same object.
 * @template {import('../config.js').Config} C
 * @param {C} config @param {number} season
 * @returns {C}
 */
export function seasonConfig(config, season) {
  const inEffect = changesInEffect(config, season);
  if (inEffect.length === 0) return config;
  let seasons = cache.get(config);
  if (!seasons) cache.set(config, (seasons = new Map()));
  let out = seasons.get(season);
  if (!out) {
    out = { ...config, rules: Object.freeze(mergeRules(config.rules, inEffect)) };
    seasons.set(season, out);
  }
  return out;
}

/**
 * The `rule_change` event's data: the reason and each changed value before and after, by its dotted path.
 * @param {any} before  The rules the season before. @param {RuleChange} change
 * @returns {{ id: string, reason: string, values: { path: string, from: unknown, to: unknown }[] }}
 */
export function ruleChangeData(before, change) {
  /** @type {{ path: string, from: unknown, to: unknown }[]} */
  const values = [];
  const walk = (/** @type {any} */ patch, /** @type {any} */ old, /** @type {string} */ prefix) => {
    for (const [k, v] of Object.entries(patch)) {
      if (k.startsWith('_')) continue;
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object' && !Array.isArray(v) && old?.[k] && typeof old[k] === 'object') walk(v, old[k], path);
      else values.push({ path, from: old?.[k] ?? null, to: v });
    }
  };
  walk(change.changes, before, '');
  return { id: change.id, reason: change.reason, values };
}
