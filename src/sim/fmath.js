// The sim's own exp, log, cos and pow (the launch, Task 270; docs/live.md §6). JavaScript leaves Math.exp, Math.log,
// Math.cos and Math.pow (and the ** operator) "implementation-approximated", so two browsers may differ in the last
// digit, and one such difference could flip a roll and fork a viewer's league. These use only + - * / and exact bit
// handling, which every engine computes alike (IEEE 754, correctly rounded), so every browser gets the same answer.
// Ported from FreeBSD's msun (fdlibm, Sun Microsystems: "Permission to use, copy, modify, and distribute this
// software is freely granted, provided that this notice is preserved."): e_exp.c, e_log.c, k_cos.c, k_sin.c,
// e_rem_pio2.c. Accurate to within an ulp of Math's own; not bit for bit the same as any browser's, and needn't be.

const buf = new DataView(new ArrayBuffer(8));

/** The high 32 bits of a double. @param {number} x */
function high(x) {
  buf.setFloat64(0, x);
  return buf.getUint32(0);
}

/** 2^k for an integer k in [-1022, 1023], built from its bits. @param {number} k */
function twoTo(k) {
  buf.setUint32(0, (k + 1023) << 20);
  buf.setUint32(4, 0);
  return buf.getFloat64(0);
}

/** x · 2^k, exact while the result is a normal number (and correctly rounded into the subnormals). @param {number} x @param {number} k */
function scale(x, k) {
  while (k > 1023) { x *= twoTo(1023); k -= 1023; }
  while (k < -1022) { x *= twoTo(-1022); k += 1022; }
  return x * twoTo(k);
}

const LN2_HI = 6.93147180369123816490e-01;
const LN2_LO = 1.90821492927058770002e-10;
const INV_LN2 = 1.44269504088896338700e+00;

/** e^x. @param {number} x */
export function exp(x) {
  if (Number.isNaN(x)) return NaN;
  if (x > 7.09782712893383973096e+02) return Infinity;
  if (x < -7.45133219101941108420e+02) return 0;
  if (Math.abs(x) < 3.725290298461914e-09) return 1 + x; // |x| < 2^-28
  const k = Math.trunc(INV_LN2 * x + (x < 0 ? -0.5 : 0.5));
  const hi = x - k * LN2_HI;
  const lo = k * LN2_LO;
  const r = hi - lo;
  const t = r * r;
  const c = r - t * (1.66666666666666019037e-01 + t * (-2.77777777770155933842e-03 + t * (6.61375632143793436117e-05 + t * (-1.65339022054652515390e-06 + t * 4.13813679705723846039e-08))));
  const y = 1 - ((lo - (r * c) / (2 - c)) - hi);
  return k === 0 ? y : scale(y, k);
}

/** The natural logarithm. @param {number} x */
export function log(x) {
  if (Number.isNaN(x) || x < 0) return NaN;
  if (x === 0) return -Infinity;
  if (x === Infinity) return Infinity;
  let k = 0;
  if (x < 2.2250738585072014e-308) { // subnormal: scale up by 2^54
    x *= 18014398509481984;
    k -= 54;
  }
  const hx = high(x);
  k += (hx >>> 20) - 1023;
  // The mantissa m in [sqrt(2)/2, sqrt(2)): x = 2^k · m.
  let i = (hx & 0x000fffff);
  const j = (i + 0x95f64) & 0x100000;
  buf.setFloat64(0, x);
  buf.setUint32(0, i | (j ^ 0x3ff00000));
  const m = buf.getFloat64(0);
  k += j >>> 20;
  const f = m - 1;
  const s = f / (2 + f);
  const z = s * s;
  const w = z * z;
  const t1 = w * (3.999999999940941908e-01 + w * (2.222219843214978396e-01 + w * 1.531383769920937332e-01));
  const t2 = z * (6.666666666666735130e-01 + w * (2.857142874366239149e-01 + w * (1.818357216161805012e-01 + w * 1.479819860511658591e-01)));
  const R = t2 + t1;
  const hfsq = 0.5 * f * f;
  return k * LN2_HI - ((hfsq - (s * (hfsq + R) + k * LN2_LO)) - f);
}

/** cos on [-π/4, π/4], x + y the reduced argument. @param {number} x @param {number} y */
function kernelCos(x, y) {
  const z = x * x;
  const w = z * z;
  const r = z * (4.16666666666666019037e-02 + z * (-1.38888888888741095749e-03 + z * 2.48015872894767294178e-05)) + w * w * (-2.75573143513906633035e-07 + z * (2.08757232129817482790e-09 + z * -1.13596475577881948265e-11));
  const hz = 0.5 * z;
  const v = 1 - hz;
  return v + (((1 - v) - hz) + (z * r - x * y));
}

/** sin on [-π/4, π/4], x + y the reduced argument. @param {number} x @param {number} y */
function kernelSin(x, y) {
  const z = x * x;
  const w = z * z;
  const r = 8.33333333332248946124e-03 + z * (-1.98412698298579493134e-04 + z * 2.75573137070700676789e-06) + z * w * (-2.50507602534068634195e-08 + z * 1.58969099521155010221e-10);
  const v = z * x;
  return x - ((z * (0.5 * y - v * r) - y) - v * -1.66666666666666324348e-01);
}

/** The largest |x| cos reduces accurately (Cody–Waite in three parts, as e_rem_pio2.c's medium case). */
export const COS_MAX = 524288 * (Math.PI / 2); // 2^19 · π/2

/** cos x, for |x| up to COS_MAX (the sim's only use is cos 2πv, v in [0, 1)). @param {number} x */
export function cos(x) {
  if (!Number.isFinite(x)) return NaN;
  if (Math.abs(x) > COS_MAX) throw new Error(`fmath.cos: |x| over ${COS_MAX}`);
  // x = n·π/2 + (y0 + y1).
  const fn = (x * 6.36619772367581382433e-01 + 6755399441055744) - 6755399441055744; // round to nearest, by 1.5·2^52
  const n = fn | 0;
  let r = x - fn * 1.57079632673412561417e+00;
  let w = fn * 6.07710050650619224932e-11;
  let t = r;
  w = fn * 6.07710050630396597660e-11;
  r = t - w;
  w = fn * 2.02226624879595063154e-21 - ((t - r) - w);
  t = r;
  w = fn * 2.02226624871116645580e-21;
  r = t - w;
  w = fn * 8.47842766036889956997e-32 - ((t - r) - w);
  const y0 = r - w;
  const y1 = (r - y0) - w;
  switch (n & 3) {
    case 0: return kernelCos(y0, y1);
    case 1: return -kernelSin(y0, y1);
    case 2: return -kernelCos(y0, y1);
    default: return kernelSin(y0, y1);
  }
}

/** a^b for a > 0 (the sim's wages), as e^(b·ln a). @param {number} a @param {number} b */
export function pow(a, b) {
  if (!(a > 0)) throw new Error(`fmath.pow: the base must be positive (got ${a})`);
  return exp(b * log(a));
}
