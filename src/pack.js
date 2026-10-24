// Packing a live league's state as JSON and back (the launch, Task 272: snapshots; docs/live.md §5). JSON alone loses
// Maps and Sets, turns an object shared by two structures into two copies (a match's events sit in the live league, the
// facts log and the chronicle's open matches at once), and unfreezes what was frozen. Here every object is written
// once, as a node, and referred to by its number wherever it appears; Maps, Sets, frozen objects, undefined and
// non-finite numbers come back as they were. Only plain data: a class instance (other than Map and Set) is refused, so
// a class's state must be saved by the class itself.

/** @typedef {{ root: any, nodes: any[] }} Packed */

/**
 * @param {any} root
 * @returns {Packed}
 */
export function pack(root) {
  /** @type {Map<object, number>} */
  const ids = new Map();
  /** @type {any[]} */
  const nodes = [];
  /** @param {any} v @param {string} at  Where it was (for the error). @returns {any} */
  const enc = (v, at) => {
    if (v === undefined) return { $u: 1 };
    if (typeof v === 'number' && !Number.isFinite(v)) return { $n: String(v) };
    if (v === null || typeof v !== 'object') {
      if (typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint') throw new TypeError(`pack: a ${typeof v} at ${at}`);
      return v;
    }
    const seen = ids.get(v);
    if (seen !== undefined) return { $r: seen };
    const id = nodes.length;
    ids.set(v, id);
    nodes.push(null);
    /** @type {any} */
    let node;
    if (v instanceof Map) node = { $m: [...v].map(([k, x], i) => [enc(k, `${at}<key ${i}>`), enc(x, `${at}<${String(k)}>`)]) };
    else if (v instanceof Set) node = { $s: [...v].map((x, i) => enc(x, `${at}{${i}}`)) };
    else if (Array.isArray(v)) node = { $a: v.map((x, i) => enc(x, `${at}[${i}]`)) };
    else {
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null) throw new TypeError(`pack: a ${proto?.constructor?.name ?? 'class'} at ${at} (save its state as plain data)`);
      /** @type {Record<string, any>} */
      const o = {};
      for (const k of Object.keys(v)) o[k] = enc(v[k], `${at}.${k}`);
      node = { $o: o };
    }
    if (Object.isFrozen(v)) node.$f = 1;
    nodes[id] = node;
    return { $r: id };
  };
  return { root: enc(root, 'root'), nodes };
}

/**
 * @param {Packed} packed
 * @returns {any}
 */
export function unpack({ root, nodes }) {
  /** @type {any[]} */
  const made = new Array(nodes.length);
  /** @param {any} x @returns {any} */
  const dec = (x) => {
    if (x === null || typeof x !== 'object') return x;
    if ('$r' in x) return node(x.$r);
    if ('$u' in x) return undefined;
    if ('$n' in x) return Number(x.$n);
    throw new TypeError('unpack: not a packed value');
  };
  /** @param {number} id */
  const node = (id) => {
    if (made[id] !== undefined) return made[id];
    const n = nodes[id];
    /** @type {any} */
    let v;
    if (n.$m) {
      made[id] = v = new Map();
      for (const [k, x] of n.$m) v.set(dec(k), dec(x));
    } else if (n.$s) {
      made[id] = v = new Set();
      for (const x of n.$s) v.add(dec(x));
    } else if (n.$a) {
      made[id] = v = [];
      for (const x of n.$a) v.push(dec(x));
    } else {
      made[id] = v = {};
      for (const k of Object.keys(n.$o)) v[k] = dec(n.$o[k]);
    }
    if (n.$f) Object.freeze(v);
    return v;
  };
  return dec(root);
}
