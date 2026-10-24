// The brands' ads (Task 105; split from spotArt.js, Task 157): each a 9 s scene (a function of the moment into it, so
// any frame draws the same) and a still for the strip above the ground in Full. Brands, taglines and colours come from
// data/spots.json. spotArt.js puts these with the league's own (spotLeague.js).
import { PALETTE } from './palette.js';
import { blockText, blockWidth, clamp01, ease, fillPoly, mix, mod, rgba, shade } from './sceneArt.js';
import { FANS, FIRE, SKINS, box, brand, endCard, fireball, hash, line, oval, pixelLine, small, sky } from './spotKit.js';

/**
 * @typedef {import('./spotKit.js').AdDraw} AdDraw
 * @typedef {import('./spotKit.js').StillDraw} StillDraw
 * @typedef {import('./spotKit.js').Path} Path
 */

/** Caravan Cola (Sunreach): a caravan crosses the dunes at sunset; a can rises, fizzing. @type {AdDraw} */
function caravanCola(ctx, R, ms, ad) {
  sky(ctx, { ...R, h: R.h * 0.62 }, ['#3b1a4a', '#6a2448', '#a8344a', '#d8553a', '#f08a3a', '#f8b84a']);
  ctx.fillStyle = '#ffd86a';
  for (let y = -18; y <= 0; y++) { const h = Math.round(Math.sqrt(324 - y * y)); ctx.fillRect(R.x + 290 - h, R.y + Math.round(R.h * 0.6) + y, h * 2, 1); }
  for (const [y0, col, amp, off] of /** @type {[number, string, number, number][]} */ ([[0.58, '#c8603a', 8, 0], [0.68, '#a84a2e', 10, 2], [0.8, '#7a3322', 7, 4]])) {
    ctx.fillStyle = col;
    for (let x = 0; x < R.w; x++) { const y = R.y + R.h * y0 + amp * Math.sin(x / 40 + off); ctx.fillRect(R.x + x, Math.round(y), 1, R.y + R.h - Math.round(y)); }
  }
  // The caravan: three camels and a walker in silhouette.
  const walk = ((ms / 1000) * 22) % (R.w + 120) - 60;
  for (let k = 0; k < 3; k++) {
    const x = R.x + walk - k * 34;
    const y = R.y + Math.round(R.h * 0.6) - 2;
    const step = Math.floor(ms / 250 + k) % 2;
    ctx.fillStyle = '#2a1018';
    ctx.fillRect(x, y - 12, 16, 6); ctx.fillRect(x + 4, y - 15, 6, 3); ctx.fillRect(x + 14, y - 18, 3, 8); ctx.fillRect(x + 15, y - 19, 4, 2);
    for (const lx of [1, 5, 10, 13]) ctx.fillRect(x + lx + (lx % 2 ? step : -step), y - 6, 1, 6);
  }
  // The can rises in the middle, fizzing.
  const rise = ease(clamp01((ms - 2500) / 900));
  if (rise > 0) {
    const cx = R.x + R.w / 2;
    const top = Math.round(R.y + R.h * 0.2 + (1 - rise) * 120);
    ctx.fillStyle = '#c9ccd4'; ctx.fillRect(cx - 13, top, 26, 3);
    ctx.fillStyle = '#d62d2d'; ctx.fillRect(cx - 14, top + 3, 28, 50);
    ctx.fillStyle = '#f0d9a0'; for (let x = 0; x < 28; x++) ctx.fillRect(cx - 14 + x, top + 24 + Math.round(3 * Math.sin(x / 4)), 1, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(cx - 10, top + 5, 2, 44);
    ctx.fillStyle = '#c9ccd4'; ctx.fillRect(cx - 13, top + 53, 26, 2);
    blockText(ctx, 'CC', cx - 5, top + 8, 1, '#f0d9a0');
    for (let k = 0; k < 10; k++) { const b = mod(ms / 7 + k * 37, 70); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(cx - 10 + ((k * 7) % 20), top - b * 0.6, 1, 1); }
  }
  const e = endCard(ms);
  if (e > 0) {
    ctx.fillStyle = `rgba(40,10,20,${0.75 * e})`;
    ctx.fillRect(R.x, R.y + R.h - 64, R.w, 64);
    ctx.globalAlpha = e;
    brand(ctx, ad.brand.toUpperCase(), R.x + R.w / 2, R.y + R.h - 56, 3, ad.colours[0], ad.colours[1]);
    line(ctx, ad.tagline, R.x + R.w / 2, R.y + R.h - 20, 14, '#ffd86a');
    ctx.globalAlpha = 1;
  }
}

/** Tideline Sardines (Gullcoast): the gull mascot dives for a tin and winks. @type {AdDraw} */
function tideline(ctx, R, ms, ad) {
  sky(ctx, { ...R, h: R.h * 0.55 }, ['#5fb4e8', '#7cc4ec', '#9ad4f0', '#bfe4f4']);
  sky(ctx, { ...R, y: R.y + R.h * 0.55, h: R.h * 0.45 }, ['#1f7aa8', '#1a6890', '#155878', '#104860']);
  for (let row = 0; row < 6; row++) {
    const y = R.y + Math.round(R.h * (0.58 + row * 0.07));
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let x = mod(-ms / (30 - row * 3) + row * 13, 26); x < R.w; x += 26) ctx.fillRect(R.x + Math.round(x), y, 6 + row, 1);
  }
  // The gull: swoops in, dives, comes up with the tin, hovers and winks.
  const t = ms / 1000;
  const cx = R.x + R.w / 2;
  let gx; let gy;
  if (t < 1.5) { gx = R.x - 30 + (cx - R.x + 30) * ease(t / 1.5); gy = R.y + 40; }
  else if (t < 2.4) { gx = cx; gy = R.y + 40 + Math.sin(((t - 1.5) / 0.9) * Math.PI) * 95; }
  else { gx = cx; gy = R.y + 52 + 3 * Math.sin(t * 5); }
  const flap = Math.floor(ms / 140) % 2;
  const s = 3;
  const px = (/** @type {string} */ c, /** @type {number} */ x, /** @type {number} */ y, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(gx + x * s), Math.round(gy + y * s), w * s, h * s); };
  px('#f4f7fb', -4, -2, 8, 4); px('#f4f7fb', 3, -4, 3, 3);
  px('#c9ccd4', -9, flap ? -6 : -1, 6, 2); px('#c9ccd4', 3, flap ? -6 : -1, 6, 2);
  px('#f2c230', 6, -3, 2, 1);
  px('#1d2230', 4, -3, 1, ms > 5200 && ms < 5500 ? 0.4 : 1);
  px('#1a1a1a', 2, -5, 4, 1); px('#1a1a1a', 3, -6, 2, 1);
  if (t > 2.0) { px('#c9ccd4', -2, 2, 6, 3); px('#3a7bd5', -2, 3, 6, 1); }
  if (t > 2.4 && t < 3.6) for (let k = 0; k < 8; k++) { ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(Math.round(gx - 10 + k * 3), Math.round(R.y + R.h * 0.6 - ((t - 2.4) * 40 * (0.5 + hash(k)))), 1, 1); }
  const e = endCard(ms);
  if (e > 0) {
    ctx.globalAlpha = e;
    ctx.fillStyle = 'rgba(16,40,64,0.85)';
    ctx.fillRect(R.x + 40, R.y + R.h - 66, R.w - 80, 52);
    brand(ctx, ad.brand.toUpperCase(), R.x + R.w / 2, R.y + R.h - 60, 2, ad.colours[0], ad.colours[1]);
    line(ctx, ad.tagline, R.x + R.w / 2, R.y + R.h - 28, 14, '#bfe4f4');
    ctx.globalAlpha = 1;
  }
}

/** Foundry Fuel (the Kettle): a sponsored stat, the season's scorchers counting up, sparks flying. @type {AdDraw} */
function foundryFuel(ctx, R, ms, ad, facts) {
  const total = facts.scorchers;
  sky(ctx, R, ['#16181f', '#1c1f28', '#22252e', '#1a1c24']);
  ctx.fillStyle = '#2b2f3a';
  for (let x = 0; x < R.w; x += 28) ctx.fillRect(R.x + x, R.y, 2, R.h);
  for (let k = 0; k < 40; k++) {
    const life = 900;
    const t0 = (k * 173) % 2400;
    const age = mod(ms - t0, 2400);
    if (age > life) continue;
    const f = age / life;
    const sx = R.x + 40 + hash(k) * 60 + f * (80 + hash(k + 1) * 120);
    const sy = R.y + R.h - 20 - f * (60 + hash(k + 2) * 80) + f * f * 90;
    ctx.fillStyle = FIRE[Math.min(5, Math.floor(f * 6))];
    ctx.fillRect(Math.round(sx), Math.round(sy), 2, 1);
  }
  const cx = R.x + R.w / 2 + 40;
  line(ctx, facts.lastSeason ? 'SCORCHERS LAST SEASON' : 'SCORCHERS THIS SEASON', cx, R.y + 42, 16, '#9aa1b2');
  const n = Math.round(total * ease(clamp01((ms - 400) / 2600)));
  line(ctx, String(n), cx, R.y + 88, 58, '#ffb627');
  line(ctx, 'brought to you by', cx, R.y + 136, 14, '#9aa1b2');
  brand(ctx, ad.brand.toUpperCase(), cx, R.y + 150, 3, ad.colours[0], ad.colours[1]);
  // The can, on the left.
  const top = R.y + 70;
  const can = R.x + 60;
  ctx.fillStyle = '#9aa1b2'; ctx.fillRect(can - 13, top, 26, 3);
  ctx.fillStyle = '#2f2f35'; ctx.fillRect(can - 14, top + 3, 28, 60);
  ctx.fillStyle = '#ff8a1f';
  fillPoly(ctx, [[can - 4, top + 50], [can + 6, top + 50], [can + 3, top + 34], [can + 8, top + 38], [can + 1, top + 18], [can - 2, top + 30], [can - 7, top + 26]]);
  ctx.fillStyle = '#ffd23f'; ctx.fillRect(can - 1, top + 40, 3, 8);
  ctx.fillStyle = '#9aa1b2'; ctx.fillRect(can - 13, top + 63, 26, 2);
  const e = endCard(ms);
  if (e > 0) { ctx.globalAlpha = e; line(ctx, ad.tagline, cx, R.y + R.h - 26, 16, '#f2efe6'); ctx.globalAlpha = 1; }
}

/** Ironvale Boots (the Kettle): a billboard with chasing lights; a boot strikes a ball that heats up as it flies. @type {AdDraw} */
function ironvale(ctx, R, ms, ad) {
  sky(ctx, R, ['#0d1016', '#11151d', '#151a24']);
  const B = { x: R.x + 24, y: R.y + 18, w: R.w - 48, h: R.h - 50 };
  ctx.fillStyle = '#2b2f3a';
  ctx.fillRect(B.x + 40, B.y + B.h, 6, R.y + R.h - B.y - B.h);
  ctx.fillRect(B.x + B.w - 46, B.y + B.h, 6, R.y + R.h - B.y - B.h);
  ctx.fillStyle = '#e8641e'; ctx.fillRect(B.x - 6, B.y - 6, B.w + 12, B.h + 12);
  ctx.fillStyle = '#1b1d24'; ctx.fillRect(B.x, B.y, B.w, B.h);
  // Chasing bulbs round the frame.
  const per = 2 * (B.w + B.h);
  for (let d = 0; d < per; d += 10) {
    const on = Math.floor(d / 10 + ms / 120) % 3 === 0;
    let x; let y;
    if (d < B.w) { x = B.x + d; y = B.y - 4; } else if (d < B.w + B.h) { x = B.x + B.w + 3; y = B.y + d - B.w; } else if (d < 2 * B.w + B.h) { x = B.x + B.w - (d - B.w - B.h); y = B.y + B.h + 3; } else { x = B.x - 4; y = B.y + B.h - (d - 2 * B.w - B.h); }
    ctx.fillStyle = on ? '#fff6c8' : '#7a3a10';
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
  // The boot swings and strikes at 1.4 s; the ball flies off, heating white → red.
  const strike = 1400;
  const swing = ms < strike ? -0.8 + 0.8 * ease(ms / strike) : 0.25 * Math.max(0, 1 - (ms - strike) / 400);
  const bx = B.x + 90;
  const by = B.y + 70;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(swing);
  ctx.fillStyle = '#1a1a1a'; ctx.fillRect(-6, -40, 12, 36);
  ctx.fillStyle = '#2f2f35'; ctx.fillRect(-8, -6, 30, 12);
  ctx.fillStyle = '#e8641e'; for (let k = 0; k < 4; k++) ctx.fillRect(-2 + k * 4, -4, 2, 1);
  ctx.fillStyle = '#c9ccd4'; for (let k = 0; k < 5; k++) ctx.fillRect(-6 + k * 6, 6, 2, 2);
  ctx.restore();
  const fly = clamp01((ms - strike) / 1400);
  /** @type {Path} */
  const path = (t) => {
    const f = clamp01((t - strike) / 1400);
    return { x: bx + 30 + f * (B.w - 140), y: by + 2 - Math.sin(f * Math.PI) * 30 - f * 10 };
  };
  if (ms < strike) {
    ctx.fillStyle = '#ffffff';
    for (let y = -6; y <= 6; y++) { const h = Math.round(Math.sqrt(36 - y * y)); ctx.fillRect(bx + 30 - h, by + 2 + y, 2 * h + 1, 1); }
  } else {
    const heat = (/** @type {number} */ t) => { const h = clamp01((t - strike) / 1400); return h < 0.5 ? mix('#ffffff', PALETTE.heatWarm, h * 2) : mix(PALETTE.heatWarm, PALETTE.heatHot, (h - 0.5) * 2); };
    fireball(ctx, Math.min(ms, strike + 1400), path, { r: 6, life: 380, rate: fly > 0.4 ? 4 : 1, speed: 30, from: strike, core: heat, seed: 3 });
  }
  const e = ease(clamp01((ms - 3600) / 500));
  if (e > 0) {
    ctx.globalAlpha = e;
    brand(ctx, ad.brand.toUpperCase(), B.x + B.w / 2, B.y + B.h - 58, 3, ad.colours[0], ad.colours[1]);
    line(ctx, ad.tagline, B.x + B.w / 2, B.y + B.h - 18, 14, '#ffb627');
    ctx.globalAlpha = 1;
  }
}

/** Velours sparkling water (Varenne): vineyards, a bottle pours into a glass, very refined. @type {AdDraw} */
function velours(ctx, R, ms, ad) {
  sky(ctx, { ...R, h: R.h * 0.5 }, ['#e8d8f0', '#dcc8e8', '#cdb6de', '#bca4d2']);
  for (const [y0, col] of /** @type {[number, string][]} */ ([[0.42, '#7a8a4a'], [0.55, '#5f7038'], [0.7, '#4a5a2c']])) {
    ctx.fillStyle = col;
    for (let x = 0; x < R.w; x++) { const y = R.y + R.h * y0 + 10 * Math.sin(x / 70 + y0 * 9); ctx.fillRect(R.x + x, Math.round(y), 1, R.y + R.h - Math.round(y)); }
    ctx.fillStyle = shade(col, 0.75);
    for (let x = 4; x < R.w; x += 9) for (let k = 0; k < 4; k++) ctx.fillRect(R.x + x, Math.round(R.y + R.h * y0 + 10 * Math.sin(x / 70 + y0 * 9)) + 4 + k * 6, 3, 2);
  }
  // A table, the bottle tilting to pour, the glass filling with bubbles.
  const cx = R.x + R.w / 2;
  ctx.fillStyle = '#f4e8d0'; ctx.fillRect(cx - 110, R.y + 150, 220, 6);
  ctx.fillStyle = '#d8ccb0'; ctx.fillRect(cx - 110, R.y + 156, 220, 3);
  const tilt = ease(clamp01((ms - 800) / 900)) * (1 - ease(clamp01((ms - 4200) / 700)));
  ctx.save();
  // On the table's top (Tom: it hovered 2 px above it), tilting about its foot.
  ctx.translate(cx - 30, R.y + 150);
  ctx.rotate(-tilt * 1.6);
  ctx.fillStyle = '#2a6a4a'; ctx.fillRect(-9, -58, 18, 58); ctx.fillRect(-4, -76, 8, 18);
  ctx.fillStyle = '#f4e8d0'; ctx.fillRect(-9, -40, 18, 16);
  ctx.fillStyle = '#6b3fa0'; ctx.fillRect(-9, -36, 18, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-6, -56, 2, 50);
  ctx.restore();
  const fill = clamp01((ms - 1500) / 2600);
  const gx = cx + 20;
  ctx.fillStyle = 'rgba(220,235,255,0.5)'; ctx.fillRect(gx - 9, R.y + 112, 18, 38);
  ctx.fillStyle = 'rgba(200,230,255,0.85)'; ctx.fillRect(gx - 8, R.y + 150 - Math.round(36 * fill), 16, Math.round(36 * fill));
  if (tilt > 0.6 && fill < 1) { ctx.fillStyle = 'rgba(200,230,255,0.9)'; ctx.fillRect(gx - 4, R.y + 92, 2, 58 - Math.round(36 * fill)); }
  for (let k = 0; k < 8 * fill; k++) { ctx.fillStyle = '#ffffff'; ctx.fillRect(gx - 6 + ((k * 5) % 12), R.y + 148 - mod(ms / 20 + k * 9, 34 * fill + 1), 1, 1); }
  const e = endCard(ms);
  if (e > 0) {
    ctx.globalAlpha = e;
    // Clear of the scorebug in Broadcast (Tom, Groundwork: it cut the name off): everything 10 px lower than before.
    ctx.fillStyle = 'rgba(40,20,60,0.8)';
    ctx.fillRect(R.x + 60, R.y + 24, R.w - 120, 54);
    brand(ctx, ad.brand.toUpperCase(), R.x + R.w / 2, R.y + 30, 4, ad.colours[0], ad.colours[1]);
    line(ctx, ad.tagline, R.x + R.w / 2, R.y + 67, 14, '#e8d8f0');
    ctx.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- the stills (Task 113)

/** Caravan Cola: the caravan on the dunes at sunset, the can. @type {StillDraw} */
function caravanColaStill(ctx, R, ad) {
  sky(ctx, { ...R, h: 14 }, ['#3b1a4a', '#6a2448', '#a8344a', '#d8553a', '#f08a3a', '#f8b84a']);
  for (let y = -6; y <= 0; y++) { const h = Math.round(Math.sqrt(36 - y * y)); box(ctx, '#ffd86a', R.x + R.w - 48 - h, R.y + 12 + y, h * 2, 1); }
  for (const [y0, col, amp, off] of /** @type {[number, string, number, number][]} */ ([[12, '#c8603a', 1.5, 0], [15, '#a84a2e', 2, 2], [18, '#7a3322', 1.5, 4]])) {
    for (let x = 0; x < R.w; x++) { const y = Math.round(R.y + y0 + amp * Math.sin(x / 14 + off)); box(ctx, col, R.x + x, y, 1, R.y + R.h - y); }
  }
  // Three camels on the skyline, walking right.
  for (let k = 0; k < 3; k++) {
    const x = R.x + R.w - 88 + k * 12;
    const y = R.y + 11;
    box(ctx, '#2a1018', x, y - 4, 6, 2); box(ctx, '#2a1018', x + 2, y - 5, 2, 1); box(ctx, '#2a1018', x + 5, y - 7, 1, 3); box(ctx, '#2a1018', x + 6, y - 7, 2, 1);
    for (const lx of [0, 2, 3, 5]) box(ctx, '#2a1018', x + lx, y - 2, 1, 2);
  }
  // The can.
  const cx = R.x + R.w - 18;
  box(ctx, '#c9ccd4', cx - 4, R.y + 2, 9, 1);
  box(ctx, '#d62d2d', cx - 5, R.y + 3, 11, 14);
  for (let x = 0; x < 11; x++) box(ctx, '#f0d9a0', cx - 5 + x, R.y + 9 + Math.round(Math.sin(x / 2)), 1, 2);
  box(ctx, 'rgba(255,255,255,0.35)', cx - 3, R.y + 4, 1, 12);
  box(ctx, '#c9ccd4', cx - 4, R.y + 17, 9, 1);
  for (let k = 0; k < 4; k++) box(ctx, 'rgba(255,255,255,0.7)', cx - 3 + k * 2, R.y + 1 - (k % 2), 1, 1);
  small(ctx, ad.brand.toUpperCase(), R.x + 5, R.y + 3, ad.colours[0], ad.colours[1]);
}

/** Tideline Sardines: the gull over the sea with a tin. @type {StillDraw} */
function tidelineStill(ctx, R, ad) {
  sky(ctx, { ...R, h: 10 }, ['#5fb4e8', '#7cc4ec', '#9ad4f0', '#bfe4f4']);
  sky(ctx, { ...R, y: R.y + 10, h: R.h - 10 }, ['#1f7aa8', '#1a6890', '#155878', '#104860']);
  for (let row = 0; row < 3; row++) for (let x = (row * 9) % 17; x < R.w; x += 17) box(ctx, 'rgba(255,255,255,0.45)', R.x + x, R.y + 12 + row * 3, 3 + row, 1);
  // The gull, wings up, the tin in its feet.
  const gx = R.x + R.w - 30;
  const gy = R.y + 6;
  box(ctx, '#f4f7fb', gx - 4, gy - 1, 8, 4); box(ctx, '#f4f7fb', gx + 3, gy - 3, 3, 3);
  box(ctx, '#c9ccd4', gx - 9, gy - 4, 6, 2); box(ctx, '#c9ccd4', gx + 2, gy - 5, 5, 2);
  box(ctx, '#f2c230', gx + 6, gy - 2, 2, 1);
  box(ctx, '#1d2230', gx + 4, gy - 2, 1, 1);
  box(ctx, '#c9ccd4', gx - 2, gy + 3, 6, 3); box(ctx, '#3a7bd5', gx - 2, gy + 4, 6, 1);
  box(ctx, 'rgba(16,40,64,0.85)', R.x + 3, R.y + 1, 108, 10);
  small(ctx, ad.brand.toUpperCase(), R.x + 6, R.y + 3, ad.colours[0], ad.colours[1]);
}

/** Foundry Fuel: the sponsored stat, sparks off the grinder, the can. @type {StillDraw} */
function foundryFuelStill(ctx, R, ad, facts) {
  sky(ctx, R, ['#16181f', '#1c1f28', '#22252e', '#1a1c24']);
  for (let x = 0; x < R.w; x += 20) box(ctx, '#2b2f3a', R.x + x, R.y, 1, R.h);
  for (let k = 0; k < 14; k++) box(ctx, FIRE[k % 5], R.x + 18 + Math.round(hash(k) * 14), R.y + 3 + Math.round(hash(k + 7) * 13), 1 + (k % 2), 1);
  // The can, on the left.
  const can = R.x + 9;
  box(ctx, '#9aa1b2', can - 4, R.y + 1, 9, 1);
  box(ctx, '#2f2f35', can - 5, R.y + 2, 11, 15);
  ctx.fillStyle = '#ff8a1f';
  fillPoly(ctx, [[can - 2, R.y + 14], [can + 3, R.y + 14], [can + 2, R.y + 9], [can + 3, R.y + 10], [can, R.y + 4], [can - 1, R.y + 8], [can - 3, R.y + 7]]);
  box(ctx, '#9aa1b2', can - 4, R.y + 17, 9, 1);
  // The stat: this season's scorchers, then the brand.
  const n = String(facts.scorchers);
  small(ctx, n, R.x + 36, R.y + 4, '#ffb627', '#5a1208', 2);
  const x = R.x + 36 + blockWidth(n, 2) + 6;
  small(ctx, facts.lastSeason ? 'SCORCHERS LAST SEASON' : 'SCORCHERS SO FAR', x, R.y + 3, '#9aa1b2', '#0d0f14');
  small(ctx, ad.brand.toUpperCase(), x, R.y + 11, ad.colours[0], ad.colours[1]);
}

/** Ironvale Boots: the billboard with its bulbs, the boot, the ball flying off hot. @type {StillDraw} */
function ironvaleStill(ctx, R, ad) {
  box(ctx, '#e8641e', R.x, R.y, R.w, R.h);
  box(ctx, '#1b1d24', R.x + 2, R.y + 3, R.w - 4, R.h - 6);
  for (let x = 2; x < R.w - 2; x += 4) {
    const on = Math.floor(x / 4) % 3 === 0;
    box(ctx, on ? '#fff6c8' : '#7a3a10', R.x + x, R.y + 1, 1, 1);
    box(ctx, on ? '#7a3a10' : '#fff6c8', R.x + x + 2, R.y + R.h - 2, 1, 1);
  }
  // The boot, just after the strike, and the ball flying off, heating up.
  const bx = R.x + 12;
  box(ctx, '#4a5060', bx, R.y + 4, 4, 7); box(ctx, '#6a7080', bx, R.y + 4, 1, 7);
  box(ctx, '#5a5f6c', bx - 1, R.y + 11, 9, 4); box(ctx, '#8a909c', bx - 1, R.y + 11, 9, 1);
  for (let k = 0; k < 3; k++) box(ctx, '#e8641e', bx + 1 + k * 2, R.y + 12, 1, 1);
  box(ctx, '#c9ccd4', bx, R.y + 15, 1, 1); box(ctx, '#c9ccd4', bx + 3, R.y + 15, 1, 1); box(ctx, '#c9ccd4', bx + 6, R.y + 15, 1, 1);
  for (let k = 0; k < 9; k++) box(ctx, FIRE[Math.min(5, Math.floor(k / 1.6))], R.x + 33 - k * 2, R.y + 8 + Math.round(hash(k) * 3), 2, 1);
  box(ctx, PALETTE.heatOrange, R.x + 33, R.y + 7, 4, 4); box(ctx, PALETTE.heatWarm, R.x + 34, R.y + 8, 2, 2);
  small(ctx, ad.brand.toUpperCase(), R.x + 46, R.y + 4, ad.colours[0], ad.colours[1]);
  small(ctx, 'FORGED IN THE KETTLE.', R.x + 46, R.y + 11, '#ffb627', '#3a1a08');
}

/** Velours: the vineyard, the bottle and a glass of bubbles. @type {StillDraw} */
function veloursStill(ctx, R, ad) {
  sky(ctx, { ...R, h: 9 }, ['#e8d8f0', '#dcc8e8', '#cdb6de', '#bca4d2']);
  for (const [y0, col] of /** @type {[number, string][]} */ ([[8, '#7a8a4a'], [12, '#5f7038'], [16, '#4a5a2c']])) {
    for (let x = 0; x < R.w; x++) { const y = Math.round(R.y + y0 + 1.5 * Math.sin(x / 22 + y0)); box(ctx, col, R.x + x, y, 1, R.y + R.h - y); }
    for (let x = 2; x < R.w; x += 5) box(ctx, shade(col, 0.75), R.x + x, Math.round(R.y + y0 + 1.5 * Math.sin(x / 22 + y0)) + 2, 2, 1);
  }
  // The bottle and the glass on the right.
  const bx = R.x + R.w - 30;
  box(ctx, '#2a6a4a', bx, R.y + 5, 6, 13); box(ctx, '#2a6a4a', bx + 2, R.y + 1, 2, 4);
  box(ctx, '#f4e8d0', bx, R.y + 9, 6, 4); box(ctx, '#6b3fa0', bx, R.y + 10, 6, 1);
  box(ctx, 'rgba(255,255,255,0.35)', bx + 1, R.y + 6, 1, 10);
  const gx = R.x + R.w - 18;
  box(ctx, 'rgba(220,235,255,0.5)', gx, R.y + 7, 6, 11);
  box(ctx, 'rgba(200,230,255,0.85)', gx + 1, R.y + 10, 4, 8);
  for (const [dx, dy] of [[1, 12], [3, 15], [2, 16], [4, 11]]) box(ctx, '#ffffff', gx + dx, R.y + dy, 1, 1);
  // The name small and quiet in the sky, no plate (Task 138, Tom: the big one drew the eye).
  small(ctx, ad.brand.toUpperCase(), R.x + 6, R.y + 1, ad.colours[1], ad.colours[0]);
}

// ---------------------------------------------------------------- Ad break, batch 1 (Task 159): one from each region

/** A bottom band for the end card, the brand on it and the tagline under. @param {CanvasRenderingContext2D} ctx @param {import('./sceneArt.js').Rect} R @param {number} e @param {import('./spotKit.js').Ad} ad @param {string} band @param {string} ink */
const bottomCard = (ctx, R, e, ad, band, ink) => {
  if (e <= 0) return;
  ctx.globalAlpha = e;
  ctx.fillStyle = band;
  ctx.fillRect(R.x, R.y + R.h - 64, R.w, 64);
  brand(ctx, ad.brand.toUpperCase(), R.x + R.w / 2, R.y + R.h - 56, 3, ad.colours[0], ad.colours[1]);
  line(ctx, ad.tagline, R.x + R.w / 2, R.y + R.h - 20, 14, ink);
  ctx.globalAlpha = 1;
};

/** The red dune's skyline: the sun-side dunes, the near one rising to a crest at `lx`. @param {number} x @param {number} lx @param {number} base */
const duneY = (x, lx, base) => base - 26 * Math.exp(-(((x - lx) / 80) ** 2)) + 3 * Math.sin(x / 37);

/**
 * The Red Dune lizard, side on, facing right, its belly at (x, y), in cells of `s` px. Hot: up on its toes, lifting its
 * feet in turn off the sand, tongue flicking. Lounging: flat out, legs splayed, sunglasses on.
 * @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} s @param {string} col
 * @param {boolean} lounging @param {number} ms @param {string} [ink]  Everything in this one colour (its outline).
 */
function lizard(ctx, x, y, s, col, lounging, ms, ink) {
  if (!ink) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) lizard(ctx, x + dx * 2, y + dy * 2, s, col, lounging, ms, '#3a0a08');
  const px = (/** @type {string} */ c, /** @type {number} */ cx, /** @type {number} */ cy, w = 1, h = 1) => { ctx.fillStyle = ink ?? c; ctx.fillRect(Math.round(x + cx * s), Math.round(y + cy * s), w * s, h * s); };
  const dark = shade(col, 0.7);
  const belly = mix(col, '#f0d8a0', 0.45);
  if (lounging) {
    px(col, -17, -1, 4, 1); px(col, -13, -2, 6, 2);
    px(col, -7, -3, 14, 3); px(belly, -6, -1, 12, 1);
    px(col, 6, -4, 8, 3); px(col, 14, -3, 2, 2);
    for (let k = -5; k <= 4; k += 3) px(dark, k, -3, 1, 1);
    px(dark, -7, 0, 4, 1); px(dark, 3, 0, 4, 1);
    px('#1a1a1a', 9, -4, 5, 1); px('#1a1a1a', 10, -3, 3, 1); px('#ffffff', 10, -4, 1, 1);
    return;
  }
  const step = Math.floor(ms / 160) % 2;
  px(col, -18, -1, 3, 1); px(col, -15, -2, 4, 2); px(col, -11, -3, 4, 3);
  px(col, -7, -4, 14, 4); px(belly, -6, -1, 12, 1);
  px(col, 6, -6, 8, 4); px(col, 14, -5, 2, 3); px(belly, 7, -2, 7, 1);
  for (let k = -5; k <= 4; k += 3) px(dark, k, -4, 1, 1);
  px('#fff6c8', 11, -5, 1, 1); px('#1d2230', 12, -5, 1, 1);
  // The hot-sand dance: one pair of feet up at a time.
  px(dark, -6, step ? -1 : 0, 2, 2); px(dark, 3, step ? 0 : -1, 2, 2);
  if (Math.floor(ms / 300) % 2 === 0) px('#ff6a8a', 16, -3, 2, 1);
}

/** The Red Dune tube: white, a red cap and band, lying on its side, nozzle left; `squeeze` 0 → 1 pinches it. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} squeeze */
function sunTube(ctx, x, y, squeeze) {
  const pinch = Math.round(squeeze * 3);
  ctx.fillStyle = '#f4f2ec'; ctx.fillRect(x, y, 30, 12);
  ctx.fillStyle = '#c9c4b8'; ctx.fillRect(x, y + 10, 30, 2);
  if (pinch) { ctx.fillStyle = '#c9c4b8'; ctx.fillRect(x + 14, y, 4, pinch); ctx.fillRect(x + 14, y + 12 - pinch, 4, pinch); }
  ctx.fillStyle = '#d8402a'; ctx.fillRect(x + 8, y + 3, 14, 5);
  ctx.fillStyle = '#ffd86a'; ctx.fillRect(x + 12, y + 4, 4, 3);
  ctx.fillStyle = '#d62d2d'; ctx.fillRect(x - 6, y + 2, 6, 8);
  ctx.fillStyle = '#e8e4da'; ctx.fillRect(x + 30, y + 1, 3, 10);
}

/** A striped parasol over (cx, top): `open` 0 (furled) → 1, its pole down to `foot`. @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} top @param {number} foot @param {number} w @param {number} open */
function parasol(ctx, cx, top, foot, w, open) {
  ctx.fillStyle = '#6a4a2a';
  ctx.fillRect(Math.round(cx) - 1, top, 2, foot - top);
  const W = Math.max(3, w * (0.15 + 0.85 * open));
  const H = Math.round(18 * (0.6 + 0.4 * open));
  for (let r = 0; r <= H; r++) {
    const half = W * Math.sqrt(1 - ((H - r) / H) ** 2);
    for (let i = 0; i < 8; i++) {
      const a = Math.round(cx + (-1 + i / 4) * half);
      const b = Math.round(cx + (-1 + (i + 1) / 4) * half);
      ctx.fillStyle = i % 2 ? '#f2efe6' : '#d62d2d';
      ctx.fillRect(a, top - 4 + r, b - a, 1);
    }
  }
  // A scalloped hem.
  for (let i = 0; i < 8; i++) {
    const half = W;
    const a = Math.round(cx + (-1 + (i + 0.5) / 4) * half);
    ctx.fillStyle = i % 2 ? '#f2efe6' : '#d62d2d';
    ctx.fillRect(a - 2, top - 3 + H, 4, 2);
  }
}

/**
 * Red Dune Sun Cream (Sunreach): a lizard on a red dune, the sun pulsing hotter, slaps on a blob of cream, turns from
 * red to calm green, and lounges under a striped parasol. @type {AdDraw}
 */
function redDune(ctx, R, ms, ad) {
  const cool = ease(clamp01((ms - 3500) / 900));
  const horizon = R.y + Math.round(R.h * 0.6);
  sky(ctx, { ...R, h: R.h * 0.62 }, ['#b8361c', '#d0502a', '#e46a30', '#f08a3a', '#f8a84a', '#fcc86a'].map((c) => mix(c, '#f8c890', cool * 0.35)));
  // The sun, swelling and pulsing until the cream goes on, then calm.
  const sx = R.x + Math.round(R.w * 0.78);
  const sy = R.y + Math.round(R.h * 0.24);
  const base = R.h * 0.1 * (0.85 + 0.3 * ease(clamp01(ms / 2800)) * (1 - cool * 0.6));
  const r = base * (1 + 0.12 * Math.abs(Math.sin(ms / 170)) * (1 - cool));
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2 + ms / 3000;
    const len = r * (0.35 + 0.25 * Math.abs(Math.sin(ms / 140 + k)) * (1 - cool));
    ctx.fillStyle = rgba('#fff1a8', 0.8 - cool * 0.4);
    for (let d = 0; d < len; d += 2) ctx.fillRect(Math.round(sx + Math.cos(a) * (r + 3 + d)), Math.round(sy + Math.sin(a) * (r + 3 + d)), 2, 2);
  }
  oval(ctx, '#ffd23f', sx, sy, r, r);
  oval(ctx, '#ffe98a', sx - 2, sy - 2, r * 0.7, r * 0.7);
  oval(ctx, '#fff6c8', sx - 3, sy - 3, r * 0.35, r * 0.35);
  // The far dunes, then the near one rising to the lizard's crest.
  const lx = R.x + Math.round(R.w * 0.4);
  for (const [y0, col, amp, off] of /** @type {[number, string, number, number][]} */ ([[0.58, '#d0703e', 7, 1], [0.66, '#b85a34', 9, 3]])) {
    ctx.fillStyle = col;
    for (let x = 0; x < R.w; x++) { const y = Math.round(R.y + R.h * y0 + amp * Math.sin(x / 45 + off)); ctx.fillRect(R.x + x, y, 1, R.y + R.h - y); }
  }
  const base2 = R.y + R.h * 0.76;
  for (let x = 0; x < R.w; x++) {
    const y = Math.round(duneY(R.x + x, lx, base2));
    ctx.fillStyle = '#e88a4a'; ctx.fillRect(R.x + x, y, 1, 2);
    ctx.fillStyle = '#c0603a'; ctx.fillRect(R.x + x, y + 2, 1, R.y + R.h - y - 2);
  }
  ctx.fillStyle = '#a84a2e';
  for (let k = 0; k < 30; k++) ctx.fillRect(R.x + Math.round(hash(k) * R.w), Math.round(base2 + 8 + hash(k + 9) * (R.h * 0.2)), 3, 1);
  // Heat shimmer rising off the sand while it's hot.
  if (cool < 1) for (let k = 0; k < 10; k++) {
    const y = horizon - mod(ms / 18 + k * 13, 70);
    ctx.fillStyle = rgba('#fff1d0', 0.22 * (1 - cool));
    for (let x = 0; x < 60; x += 2) ctx.fillRect(Math.round(R.x + hash(k) * R.w + x), Math.round(y + 2 * Math.sin(x / 6 + ms / 120)), 2, 1);
  }
  const crest = Math.round(duneY(lx, lx, base2));
  // The parasol opens over the lizard (4.6–5.2 s), throwing shade.
  const open = ease(clamp01((ms - 4600) / 600));
  if (ms > 4400) {
    oval(ctx, 'rgba(60,10,10,0.3)', lx + 6, crest + 2, 52 * open, 4);
    parasol(ctx, lx - 8, crest - 80, crest + 4, 56, open);
  }
  // The lizard, red and dancing, cooling to green; lounging once the parasol is up.
  const col = mix('#e8202e', '#4cb84a', cool);
  lizard(ctx, lx - 6, crest, 4, col, ms > 5000, ms);
  // Sweat drops while it's hot.
  if (ms < 3500) for (let k = 0; k < 3; k++) {
    const age = mod(ms + k * 230, 700) / 700;
    ctx.fillStyle = '#bfe4f4';
    ctx.fillRect(Math.round(lx + 42 + (k - 1) * 6 + age * (k - 1) * 8), Math.round(crest - 30 - 8 * Math.sin(age * Math.PI) + age * 10), 2, 3);
  }
  // The tube flies in (2.2 s), squeezes (2.8 s), the blob arcs onto the lizard's back (2.9–3.3 s), the tube drops.
  if (ms > 2200) {
    const tx0 = R.x + R.w + 10;
    const tx = Math.round(tx0 + (lx + 80 - tx0) * ease(clamp01((ms - 2200) / 500)));
    const fall = ease(clamp01((ms - 3600) / 400));
    const ty = Math.round(crest - 60 + fall * 52);
    // Twice its drawn size.
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(2, 2);
    sunTube(ctx, 0, 0, clamp01((ms - 2750) / 150) * (1 - clamp01((ms - 3300) / 200)));
    ctx.restore();
    const f = clamp01((ms - 2900) / 400);
    if (f > 0 && f < 1) oval(ctx, '#ffffff', tx - 14 + (lx - tx + 14) * f, ty + 12 - Math.sin(f * Math.PI) * 30 + f * 6, 5, 4);
  }
  if (ms > 3300) {
    const splat = clamp01((ms - 3300) / 150) * (1 - cool);
    if (splat > 0) { oval(ctx, rgba('#ffffff', splat), lx, crest - 17, 9, 3); oval(ctx, rgba('#ffffff', splat), lx + 4, crest - 19, 4, 2); }
  }
  // Sparkles as it cools.
  if (ms > 3500 && ms < 4700) for (let k = 0; k < 8; k++) {
    const age = mod(ms - 3500 + k * 140, 600) / 600;
    const a = hash(k + 40) * Math.PI * 2;
    const d = 14 + age * 18;
    const x = Math.round(lx + 10 + Math.cos(a) * d * 1.6);
    const y = Math.round(crest - 10 + Math.sin(a) * d);
    ctx.fillStyle = rgba('#ffffff', 1 - age);
    ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3);
  }
  bottomCard(ctx, R, endCard(ms), ad, 'rgba(70,14,10,0.8)', '#fcd27a');
}


/** The Gullwing ferry, side on, facing right, its waterline at (x, y), in cells of `s` px. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} s */
function ferry(ctx, x, y, s) {
  const px = (/** @type {string} */ c, /** @type {number} */ cx, /** @type {number} */ cy, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x + cx * s), Math.round(y + cy * s), w * s, h * s); };
  px('#f4f7fb', -14, -3, 29, 1); px('#f4f7fb', -13, -2, 28, 1); px('#b8322a', -12, -1, 27, 1); px('#1d2230', -11, 0, 25, 1);
  px('#f4f7fb', 15, -3, 1, 1);
  px('#c9ccd4', -10, -7, 17, 1);
  px('#f4f7fb', -9, -6, 15, 3);
  for (let k = -8; k < 5; k += 2) px('#3a7bd5', k, -5, 1, 1);
  px('#f4f7fb', 2, -9, 5, 2); px('#3a7bd5', 4, -9, 2, 1);
  px('#f2c230', -6, -11, 3, 4); px('#1a1a1a', -6, -11, 3, 1);
  px('#c9ccd4', -14, -6, 1, 3); px('#b8322a', -13, -6, 2, 1);
}

/** A gull, wings up or down, its middle at (x, y). @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {boolean} up */
function gull(ctx, x, y, up) {
  ctx.fillStyle = '#f4f7fb';
  ctx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1);
  ctx.fillStyle = '#c9ccd4';
  const dy = up ? -1 : 1;
  ctx.fillRect(Math.round(x) - 4, Math.round(y) + dy, 3, 1); ctx.fillRect(Math.round(x) + 2, Math.round(y) + dy, 3, 1);
  ctx.fillRect(Math.round(x) - 6, Math.round(y) + dy * 2, 2, 1); ctx.fillRect(Math.round(x) + 5, Math.round(y) + dy * 2, 2, 1);
}

/**
 * Gullwing Ferries (the Gullcoast): a little ferry chugs across the bay on a dotted line from one harbour to another,
 * gulls trailing; behind it the tide rushes in over the flats just as it docks. @type {AdDraw}
 */
function gullwing(ctx, R, ms, ad) {
  const horizon = R.y + Math.round(R.h * 0.36);
  const flats = R.y + Math.round(R.h * 0.76);
  sky(ctx, { ...R, h: horizon - R.y }, ['#5fb4e8', '#7cc4ec', '#9ad4f0', '#bfe4f4']);
  // The far shore.
  ctx.fillStyle = '#6a8a7a';
  for (let x = 0; x < R.w; x++) { const y = Math.round(horizon - 6 - 5 * Math.sin(x / 60) - 3 * Math.sin(x / 23)); ctx.fillRect(R.x + x, y, 1, horizon - y); }
  sky(ctx, { ...R, y: horizon, h: flats - horizon }, ['#2a8ab8', '#1f7aa8', '#1a6890', '#155878']);
  for (let row = 0; row < 5; row++) {
    const y = horizon + 4 + row * Math.round((flats - horizon) / 5);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let x = mod(-ms / (40 - row * 5) + row * 17, 30); x < R.w; x += 30) ctx.fillRect(R.x + Math.round(x), y, 5 + row, 1);
  }
  // The flats at low tide, and the tide rushing in over them from the left as the ferry docks (4.7–6 s).
  sky(ctx, { ...R, y: flats, h: R.y + R.h - flats }, ['#c9b48a', '#b8a27a', '#a8926a']);
  ctx.fillStyle = '#d8c49a';
  for (let k = 0; k < 24; k++) ctx.fillRect(R.x + Math.round(hash(k + 3) * R.w), flats + 4 + Math.round(hash(k + 5) * (R.y + R.h - flats - 6)), 6 + Math.round(hash(k) * 8), 1);
  const tide = ease(clamp01((ms - 4700) / 1300));
  if (tide > 0) {
    const front = R.x - 30 + (R.w + 60) * tide;
    for (let y = flats; y < R.y + R.h; y++) {
      const edge = Math.round(front - (y - flats) * 0.4 + hash(y) * 6);
      ctx.fillStyle = mix('#1f7aa8', '#155878', (y - flats) / (R.y + R.h - flats));
      ctx.fillRect(R.x, y, Math.max(0, edge - R.x), 1);
      ctx.fillStyle = '#f4f7fb';
      ctx.fillRect(edge - 3, y, 4, 1);
    }
    for (let k = 0; k < 14; k++) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(Math.round(front - 6 + hash(k) * 10 + mod(ms / 30 + k * 5, 8)), Math.round(flats + hash(k + 2) * (R.y + R.h - flats) - mod(ms / 40 + k * 7, 10)), 1, 1);
    }
  }
  // The harbours: a quay with a lighthouse on the left, a quay with houses on the right.
  const quayTop = horizon + Math.round((flats - horizon) * 0.45);
  const lq = R.x + 58;
  const rq = R.x + R.w - 70;
  ctx.fillStyle = '#6a6f7a'; ctx.fillRect(R.x, quayTop, lq - R.x, R.y + R.h - quayTop);
  ctx.fillStyle = '#8a909c'; ctx.fillRect(R.x, quayTop, lq - R.x, 3);
  ctx.fillStyle = '#6a6f7a'; ctx.fillRect(rq, quayTop, R.x + R.w - rq, R.y + R.h - quayTop);
  ctx.fillStyle = '#8a909c'; ctx.fillRect(rq, quayTop, R.x + R.w - rq, 3);
  ctx.fillStyle = '#4a4f5c';
  for (let y = quayTop + 7; y < R.y + R.h; y += 7) { ctx.fillRect(R.x, y, lq - R.x, 1); ctx.fillRect(rq, y, R.x + R.w - rq, 1); }
  const lh = R.x + 24;
  // On its quay (Tom: it floated 4 px above it), the lamp sitting on its top band.
  for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#f4f7fb' : '#d62d2d'; ctx.fillRect(lh - 6 + Math.floor(k / 3), quayTop - 8 - k * 8, 12 - Math.floor(k / 3) * 2, 8); }
  ctx.fillStyle = '#1d2230'; ctx.fillRect(lh - 6, quayTop - 58, 10, 4);
  ctx.fillStyle = Math.floor(ms / 400) % 2 ? '#fff6c8' : '#ffd23f'; ctx.fillRect(lh - 4, quayTop - 54, 6, 4);
  ctx.fillStyle = '#1d2230'; ctx.fillRect(lh - 5, quayTop - 50, 8, 2);
  /** @type {[string, number, number][]} */
  const houses = [['#d8553a', 0, 24], ['#f2c230', 22, 30], ['#3a7bd5', 44, 22]];
  for (const [col, dx, h] of houses) {
    const hx = rq + 4 + dx;
    ctx.fillStyle = col; ctx.fillRect(hx, quayTop - h, 20, h);
    ctx.fillStyle = '#4a3a3a'; fillPoly(ctx, [[hx - 2, quayTop - h], [hx + 10, quayTop - h - 9], [hx + 22, quayTop - h]]);
    ctx.fillStyle = '#fff6c8'; ctx.fillRect(hx + 4, quayTop - h + 6, 4, 4); ctx.fillRect(hx + 12, quayTop - h + 6, 4, 4);
  }
  // The route: a dotted line from quay to quay, dim ahead of the ferry, bright behind it.
  const lane = quayTop + Math.round((flats - quayTop) * 0.5);
  const from = lq + 50;
  const to = rq - 50;
  const go = ease(clamp01((ms - 500) / 4300));
  const fx = from + (to - from) * go;
  for (let x = lq + 4; x < rq - 4; x += 8) {
    ctx.fillStyle = x < fx ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
    ctx.fillRect(x, lane + 2, 4, 1);
  }
  // Smoke puffs from the funnel, one a chug, drifting back.
  const moving = go > 0 && go < 1;
  const bob = Math.round(Math.sin(ms / 260) * (moving ? 1.5 : 0.5));
  for (let k = 0; k < 6; k++) {
    const age = mod(ms + k * 350, 2100) / 2100;
    const born = ms - age * 2100;
    const bx = from + (to - from) * ease(clamp01((born - 500) / 4300)) - 14;
    oval(ctx, `rgba(230,234,240,${(0.7 * (1 - age)).toFixed(3)})`, bx - age * 24, lane - 36 + bob - age * 22, 3 + age * 6, 3 + age * 5);
  }
  ferry(ctx, fx, lane + bob, 3);
  // The wake, only on open water (Tom: not over the quay as it sets off).
  if (moving) for (let k = 0; k < 8; k++) {
    const wx = Math.round(fx - 44 - k * 4 - hash(k + Math.floor(ms / 100)) * 3);
    if (wx < lq || wx + 2 > rq) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillRect(wx, lane + 1 + (k % 2), 2, 1);
  }
  // Gulls trailing the ferry.
  for (let k = 0; k < 3; k++) gull(ctx, fx - 52 - k * 22, lane - 46 - k * 7 + 3 * Math.sin(ms / 300 + k), Math.floor(ms / 180 + k) % 2 === 0);
  // The end card: a plate in the sky.
  const e = endCard(ms);
  if (e > 0) {
    ctx.globalAlpha = e;
    // Clear of the scorebug in Broadcast (Groundwork): 12 px lower than before.
    ctx.fillStyle = 'rgba(16,40,64,0.85)';
    ctx.fillRect(R.x + 30, R.y + 22, R.w - 60, 56);
    brand(ctx, ad.brand.toUpperCase(), R.x + R.w / 2, R.y + 29, 3, ad.colours[0], ad.colours[1]);
    line(ctx, ad.tagline, R.x + R.w / 2, R.y + 64, 14, '#bfe4f4');
    ctx.globalAlpha = 1;
  }
}

/** A croissant, its middle at (cx, cy), `k` its size: lobes along a crescent, the middle one on top. @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} k */
function croissant(ctx, cx, cy, k) {
  for (const i of [-3, 3, -2, 2, -1, 1, 0]) {
    const x = cx + i * 9 * k;
    const y = cy + i * i * 1.3 * k;
    const rx = (9.5 - Math.abs(i) * 1.8) * k;
    const ry = (8 - Math.abs(i) * 1.6) * k;
    oval(ctx, '#7a3e10', x, y, rx + 1, ry + 1);
    oval(ctx, '#c47a22', x, y, rx, ry);
    oval(ctx, '#e0a040', x, y - ry * 0.3, rx * 0.8, ry * 0.6);
    oval(ctx, '#f6cf7a', x - rx * 0.2, y - ry * 0.55, rx * 0.35, Math.max(1, ry * 0.2));
  }
}

/**
 * Maison Doré (Varenne): a croissant on a silver plate under a spotlight; a gloved hand lifts it, and it shatters into a
 * slow-motion shower of golden flakes. @type {AdDraw}
 */
function maisonDore(ctx, R, ms, ad) {
  sky(ctx, R, ['#1a0f1e', '#22142a', '#2a1834', '#22142a', '#1a0f1e']);
  const cx = R.x + R.w / 2;
  const table = R.y + Math.round(R.h * 0.74);
  // The spotlight comes up over the first second.
  const spot = ease(clamp01(ms / 1100));
  for (let y = R.y; y < table; y += 2) {
    const half = 18 + (y - R.y) * 0.45;
    ctx.fillStyle = `rgba(255,236,200,${(0.07 * spot).toFixed(3)})`;
    ctx.fillRect(Math.round(cx - half), y, Math.round(half * 2), 2);
  }
  // The table: dark velvet, a gold trim.
  ctx.fillStyle = '#3a1a30'; ctx.fillRect(R.x, table, R.w, R.y + R.h - table);
  ctx.fillStyle = '#c8a040'; ctx.fillRect(R.x, table, R.w, 2);
  ctx.fillStyle = '#2a1224'; for (let x = 0; x < R.w; x += 16) ctx.fillRect(R.x + x, table + 2, 1, R.y + R.h - table);
  oval(ctx, `rgba(255,236,200,${(0.12 * spot).toFixed(3)})`, cx, table + 6, 70, 5);
  // The plate.
  const py = table - 2;
  oval(ctx, '#6a6f7a', cx, py + 3, 86, 13);
  oval(ctx, '#c9ccd4', cx, py, 84, 13);
  oval(ctx, '#e8eaee', cx, py - 2, 62, 8);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 54, py - 9, 18, 1);
  // The croissant: lifted by the hand (2.8–3.6 s), shattering at 3.9 s.
  const SHATTER = 3900;
  const LIFT = Math.round(R.h * 0.22);
  const lift = ease(clamp01((ms - 2800) / 800)) * LIFT;
  const cy = py - 18 - lift;
  if (ms < SHATTER) croissant(ctx, cx, cy, 2);
  else if (ms < SHATTER + 160) { oval(ctx, `rgba(255,246,200,${(1 - (ms - SHATTER) / 160).toFixed(3)})`, cx, cy, 68, 28); }
  // The flakes, in slow motion: out, then drifting down to the plate and the table.
  if (ms >= SHATTER) {
    const age = (ms - SHATTER) / 1000;
    const FLAKE = ['#f6cf7a', '#e0a040', '#c47a22', '#fbe0a0'];
    for (let k = 0; k < 170; k++) {
      const x0 = cx + (hash(k) - 0.5) * 120;
      const y0 = cy + (hash(k + 1) - 0.5) * 28;
      const vx = (hash(k + 2) - 0.5) * 110;
      const vy = -(14 + hash(k + 3) * 50);
      const x = x0 + vx * age;
      let y = y0 + vy * age + 0.5 * 40 * age * age;
      const onPlate = Math.abs(x - cx) < 60;
      const floor = onPlate ? py - 6 + hash(k + 4) * 8 : table + 3 + hash(k + 5) * (R.y + R.h - table - 6);
      const landed = y >= floor;
      if (landed) y = floor;
      const flip = !landed && Math.floor(ms / 110 + k) % 2;
      ctx.fillStyle = !landed && hash(k + Math.floor(ms / 90)) > 0.93 ? '#ffffff' : FLAKE[k % 4];
      ctx.fillRect(Math.round(x), Math.round(y), flip ? 2 : 3, flip ? 3 : 2);
    }
  }
  // The gloved hand: down from above (1.4–2.5 s), grips, lifts, then lets go and rises away (5–6.2 s).
  const grip = cy + lift - 14;
  let hy;
  if (ms < 2500) hy = R.y - 70 + (grip - R.y + 70) * ease(clamp01((ms - 1400) / 1100));
  else if (ms < 5000) hy = grip - lift;
  else hy = grip - LIFT - (grip - LIFT - R.y + 90) * ease(clamp01((ms - 5000) / 1200));
  if (ms > 1400) {
    const open = ms > SHATTER ? 1 : 0;
    const y = Math.round(hy);
    ctx.fillStyle = '#1a1a24'; ctx.fillRect(cx - 13, R.y, 26, Math.max(0, y - 44 - R.y));
    ctx.fillStyle = '#2a2a36'; ctx.fillRect(cx + 7, R.y, 6, Math.max(0, y - 44 - R.y));
    ctx.fillStyle = '#f2efe6'; ctx.fillRect(cx - 15, y - 46, 30, 7);
    ctx.fillStyle = '#fafafa'; ctx.fillRect(cx - 13, y - 39, 26, 22);
    ctx.fillStyle = '#d8d8e0'; ctx.fillRect(cx + 7, y - 39, 6, 22);
    ctx.fillStyle = '#c0c0cc'; ctx.fillRect(cx - 8, y - 30, 12, 1);
    // Thumb and finger pinching (or spread once it's gone).
    for (const [dx, shadow] of /** @type {[number, boolean][]} */ ([[-13 - open * 8, false], [7 + open * 8, true]])) {
      ctx.fillStyle = '#fafafa'; ctx.fillRect(cx + dx, y - 18, 6, 16);
      ctx.fillStyle = shadow ? '#d8d8e0' : '#ececf2'; ctx.fillRect(cx + dx + 4, y - 18, 2, 16);
      ctx.fillStyle = '#c0c0cc'; ctx.fillRect(cx + dx, y - 3, 6, 1);
    }
  }
  // The end card: the name in gold at the top, a gold rule, the tagline.
  const e = endCard(ms);
  if (e > 0) {
    ctx.globalAlpha = e;
    // Clear of the scorebug in Broadcast (Groundwork): 10 px lower than before.
    brand(ctx, ad.brand.toUpperCase(), cx, R.y + 26, 4, ad.colours[0], ad.colours[1]);
    ctx.fillStyle = '#c8a040'; ctx.fillRect(Math.round(cx - 70), R.y + 56, 140, 1);
    line(ctx, ad.tagline, cx, R.y + 68, 14, '#e8d8c0');
    ctx.globalAlpha = 1;
  }
}

/** Hair, for the backs of heads. */
const HAIR = ['#2a1a10', '#5a3a1a', '#c8a040', '#1a1a1a', '#8a4a2a', '#d0d0d0'];

/**
 * Steamvale Crisps (the Kettle): a packet pops open in the stands; the CRUNCH echoes off the steaming valley walls and
 * the whole row in front turns round. @type {AdDraw}
 */
function steamvale(ctx, R, ms, ad) {
  sky(ctx, R, ['#4a4048', '#5a4a4c', '#6a524c', '#7a5a48']);
  const standTop = R.y + Math.round(R.h * 0.5);
  // The crunch (2.2 s) and its echoes shake the walls.
  const POP = 1800;
  const CRUNCH = 2200;
  const shake = ms > CRUNCH && ms < 3800 ? Math.round(Math.sin(ms / 22) * 2 * (1 - (ms - CRUNCH) / 1600)) : 0;
  // The valley walls: iron-dark cliffs either side, glowing seams, steam from vents.
  for (const side of [-1, 1]) {
    const edge = (/** @type {number} */ y) => R.w * (0.26 - 0.1 * ((y - R.y) / (standTop - R.y))) + 6 * Math.sin(y / 9 + side);
    for (let y = R.y; y < standTop + 10; y++) {
      const w = Math.round(edge(y));
      ctx.fillStyle = (y - R.y) % 14 < 2 ? '#3a404c' : '#2b2f3a';
      ctx.fillRect(side < 0 ? R.x + shake : R.x + R.w - w + shake, y, w, 1);
    }
    for (let k = 0; k < 3; k++) {
      const vy = R.y + 24 + k * 30;
      const vx = side < 0 ? R.x + edge(vy) - 4 : R.x + R.w - edge(vy) + 4;
      ctx.fillStyle = '#ff8a1f'; ctx.fillRect(Math.round(vx) - 1 + shake, vy, 3, 1);
      for (let j = 0; j < 5; j++) {
        const age = mod(ms + j * 480 + k * 230 + (side > 0 ? 170 : 0), 2400) / 2400;
        const puff = shake ? 1.4 : 1;
        oval(ctx, `rgba(220,222,230,${(0.32 * (1 - age)).toFixed(3)})`, vx - side * age * 26 + Math.sin(age * 4 + k) * 4, vy - age * 50, (3 + age * 9) * puff, (2 + age * 7) * puff);
      }
    }
  }
  // The stand: rows of fans, facing us.
  const ROW = 36;
  const COL = 26;
  const F = 2;
  /** A rect in fan units (F px). @param {string} c @param {number} x @param {number} y @param {number} w @param {number} h */
  const fr = (c, x, y, w, h) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w * F), Math.round(h * F)); };
  ctx.fillStyle = '#1d2230';
  ctx.fillRect(R.x, standTop, R.w, R.y + R.h - standTop);
  const rows = Math.ceil((R.y + R.h - standTop) / ROW);
  const cols = Math.ceil(R.w / COL) + 1;
  const cc = Math.floor(cols / 2);
  for (let row = 0; row < rows; row++) {
    const y = standTop + 4 + row * ROW;
    ctx.fillStyle = '#2b2f3a';
    ctx.fillRect(R.x, y + 32, R.w, 4);
    for (let c = 0; c < cols; c++) {
      const x = R.x - 8 + c * COL + (row % 2) * 13;
      const k = hash(row * 97 + c * 13 + 5);
      const cruncher = row === 1 && c === cc;
      // The row in front of the cruncher turns round to look, rippling out from them.
      const turned = row === 2 && ms > 2600 + Math.abs(c - cc) * 45;
      const bounce = !turned && !cruncher ? Math.round(Math.sin(ms / 400 + k * 9) * 0.6) : 0;
      const hair = HAIR[Math.floor(hash(k * 7) * HAIR.length)];
      fr(FANS[Math.floor(k * FANS.length)], x, y + 7 * F - bounce, 10, 9);
      fr(turned ? hair : SKINS[Math.floor(hash(k * 31) * SKINS.length)], x + 2 * F, y - bounce, 6, 7);
      if (!turned) {
        fr(hair, x + 2 * F, y - F - bounce, 6, 2);
        fr('#1d2230', x + 3 * F, y + 3 * F - bounce, 1, 1); fr('#1d2230', x + 6 * F, y + 3 * F - bounce, 1, 1);
      }
      if (cruncher) {
        // The packet: up to the face (1 s), puffing out and popping (1.8 s), then a hand to the mouth.
        const up = ease(clamp01((ms - 900) / 400));
        const puff = ms > 1400 && ms < POP ? Math.round(((ms - 1400) / 400) * 3) : 0;
        const bx = x + F - puff * F;
        const by = y + 14 * F - up * 6 * F;
        fr('#f2c230', bx, by, 9 + puff * 2, 11);
        fr('#d62d2d', bx, by + 3 * F, 9 + puff * 2, 3);
        fr('#f2efe6', bx + (3 + puff) * F, by + 4 * F, 3, 1);
        if (ms > POP) fr('#c89a20', bx + F, by, 7, 1);
        if (ms > 2000 && ms < 2600) fr(SKINS[0], x + 8 * F, y + 4 * F, 3, 3);
      }
    }
  }
  // The stand dim but for a light on the cruncher and the row in front (a pool of light, row by row).
  const crX = R.x - 8 + cc * COL + 13 + 10;
  const crY = standTop + 4 + ROW + 12;
  for (let y = standTop; y < R.y + R.h; y++) {
    const dy = (y - (crY + 10)) / 62;
    const half = Math.abs(dy) < 1 ? 96 * Math.sqrt(1 - dy * dy) : 0;
    ctx.fillStyle = 'rgba(8,8,14,0.55)';
    ctx.fillRect(R.x, y, Math.max(0, Math.round(crX - half - R.x)), 1);
    ctx.fillRect(Math.round(crX + half), y, Math.max(0, Math.round(R.x + R.w - crX - half)), 1);
  }
  // The pop: crisps flying out of the packet.
  if (ms > POP && ms < POP + 900) {
    const age = (ms - POP) / 1000;
    for (let k = 0; k < 14; k++) {
      ctx.fillStyle = k % 3 ? '#f2c230' : '#e8a845';
      ctx.fillRect(Math.round(crX + (hash(k) - 0.5) * 90 * age), Math.round(crY - (30 + hash(k + 1) * 40) * age + 90 * age * age), 2, 2);
    }
  }
  // CRUNCH!: a punch, shaking, then its echoes off the left and right walls, fainter each time.
  if (ms > CRUNCH && ms < 3500) {
    const s = ms < CRUNCH + 140 ? 5 : 4;
    const jx = Math.round(Math.sin(ms / 30) * 1.5);
    ctx.globalAlpha = clamp01((3500 - ms) / 400);
    brand(ctx, 'CRUNCH!', crX + jx, crY - 64, s, '#ffd23f', '#7a1a08');
    ctx.globalAlpha = 1;
    // Impact lines round the cruncher.
    if (ms < CRUNCH + 400) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ctx.fillStyle = '#fff6c8';
      for (let d = 12; d < 20; d += 2) ctx.fillRect(Math.round(crX + Math.cos(a) * d), Math.round(crY - 14 + Math.sin(a) * d * 0.7), 1, 1);
    }
  }
  /** @type {[number, number, number, number][]} when, side, scale, alpha */
  const echoes = [[2600, -1, 2, 0.75], [2950, 1, 2, 0.55], [3300, -1, 1, 0.4], [3650, 1, 1, 0.3]];
  for (const [at, side, s, a] of echoes) {
    const f = (ms - at) / 700;
    if (f < 0 || f > 1) continue;
    ctx.globalAlpha = a * (1 - f);
    const ex = side < 0 ? R.x + R.w * 0.2 + 10 * f : R.x + R.w * 0.8 - 10 * f;
    brand(ctx, 'CRUNCH!', ex, R.y + 30 + (at - 2600) / 30, s, '#ffb627', '#3a1a08');
    ctx.globalAlpha = 1;
  }
  bottomCard(ctx, R, endCard(ms), ad, 'rgba(26,18,16,0.88)', '#f2efe6');
}

// ---- their stills

/** Red Dune Sun Cream: the hot sky, the sun, the lizard lounging green under its parasol. @type {StillDraw} */
function redDuneStill(ctx, R, ad) {
  sky(ctx, R, ['#d0502a', '#e46a30', '#f08a3a', '#f8a84a', '#f8a84a']);
  const sx = R.x + R.w - 52;
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; box(ctx, '#fff1a8', Math.round(sx + Math.cos(a) * 7), Math.round(R.y + 7 + Math.sin(a) * 6), 1, 1); }
  oval(ctx, '#ffd23f', sx, R.y + 7, 4, 4);
  oval(ctx, '#fff6c8', sx - 1, R.y + 6, 2, 2);
  for (let x = 0; x < R.w; x++) { const y = Math.round(R.y + 15 + 1.5 * Math.sin(x / 12)); box(ctx, '#e88a4a', R.x + x, y, 1, 1); box(ctx, '#c0603a', R.x + x, y + 1, 1, R.y + R.h - y - 1); }
  // The parasol and the lizard under it.
  const px = R.x + R.w - 22;
  box(ctx, '#6a4a2a', px, R.y + 4, 1, 12);
  for (let r = 0; r < 4; r++) {
    const half = Math.round(9 * Math.sqrt(1 - ((3 - r) / 4) ** 2));
    for (let i = -half; i < half; i += 3) box(ctx, Math.floor((i + 30) / 3) % 2 ? '#f2efe6' : '#d62d2d', px + i, R.y + 1 + r, Math.min(3, half - i), 1);
  }
  box(ctx, 'rgba(60,10,10,0.3)', px - 8, R.y + 15, 18, 1);
  box(ctx, '#3a0a08', px - 11, R.y + 11, 19, 5);
  box(ctx, '#4cb84a', px - 6, R.y + 13, 9, 2); box(ctx, '#4cb84a', px + 3, R.y + 12, 4, 2); box(ctx, '#4cb84a', px - 10, R.y + 14, 4, 1);
  box(ctx, '#1a1a1a', px + 4, R.y + 12, 2, 1);
  // The tube on the sand.
  box(ctx, '#f4f2ec', px + 12, R.y + 13, 8, 3); box(ctx, '#d62d2d', px + 10, R.y + 13, 2, 3); box(ctx, '#d8402a', px + 14, R.y + 14, 4, 1);
  small(ctx, ad.brand.toUpperCase(), R.x + 5, R.y + 3, ad.colours[0], ad.colours[1]);
}

/** Gullwing Ferries: the bay, the dotted route, the ferry nearly home, gulls. @type {StillDraw} */
function gullwingStill(ctx, R, ad) {
  sky(ctx, { ...R, h: 9 }, ['#7cc4ec', '#9ad4f0', '#bfe4f4']);
  sky(ctx, { ...R, y: R.y + 9, h: R.h - 9 }, ['#2a8ab8', '#1f7aa8', '#1a6890', '#155878']);
  for (let x = 4; x < R.w; x += 6) box(ctx, 'rgba(255,255,255,0.75)', R.x + x, R.y + 16, 3, 1);
  // The quay and a house on the right.
  box(ctx, '#6a6f7a', R.x + R.w - 8, R.y + 10, 8, 10); box(ctx, '#f2c230', R.x + R.w - 7, R.y + 4, 6, 6); box(ctx, '#4a3a3a', R.x + R.w - 8, R.y + 3, 8, 1);
  // The ferry.
  const fx = R.x + R.w - 34;
  box(ctx, '#f4f7fb', fx - 9, R.y + 12, 19, 2); box(ctx, '#b8322a', fx - 8, R.y + 14, 17, 1); box(ctx, '#1d2230', fx - 7, R.y + 15, 15, 1);
  box(ctx, '#f4f7fb', fx - 6, R.y + 9, 10, 3); for (let k = 0; k < 4; k++) box(ctx, '#3a7bd5', fx - 5 + k * 2, R.y + 10, 1, 1);
  box(ctx, '#f2c230', fx - 4, R.y + 6, 2, 3); box(ctx, '#1a1a1a', fx - 4, R.y + 6, 2, 1);
  box(ctx, 'rgba(230,234,240,0.7)', fx - 8, R.y + 4, 2, 2); box(ctx, 'rgba(230,234,240,0.5)', fx - 12, R.y + 2, 3, 2);
  for (const [gx, gy] of [[fx - 22, R.y + 5], [fx - 32, R.y + 3]]) { box(ctx, '#f4f7fb', gx - 1, gy, 3, 1); box(ctx, '#c9ccd4', gx - 3, gy - 1, 2, 1); box(ctx, '#c9ccd4', gx + 2, gy - 1, 2, 1); }
  box(ctx, 'rgba(16,40,64,0.85)', R.x + 3, R.y + 1, blockWidth(ad.brand.toUpperCase(), 1) + 7, 10);
  small(ctx, ad.brand.toUpperCase(), R.x + 6, R.y + 3, ad.colours[0], ad.colours[1]);
}

/** Maison Doré: the croissant on its silver plate, a few golden flakes, the name in gold. @type {StillDraw} */
function maisonDoreStill(ctx, R, ad) {
  sky(ctx, R, ['#1a0f1e', '#22142a', '#2a1834']);
  box(ctx, '#3a1a30', R.x, R.y + 17, R.w, 3);
  box(ctx, '#c8a040', R.x, R.y + 17, R.w, 1);
  const cx = R.x + R.w - 22;
  oval(ctx, '#c9ccd4', cx, R.y + 16, 14, 2);
  oval(ctx, '#e8eaee', cx, R.y + 15, 10, 1);
  for (const i of [-2, 2, -1, 1, 0]) {
    const x = cx + i * 4;
    const y = R.y + 11 + i * i * 0.5;
    const rx = 4.5 - Math.abs(i);
    const ry = 3.5 - Math.abs(i) * 0.6;
    oval(ctx, '#7a3e10', x, y, rx + 1, ry + 1);
    oval(ctx, '#c47a22', x, y, rx, ry);
    oval(ctx, '#e0a040', x, y - 1, rx * 0.7, Math.max(1, ry * 0.5));
  }
  for (let k = 0; k < 7; k++) box(ctx, ['#f6cf7a', '#e0a040', '#fbe0a0'][k % 3], cx - 20 + Math.round(hash(k + 11) * 34), R.y + 2 + Math.round(hash(k + 3) * 8), 1, 1);
  small(ctx, ad.brand.toUpperCase(), R.x + 6, R.y + 4, ad.colours[0], ad.colours[1]);
}

/** Steamvale Crisps: steam over the stand, the packet popped, CRUNCH! @type {StillDraw} */
function steamvaleStill(ctx, R, ad) {
  sky(ctx, R, ['#2a1c1c', '#3a2620', '#1d2230']);
  for (let k = 0; k < 6; k++) oval(ctx, 'rgba(220,222,230,0.25)', R.x + R.w - 70 + k * 10, R.y + 3 + (k % 2), 3, 2);
  // A row of heads along the bottom.
  for (let x = 2; x < R.w; x += 5) { const k = hash(x * 3); box(ctx, FANS[Math.floor(k * FANS.length)], R.x + x, R.y + 17, 4, 3); box(ctx, SKINS[Math.floor(hash(k * 31) * SKINS.length)], R.x + x + 1, R.y + 15, 2, 2); }
  // The packet, burst open, crisps flying.
  const bx = R.x + R.w - 16;
  box(ctx, '#f2c230', bx, R.y + 4, 9, 11); box(ctx, '#d62d2d', bx, R.y + 7, 9, 3); box(ctx, '#f2efe6', bx + 3, R.y + 8, 3, 1);
  for (const [dx, dy] of [[-3, 2], [2, 0], [8, 1], [11, 3], [-1, -0]]) box(ctx, '#e8a845', bx + dx, R.y + dy + 1, 2, 1);
  small(ctx, 'CRUNCH!', bx - blockWidth('CRUNCH!', 1) - 6, R.y + 6, '#ffd23f', '#7a1a08');
  small(ctx, ad.brand.toUpperCase(), R.x + 5, R.y + 4, ad.colours[0], ad.colours[1]);
}

// ---------------------------------------------------------------- Ad break, batch 2 (Task 160)


/** Market awnings along the top, their scalloped hems fluttering. @param {CanvasRenderingContext2D} ctx @param {import('./sceneArt.js').Rect} R @param {number} ms @param {number} y @param {number} h */
function awnings(ctx, R, ms, y, h) {
  const PAIRS = [['#c8402a', '#f4e8d0'], ['#1fa3a3', '#f4e8d0'], ['#d8a030', '#f4e8d0'], ['#7a3a6a', '#f4e8d0']];
  const n = 4;
  const w = Math.ceil(R.w / n);
  for (let i = 0; i < n; i++) {
    const x0 = R.x + i * w;
    const [a, b] = PAIRS[i % PAIRS.length];
    // The stall's shade under it, and a few pots on a shelf.
    ctx.fillStyle = '#5a3420'; ctx.fillRect(x0 + 4, y + h, w - 8, Math.round(h * 1.2));
    for (let k = 0; k < 4; k++) oval(ctx, ['#c8603a', '#e8c070', '#4a8a8a', '#a84a2e'][(k + i) % 4], x0 + 12 + k * ((w - 24) / 3), y + h + h * 0.9, 4, 3);
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(x0 + 3, y, 2, Math.round(h * 2.3)); ctx.fillRect(x0 + w - 5, y, 2, Math.round(h * 2.3));
    for (let x = 0; x < w; x++) {
      const scallop = 3 + 2 * Math.sin((x / 8) * Math.PI) ** 2 + 1.5 * Math.sin(ms / 140 + i * 1.7 + x / 9);
      ctx.fillStyle = Math.floor(x / 7) % 2 ? b : a;
      ctx.fillRect(x0 + x, y, 1, Math.round(h + scallop));
    }
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.fillRect(x0, y, w, 2);
  }
}

/**
 * Sandglass Watches (Sunreach): desert sand pours through an hourglass in a market, then the hourglass turns into a
 * watch face, its second hand ticking; the awnings flutter behind. @type {AdDraw}
 */
function sandglass(ctx, R, ms, ad) {
  // Bright sky above, the stalls' shaded interiors behind the hourglass so the glass and the sand stand out.
  sky(ctx, R, ['#f0b860', '#5a3220', '#64382a', '#6e402c', '#784830']);
  awnings(ctx, R, ms, R.y + Math.round(R.h * 0.08), Math.round(R.h * 0.1));
  const table = R.y + Math.round(R.h * 0.8);
  // A rug-covered table.
  ctx.fillStyle = '#8a2a1c'; ctx.fillRect(R.x, table, R.w, R.y + R.h - table);
  ctx.fillStyle = '#d8a030'; ctx.fillRect(R.x, table, R.w, 2); ctx.fillRect(R.x, table + 8, R.w, 1);
  for (let x = 0; x < R.w; x += 12) { ctx.fillStyle = '#1fa3a3'; ctx.fillRect(R.x + x + 4, table + 4, 4, 2); }
  const cx = R.x + Math.round(R.w / 2);
  const H = Math.round(R.h * 0.5);
  const W = Math.round(H * 0.3);
  const cy = table - Math.round(H / 2) - 6;
  const morph = ease(clamp01((ms - 3600) / 800));
  // The hourglass, fading out as it becomes the watch.
  if (morph < 1) {
    ctx.globalAlpha = 1 - morph;
    const fall = clamp01((ms - 300) / 3300);
    const half = H / 2;
    const neck = 2;
    const width = (/** @type {number} */ y) => neck + (W - neck) * Math.min(1, (Math.abs(y) / half) ** 0.7) * (Math.abs(y) > half - 4 ? 0.85 : 1);
    for (let y = -half + 2; y < half - 2; y++) {
      const w = Math.round(width(y));
      ctx.fillStyle = 'rgba(210,235,255,0.28)';
      ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(cx - w, cy + y, 1, 1); ctx.fillRect(cx + w, cy + y, 1, 1);
    }
    // The sand: the top bulb draining from its surface down, a stream, the bottom pile growing.
    const topLevel = -2 - (half - 8) * (1 - fall);
    for (let y = Math.round(topLevel); y < -1; y++) { const w = Math.round(width(y)) - 1; ctx.fillStyle = '#e8c070'; ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1); }
    const pile = (half - 8) * fall;
    for (let y = 0; y < pile; y++) {
      const yy = half - 3 - y;
      const w = Math.min(Math.round(width(yy)) - 1, Math.round((pile - y) * 1.6));
      ctx.fillStyle = y === Math.floor(pile) - 1 ? '#f4d890' : '#e0b460';
      ctx.fillRect(cx - w, cy + yy, w * 2 + 1, 1);
    }
    if (fall > 0 && fall < 1) { ctx.fillStyle = '#e8c070'; ctx.fillRect(cx, cy - 1, 1, Math.round(half - 3 - pile)); }
    // The frame: wooden plates with brass trim, three posts a side.
    for (const py of [cy - half - 4, cy + half - 2]) {
      ctx.fillStyle = '#6a3a1a'; ctx.fillRect(cx - W - 8, py, W * 2 + 17, 6);
      ctx.fillStyle = '#c8a040'; ctx.fillRect(cx - W - 8, py + (py < cy ? 5 : 0), W * 2 + 17, 1);
    }
    ctx.fillStyle = '#7a4a24';
    for (const dx of [-W - 6, W + 4]) ctx.fillRect(cx + dx, cy - half + 2, 3, H - 4);
    ctx.globalAlpha = 1;
  }
  // The watch, growing out of it: leather strap, gold case, a white face with ticks, hands, a ticking second hand.
  if (morph > 0) {
    const r = Math.round(H * 0.34 * (0.6 + 0.4 * morph));
    ctx.globalAlpha = morph;
    ctx.fillStyle = '#8a5a2a'; ctx.fillRect(cx - Math.round(r * 0.55), cy - H / 2 - 6, Math.round(r * 1.1), H + 6);
    ctx.fillStyle = '#6a4220';
    for (let y = cy - H / 2 - 4; y < cy + H / 2; y += 4) { ctx.fillRect(cx - Math.round(r * 0.55) + 2, y, 1, 2); ctx.fillRect(cx + Math.round(r * 0.55) - 3, y, 1, 2); }
    oval(ctx, '#8a6a20', cx + 1, cy + 2, r + 5, r + 5);
    oval(ctx, '#d8a840', cx, cy, r + 5, r + 5);
    oval(ctx, '#f0d080', cx - 1, cy - 1, r + 2, r + 2);
    oval(ctx, '#f6f0e0', cx, cy, r, r);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const len = k % 3 === 0 ? 5 : 2;
      pixelLine(ctx, '#3a2a1a', cx + Math.sin(a) * (r - 2), cy - Math.cos(a) * (r - 2), cx + Math.sin(a) * (r - 2 - len), cy - Math.cos(a) * (r - 2 - len), k % 3 === 0 ? 2 : 1);
    }
    // A little sun on the face, Sunreach's.
    oval(ctx, '#f0b040', cx, cy + Math.round(r * 0.45), 3, 3);
    const tick = Math.floor(Math.max(0, ms - 4400) / 1000);
    const sec = ((tick + 1) / 60) * Math.PI * 2;
    pixelLine(ctx, '#2a1a10', cx, cy, cx + Math.sin(-0.9) * r * 0.5, cy - Math.cos(-0.9) * r * 0.5, 2);
    pixelLine(ctx, '#2a1a10', cx, cy, cx + Math.sin(1.2) * r * 0.75, cy - Math.cos(1.2) * r * 0.75, 2);
    pixelLine(ctx, '#c8402a', cx, cy, cx + Math.sin(sec) * r * 0.85, cy - Math.cos(sec) * r * 0.85, 1);
    oval(ctx, '#c8a040', cx, cy, 2, 2);
    ctx.globalAlpha = 1;
  }
  // A swirl of sand as it changes.
  if (ms > 3500 && ms < 5000) for (let k = 0; k < 30; k++) {
    const age = (ms - 3500) / 1500;
    const a = hash(k) * Math.PI * 2 + age * 3;
    const d = 10 + age * (30 + hash(k + 1) * 40);
    ctx.fillStyle = rgba('#f4d890', 1 - age);
    ctx.fillRect(Math.round(cx + Math.cos(a) * d * 1.3), Math.round(cy + Math.sin(a) * d), 2, 1);
  }
  bottomCard(ctx, R, endCard(ms), ad, 'rgba(70,40,14,0.85)', '#fbe0a0');
}

/**
 * The Brinestone fisher in yellow oilskins, standing at (0, 0) (their boots) in the current transform.
 * @param {CanvasRenderingContext2D} ctx @param {boolean} grin  Bone dry and grinning, a thumb up.
 */
function fisher(ctx, grin) {
  const px = (/** @type {string} */ c, /** @type {number} */ x, /** @type {number} */ y, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  px('#2a2a30', -5, -6, 4, 6); px('#2a2a30', 1, -6, 4, 6);
  px('#f2c230', -7, -27, 14, 21); px('#c89a20', 3, -27, 4, 21);
  px('#c89a20', -7, -17, 14, 1);
  for (const y of [-24, -20, -14]) px('#8a6a10', -1, y, 2, 2);
  // Arms: down at the sides in the storm; one up, thumb up, once it clears.
  px('#f2c230', -10, -26, 3, 14); px('#e8d0b0', -10, -12, 3, 3);
  if (grin) { px('#f2c230', 7, -38, 3, 13); px('#c89a20', 9, -38, 1, 13); px('#e8d0b0', 7, -42, 3, 4); px('#e8d0b0', 8, -45, 2, 3); }
  else { px('#c89a20', 7, -26, 3, 14); px('#e8d0b0', 7, -12, 3, 3); }
  px('#e8c0a0', -4, -35, 8, 8);
  if (grin) { px('#1d2230', -3, -33, 2, 1); px('#1d2230', 1, -33, 2, 1); px('#5a1a10', -3, -30, 6, 2); px('#ffffff', -2, -30, 4, 1); }
  else { px('#1d2230', -3, -32, 2, 1); px('#1d2230', 1, -32, 2, 1); px('#5a1a10', -2, -29, 4, 1); }
  // The sou'wester: brim, crown, the flap down the back.
  px('#f2c230', -8, -37, 16, 2); px('#f2c230', -5, -41, 10, 4); px('#c89a20', -8, -35, 3, 6); px('#c89a20', 3, -41, 2, 4);
}

/**
 * Brinestone Oilskins (the Gullcoast): a fisher stands on a pitching boat in a storm; waves crash over them; when the
 * spray clears they're bone dry and grinning. @type {AdDraw}
 */
function brinestone(ctx, R, ms, ad) {
  const t = ms / 1000;
  const calm = ease(clamp01((ms - 4800) / 1200));
  sky(ctx, R, ['#141a24', '#1a2230', '#202a3a', '#28324a', '#303c54'].map((c) => mix(c, '#7a8aa0', calm * 0.5)));
  // Lightning at 1.1 s, a fork and a white flash.
  const flash = ms > 1100 && ms < 1300 ? 1 - (ms - 1100) / 200 : 0;
  if (flash > 0) {
    let x = R.x + R.w * 0.72;
    let y = R.y;
    ctx.fillStyle = '#fff6c8';
    for (let k = 0; k < 9; k++) { const nx = x + (hash(k + 50) - 0.5) * 18; const ny = y + R.h * 0.05; pixelLine(ctx, '#fff6c8', x, y, nx, ny, 2); x = nx; y = ny; }
  }
  // A break in the cloud once it clears, light falling on the boat.
  if (calm > 0) for (let k = 0; k < 4; k++) {
    ctx.fillStyle = `rgba(255,240,200,${(0.08 * calm).toFixed(3)})`;
    fillPoly(ctx, [[R.x + R.w * (0.55 + k * 0.06), R.y], [R.x + R.w * (0.6 + k * 0.06), R.y], [R.x + R.w * (0.45 + k * 0.03), R.y + R.h * 0.6], [R.x + R.w * (0.38 + k * 0.03), R.y + R.h * 0.6]]);
  }
  const base = R.y + R.h * 0.62;
  const amp = 9 * (1 - 0.65 * calm);
  const sea = (/** @type {number} */ x) => base + amp * Math.sin((x - R.x) / 40 + t * 1.6) + amp * 0.5 * Math.sin((x - R.x) / 17 - t * 2.4);
  // The far swell, darker.
  ctx.fillStyle = mix('#1a3040', '#2a5068', calm);
  for (let x = 0; x < R.w; x++) { const y = Math.round(sea(R.x + x + 60) - 14); ctx.fillRect(R.x + x, y, 1, R.y + R.h - y); }
  // The boat, riding the swell, and the fisher on it.
  const bx = R.x + Math.round(R.w * 0.45);
  const tilt = Math.atan2(sea(bx + 20) - sea(bx - 20), 40);
  const grin = ms > 4800;
  ctx.save();
  ctx.translate(bx, Math.round(sea(bx)) - 6);
  ctx.rotate(tilt);
  // Twice its drawn size, so the story reads.
  ctx.scale(2, 2);
  ctx.fillStyle = '#7a2a1c';
  fillPoly(ctx, [[-44, -6], [46, -10], [36, 12], [-34, 12]]);
  ctx.fillStyle = '#f4f7fb'; ctx.fillRect(-42, -7, 86, 2);
  ctx.fillStyle = '#2a4a3a'; ctx.fillRect(-34, 6, 70, 3);
  ctx.fillStyle = '#e8e4da'; ctx.fillRect(-36, -28, 20, 22);
  ctx.fillStyle = '#3a7bd5'; ctx.fillRect(-32, -24, 5, 5); ctx.fillRect(-25, -24, 5, 5);
  ctx.fillStyle = '#4a4f5c'; ctx.fillRect(-38, -30, 24, 3);
  ctx.translate(10, -7);
  fisher(ctx, grin);
  // A dry glint on the coat once it clears.
  if (grin && Math.floor(ms / 250) % 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(-5, -24, 1, 3); ctx.fillRect(-6, -23, 3, 1); }
  ctx.restore();
  // The near sea, over the hull's bottom.
  for (let x = 0; x < R.w; x++) {
    const y = Math.round(sea(R.x + x));
    ctx.fillStyle = mix('#1f4a60', '#2a6a88', calm); ctx.fillRect(R.x + x, y, 1, R.y + R.h - y);
    ctx.fillStyle = 'rgba(255,255,255,0.5)'; if ((x + Math.floor(t * 30)) % 23 < 4) ctx.fillRect(R.x + x, y, 1, 1);
  }
  // Two waves crash over the boat (2.2 s and 3.4 s): a wall of spray that breaks over the fisher and falls away.
  for (const [at, side] of /** @type {[number, number][]} */ ([[2200, -1], [3400, 1]])) {
    const age = (ms - at) / 1400;
    if (age < 0 || age > 1) continue;
    for (let k = 0; k < 90; k++) {
      const h0 = hash(k + at);
      const sx = bx + side * (60 + h0 * 50);
      const vx = -side * (70 + hash(k + 1) * 110);
      const vy = -(110 + hash(k + 2) * 130);
      const x = sx + vx * age;
      const y = sea(sx) + vy * age + 240 * age * age;
      ctx.fillStyle = k % 3 ? `rgba(240,248,255,${(1 - age * 0.8).toFixed(3)})` : `rgba(160,200,220,${(1 - age).toFixed(3)})`;
      const s = 2 + Math.round(hash(k + 3) * 3);
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    }
    // At its height the spray hides the fisher.
    const cover = Math.sin(clamp01(age / 0.6) * Math.PI);
    // A cloud of foam, lumpy, over the fisher.
    if (cover > 0) for (let k = 0; k < 9; k++) {
      const a = hash(k + at / 7) * Math.PI * 2;
      const d = 10 + hash(k + 3) * 22;
      oval(ctx, `rgba(${k % 3 ? '240,248,255' : '200,226,240'},${(0.8 * cover).toFixed(3)})`, bx + 20 + Math.cos(a) * d * 1.3, sea(bx) - 62 + Math.sin(a) * d - cover * 6, 14 + hash(k + 5) * 12, 12 + hash(k + 6) * 10);
    }
  }
  // Rain, slanting, until it clears.
  if (calm < 1) {
    ctx.fillStyle = `rgba(180,200,220,${(0.5 * (1 - calm)).toFixed(3)})`;
    for (let k = 0; k < 70; k++) {
      const x = R.x + mod(hash(k) * R.w + ms * 0.25, R.w + 40) - 20;
      const y = R.y + mod(hash(k + 9) * R.h + ms * 0.6, R.h);
      for (let j = 0; j < 6; j++) ctx.fillRect(Math.round(x - j * 0.4), Math.round(y + j), 1, 1);
    }
  }
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${(0.5 * flash).toFixed(3)})`; ctx.fillRect(R.x, R.y, R.w, R.h); }
  // The end card over the sea, clear of the fisher (a plate in the sky hid their head in Full).
  bottomCard(ctx, R, endCard(ms), ad, 'rgba(16,26,36,0.85)', '#e8eef4');
}

/** A fluted marble column from y0 to y1, `w` wide. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y0 @param {number} y1 @param {number} w */
function column(ctx, x, y0, y1, w) {
  ctx.fillStyle = '#c8c0b4'; ctx.fillRect(x - 3, y0, w + 6, 6); ctx.fillRect(x - 3, y1 - 6, w + 6, 6);
  ctx.fillStyle = '#e8e2d8'; ctx.fillRect(x - 3, y0, w + 6, 2);
  for (let k = 0; k < w; k++) {
    const flute = k % 5;
    ctx.fillStyle = flute === 0 ? '#bcb4a8' : flute < 3 ? '#f2ede4' : '#ded6ca';
    ctx.fillRect(x + k, y0 + 6, 1, y1 - y0 - 12);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x + w - 4, y0 + 6, 4, y1 - y0 - 12);
}

/** The orrery on the vault door: gold rings round a hub, planets going round. @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} cy @param {number} r @param {number} ms @param {number} squash */
function orrery(ctx, cx, cy, r, ms, squash) {
  for (const [k, rr] of [[0, r * 0.45], [1, r * 0.7], [2, r * 0.95]]) {
    for (let a = 0; a < Math.PI * 2; a += 0.12) { ctx.fillStyle = '#b8902a'; ctx.fillRect(Math.round(cx + Math.cos(a) * rr * squash), Math.round(cy + Math.sin(a) * rr * 0.5), 1, 1); }
    const p = ms / (900 + k * 700) + k * 2;
    oval(ctx, ['#e8eaee', '#d8553a', '#3a7bd5'][k], cx + Math.cos(p) * rr * squash, cy + Math.sin(p) * rr * 0.5, 2 * squash, 2);
  }
  oval(ctx, '#ffd23f', cx, cy, 4 * squash, 4);
}

/**
 * Orrery Bank (Varenne): marble columns; a gold coin rolls along a ledge and drops into an open vault, whose door
 * swings shut with a deep clunk; the name is cut into the frieze above. @type {AdDraw}
 */
function orreryBank(ctx, R, ms, ad) {
  const SHUT = 4400;
  const quake = ms > SHUT && ms < SHUT + 350 ? Math.round(Math.sin(ms / 18) * 2 * (1 - (ms - SHUT) / 350)) : 0;
  ctx.save();
  ctx.translate(0, quake);
  // The wall and the frieze.
  sky(ctx, { ...R, y: R.y - 4, h: R.h + 8 }, ['#d8d0c4', '#d0c8bc', '#c8c0b4']);
  ctx.fillStyle = 'rgba(150,140,130,0.35)';
  for (let k = 0; k < 8; k++) pixelLine(ctx, 'rgba(150,140,130,0.2)', R.x + hash(k) * R.w, R.y + 70 + hash(k + 3) * (R.h - 90), R.x + hash(k) * R.w + 30, R.y + 80 + hash(k + 5) * (R.h - 90));
  const frieze = R.y + 62;
  ctx.fillStyle = '#e8e2d8'; ctx.fillRect(R.x, R.y - 4, R.w, frieze - R.y + 4);
  ctx.fillStyle = '#b8b0a4'; ctx.fillRect(R.x, frieze - 4, R.w, 4); ctx.fillRect(R.x, R.y + 4, R.w, 2);
  for (let x = 6; x < R.w; x += 14) { ctx.fillStyle = '#c8c0b4'; ctx.fillRect(R.x + x, frieze - 10, 6, 5); }
  const floor = R.y + R.h - 14;
  ctx.fillStyle = '#a8a094'; ctx.fillRect(R.x, floor, R.w, R.y + R.h - floor + 4);
  ctx.fillStyle = '#c8c0b4'; ctx.fillRect(R.x, floor, R.w, 2);
  // Columns across the left of the hall.
  const cw = Math.round(R.w * 0.07);
  for (const f of [0.06, 0.24, 0.42]) column(ctx, R.x + Math.round(R.w * f), frieze, floor, cw);
  // The vault on the right: a dark round opening with gold inside, its door hinged at its right.
  const r = Math.round(Math.min(52, R.h * 0.24));
  const vx = R.x + Math.round(R.w * 0.76);
  const vy = floor - r - 8;
  oval(ctx, '#6a6f7a', vx, vy, r + 7, r + 7);
  oval(ctx, '#3a3f4a', vx, vy, r + 2, r + 2);
  oval(ctx, '#14161c', vx, vy, r, r);
  for (let k = 0; k < 10; k++) oval(ctx, k % 2 ? '#c8a040' : '#e8c060', vx - r * 0.5 + hash(k + 20) * r, vy + r * 0.55 - hash(k + 21) * 6, 4, 2);
  // The ledge, from the wall to the vault's rim.
  const ledge = vy - r - 16;
  ctx.fillStyle = '#e8e2d8'; ctx.fillRect(R.x, ledge, vx - r - R.x + 4, 4);
  ctx.fillStyle = '#b8b0a4'; ctx.fillRect(R.x, ledge + 4, vx - r - R.x + 4, 3);
  // The coin: rolls along the ledge (0.5–2.8 s), tips off, drops into the vault and is gone (3.3 s).
  const cr = 10;
  const endX = vx - r;
  let coin = null;
  if (ms < 2800) {
    const p = ease(clamp01((ms - 500) / 2300));
    coin = { x: R.x - 10 + (endX - R.x + 10) * p, y: ledge - cr, s: 1, spin: p * 12 };
  } else if (ms < 3300) {
    const f = (ms - 2800) / 500;
    coin = { x: endX + f * r, y: ledge - cr + f * f * (vy - ledge + cr), s: 1 - 0.7 * f, spin: 12 + f * 4 };
  }
  if (coin) {
    oval(ctx, '#8a6a20', coin.x + 1, coin.y + 1, cr * coin.s, cr * coin.s);
    oval(ctx, '#d8a840', coin.x, coin.y, cr * coin.s, cr * coin.s);
    oval(ctx, '#f0d080', coin.x - 1, coin.y - 1, cr * coin.s * 0.65, cr * coin.s * 0.65);
    if (coin.s > 0.5) pixelLine(ctx, '#b8902a', coin.x, coin.y, coin.x + Math.cos(coin.spin) * cr * 0.6, coin.y + Math.sin(coin.spin) * cr * 0.6, 1);
  }
  if (ms > 3300 && ms < 3500) for (let k = 0; k < 6; k++) { ctx.fillStyle = '#fff6c8'; ctx.fillRect(vx + Math.round((hash(k) - 0.5) * 20), vy + Math.round(r * 0.3 - hash(k + 1) * 12), 1, 1); }
  // The door: edge on at the hinge while open, swinging shut (3.7–4.4 s), the wheel turning after the clunk.
  const shut = clamp01((ms - 3700) / 700) ** 2;
  const dw = Math.max(0.12, shut);
  const dcx = vx + (r + 6) * (1 - shut) + 4 * (1 - shut);
  oval(ctx, '#5a5f6c', dcx + 2, vy + 2, (r + 4) * dw, r + 4);
  oval(ctx, '#8a909c', dcx, vy, (r + 4) * dw, r + 4);
  oval(ctx, '#a8aeb8', dcx - 1, vy - 1, (r - 2) * dw, r - 2);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ctx.fillStyle = '#5a5f6c'; ctx.fillRect(Math.round(dcx + Math.cos(a) * r * dw), Math.round(vy + Math.sin(a) * r), 2, 2); }
  if (dw > 0.4) {
    orrery(ctx, dcx, vy - r * 0.15, r * 0.55, ms, dw);
    const turn = ease(clamp01((ms - SHUT - 200) / 900)) * Math.PI;
    for (let k = 0; k < 3; k++) {
      const a = turn + (k / 3) * Math.PI * 2;
      pixelLine(ctx, '#4a4f5c', dcx, vy + r * 0.5, dcx + Math.cos(a) * r * 0.28 * dw, vy + r * 0.5 + Math.sin(a) * r * 0.28, 2);
    }
    oval(ctx, '#c8a040', dcx, vy + r * 0.5, 3 * dw, 3);
  }
  // Dust shaken off the ledge at the clunk.
  if (ms > SHUT && ms < SHUT + 1200) for (let k = 0; k < 24; k++) {
    const age = (ms - SHUT) / 1200;
    ctx.fillStyle = `rgba(200,190,176,${(0.9 * (1 - age)).toFixed(3)})`;
    ctx.fillRect(Math.round(R.x + hash(k) * (vx - r - R.x)), Math.round(ledge + 6 + age * 40 * (0.5 + hash(k + 1))), 1, 1);
    ctx.fillRect(Math.round(vx + (hash(k + 2) - 0.5) * r * 2.4), Math.round(floor - age * 12 * hash(k + 3)), 2, 1);
  }
  ctx.restore();
  // The end card: the name cut into the frieze in gold, the tagline below it.
  const e = endCard(ms);
  if (e > 0) {
    ctx.globalAlpha = e;
    // Lower in the frieze, clear of the scorebug in Broadcast (Tom, Groundwork: it cut the name off); the dentils
    // start at frieze - 10.
    brand(ctx, ad.brand.toUpperCase(), R.x + R.w / 2, R.y + 24, 4, ad.colours[0], ad.colours[1]);
    ctx.fillStyle = 'rgba(40,30,20,0.75)';
    ctx.fillRect(R.x + R.w / 2 - 110, frieze + 4, 220, 20);
    line(ctx, ad.tagline, R.x + R.w / 2, frieze + 14, 14, '#f0d080');
    ctx.globalAlpha = 1;
  }
}

// ---- their stills

/** Sandglass Watches: the awnings, the watch on its strap, the hourglass beside it. @type {StillDraw} */
function sandglassStill(ctx, R, ad) {
  sky(ctx, R, ['#f0b860', '#f6d080', '#e0a858']);
  const PAIRS = ['#c8402a', '#1fa3a3', '#d8a030', '#7a3a6a'];
  for (let x = 0; x < R.w; x++) box(ctx, Math.floor(x / 4) % 2 ? '#f4e8d0' : PAIRS[Math.floor(x / 40) % 4], R.x + x, R.y, 1, 3 + (x % 8 < 4 ? 1 : 0));
  // The hourglass, small, then the watch.
  const hx = R.x + R.w - 44;
  box(ctx, '#6a3a1a', hx - 5, R.y + 5, 11, 2); box(ctx, '#6a3a1a', hx - 5, R.y + 17, 11, 2);
  for (let y = 0; y < 10; y++) { const w = Math.round(1 + 3 * Math.abs(y - 5) / 5); box(ctx, y > 5 ? '#e0b460' : 'rgba(210,235,255,0.5)', hx - w, R.y + 7 + y, w * 2 + 1, 1); }
  const cx = R.x + R.w - 18;
  box(ctx, '#8a5a2a', cx - 4, R.y, 9, R.h);
  oval(ctx, '#d8a840', cx, R.y + 10, 8, 8);
  oval(ctx, '#f6f0e0', cx, R.y + 10, 6, 6);
  box(ctx, '#2a1a10', cx, R.y + 6, 1, 4); box(ctx, '#2a1a10', cx, R.y + 10, 4, 1); box(ctx, '#c8402a', cx - 3, R.y + 11, 3, 1);
  small(ctx, ad.brand.toUpperCase(), R.x + 5, R.y + 7, ad.colours[0], ad.colours[1]);
}

/** Brinestone Oilskins: the storm, the boat on the swell, the fisher in yellow. @type {StillDraw} */
function brinestoneStill(ctx, R, ad) {
  sky(ctx, R, ['#141a24', '#1a2230', '#202a3a']);
  for (let k = 0; k < 30; k++) box(ctx, 'rgba(180,200,220,0.4)', R.x + Math.round(hash(k) * R.w), R.y + Math.round(hash(k + 4) * 12), 1, 3);
  for (let x = 0; x < R.w; x++) { const y = Math.round(R.y + 15 + 1.5 * Math.sin(x / 9)); box(ctx, '#1f4a60', R.x + x, y, 1, R.y + R.h - y); if (x % 11 < 2) box(ctx, 'rgba(255,255,255,0.6)', R.x + x, y, 1, 1); }
  const bx = R.x + R.w - 30;
  box(ctx, '#7a2a1c', bx - 12, R.y + 13, 25, 3); box(ctx, '#f4f7fb', bx - 12, R.y + 13, 25, 1);
  box(ctx, '#e8e4da', bx - 10, R.y + 7, 6, 6);
  box(ctx, '#f2c230', bx + 2, R.y + 6, 5, 7); box(ctx, '#e8c0a0', bx + 3, R.y + 3, 3, 3); box(ctx, '#f2c230', bx + 1, R.y + 2, 7, 1); box(ctx, '#f2c230', bx + 2, R.y + 1, 5, 1);
  for (let k = 0; k < 8; k++) box(ctx, 'rgba(240,248,255,0.8)', bx - 18 + Math.round(hash(k + 30) * 10), R.y + 6 + Math.round(hash(k + 31) * 8), 2, 2);
  small(ctx, ad.brand.toUpperCase(), R.x + 5, R.y + 4, ad.colours[0], ad.colours[1]);
}

/** Orrery Bank: marble, a column, the vault door with its orrery, a gold coin; the name in gold. @type {StillDraw} */
function orreryBankStill(ctx, R, ad) {
  sky(ctx, R, ['#e8e2d8', '#d8d0c4', '#c8c0b4']);
  box(ctx, '#b8b0a4', R.x, R.y + 17, R.w, 3);
  // The name at its usual size again (Tom, Groundwork: at twice the size it drew the eye), with a soft marble shadow
  // instead of the brand's dark one (Task 160: at 1x that swamped the gold).
  const name = ad.brand.toUpperCase();
  const nameEnd = 6 + blockWidth(name, 1);
  for (const x of [R.w - 70, R.w - 54].filter((x) => x > nameEnd + 6)) { for (let k = 0; k < 8; k++) box(ctx, k % 4 === 0 ? '#bcb4a8' : '#f2ede4', R.x + x + k, R.y + 2, 1, 15); box(ctx, '#c8c0b4', R.x + x - 1, R.y + 1, 10, 2); }
  const vx = R.x + R.w - 18;
  oval(ctx, '#5a5f6c', vx, R.y + 10, 9, 9);
  oval(ctx, '#8a909c', vx, R.y + 10, 8, 8);
  for (let a = 0; a < Math.PI * 2; a += 0.3) box(ctx, '#b8902a', Math.round(vx + Math.cos(a) * 5), Math.round(R.y + 9 + Math.sin(a) * 2.5), 1, 1);
  box(ctx, '#ffd23f', vx - 1, R.y + 8, 2, 2); box(ctx, '#d8553a', vx + 4, R.y + 10, 1, 1);
  oval(ctx, '#d8a840', vx - 18, R.y + 13, 3, 3); box(ctx, '#f0d080', vx - 19, R.y + 12, 1, 1);
  small(ctx, name, R.x + 6, R.y + 7, ad.colours[0], '#bcb4a8');
}

/** The brands' ads by their scene name in data/spots.json. @type {Record<string, AdDraw>} */
export const BRAND_SCENES = Object.freeze({ caravan_cola: caravanCola, tideline, foundry_fuel: foundryFuel, ironvale, velours, red_dune: redDune, gullwing, maison_dore: maisonDore, steamvale, sandglass, brinestone, orrery_bank: orreryBank });
/** The brands' stills by their scene name. @type {Record<string, StillDraw>} */
export const BRAND_STILLS = Object.freeze({ caravan_cola: caravanColaStill, tideline: tidelineStill, foundry_fuel: foundryFuelStill, ironvale: ironvaleStill, velours: veloursStill, red_dune: redDuneStill, gullwing: gullwingStill, maison_dore: maisonDoreStill, steamvale: steamvaleStill, sandglass: sandglassStill, brinestone: brinestoneStill, orrery_bank: orreryBankStill });
