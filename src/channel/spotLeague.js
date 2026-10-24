// The league's own ads and the channel's promo (Tasks 105, 111, 146; split from spotArt.js, Task 157): Tickets, Season
// tickets and the playoffs promo, each a 9 s scene and a still, with facts from the league (ads.js adFacts). The
// league's ads share an end card with room for a call to action. spotArt.js puts these with the brands' (spotBrands.js).
import { PALETTE } from './palette.js';
import { sharpBlock, sharpBlockWidth, sharpText } from './sharpText.js';
import { blockText, blockWidth, clamp01, ease, mix, mod, shade } from './sceneArt.js';
import { drawSprite } from './pitch.js';
import { FANS, FIRE, box, brand, crowd, endCard, fireball, hash, identBack, line, oval, small, sky, tiny } from './spotKit.js';

/**
 * @typedef {import('./spotKit.js').Ad} Ad
 * @typedef {import('./spotKit.js').AdDraw} AdDraw
 * @typedef {import('./spotKit.js').StillDraw} StillDraw
 * @typedef {import('./spotKit.js').TicketFacts} TicketFacts
 * @typedef {import('./sceneArt.js').Rect} Rect
 */

/**
 * The finalists, centred: each name after a block of its kit colour, home first ("■ Gulls  v  ■ Storm").
 * @param {CanvasRenderingContext2D} ctx @param {import('./spots.js').Finalist[]} teams @param {number} cx @param {number} y
 */
const finalists = (ctx, [home, away], cx, y) => {
  ctx.font = '16px VT323';
  const v = '  v  ';
  const w = (/** @type {string} */ s) => ctx.measureText(s).width;
  const KIT = 9;
  let x = Math.round(cx - (KIT * 2 + w(home.name) + w(v) + w(away.name)) / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const [team, after] of /** @type {const} */ ([[home, v], [away, '']])) {
    ctx.fillStyle = '#f2efe6';
    ctx.fillRect(x, y - 4, 6, 8);
    ctx.fillStyle = team.colour;
    ctx.fillRect(x + 1, y - 3, 4, 6);
    x += KIT;
    sharpText(ctx, team.name + after, x, y, { size: 16, colour: '#f2efe6', baseline: 'middle' });
    x += w(team.name + after);
  }
};

/**
 * The end card the league's own ads share: a dark band at the bottom with the brand, the tagline and up to two more
 * lines (the call to action, a fact). @param {CanvasRenderingContext2D} ctx @param {Rect} R @param {number} e  Its fade in.
 * @param {Ad} ad @param {string[]} more
 */
function leagueCard(ctx, R, e, ad, more) {
  const h = 46 + more.length * 16;
  ctx.globalAlpha = e;
  ctx.fillStyle = 'rgba(12,14,22,0.9)';
  ctx.fillRect(R.x, R.y + R.h - h, R.w, h);
  ctx.fillStyle = ad.colours[0];
  ctx.fillRect(R.x, R.y + R.h - h, R.w, 2);
  const name = ad.brand.toUpperCase();
  const s = blockWidth(name, 3) <= R.w - 24 ? 3 : 2;
  brand(ctx, name, R.x + R.w / 2, R.y + R.h - h + 8 + (3 - s) * 3, s, ad.colours[0], ad.colours[1]);
  line(ctx, ad.tagline, R.x + R.w / 2, R.y + R.h - h + 38, 14, '#f2efe6');
  more.forEach((text, i) => line(ctx, text, R.x + R.w / 2, R.y + R.h - h + 54 + i * 16, 14, i === 0 ? ad.colours[0] : '#9aa1b2'));
  ctx.globalAlpha = 1;
}

/** "Tue 14:00 · KES v QAD" for the next live match, or its time alone while its teams aren't known. @param {TicketFacts | undefined} t */
const nextMatch = (t) => (!t ? '' : t.home && t.away ? `Next live: ${t.when} · ${t.home.abbr} v ${t.away.abbr}` : `Next live: ${t.when}`);

/**
 * Tickets (the league, Task 146): a turnstile clicks; a fan climbs the steps out of the dark into the light of a full
 * stand, which rises cheering as they reach the top. Then the brand, ON SALE NOW and the next live match.
 * @type {AdDraw}
 */
function tickets(ctx, R, ms, ad, facts) {
  const light = ease(clamp01((ms - 1200) / 2800));
  const standH = Math.round(R.h * 0.5);
  crowd(ctx, { x: R.x, y: R.y, w: R.w, h: standH }, ms, light, 3800);
  // The concourse below: dark, lightening as the fan comes up into the stand.
  sky(ctx, { x: R.x, y: R.y + standH, w: R.w, h: R.h - standH }, ['#16181f', '#111319', '#0c0e13']);
  // The steps: from the bottom left up to the stand's front, each one a lighter grey.
  const steps = 7;
  const sx = R.x + 70;
  const foot = R.y + R.h - 8;
  const stepW = Math.round((R.w * 0.45) / steps);
  const stepH = Math.round((foot - (R.y + standH)) / steps);
  for (let k = 0; k < steps; k++) {
    ctx.fillStyle = mix('#2b2f3a', '#6b7184', (k / steps) * (0.4 + 0.6 * light));
    ctx.fillRect(sx + k * stepW, foot - (k + 1) * stepH, R.x + R.w - (sx + k * stepW), stepH);
  }
  // The turnstile: a post with three arms, turning a third as the fan goes through (0.5–0.9 s).
  const tx = R.x + 36;
  const ty = foot - 26;
  ctx.fillStyle = '#9aa1b2';
  ctx.fillRect(tx - 3, ty, 6, 26);
  const turn = ease(clamp01((ms - 500) / 400)) * ((2 * Math.PI) / 3);
  ctx.strokeStyle = '#c9ccd4';
  ctx.lineWidth = 2;
  for (let k = 0; k < 3; k++) {
    const a = turn + (k * 2 * Math.PI) / 3;
    ctx.beginPath();
    ctx.moveTo(tx, ty + 6);
    ctx.lineTo(Math.round(tx + Math.cos(a) * 16), Math.round(ty + 6 + Math.sin(a) * 6));
    ctx.stroke();
  }
  // The fan, three times a player's size: through the turnstile, then up the steps, arms up at the top.
  const climb = ease(clamp01((ms - 900) / 3000));
  const fx = tx + 14 + climb * (stepW * steps + sx - tx - 10);
  const fy = foot - climb * stepH * steps;
  ctx.save();
  ctx.translate(Math.round(fx), Math.round(fy));
  ctx.scale(3, 3);
  drawSprite(ctx, 0, 0, { shirt: '#d62d2d', trim: '#f2efe6', skin: PALETTE.skin2, stride: climb > 0 && climb < 1 ? Math.floor(ms / 160) % 2 : -1, arms: ms > 4100 ? 'both' : 'none' });
  // A scarf round the neck.
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(-3, -8, 7, 1);
  ctx.fillRect(2, -8, 1, 3);
  ctx.restore();
  const e = endCard(ms);
  if (e > 0) leagueCard(ctx, R, e, ad, ['ON SALE NOW', nextMatch(facts.tickets)].filter(Boolean));
}

/**
 * Season tickets (the league, Task 146): a wall calendar flips through a team's seven home matches while a scarf in
 * that team's colours grows a stripe for each, and ends draped over a seat. Then the brand and which season is on sale.
 * @type {AdDraw}
 */
function seasonTickets(ctx, R, ms, ad, facts) {
  const team = facts.seasonTickets;
  const [a, b] = team ? [team.primary, team.secondary] : ['#d62d2d', '#f2efe6'];
  sky(ctx, R, ['#1b1e28', '#20242f', '#252a36', '#20242f']);
  // The calendar, on the wall on the left: HOME MATCH and its number, a page torn off every 700 ms from 0.4 s.
  const pages = 7;
  const flipped = Math.min(pages, Math.max(0, Math.floor((ms - 400) / 700) + 1));
  const cx = R.x + Math.round(R.w * 0.28);
  const cy = R.y + Math.round(R.h * 0.18);
  ctx.fillStyle = '#c9ccd4';
  ctx.fillRect(cx - 44, cy, 88, 92);
  ctx.fillStyle = a;
  ctx.fillRect(cx - 44, cy, 88, 18);
  for (const dx of [-26, 26]) { ctx.fillStyle = '#4a4f5c'; ctx.fillRect(cx + dx - 2, cy - 4, 4, 8); }
  ctx.fillStyle = '#f2efe6';
  ctx.fillRect(cx - 40, cy + 20, 80, 68);
  blockText(ctx, 'HOME', cx - Math.round(blockWidth('HOME', 2) / 2), cy + 3, 2, b);
  line(ctx, 'MATCH', cx, cy + 32, 16, '#4a4f5c');
  line(ctx, String(Math.max(1, flipped)), cx, cy + 62, 44, '#1b1e28');
  // The page just torn off, falling away: once for each tear, none after the last page (it used to loop on page 6).
  const since = mod(ms - 400, 700);
  const tearing = ms - 400 < pages * 700;
  if (ms > 1100 && flipped > 1 && tearing && since < 400) {
    // The page before, with its number, sliding down and off as it fades.
    const f = since / 400;
    const px = Math.round(cx + f * 30);
    const py = Math.round(cy + f * 60);
    ctx.globalAlpha = 1 - f;
    ctx.fillStyle = '#f2efe6';
    ctx.fillRect(px - 40, py + 20, 80, 68);
    line(ctx, 'MATCH', px, py + 32, 16, '#4a4f5c');
    line(ctx, String(flipped - 1), px, py + 62, 44, '#1b1e28');
    ctx.globalAlpha = 1;
  }
  if (team) line(ctx, team.name, cx, cy + 108, 14, '#9aa1b2');
  // The seat, on the right: a stadium seat in the team's colour. Above it the scarf hangs from a peg, a stripe for each
  // page; from 5.4 s it comes down and lies along the seat's back, its ends hanging either side.
  const scx = R.x + Math.round(R.w * 0.68);
  const seatY = R.y + Math.round(R.h * 0.62);
  const backTop = seatY - 44;
  ctx.fillStyle = shade(a, 0.7);
  ctx.fillRect(scx - 34, backTop, 68, 40);
  ctx.fillStyle = shade(a, 0.55);
  ctx.fillRect(scx - 34, backTop + 36, 68, 4);
  ctx.fillStyle = a;
  ctx.fillRect(scx - 36, seatY - 4, 72, 10);
  ctx.fillStyle = '#4a4f5c';
  ctx.fillRect(scx - 30, seatY + 6, 5, 22);
  ctx.fillRect(scx + 25, seatY + 6, 5, 22);
  const stripe = 6;
  const stripes = 2 + flipped * 2;
  const W2 = 14;
  /** A stripe of the scarf, k from its end. @param {number} k @param {number} x @param {number} y @param {number} w @param {number} h */
  const piece = (k, x, y, w, h) => { ctx.fillStyle = k % 2 ? b : a; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  /** Tassels below (x, y). @param {number} x @param {number} y */
  const tassels = (x, y) => { ctx.fillStyle = b; for (let k = 0; k < 6; k++) ctx.fillRect(Math.round(x + 1 + k * 2), Math.round(y), 1, 5); };
  const drop = ease(clamp01((ms - 5400) / 600));
  if (drop < 1) {
    // Hanging from the peg, falling toward the seat.
    const peg = R.y + 14;
    ctx.fillStyle = '#9aa1b2';
    ctx.fillRect(scx - 3, peg - 3, 6, 4);
    const top = peg + drop * (backTop - 6 - peg);
    for (let k = 0; k < stripes; k++) piece(k, scx - W2 / 2, top + k * stripe, W2, stripe);
    tassels(scx - W2 / 2, top + stripes * stripe);
  } else {
    // Along the back's top edge, the ends down the front either side.
    const across = 68;
    for (let k = 0; k * stripe < across; k++) piece(k, scx - across / 2 + k * stripe, backTop - 6, stripe, W2 - 4);
    const hang = Math.max(2, Math.floor((stripes * stripe - across) / 2 / stripe));
    for (const x of [scx - across / 2, scx + across / 2 - W2]) {
      for (let k = 0; k < hang; k++) piece(k, x, backTop + 4 + k * stripe, W2, stripe);
      tassels(x, backTop + 4 + hang * stripe);
    }
  }
  const e = endCard(ms);
  if (e > 0) leagueCard(ctx, R, e, ad, team ? [`SEASON ${team.season} ON SALE NOW`] : ['ON SALE NOW']);
}

/** A channel promo: the playoffs are coming, a trophy among sparks, with their times from the calendar. @type {AdDraw} */
function promo(ctx, R, ms, ad, facts) {
  identBack(ctx, R, ms, facts.back);
  const cx = R.x + R.w / 2;
  const top = R.y + 30;
  const rise = ease(clamp01(ms / 800));
  const ty = top + Math.round((1 - rise) * 40);
  ctx.fillStyle = '#f2c230';
  ctx.fillRect(cx - 22, ty, 44, 6); ctx.fillRect(cx - 18, ty + 6, 36, 22); ctx.fillRect(cx - 12, ty + 28, 24, 6);
  ctx.fillRect(cx - 4, ty + 34, 8, 14); ctx.fillRect(cx - 16, ty + 48, 32, 6);
  ctx.fillRect(cx - 30, ty + 6, 8, 3); ctx.fillRect(cx - 30, ty + 6, 3, 14); ctx.fillRect(cx - 30, ty + 18, 10, 3);
  ctx.fillRect(cx + 22, ty + 6, 8, 3); ctx.fillRect(cx + 27, ty + 6, 3, 14); ctx.fillRect(cx + 20, ty + 18, 10, 3);
  ctx.fillStyle = '#fff6c8'; ctx.fillRect(cx - 14, ty + 8, 3, 16);
  ctx.fillStyle = '#b88a10'; ctx.fillRect(cx + 10, ty + 8, 4, 18);
  for (let k = 0; k < 24; k++) {
    const age = mod(ms - k * 97, 1600) / 1600;
    const a = hash(k) * Math.PI * 2;
    ctx.fillStyle = FIRE[Math.min(5, Math.floor(age * 6))];
    ctx.fillRect(Math.round(cx + Math.cos(a) * (30 + age * 60)), Math.round(ty + 26 + Math.sin(a) * (20 + age * 40) - age * 20), 1, 1);
  }
  const a = ease(clamp01((ms - 900) / 400));
  ctx.globalAlpha = a;
  const p = facts.playoffs;
  if (p.stage === 'final') {
    // The final's version (Task 111): from the first semifinal's kick-off, the finalists once both are known.
    brand(ctx, 'THE FINAL', cx, R.y + 106, 4, ad.colours[0], ad.colours[1]);
    if (p.finalists) finalists(ctx, p.finalists, cx, R.y + 148);
    else line(ctx, 'Two semifinals. One final.', cx, R.y + 148, 16, '#f2efe6');
    line(ctx, p.finalAt, cx, R.y + 166, 16, '#f2efe6');
  } else {
    brand(ctx, ad.brand.toUpperCase(), cx, R.y + 106, 4, ad.colours[0], ad.colours[1]);
    line(ctx, p.semis, cx, R.y + 148, 16, '#f2efe6');
    line(ctx, p.final, cx, R.y + 166, 16, '#f2efe6');
  }
  ctx.globalAlpha = ease(clamp01((ms - 2200) / 400));
  // "Only on SCORCHBALL", centred as a pair with a clear gap between them (Task 138).
  ctx.font = '16px VT323';
  const only = ctx.measureText(ad.tagline).width;
  const GAP = 12;
  const ox = Math.round(cx - (only + GAP + blockWidth('SCORCHBALL', 2)) / 2);
  line(ctx, ad.tagline, ox + only / 2, R.y + 198, 16, '#9aa1b2');
  sharpBlock(ctx, 'SCORCHBALL', Math.round(ox + only + GAP), R.y + 192, 2, '#ff8a1f');
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- the stills (Task 113)

/** The playoffs promo: the trophy on the light bars, and when; or the final's, with the finalists. @type {StillDraw} */
function promoStill(ctx, R, ad, facts) {
  identBack(ctx, R, 0, facts.back);
  // The trophy.
  const tx = R.x + 12;
  box(ctx, '#f2c230', tx - 6, R.y + 2, 12, 2); box(ctx, '#f2c230', tx - 5, R.y + 4, 10, 5); box(ctx, '#f2c230', tx - 3, R.y + 9, 6, 2);
  box(ctx, '#f2c230', tx - 1, R.y + 11, 2, 3); box(ctx, '#f2c230', tx - 4, R.y + 14, 8, 2);
  box(ctx, '#f2c230', tx - 8, R.y + 4, 2, 4); box(ctx, '#f2c230', tx + 6, R.y + 4, 2, 4);
  box(ctx, '#fff6c8', tx - 4, R.y + 5, 1, 3); box(ctx, '#b88a10', tx + 3, R.y + 5, 1, 4);
  for (let k = 0; k < 8; k++) box(ctx, FIRE[k % 4], tx - 10 + Math.round(hash(k) * 22), R.y + 1 + Math.round(hash(k + 3) * 17), 1, 1);
  const p = facts.playoffs;
  const x = R.x + 28;
  const upper = (/** @type {string} */ s) => s.toUpperCase();
  if (p.stage === 'final') {
    small(ctx, 'THE FINAL', x, R.y + 3, ad.colours[0], ad.colours[1]);
    small(ctx, upper(p.finalAt), x + blockWidth('THE FINAL', 1) + 8, R.y + 3, '#f2efe6', '#000000');
    if (p.finalists) {
      let fx = x;
      // The names, or the abbreviations if both names wouldn't fit beside their kits.
      const named = p.finalists.map((f) => upper(f.name));
      const fits = blockWidth(`${named[0]} V ${named[1]}`, 1) + 22 <= R.x + R.w - x;
      p.finalists.forEach((f, i) => {
        box(ctx, '#f2efe6', fx, R.y + 11, 5, 6); box(ctx, f.colour, fx + 1, R.y + 12, 3, 4);
        fx += 8;
        const name = (fits ? named[i] : upper(f.abbr)) + (i === 0 ? ' V ' : '');
        small(ctx, name, fx, R.y + 11, '#f2efe6', '#000000');
        fx += blockWidth(name, 1) + 6;
      });
    } else small(ctx, 'TWO SEMIS. ONE FINAL.', x, R.y + 11, '#f2efe6', '#000000');
  } else {
    small(ctx, upper(ad.brand), x, R.y + 3, ad.colours[0], ad.colours[1]);
    // The kick-offs from "Semis Sun 14:00 and 17:00" (or "Sat 14:00 and Sun 17:00") and "Finals Sun 20:00".
    const days = (/** @type {string} */ text) => [...upper(text).matchAll(/(?:(MON|TUE|WED|THU|FRI|SAT|SUN) )?(\d\d:\d\d)/g)].map((m) => ({ day: m[1] ?? '', time: m[2] }));
    const semis = days(p.semis);
    const [final] = days(p.final);
    // The brand (and the day) on top; below, the semis then the final, each after its label in the tiny font (Task 138,
    // Tom: SEMIS and FINALS, not SF and F; Tom, after Task 258: both on the bottom row). All on one day: the day by the
    // brand, then only times.
    const oneDay = semis.every((k) => !k.day || k.day === final.day);
    if (oneDay) small(ctx, final.day, x + blockWidth(upper(ad.brand), 1) + 6, R.y + 3, '#f2efe6', '#000000');
    let bx = x + tiny(ctx, 'SEMIS', x, R.y + 11, ad.colours[0], ad.colours[1]) + 4;
    const semiTimes = semis.map((k) => (k.day && !oneDay ? `${k.day} ${k.time}` : k.time)).join(' ');
    small(ctx, semiTimes, bx, R.y + 11, '#f2efe6', '#000000');
    bx += Math.ceil(sharpBlockWidth(ctx, semiTimes, 1)) + 6;
    bx += tiny(ctx, 'FINALS', bx, R.y + 11, ad.colours[0], ad.colours[1]) + 4;
    small(ctx, oneDay ? final.time : `${final.day} ${final.time}`, bx, R.y + 11, '#f2efe6', '#000000');
  }
}

/** Tickets: the turnstile, TICKETS and ON SALE NOW, the next live match. @type {StillDraw} */
function ticketsStill(ctx, R, ad, facts) {
  sky(ctx, R, ['#16181f', '#1b1e28', '#20242f']);
  // A strip of crowd along the top, lit.
  for (let x = 2; x < R.w; x += 4) {
    const k = hash(x * 7);
    box(ctx, FANS[Math.floor(k * FANS.length)], R.x + x, R.y + 1 + (k > 0.6 ? 0 : 1), 3, 2);
  }
  // The turnstile.
  const tx = R.x + 10;
  box(ctx, '#9aa1b2', tx - 1, R.y + 6, 3, 13);
  box(ctx, '#c9ccd4', tx - 7, R.y + 9, 7, 1); box(ctx, '#c9ccd4', tx + 2, R.y + 7, 6, 1); box(ctx, '#c9ccd4', tx + 2, R.y + 12, 6, 1);
  const x = R.x + 24;
  small(ctx, ad.brand.toUpperCase(), x, R.y + 5, ad.colours[0], ad.colours[1]);
  small(ctx, 'ON SALE NOW', x + blockWidth(ad.brand.toUpperCase(), 1) + 6, R.y + 5, '#f2efe6', '#000000');
  const t = facts.tickets;
  if (t) small(ctx, t.home && t.away ? `NEXT ${t.when} ${t.home.abbr} V ${t.away.abbr}` : `NEXT ${t.when}`, x, R.y + 13, '#9aa1b2', '#000000');
}

/** Season tickets: a scarf in the team's colours, SEASON TICKETS, which season is on sale. @type {StillDraw} */
function seasonTicketsStill(ctx, R, ad, facts) {
  const team = facts.seasonTickets;
  const [a, b] = team ? [team.primary, team.secondary] : ['#d62d2d', '#f2efe6'];
  sky(ctx, R, ['#1b1e28', '#20242f', '#252a36']);
  // The scarf across the left end, stripe by stripe, tassels at its end.
  for (let k = 0; k < 6; k++) box(ctx, k % 2 ? b : a, R.x + 3 + k * 3, R.y + 7, 3, 7);
  for (let k = 0; k < 3; k++) box(ctx, b, R.x + 22, R.y + 7 + k * 3, 3, 1);
  const x = R.x + 28;
  small(ctx, ad.brand.toUpperCase(), x, R.y + 4, ad.colours[0], ad.colours[1]);
  small(ctx, team ? `SEASON ${team.season} ON SALE NOW` : 'ON SALE NOW', x, R.y + 12, '#f2efe6', '#000000');
}

// ---------------------------------------------------------------- Ad break, batch 3 (Task 161): the league's own

/** The heat a ball shows at a moment: Cool (white) to Warm to Hot, as the match ball's own colours (0 → 1). @param {number} h */
const heatColour = (h) => (h < 0.5 ? mix(PALETTE.heatCool, PALETTE.heatWarm, h * 2) : mix(PALETTE.heatWarm, PALETTE.heatHot, (h - 0.5) * 2));

/**
 * Ember & Co. (the league; the official match ball): the ball on a pedestal heats from Cool to Warm to Hot, the ident's
 * fire licking round it once it's hot; beside it this season's burns count up. @type {AdDraw}
 */
function ember(ctx, R, ms, ad, facts) {
  identBack(ctx, R, ms, facts.back);
  const bx = R.x + Math.round(R.w * 0.3);
  const top = R.y + Math.round(R.h * 0.6);
  // The pedestal: dark stone, gold trim.
  ctx.fillStyle = '#1d2230'; ctx.fillRect(bx - 30, top, 60, R.y + R.h - top);
  ctx.fillStyle = '#2b2f3a'; ctx.fillRect(bx - 36, top, 72, 8); ctx.fillRect(bx - 36, R.y + R.h - 10, 72, 10);
  ctx.fillStyle = '#c8a040'; ctx.fillRect(bx - 36, top + 8, 72, 2); ctx.fillRect(bx - 22, top + 22, 44, 1);
  // The ball: heating through the meter's three steps, flames from Warm on.
  const heat = clamp01((ms - 600) / 3600);
  const r = Math.round(R.h * 0.1);
  const cy = top - r - 2;
  fireball(ctx, ms, () => ({ x: bx, y: cy }), { r, life: 700, rate: heat > 0.75 ? 6 : 3, speed: 24, from: 2400, core: (t) => heatColour(clamp01((t - 600) / 3600)), seed: 11 });
  // The meter: COOL, WARM, HOT lighting in turn, and the season's burns counting up.
  const mx = R.x + Math.round(R.w * 0.56);
  const my = R.y + Math.round(R.h * 0.2);
  /** @type {[string, string, number][]} */
  const steps = [['COOL', PALETTE.heatCool, 0], ['WARM', PALETTE.heatWarm, 0.4], ['HOT', PALETTE.heatHot, 0.8]];
  steps.forEach(([label, colour, at], i) => {
    const on = heat >= at;
    const x = mx + i * 46;
    ctx.fillStyle = on ? colour : '#2b2f3a';
    ctx.fillRect(x, my, 40, 8);
    blockText(ctx, label, x + Math.round((40 - blockWidth(label, 1)) / 2), my + 12, 1, on ? colour : '#4a4f5c');
  });
  line(ctx, facts.lastSeason ? 'BURNS LAST SEASON' : 'BURNS THIS SEASON', mx + 66, my + 42, 16, '#9aa1b2');
  const burns = facts.burns ?? 0;
  const n = Math.round(burns * ease(clamp01((ms - 800) / 3400)));
  brand(ctx, String(n), mx + 66, my + 54, 6, '#ff8a1f', '#3a0d08');
  const e = endCard(ms);
  if (e > 0) leagueCard(ctx, R, e, ad, ['THE OFFICIAL MATCH BALL']);
}

/** A closed book, its cover at (x, y), w × h, with its page edges below and to the right. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} season */
function closedBook(ctx, x, y, w, h, season) {
  ctx.fillStyle = '#f0e6cc'; ctx.fillRect(x + 4, y + 4, w, h);
  ctx.fillStyle = '#c8bca0'; for (let k = 6; k < h; k += 3) ctx.fillRect(x + w, y + k, 4, 1);
  ctx.fillStyle = '#6a1a1a'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#4a1010'; ctx.fillRect(x, y, 6, h);
  ctx.fillStyle = '#c8a040'; ctx.fillRect(x + 10, y + 6, w - 16, 1); ctx.fillRect(x + 10, y + h - 7, w - 16, 1);
  const cx = x + w / 2 + 3;
  oval(ctx, '#ff8a1f', cx, y + h * 0.42, 6, 6);
  oval(ctx, '#ffd23f', cx - 1, y + h * 0.42 - 1, 3, 3);
  for (let k = 0; k < 3; k++) { ctx.fillStyle = FIRE[k + 1]; ctx.fillRect(Math.round(cx - 12 - k * 4), Math.round(y + h * 0.42 - 2 + k), 6, 2); }
  blockText(ctx, 'ALMANAC', Math.round(cx - blockWidth('ALMANAC', 2) / 2), Math.round(y + h * 0.58), 2, '#e8c060');
  const sn = `SEASON ${season}`;
  blockText(ctx, sn, Math.round(cx - blockWidth(sn, 1) / 2), Math.round(y + h * 0.58) + 17, 1, '#c8a040');
}

/** A page of tiny results: rows of grey marks in two columns, seeded by `k`. @param {CanvasRenderingContext2D} ctx @param {number} x @param {number} y @param {number} w @param {number} h @param {number} k */
function resultsPage(ctx, x, y, w, h, k) {
  ctx.fillStyle = '#f4ecd4'; ctx.fillRect(x, y, w, h);
  for (let row = 0; row * 5 + 8 < h - 4; row++) {
    const yy = y + 6 + row * 5;
    ctx.fillStyle = row % 6 === 0 ? '#8a3a20' : '#9a9080';
    const a = 6 + Math.round(hash(k * 31 + row) * (w * 0.25));
    ctx.fillRect(x + 5, yy, a, 2);
    ctx.fillStyle = '#5a5040'; ctx.fillRect(x + w / 2 - 3, yy, 6, 2);
    ctx.fillStyle = '#9a9080'; ctx.fillRect(x + w - 5 - a, yy, a, 2);
  }
}

/**
 * The Scorchball Almanac (the league; the record book, a trail for It remembers): a thick book thumps onto a desk and
 * opens, its pages riffling past, each a blur of tiny results; it settles on this season's goals so far. @type {AdDraw}
 */
function almanac(ctx, R, ms, ad, facts) {
  const desk = R.y + Math.round(R.h * 0.7);
  // A study: dark green wall, a lamp's glow, a wooden desk.
  sky(ctx, { ...R, h: desk - R.y }, ['#14241c', '#18291f', '#1c2e22', '#203324']);
  oval(ctx, 'rgba(255,220,150,0.04)', R.x + R.w * 0.7, R.y + R.h * 0.3, 120, 70);
  oval(ctx, 'rgba(255,220,150,0.05)', R.x + R.w * 0.7, R.y + R.h * 0.3, 70, 40);
  sky(ctx, { ...R, y: desk, h: R.y + R.h - desk }, ['#6a4224', '#5a3820', '#4a2e1a']);
  ctx.fillStyle = '#8a5a30'; ctx.fillRect(R.x, desk, R.w, 2);
  for (let x = 0; x < R.w; x += 37) { ctx.fillStyle = '#4a2e1a'; ctx.fillRect(R.x + x, desk + 6 + (x % 3) * 4, 24, 1); }
  const cx = R.x + R.w / 2;
  const pw = Math.round(R.w * 0.25);
  const ph = Math.round(R.h * 0.46);
  const by = desk - ph + 10;
  const LAND = 900;
  const OPEN = 1700;
  const season = facts.numbersSeason ?? facts.season ?? 1;
  if (ms < OPEN) {
    // Falling (from 0.3 s), a thump on landing (0.9 s): a bounce, dust either side.
    const f = clamp01((ms - 300) / (LAND - 300));
    const bounce = ms > LAND ? Math.round(Math.sin(clamp01((ms - LAND) / 250) * Math.PI) * 4) : 0;
    const y = Math.round(R.y - ph - 20 + (by - R.y + ph + 20) * f * f) - bounce;
    closedBook(ctx, Math.round(cx - pw / 2), y, pw, ph, season);
    if (ms > LAND) for (let k = 0; k < 16; k++) {
      const age = (ms - LAND) / 700;
      if (age > 1) break;
      const side = k % 2 ? 1 : -1;
      oval(ctx, `rgba(200,180,140,${(0.5 * (1 - age)).toFixed(3)})`, cx + side * (pw / 2 + 6 + age * 30 * (0.5 + hash(k))), by + ph - 4 - age * 10 * hash(k + 2), 3 + age * 4, 2 + age * 2);
    }
  } else {
    // Open: two pages either side of the spine, the right-hand ones riffling over (2–5.2 s), then still.
    const lx = Math.round(cx - pw);
    ctx.fillStyle = '#4a1010'; ctx.fillRect(lx - 6, by - 4, pw * 2 + 12, ph + 8);
    const FLIP = 160;
    const flips = Math.max(0, Math.min(20, Math.floor((ms - 2000) / FLIP)));
    resultsPage(ctx, lx, by, pw, ph, flips * 2);
    const settled = ms >= 2000 + 20 * FLIP;
    if (!settled) resultsPage(ctx, cx, by, pw, ph, flips * 2 + 1);
    else {
      // The page it settles on: this season's goals so far, in ink.
      ctx.fillStyle = '#f4ecd4'; ctx.fillRect(cx, by, pw, ph);
      blockText(ctx, 'GOALS', Math.round(cx + pw / 2 - blockWidth('GOALS', 2) / 2), by + 10, 2, '#8a3a20');
      const g = String(facts.goals ?? 0);
      const s = blockWidth(g, 4) <= pw - 10 ? 4 : 3;
      blockText(ctx, g, Math.round(cx + pw / 2 - blockWidth(g, s) / 2), by + 30, s, '#2a2018');
      const when = facts.lastSeason ? 'LAST SEASON' : 'THIS SEASON';
      blockText(ctx, when, Math.round(cx + pw / 2 - blockWidth(when, 1) / 2), by + 36 + 6 * s, 1, '#8a3a20');
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(cx - 2, by, 4, ph);
    // The page turning: across from the right to the left, narrowing to the spine and widening again.
    if (ms > 2000 && !settled) {
      const f = ((ms - 2000) % FLIP) / FLIP;
      const w = Math.round(pw * Math.abs(Math.cos(f * Math.PI)));
      ctx.fillStyle = f < 0.5 ? '#fbf4e0' : '#e8dcc0';
      ctx.fillRect(f < 0.5 ? cx : cx - w, by - Math.round(Math.sin(f * Math.PI) * 6), w, ph);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(f < 0.5 ? cx + w - 2 : cx - w, by - Math.round(Math.sin(f * Math.PI) * 6), 2, ph);
    }
    // The cover swinging open (1.7–2 s): across to the left.
    if (ms < 2000) {
      const f = (ms - OPEN) / 300;
      const w = Math.round(pw * Math.abs(Math.cos(f * Math.PI)));
      ctx.fillStyle = f < 0.5 ? '#6a1a1a' : '#4a1010';
      ctx.fillRect(f < 0.5 ? cx : cx - w, by - Math.round(Math.sin(f * Math.PI) * 10), w, ph);
    }
  }
  const e = endCard(ms);
  if (e > 0) leagueCard(ctx, R, e, ad, ['BUY YOURS TODAY']);
}

/**
 * A replica shirt, front on, its collar at (cx, top), `s` px a cell: the body in the team's first colour, collar,
 * cuffs and hem in its second, the abbreviation on the chest.
 * @param {CanvasRenderingContext2D} ctx @param {number} cx @param {number} top @param {number} s @param {import('./spots.js').Kit} kit @param {number} [dim]  0 (lit) → 1 (dark).
 */
function shirt(ctx, cx, top, s, kit, dim = 0) {
  const a = mix(kit.primary, '#1a1c24', dim);
  const b = mix(kit.secondary, '#1a1c24', dim);
  const px = (/** @type {string} */ c, /** @type {number} */ x, /** @type {number} */ y, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(Math.round(cx + x * s), Math.round(top + y * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s))); };
  px(a, -6, 0, 12, 16);
  px(a, -10, 1, 4, 6); px(a, 6, 1, 4, 6);
  px(b, -10, 6, 4, 1); px(b, 6, 6, 4, 1);
  px(b, -6, 15, 12, 1);
  px(b, -2, 0, 4, 1); px(b, -1, 1, 2, 1);
  px(shade(a, 0.85), 4, 1, 2, 14);
  if (s >= 2) blockText(ctx, kit.abbr, Math.round(cx - blockWidth(kit.abbr, Math.max(1, Math.floor(s / 2))) / 2), Math.round(top + 5 * s), Math.max(1, Math.floor(s / 2)), b);
}

/**
 * The League Shop (the league; replica shirts): a carousel rack spins through all eight teams' shirts and slows to a
 * stop on one (seeded per break), which is lifted off and held up to the camera. @type {AdDraw}
 */
function leagueShop(ctx, R, ms, ad, facts) {
  const shop = facts.shop ?? { kits: [{ primary: '#d62d2d', secondary: '#f2efe6', abbr: 'XXX' }], pick: 0, name: '' };
  const { kits, pick } = shop;
  // A bright shop: a warm wall, shelves, a wooden floor.
  sky(ctx, R, ['#e8e2d8', '#e0d8cc', '#d8d0c4']);
  const floor = R.y + Math.round(R.h * 0.8);
  sky(ctx, { ...R, y: floor, h: R.y + R.h - floor }, ['#a8703a', '#986434', '#88582e']);
  ctx.fillStyle = '#c8bcac';
  for (const f of [0.12, 0.88]) { ctx.fillRect(R.x + R.w * f - 30, R.y + 30, 60, 3); ctx.fillRect(R.x + R.w * f - 30, R.y + 70, 60, 3); }
  for (let k = 0; k < 6; k++) { const f = k < 3 ? 0.12 : 0.88; oval(ctx, ['#d62d2d', '#1fa3a3', '#f2c230'][k % 3], R.x + R.w * f - 18 + (k % 3) * 18, R.y + 24, 6, 5); }
  const cx = R.x + R.w / 2;
  const rail = R.y + Math.round(R.h * 0.22);
  const n = kits.length;
  // The rack: a chrome rail, a pole down to a round base.
  ctx.fillStyle = '#9aa1b2'; ctx.fillRect(cx - 1, rail, 3, floor - rail);
  oval(ctx, '#7a8090', cx, floor - 2, 34, 5);
  // Spinning (three turns), slowing to a stop with the pick in front at 3.6 s.
  const STOP = 3600;
  const spin = 1 - ease(clamp01(ms / STOP));
  const theta = -(pick / n) * Math.PI * 2 - spin * 3 * Math.PI * 2;
  const rx = R.w * 0.3;
  const held = ease(clamp01((ms - 4000) / 900));
  const order = kits.map((kit, i) => ({ kit, i, a: theta + (i / n) * Math.PI * 2 })).sort((p, q) => Math.cos(p.a) - Math.cos(q.a));
  for (const { kit, i, a } of order) {
    if (i === pick && held > 0) continue;
    const depth = (Math.cos(a) + 1) / 2;
    const x = cx + Math.sin(a) * rx;
    ctx.fillStyle = '#c9ccd4'; ctx.fillRect(Math.round(x) - 1, rail - 4, 2, 6);
    shirt(ctx, x, rail + 2, 2 + depth * 1.2, kit, (1 - depth) * 0.45 + held * 0.4);
  }
  ctx.fillStyle = '#c9ccd4';
  ctx.fillRect(Math.round(cx - rx - 12), rail - 4, Math.round(rx * 2 + 24), 2);
  // Lifted off and held up to the camera, big, with the team's name under it.
  if (held > 0) {
    const s = 3.2 + held * (Math.min(6.5, R.h / 40) - 3.2);
    const top = rail + 2 - held * (rail - R.y - 8) * 0.6;
    shirt(ctx, cx, top, s, kits[pick]);
    // Hands at the shoulders.
    for (const side of [-1, 1]) { ctx.fillStyle = PALETTE.skin2; ctx.fillRect(Math.round(cx + side * 9 * s - 4), Math.round(top + 1.5 * s), 8, 10); }
    const nameAlpha = clamp01((ms - 4900) / 400);
    if (nameAlpha > 0 && shop.name) {
      ctx.globalAlpha = nameAlpha;
      brand(ctx, shop.name.toUpperCase(), cx, Math.round(top + 17 * s + 6), 2, kits[pick].primary, '#1a1c24');
      ctx.globalAlpha = 1;
    }
  }
  const e = endCard(ms);
  if (e > 0) leagueCard(ctx, R, e, ad, ['FIND A SHOP AT YOUR LOCAL STADIUM']);
}

// ---- their stills

/** Ember & Co.: the ball hot on its pedestal, the season's burns, the name. @type {StillDraw} */
function emberStill(ctx, R, ad, facts) {
  identBack(ctx, R, 0, facts.back);
  const bx = R.x + 11;
  box(ctx, '#1d2230', bx - 6, R.y + 14, 12, 6); box(ctx, '#c8a040', bx - 7, R.y + 14, 14, 1);
  for (let k = 0; k < 8; k++) box(ctx, FIRE[k % 4], bx - 6 + Math.round(hash(k + 60) * 12), R.y + 1 + Math.round(hash(k + 61) * 6), 1, 2);
  oval(ctx, PALETTE.heatHot, bx, R.y + 9, 4, 4);
  oval(ctx, PALETTE.heatWarm, bx - 1, R.y + 8, 2, 2);
  const n = String(facts.burns ?? 0);
  small(ctx, n, R.x + 24, R.y + 4, '#ff8a1f', '#3a0d08', 2);
  const x = R.x + 24 + blockWidth(n, 2) + 6;
  small(ctx, facts.lastSeason ? 'BURNS LAST SEASON' : 'BURNS SO FAR', x, R.y + 3, '#9aa1b2', '#000000');
  small(ctx, ad.brand.toUpperCase(), x, R.y + 11, ad.colours[0], ad.colours[1]);
}

/** The Almanac: the book open on the desk, the name and the call to action. @type {StillDraw} */
function almanacStill(ctx, R, ad) {
  sky(ctx, R, ['#14241c', '#1c2e22', '#203324']);
  box(ctx, '#6a4224', R.x, R.y + 17, R.w, 3);
  const bx = R.x + R.w - 22;
  box(ctx, '#4a1010', bx - 16, R.y + 3, 32, 15);
  box(ctx, '#f4ecd4', bx - 15, R.y + 4, 14, 13); box(ctx, '#f4ecd4', bx + 1, R.y + 4, 14, 13);
  for (let k = 0; k < 4; k++) { box(ctx, '#9a9080', bx - 13, R.y + 6 + k * 3, 10, 1); box(ctx, '#9a9080', bx + 3, R.y + 6 + k * 3, 10, 1); }
  small(ctx, ad.brand.toUpperCase(), R.x + 5, R.y + 3, ad.colours[0], ad.colours[1]);
  small(ctx, 'BUY YOURS TODAY', R.x + 5, R.y + 11, '#f2efe6', '#000000');
}

/** The League Shop: shirts on the rail, the one up front in its team's colours, the name and the line. @type {StillDraw} */
function leagueShopStill(ctx, R, ad, facts) {
  sky(ctx, R, ['#e8e2d8', '#e0d8cc', '#d8d0c4']);
  const shop = facts.shop;
  box(ctx, '#9aa1b2', R.x + R.w - 52, R.y + 2, 48, 1);
  if (shop) [-1, 1, 0].forEach((off) => {
    const kit = shop.kits[(shop.pick + off + shop.kits.length) % shop.kits.length];
    shirt(ctx, R.x + R.w - 28 + off * 15, R.y + 3, off === 0 ? 1 : 0.8, kit, off === 0 ? 0 : 0.35);
  });
  small(ctx, ad.brand.toUpperCase(), R.x + 5, R.y + 3, ad.colours[1], ad.colours[0]);
  small(ctx, 'WEAR YOUR COLOURS', R.x + 5, R.y + 11, '#4a4f5c', '#f2efe6');
}

/** The league's ads and the promo by their scene name in data/spots.json. @type {Record<string, AdDraw>} */
export const LEAGUE_SCENES = Object.freeze({ tickets, season_tickets: seasonTickets, playoffs_promo: promo, ember, almanac, league_shop: leagueShop });
/** Their stills by scene name. @type {Record<string, StillDraw>} */
export const LEAGUE_STILLS = Object.freeze({ tickets: ticketsStill, season_tickets: seasonTicketsStill, playoffs_promo: promoStill, ember: emberStill, almanac: almanacStill, league_shop: leagueShopStill });
