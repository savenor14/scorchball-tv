// Tiny declarative validator for the JSON data files. Browser-safe, no dependencies.
// Object keys starting with "_" are treated as comments and ignored.

/**
 * @typedef {{ kind: string, optional?: boolean, [key: string]: any }} Spec
 */

/** @param {number} [min] @param {number} [max] @returns {Spec} */
export const num = (min = -Infinity, max = Infinity) => ({ kind: 'number', min, max, integer: false });

/** @param {number} [min] @param {number} [max] @returns {Spec} */
export const int = (min = -Infinity, max = Infinity) => ({ kind: 'number', min, max, integer: true });

/** A probability, 0–1. @returns {Spec} */
export const prob = () => num(0, 1);

/** @returns {Spec} */
export const bool = () => ({ kind: 'boolean' });

/** @returns {Spec} */
export const str = () => ({ kind: 'string' });

/** A string matching a regular expression. @param {RegExp} re @param {string} description @returns {Spec} */
export const pattern = (re, description) => ({ kind: 'pattern', re, description });

/** @param {...(string|number)} values @returns {Spec} */
export const oneOf = (...values) => ({ kind: 'oneOf', values });

/**
 * @param {Spec} item
 * @param {{ minLength?: number, maxLength?: number, unique?: boolean }} [opts]
 * @returns {Spec}
 */
export const arrayOf = (item, { minLength = 0, maxLength = Infinity, unique = false } = {}) =>
  ({ kind: 'array', item, minLength, maxLength, unique });

/** An object with exactly these keys. @param {Record<string, Spec>} shape @returns {Spec} */
export const obj = (shape) => ({ kind: 'object', shape });

/** An object with any keys, all values matching `value`. @param {Spec} value @returns {Spec} */
export const recordOf = (value) => ({ kind: 'record', value });

/**
 * `{ "min": a, "max": b }` with both within bounds and a ≤ b.
 * @param {number} min @param {number} max @param {boolean} [integer]
 * @returns {Spec}
 */
export const range = (min, max, integer = false) => ({ kind: 'range', min, max, integer });

/** Any plain object, checked no further (a partial file checked once merged, e.g. a rule change). @returns {Spec} */
export const plainObject = () => ({ kind: 'plainObject' });

/** @param {Spec} spec @returns {Spec} */
export const optional = (spec) => ({ ...spec, optional: true });

/**
 * Validate a value against a spec.
 * @param {unknown} value
 * @param {Spec} spec
 * @returns {string[]} Human-readable errors such as "heat.burnSeconds: expected a number ≥ 1, got 0". Empty if valid.
 */
export function check(value, spec) {
  /** @type {string[]} */
  const errors = [];
  visit(value, spec, '', errors);
  return errors;
}

/**
 * @param {unknown} value @param {Spec} spec @param {string} path @param {string[]} errors
 */
function visit(value, spec, path, errors) {
  /** @param {string} msg */
  const fail = (msg) => { errors.push(`${path || '(root)'}: ${msg}`); };
  /** @param {string} key */
  const child = (key) => (path ? `${path}.${key}` : key);

  switch (spec.kind) {
    case 'number': {
      if (typeof value !== 'number' || !Number.isFinite(value)) return fail(`expected a number, got ${describe(value)}`);
      if (spec.integer && !Number.isInteger(value)) return fail(`expected a whole number, got ${value}`);
      if (value < spec.min || value > spec.max) return fail(`expected a number ${bounds(spec)}, got ${value}`);
      return;
    }
    case 'boolean':
      if (typeof value !== 'boolean') fail(`expected true or false, got ${describe(value)}`);
      return;
    case 'string':
      if (typeof value !== 'string' || value.length === 0) fail(`expected a non-empty string, got ${describe(value)}`);
      return;
    case 'pattern':
      if (typeof value !== 'string' || !spec.re.test(value)) fail(`expected ${spec.description}, got ${describe(value)}`);
      return;
    case 'oneOf':
      if (!spec.values.includes(value)) fail(`expected one of ${spec.values.map(fmt).join(', ')}, got ${describe(value)}`);
      return;
    case 'array': {
      if (!Array.isArray(value)) return fail(`expected a list, got ${describe(value)}`);
      if (value.length < spec.minLength || value.length > spec.maxLength) {
        fail(`expected ${spec.minLength}${spec.maxLength === Infinity ? '+' : `–${spec.maxLength}`} items, got ${value.length}`);
      }
      if (spec.unique && new Set(value).size !== value.length) fail('items must not repeat');
      value.forEach((item, i) => visit(item, spec.item, `${path}[${i}]`, errors));
      return;
    }
    case 'object': {
      if (!isPlainObject(value)) return fail(`expected an object, got ${describe(value)}`);
      for (const [key, sub] of Object.entries(/** @type {Record<string, Spec>} */ (spec.shape))) {
        if (Object.hasOwn(value, key)) visit(value[key], sub, child(key), errors);
        else if (!sub.optional) errors.push(`${child(key)}: missing`);
      }
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(spec.shape, key) && !key.startsWith('_')) errors.push(`${child(key)}: unknown key (typo?)`);
      }
      return;
    }
    case 'record': {
      if (!isPlainObject(value)) return fail(`expected an object, got ${describe(value)}`);
      for (const [key, item] of Object.entries(value)) {
        if (!key.startsWith('_')) visit(item, spec.value, child(key), errors);
      }
      return;
    }
    case 'plainObject':
      if (!isPlainObject(value)) fail(`expected an object, got ${describe(value)}`);
      return;
    case 'range': {
      const bound = spec.integer ? int(spec.min, spec.max) : num(spec.min, spec.max);
      const before = errors.length;
      visit(value, obj({ min: bound, max: bound }), path, errors);
      if (errors.length === before) {
        const r = /** @type {{ min: number, max: number }} */ (value);
        if (r.min > r.max) fail(`min (${r.min}) must not be greater than max (${r.max})`);
      }
      return;
    }
    default:
      throw new Error(`Unknown spec kind "${spec.kind}" at ${path || '(root)'}`);
  }
}

/** @param {unknown} v @returns {v is Record<string, any>} */
function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** @param {Spec} spec */
function bounds(spec) {
  if (spec.min > -Infinity && spec.max < Infinity) return `from ${spec.min} to ${spec.max}`;
  if (spec.min > -Infinity) return `≥ ${spec.min}`;
  return `≤ ${spec.max}`;
}

/** @param {unknown} v */
function fmt(v) {
  return typeof v === 'string' ? `"${v}"` : String(v);
}

/** @param {unknown} v */
function describe(v) {
  if (v === undefined) return 'nothing';
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'a list';
  if (typeof v === 'object') return 'an object';
  return `${typeof v} ${fmt(v)}`;
}
