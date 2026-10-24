// The big card over the pitch: full time, pre-match and the studio cards. What they say comes from cards.js. Over the
// scene (studio cards, the champions, the off-season) it's Glass (Task 102, Tom's pick from Task 93), and one card
// dissolves softly into the next (Tom, after Task 101). Over the pitch a card fades in, settling up into place (Task
// 278k, Tom's pick A on cardfades.html; once a sweep covering it has passed), and the pre-match card fades out as the
// walk-out begins; the others leave with the sweep into the studio.
import { crestCanvas } from '../crests.js';
import { guilders } from '../money.js';
import { PALETTE } from '../palette.js';
import { $, countdown, el, kit, setText } from './dom.js';

/**
 * @typedef {ReturnType<typeof import('../cards.js').fullTimeCard> | ReturnType<typeof import('../cards.js').preMatchCard>
 *   | ReturnType<typeof import('../cards.js').studioCard> | ReturnType<typeof import('../cards.js').finalDayCard>
 *   | ReturnType<typeof import('../cards.js').finalDayResultsCard> | ReturnType<typeof import('../cards.js').championCard>
 *   | ReturnType<typeof import('../cards.js').reairCard>
 *   | ReturnType<typeof import('../cards.js').placeholderCard> | NonNullable<ReturnType<typeof import('../cards.js').promoCard>>
 *   | NonNullable<ReturnType<typeof import('../previewCards.js').previewCard>>} Card
 */

/**
 * @param {{ league: import('../../sim/league.js').League, formatTime: (t: number) => string, config: import('../../config.js').Config }} channel
 */
export function createCardPanel({ league, formatTime, config }) {
  const box = $('card');
  /** @type {HTMLElement | null} The card dissolving away under the new one. */
  let ghost = null;
  const team = (/** @type {string} */ id) => league.teams[id];
  const awardName = Object.fromEntries(config.rules.awards.list.map((/** @type {any} */ a) => [a.id, a.name.replace(/^The /, '')]));
  /** @type {number | null} */
  let kickoff = null;
  /** A card over the pitch came in under a sweep: it fades in once uncovered. */
  let fadePending = false;
  /** The pre-match card fading out. @type {HTMLElement | null} */
  let leaving = null;
  const fadeMs = config.settings.transitions.cardFadeMs;
  /** Fade a card over the pitch in (transform, not translate: Broadcast shifts the card with translate). */
  /** @type {Animation | null} */
  let fading = null;
  const fadeIn = () => {
    if (fadeMs > 0) fading = box.animate([{ opacity: 0, transform: 'translateY(calc(var(--px) * 4))' }, { opacity: 1, transform: 'none' }], { duration: fadeMs, easing: 'ease-out' });
  };
  /** The pre-match card as the walk-out begins: a copy left on top, fading up and away. */
  const fadeOut = () => {
    if (fadeMs <= 0 || box.hidden || !(box.classList.contains('card-pre_match') || box.classList.contains('card-final_day'))) return;
    const g = /** @type {HTMLElement} */ (box.cloneNode(true));
    // As the glass cards' ghost (its styles are #card's), with this fade in place of the dissolve.
    // Kept apart from `ghost`, which show(null) clears every frame.
    leaving?.remove();
    g.id = 'card-ghost';
    g.style.animation = 'none';
    box.after(g);
    leaving = g;
    g.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(calc(var(--px) * -2))' }], { duration: fadeMs, easing: 'ease-in', fill: 'forwards' }).finished.then(() => g.remove(), () => g.remove());
  };

  /** A team's name with its kit swatch. @param {string} id @param {string} [cls] */
  const teamLine = (id, cls = '') => el('div', `card-team ${cls}`, [kit(team(id)), el('span', '', [team(id).name])]);
  /** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. @param {number} n */
  const ordinal = (n) => {
    const suffix = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
  };

  /** @param {Card} card @returns {Node[]} */
  function render(card) {
    switch (card.kind) {
      case 'full_time': {
        const scorers = (/** @type {import('../cards.js').Scorer[]} */ list) => el('ul', 'card-list', list.map((s) =>
          el('li', s.scorcher ? 'scorcher' : '', [`${s.name} ${s.minute}'${s.scorcher ? ' SCORCHER' : ''}${s.freeShot ? ' (FS)' : ''}`])));
        return [
          el('h3', '', [card.title]),
          el('div', 'card-score', [
            teamLine(card.home.teamId, 'home'),
            el('span', 'big', [`${card.home.goals} - ${card.away.goals}`]),
            teamLine(card.away.teamId, 'away'),
          ]),
          el('div', 'card-cols', [scorers(card.home.scorers), scorers(card.away.scorers)]),
          el('p', 'card-note', [card.note]),
        ];
      }
      case 'pre_match': {
        kickoff = card.kickoff;
        // The banded crest beside the name, the place and the form (Task 166), so the line-ups still fit below.
        const side = (/** @type {typeof card.home} */ s) => el('div', 'card-side', [
          el('div', 'crest-head', [crestCanvas(document, team(s.teamId), { style: 'banded', scale: 2 }), el('div', '', [
            teamLine(s.teamId),
            el('p', 'muted', [s.position ? `${ordinal(s.position)} · ${s.points} pts` : 'No games yet']),
            el('div', 'form', s.form.map((f) => el('span', `chip ${f}`, [f]))),
          ])]),
          el('ul', 'card-list', s.lineup.map((p) => el('li', '', [el('span', 'slot', [p.slot]), ` ${p.name}`, ...(p.rookie ? [el('span', 'rookie', ['R'])] : [])]))),
        ]);
        return [
          el('h3', '', [card.title]),
          el('p', 'muted', [`${formatTime(card.kickoff)} · ${card.venue} · kick-off in `, el('span', '', [])]),
          el('div', 'card-cols', [side(card.home), side(card.away)]),
        ];
      }
      case 'placeholder':
        return [el('h3', '', [card.title]), el('p', 'card-note', [card.note])];
      case 'reair':
        return [
          el('h3', '', [card.title]),
          // No "v" (Tom, Task 109; UP NEXT has none): the two teams side by side, meeting the middle.
          el('div', 'card-score pair', [teamLine(card.homeId, 'home'), teamLine(card.awayId, 'away')]),
          el('p', 'card-note', [card.note]),
        ];
      case 'final_day': {
        kickoff = card.kickoff;
        const side = (/** @type {typeof card.rows[number]['home']} */ s) =>
          el('span', '', [kit(team(s.teamId)), ` ${team(s.teamId).abbr} (${ordinal(s.position)})`, s.races ? el('span', 'hot', [` ${s.races}`]) : '']);
        return [
          el('h3', '', [card.title]),
          el('p', 'muted', [`${formatTime(card.kickoff)} · press 1-4 to pick a match · kick-off in `, el('span', '', [])]),
          el('ul', 'card-list rows', card.rows.map((r) => el('li', '', [`${r.number}  `, side(r.home), el('span', 'muted', ['  v  ']), side(r.away)]))),
        ];
      }
      case 'final_day_results':
        return [
          el('h3', '', [card.title]),
          el('ul', 'card-list rows', card.rows.map((r) => el('li', '', [
            kit(team(r.homeId)), ` ${team(r.homeId).abbr} ${r.homeGoals}-${r.awayGoals} ${team(r.awayId).abbr} `, kit(team(r.awayId)),
          ]))),
          el('p', '', ['PENNANT: ', kit(team(card.shieldId)), ` ${team(card.shieldId).name}`]),
          el('p', 'muted', [`PLAYOFFS: ${card.playoffIds.map((id) => team(id).abbr).join(', ')}`]),
        ];
      case 'promo': {
        // The big matches promoted (Tom's pick C, the poster; bigmatches.html): the event's name stacked large in a
        // fire-red column with the day, time and countdown; the matches beside it.
        kickoff = card.kickoff;
        const place = (/** @type {{ position: number }} */ s) => el('span', 'muted', [`(${ordinal(s.position)})`]);
        const row = (/** @type {typeof card.rows[number]} */ r) => {
          const won = (/** @type {string} */ id) => (r.result ? (r.result.winnerId === id ? 'won' : 'lost') : '');
          return el('div', 'promo-row', [
            el('span', `h ${won(r.homeId)}`, [place(r.home), ` ${team(r.homeId).abbr}`, kit(team(r.homeId))]),
            el('span', r.result ? 'score' : 'muted', [r.result ? r.result.text : 'v']),
            el('span', `a ${won(r.awayId)}`, [kit(team(r.awayId)), `${team(r.awayId).abbr} `, place(r.away)]),
          ]);
        };
        /** @type {Node[]} */
        const body = [];
        for (const r of card.rows) {
          body.push(row(r));
          if ('sub' in r && r.sub) body.push(el('p', 'promo-sub', [r.sub]));
          if ('watch' in r && r.watch) body.push(el('p', 'promo-sub watch', [r.watch]));
        }
        if (card.face) {
          const f = card.face;
          const side = (/** @type {string} */ id, /** @type {{ position: number, points: number }} */ s) => el('div', 'promo-side', [
            crestCanvas(document, team(id), { style: 'banded', scale: 2 }),
            el('span', 'nm', [team(id).shortName.toUpperCase()]),
            el('span', 'promo-sub', [`${ordinal(s.position)} · ${s.points} PTS`]),
          ]);
          body.push(el('div', 'promo-face', [side(f.homeId, f.home), el('span', 'vs', ['v']), side(f.awayId, f.away)]));
        }
        for (const line of card.lines) body.push(el('p', 'promo-sub', [line]));
        if (card.hot) body.push(el('p', 'promo-sub watch', [card.hot]));
        return [el('div', 'promo', [
          el('div', 'promo-col', [
            ...card.words.map((w, i) => el('div', `w${i === 2 && card.event === 'semifinals' ? ' sm' : ''}`, [w])),
            el('div', 'when', [card.when]),
            // The countdown ticks every frame (show(), as the pre-match card's).
            el('p', 'muted promo-cd', [el('span', '', [])]),
          ]),
          el('div', 'promo-body', body),
        ])];
      }
      // FROM THE VAULT (Tom's note 14; his picks on vault.html): the opening, A with the amber bar, the story's headline and
      // v (never the result); SINCE THEN, A: each finalist then and now.
      case 'vault_open': {
        const side = (/** @type {string} */ id) => el('div', 'vt-side', [crestCanvas(document, team(id), { style: 'banded', scale: 2 }), el('span', 'nm', [team(id).shortName.toUpperCase()])]);
        const ground = card.ground ? `${card.ground.toUpperCase()}, ` : '';
        return [el('h3', '', ['FROM THE VAULT']), el('div', 'vt-open', [
          el('div', 'vt-head honour', [card.headline]),
          el('div', 'vt-face', [side(card.homeId), el('span', 'vs', ['v']), side(card.awayId)]),
          el('p', 'muted', [`SEASON ${card.season} · ${formatTime(card.kickoff).toUpperCase()} · ${ground}${card.city.toUpperCase()}`]),
        ])];
      }
      case 'vault_since':
        return [el('h3', '', ['SINCE THEN']), el('div', 'vt-cols', card.sides.map((x) => el('div', 'vt-side', [
          crestCanvas(document, team(x.teamId), { style: 'banded', scale: 2 }), el('span', 'nm', [team(x.teamId).shortName.toUpperCase()]),
          el('span', 'muted', ['THEN']), el('span', 'honour', [x.then]),
          el('span', 'muted', ['NOW']), el('span', 'amb', [x.now ? `${ordinal(x.now.position)} · ${x.now.points} PTS` : 'NOT PLAYED YET']),
        ])))];
      // The PLAYOFF PREVIEW show (the big matches promoted; Tom's picks on preview.html).
      case 'preview_open':
        // A, the poster, PREVIEW on one line: the red column, what the show holds beside it.
        return [el('div', 'promo', [
          el('div', 'promo-col', [el('div', 'w', ['PLAYOFF']), el('div', 'w', ['PREVIEW']), el('div', 'when', [`SEASON ${card.season}`])]),
          el('div', 'promo-body pv-open', [
            el('p', 'pv-amb', ['ON THE SHOW']), el('p', '', ['THE SEASON IN REVIEW']),
            ...card.semis.map((x) => el('p', '', [`${x.label}: ${team(x.homeId).abbr} v ${team(x.awayId).abbr} · ${formatTime(x.kickoff).toUpperCase()}`])),
          ]),
        ])];
      // The FINALS PREVIEW show (Tom, 2026-10-18; his picks on finalspreview.html).
      case 'finals_open':
        // A, the poster: FINALS / PREVIEW in the red column, what the show holds beside it.
        return [el('div', 'promo', [
          el('div', 'promo-col', [el('div', 'w', ['FINALS']), el('div', 'w', ['PREVIEW']), el('div', 'when', [`SEASON ${card.season}`])]),
          el('div', 'promo-body pv-open', [
            el('p', 'pv-amb', ['ON THE SHOW']), el('p', '', ['THE ROAD TO THE FINAL']),
            el('p', '', [`THE FINAL: ${team(card.homeId).abbr} v ${team(card.awayId).abbr} · ${formatTime(card.kickoff).toUpperCase()}`]),
          ]),
        ])];
      case 'road': {
        // B, the bracket: the semifinals with their seeds and scores, the two through lit, into THE FINAL in amber.
        const row = (/** @type {string} */ id, /** @type {number} */ place, /** @type {number} */ goals, /** @type {boolean} */ won) => el('div', `pv-road-row${won ? ' hi' : ''}`, [
          el('span', 'pv-small', [ordinal(place)]), kit(team(id)), el('span', '', [team(id).abbr]), el('span', 'g', [String(goals)]),
        ]);
        const box = (/** @type {typeof card.semis[number]} */ x) => el('div', 'pv-road-box', [
          el('div', 'pv-small', [`${x.label}${x.decidedBy === 'overtime' ? ' · GOLDEN GOAL' : x.shootout ? ` · ${x.shootout.home}-${x.shootout.away} SHOOTOUT` : ''}`]),
          row(x.homeId, x.homePlace, x.homeGoals, x.winnerId === x.homeId), row(x.awayId, x.awayPlace, x.awayGoals, x.winnerId === x.awayId),
        ]);
        return [el('h3', '', [`THE ROAD TO THE FINAL · SEASON ${card.season}`]), el('div', 'pv-road', [
          el('div', 'pv-road-semis', card.semis.map(box)),
          el('span', 'pv-road-to', ['›']),
          el('div', 'pv-road-box final', [el('div', 'honour', ['THE FINAL']), el('div', '', [kit(team(card.homeId)), ` ${team(card.homeId).abbr} v ${team(card.awayId).abbr} `, kit(team(card.awayId))]), el('div', 'pv-small', [formatTime(card.kickoff).toUpperCase()])]),
        ])];
      }
      case 'table_story': {
        // A, the bump chart: a line per team in its colours, its place after each round; each line ends at its team's
        // swatch, abbreviation and points, drawn in the chart so they're level; the playoff cut dashed.
        const NS = 'http://www.w3.org/2000/svg';
        const W = 292;
        const H = 112;
        const labelW = 40;
        const n = card.rows.length;
        const rounds = card.rows[0]?.places.length ?? 0;
        const x = (/** @type {number} */ i) => 4 + (i * (W - labelW - 8)) / Math.max(1, rounds - 1);
        const y = (/** @type {number} */ place) => 6 + ((place - 1) * (H - 12)) / Math.max(1, n - 1);
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        svg.setAttribute('class', 'pv-chart');
        const add = (/** @type {string} */ tag, /** @type {Record<string, string | number>} */ attrs, text = '') => {
          const e = document.createElementNS(NS, tag);
          for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
          if (text) e.textContent = text;
          svg.append(e);
          return e;
        };
        const yc = (y(card.cut) + y(card.cut + 1)) / 2;
        add('line', { x1: 0, x2: W - labelW + 2, y1: yc, y2: yc, stroke: PALETTE.accent, 'stroke-dasharray': '2 2', 'stroke-width': 0.6 });
        for (const r of [...card.rows].reverse()) {
          const c = team(r.teamId).colours;
          const pts = r.places.map((pl, i) => `${x(i)},${y(pl)}`).join(' ');
          add('polyline', { points: pts, fill: 'none', stroke: c.secondary, 'stroke-width': 3.2, 'stroke-linejoin': 'round' });
          add('polyline', { points: pts, fill: 'none', stroke: c.primary, 'stroke-width': 2, 'stroke-linejoin': 'round' });
        }
        // The labels at each line's end: its final place, which is its row in the table.
        card.rows.forEach((r, i) => {
          const c = team(r.teamId).colours;
          const yy = y(i + 1);
          const lx = x(rounds - 1) + 4;
          add('rect', { x: lx, y: yy - 3.5, width: 4, height: 7, fill: c.primary });
          add('rect', { x: lx + 3, y: yy - 3.5, width: 1, height: 7, fill: c.secondary });
          add('text', { x: lx + 7, y: yy + 3, class: 'pv-label' }, team(r.teamId).abbr);
          add('text', { x: W - 1, y: yy + 3, class: 'pv-label pts', 'text-anchor': 'end' }, String(r.points));
        });
        return [el('h3', '', [`THE TABLE'S STORY · SEASON ${card.season}`]), svg, el('div', 'pv-foot', [el('span', '', [`ROUND 1 TO ${rounds}`]), el('span', '', [`PENNANT: ${team(card.rows[0].teamId).shortName.toUpperCase()}`])])];
      }
      case 'season_numbers':
        // B, tiles: a big number, what it was and who.
        return [el('h3', '', [`SEASON ${card.season} BY THE NUMBERS`]), el('div', `pv-tiles n${card.tiles.length}`, card.tiles.map((x) => el('div', 'pv-tile', [el('div', 'n', [x.n]), el('div', 'what', [x.what]), el('div', 'who', [x.who])])))];
      case 'tape': {
        // A, the boxer's sheet: the two sides' numbers either side of the label, the better one lit.
        const h = card.home;
        const a = card.away;
        /** @type {[string, string | number, string | number, boolean | null][]} label, home, away, more is better (null: no judging) */
        const stats = [
          ['PLACE', ordinal(h.position), ordinal(a.position), null], ['POINTS', h.points, a.points, true], ['W-D-L', h.record, a.record, null],
          ['GOALS FOR', h.goalsFor, a.goalsFor, true], ['AGAINST', h.goalsAgainst, a.goalsAgainst, false], ['SCORCHERS', h.scorchers, a.scorchers, true],
          ['SAVES', h.saves, a.saves, true], ['HOME', h.home, a.home, null], ['AWAY', h.away, a.away, null],
        ];
        const better = (/** @type {any} */ v, /** @type {any} */ w, /** @type {boolean | null} */ more) => more !== null && typeof v === 'number' && v !== w && (more ? v > w : v < w);
        return [el('h3', '', [`TALE OF THE TAPE · ${card.label}`]), el('div', 'pv-tape', [
          el('span', 'r b', [team(h.teamId).shortName.toUpperCase(), ' ', kit(team(h.teamId))]), el('span', '', []), el('span', 'b', [kit(team(a.teamId)), ' ', team(a.teamId).shortName.toUpperCase()]),
          ...stats.flatMap(([l, v, w, more]) => [el('span', `r${better(v, w, more) ? ' hi' : ''}`, [String(v)]), el('span', 'l', [l]), el('span', better(w, v, more) ? 'hi' : '', [String(w)])]),
          // The final's (FINALS PREVIEW): how each won its semifinal.
          ...(h.semi && a.semi ? [el('span', 'r', [h.semi]), el('span', 'l', ['SEMIFINAL']), el('span', '', [a.semi])] : []),
        ]), el('p', 'pv-meet', [card.meetings.length ? `THIS SEASON: ${card.meetings.join(' · ')}` : "THEY HAVEN'T MET THIS SEASON"])];
      }
      case 'watch': {
        // B, two halves: each side under its crest, its scorer's goals and its keeper's save % big, apart (four players).
        const half = (/** @type {typeof card.home} */ s) => el('div', 'pv-half', [
          crestCanvas(document, team(s.teamId), { style: 'banded', scale: 1 }),
          el('div', 'pv-small', [team(s.teamId).shortName.toUpperCase()]),
          ...(s.scorer ? [el('div', 'pv-player', [el('div', 'big', [String(s.scorer.goals)]), el('div', '', [s.scorer.name]), el('div', 'pv-small', [`GOALS · ${s.scorer.scorchers} SCORCHERS`]),
            ...(s.scorer.semi !== null ? [el('div', 'pv-small', [`${s.scorer.semi} IN THE SEMIFINAL`])] : [])])] : []),
          ...(s.keeper ? [el('div', 'pv-player', [el('div', 'big honour', [`${s.keeper.pct}%`]), el('div', '', [s.keeper.name]), el('div', 'pv-small', [`SAVED · ${s.keeper.saves} SAVES`]),
            ...(s.keeper.semi !== null ? [el('div', 'pv-small', [`${s.keeper.semi} SAVES IN THE SEMIFINAL`])] : [])])] : []),
        ]);
        return [el('h3', '', [`PLAYERS TO WATCH · ${card.label}`]), el('div', 'pv-halves', [half(card.home), half(card.away)])];
      }
      case 'bracket':
        return [el('h3', '', [card.title]), el('ul', 'card-list rows', card.rows.map((r) => {
          const name = (/** @type {string | null} */ id) => (id ? team(id).abbr : 'TBC');
          const side = (/** @type {string | null} */ id) => [id ? kit(team(id)) : '', ` ${name(id)}`];
          const res = r.result;
          const tail = res
            ? `  ${res.homeGoals}-${res.awayGoals}${res.decidedBy === 'overtime' ? ' GG' : res.shootout ? ` (${res.shootout.home}-${res.shootout.away} SO)` : ''}  → ${team(res.winnerId).abbr}`
            : r.status === 'live' ? '  LIVE' : `  ${formatTime(r.kickoff)}`;
          return el('li', res ? '' : 'muted', [el('span', 'slot', [r.label]), ' ', ...side(r.homeId), ' v', ...side(r.awayId), tail]);
        }))];
      case 'champion':
        return [
          el('h3', 'hot', [card.title]),
          el('div', 'card-feature', [kit(team(card.championId), 'kit big'), el('div', '', [
            el('p', 'card-name', [team(card.championId).name]),
            el('p', 'muted', [`${card.titles === 1 ? 'First title' : `Title number ${card.titles}`} · beat ${team(card.runnerUpId).name} ${card.score} in the final`]),
          ])]),
          el('p', '', ['Pennant (top of the table): ', kit(team(card.shieldId)), ` ${team(card.shieldId).name}`]),
          card.playoffScorer ? el('p', '', [`Playoffs' top scorer: ${card.playoffScorer.name} (${team(card.playoffScorer.teamId).abbr}) ${card.playoffScorer.goals}`]) : '',
        ];
      case 'new_season':
        kickoff = card.kickoff;
        return [
          el('h3', '', [card.title]),
          el('p', 'muted', [`Kicks off ${formatTime(card.kickoff)} · in `, el('span', '', [])]),
          card.championId ? el('p', '', ['Defending champions: ', kit(team(card.championId)), ` ${team(card.championId).name}`]) : '',
          card.opener ? el('p', '', ['Opening match: ', kit(team(card.opener.homeId)), ` ${team(card.opener.homeId).name} v ${team(card.opener.awayId).name} `, kit(team(card.opener.awayId))]) : '',
        ];
      // The studio cards as grids (Task 102, as in studio.html's Glass cards).
      case 'results':
        return [el('h3', '', [card.title]), grid('1fr 0.6em 3.4em 0.6em 1fr 1.6em', card.rows.flatMap((r) => [
          cell('r', team(r.homeId).shortName), kit(team(r.homeId)), cell('hi c', `${r.homeGoals}-${r.awayGoals}`), kit(team(r.awayId)), el('span', '', [team(r.awayId).shortName]),
          cell('m', r.decidedBy === 'overtime' ? 'GG' : r.decidedBy === 'shootout' ? 'SO' : ''),
        ]))];
      case 'upcoming':
        if (card.rows.length === 0) return [el('h3', '', [card.title]), el('p', 'card-note', ['The season is over'])];
        return [el('h3', '', [card.title]), grid('5.4em 2.6em 1fr 0.6em 1em 0.6em 1fr', card.rows.flatMap((f) => {
          const stage = cell('hi', f.stage === 'final' ? 'FINAL' : f.stage === 'semifinal' ? 'SEMI' : '');
          return f.homeId && f.awayId
            ? [cell('m', formatTime(f.kickoff)), stage, cell('r', team(f.homeId).shortName), kit(team(f.homeId)), cell('m c', 'v'), kit(team(f.awayId)), el('span', '', [team(f.awayId).shortName])]
            : [cell('m', formatTime(f.kickoff)), stage, cell('m r', 'TBC'), '', cell('m c', 'v'), '', cell('m', 'TBC')];
        }))];
      // The desk's career card (Task 226, Tom's pick A on careercard.html): who, why, the career in big totals, honours.
      case 'career': {
        const LABEL = /** @type {Record<string, string>} */ ({ goals: 'GOALS', assists: 'ASSISTS', stops: 'STOPS', saves: 'SAVES', savePct: 'SAVE %' });
        const WORD = /** @type {Record<string, [string, string]>} */ ({ goals: ['goal', 'goals'], assists: ['assist', 'assists'], saves: ['save', 'saves'], stops: ['stop', 'stops'], appearances: ['game', 'games'] });
        const why = card.why;
        const reason = card.next ? ['Next on: ', kit(team(card.next.homeId)), ` ${team(card.next.homeId).abbr} v `, kit(team(card.next.awayId)), ` ${team(card.next.awayId).abbr}`]
          : why.stat ? [`${why.left} ${WORD[why.stat][why.left === 1 ? 0 : 1]} from ${(why.target ?? 0).toLocaleString('en-US')}`] : [];
        const total = (/** @type {string} */ label, /** @type {string} */ v) => el('div', 'cc-total', [el('span', 'cc-big', [v]), el('span', 'muted', [label])]);
        const shown = (/** @type {string} */ k, /** @type {number | null} */ v) => (v === null ? '-' : k === 'savePct' ? `${(v * 100).toFixed(0)}%` : v.toLocaleString('en-US'));
        const honours = [
          ...(card.cups ? [`${card.cups} Cup${card.cups === 1 ? '' : 's'}`] : []),
          ...card.awards.map((a) => `${awardName[a.award] ?? a.award}${a.times > 1 ? ` ×${a.times}` : ''}`),
          ...(card.potm ? [`player of the match ×${card.potm}`] : []),
        ];
        return [
          el('h3', '', [card.title]),
          el('div', 'card-feature', [crestCanvas(document, team(card.teamId), { style: 'banded', scale: 2 }), el('div', '', [
            el('p', 'card-name', [card.name]),
            el('p', 'muted', [`${card.positionName} · ${team(card.teamId).shortName} · age ${card.age} · ${card.seasons} seasons`]),
            el('p', 'hi', reason),
          ])]),
          el('div', 'cc-totals', [total('GAMES', card.games.toLocaleString('en-US')), ...card.totals.map((x) => total(LABEL[x.stat], shown(x.stat, x.value)))]),
          honours.length ? el('p', 'card-note', [honours.join(' · ')]) : '',
        ];
      }
      // Money (Task 234): the payrolls with a bar against the cap and the room under it; the biggest signings, from where.
      case 'payrolls':
        return [el('h3', '', [card.title]), grid('0.6em 1fr 3.2em 5em 3.2em', card.rows.flatMap((r) => {
          const fill = el('span', r.payroll > 0.95 * card.cap ? 'full' : '');
          fill.style.width = `${Math.min(100, (100 * r.payroll) / card.cap)}%`;
          return [kit(team(r.teamId)), el('span', '', [team(r.teamId).shortName]), cell('hi r', guilders(r.payroll)), el('div', 'bar', [fill]),
            cell('m r', card.cap > r.payroll ? guilders(card.cap - r.payroll) : 'NONE')];
        })), el('p', 'card-note', [`The cap ${guilders(card.cap)} a season · the last column, room under it`])];
      case 'signings':
        if (card.rows.length === 0) return [el('h3', '', [card.title]), el('p', 'card-note', ['No signings yet'])];
        return [el('h3', '', [card.title]), grid('0.6em 1fr 2.4em 1em 2.4em 3.2em 1.6em', card.rows.flatMap((r) => [
          kit(team(r.teamId)), el('span', '', [r.name]), cell('m r', r.fromId ? team(r.fromId).abbr : 'FA'), cell('m c', '→'), el('span', '', [team(r.teamId).abbr]),
          cell('hi r', guilders(r.wage)), cell('m r', `${r.seasons}Y`),
        ])), el('p', 'card-note', ['FA: from free agency · Y: the deal\'s seasons'])];
      case 'scorers':
        if (card.rows.length === 0) return [el('h3', '', [card.title]), el('p', 'card-note', ['No goals yet'])];
        return [el('h3', '', [card.title]), grid('1.2em 0.6em 1fr auto 2em', card.rows.flatMap((s, i) => [
          cell('m', String(i + 1)), kit(team(s.teamId)), el('span', '', [`${s.name} `, el('span', 'muted', [team(s.teamId).abbr])]),
          s.scorchers > 0 ? cell('scorcher r', `${s.scorchers} ${s.scorchers === 1 ? 'scorcher' : 'scorchers'}`) : '', cell('hi r', String(s.goals)),
        ]))];
      case 'spotlight':
        return [
          el('h3', '', [card.title]),
          el('div', 'card-feature', [crestCanvas(document, team(card.teamId), { style: 'banded', scale: 2 }), el('div', '', [
            el('p', 'card-name', [card.name]),
            el('p', 'muted', [`${card.place} · ${card.position ? `${ordinal(card.position)}, ${card.points} pts` : 'season not started'}`]),
          ])]),
          el('p', 'card-blurb', [card.blurb]),
        ];
      // Task 102's four new cards: grids of cells.
      case 'form':
        return [el('h3', '', [card.title]), grid('0.6em 1fr auto', card.rows.flatMap((r) => [
          kit(team(r.teamId)), el('span', '', [team(r.teamId).name]), chips(r.form),
        ]))];
      case 'race':
        return [el('h3', '', [card.title]), grid(card.done ? '1.2em 0.6em 1fr 2.4em' : '1.2em 0.6em 1fr 2.4em 2.4em 5em', [
          ...(card.done ? ['', '', '', cell('m r', 'PTS')] : ['', '', '', cell('m r', 'PTS'), cell('m r', 'LEFT'), '']),
          ...card.rows.flatMap((r) => [
            cell('m', String(r.position)), kit(team(r.teamId)), el('span', '', [team(r.teamId).name]), cell('r', String(r.points)),
            ...(card.done ? [] : [cell('m r', String(r.left)), r.position <= card.cut ? cell('hi r', `+${r.gap} on ${ordinal(card.cut + 1)}`) : cell('m r', `${r.gap} off ${ordinal(card.cut)}`)]),
            ...(r.position === card.cut ? [el('div', 'card-cut')] : []),
          ]),
        ])];
      case 'honours':
        // The season's honours (Task 206).
        return [
          el('h3', 'hot', [card.title]),
          card.championId ? el('p', '', ['Champions: ', kit(team(card.championId)), ` ${team(card.championId).name}`]) : '',
          card.shieldId ? el('p', '', ['Pennant: ', kit(team(card.shieldId)), ` ${team(card.shieldId).name}`]) : '',
          grid('auto 0.6em 1fr', card.awards.flatMap((a) => [cell('m', a.name.replace(/^The /, '')), kit(team(a.teamId)), el('span', '', [a.player])])),
          card.firstPick ? el('div', 'card-cut quiet') : '',
          card.firstPick ? el('p', '', ['No. 1 pick: ', kit(team(card.firstPick.teamId)), ` ${card.firstPick.player}`]) : '',
        ];
      case 'stat_leaders': {
        // ASSISTS, STOPS or KEEPERS (Task 278n), drawn like TOP SCORERS; keepers with their save percentage. No word beside
        // the total: the heading says what it counts (Tom, 2026-10-18).
        const none = { assists: 'No assists yet', stops: 'No stops yet', keepers: 'No saves yet' }[card.stat];
        if (card.rows.length === 0) return [el('h3', '', [card.title]), el('p', 'card-note', [none])];
        return [el('h3', '', [card.title]), grid('1.2em 0.6em 1fr auto 2em', card.rows.flatMap((r, i) => [
          cell('m', String(i + 1)), kit(team(r.teamId)), el('span', '', [`${r.name} `, el('span', 'muted', [team(r.teamId).abbr])]),
          r.pct !== null ? cell('m r', `${r.pct}% saved`) : '', cell('hi r', String(r.value)),
        ]))];
      }
      case 'head_to_head': {
        if (!card.home || !card.away || !card.fixture) return [el('h3', '', [card.title]), el('p', 'card-note', ['No match to come this season.'])];
        const { home, away } = card;
        const place = (/** @type {typeof home} */ s) => (s.position ? `${ordinal(s.position)} · ${s.points} pts` : 'No games yet');
        return [el('h3', '', [card.title]), grid('1fr 0.6em 3.4em 0.6em 1fr', [
          cell('r', team(home.teamId).name), kit(team(home.teamId)), cell('m c', 'v'), kit(team(away.teamId)), el('span', '', [team(away.teamId).name]),
          cell('m r', place(home)), '', cell('m c', 'TABLE'), '', cell('m', place(away)),
          el('span', 'r', [chips(home.form)]), '', cell('m c', 'FORM'), '', chips(away.form),
          el('div', 'card-cut quiet'),
          ...(card.meetings.length === 0
            ? [cell('m r', 'First meeting'), '', cell('m c', 'NEXT'), '', cell('m', formatTime(card.fixture.kickoff))]
            : card.meetings.flatMap((m) => [
              cell('r', team(m.homeId).shortName), kit(team(m.homeId)), cell('hi c', `${m.homeGoals}-${m.awayGoals}`), kit(team(m.awayId)), el('span', '', [team(m.awayId).shortName, el('span', 'muted', [`  S${m.season}${m.stage === 'regular' ? '' : ` ${m.stage === 'final' ? 'final' : 'semi'}`}`])]),
            ])),
        ])];
      }
      // The eleven from Tom's note 11 (moreCards.js; his picks on newcards.html, rounds 2 and 3).
      case 'last_season': {
        const cells = [cell('', ''), cell('', ''), cell('', ''), cell('m r', 'W-D-L'), cell('m r', 'GD'), cell('m r', 'PTS'), cell('', '')];
        card.rows.forEach((r, i) => {
          if (i === card.cut) cells.push(el('div', 'card-cut'));
          const big = r.marks.includes('CUP') || r.marks.includes('PENNANT');
          cells.push(cell('m', String(r.position)), kit(team(r.teamId)), cell('', team(r.teamId).shortName),
            cell('m r', `${r.won}-${r.drawn}-${r.lost}`), cell('m r', signed(r.gd)), cell('hi r', String(r.points)), cell(big ? 'honour' : 'm', r.marks));
        });
        // The table wider than the awards, the gaps tighter, so a long name with CUP · PENNANT fits (Stormcrows checked).
        const blocks = el('div', 'card-blocks tight', [
          el('div', '', [el('h4', '', ['FINAL TABLE']), grid('1.2em 0.6em auto auto auto 2em 1fr', cells)]),
          el('div', '', [el('h4', '', ['AWARDS']), grid('auto 0.6em 1fr', card.awards.flatMap((a) => [cell('m', a.name), kit(team(a.teamId)), cell('', a.player)]))]),
        ]);
        return [el('h3', '', [card.title]), blocks];
      }
      case 'roll_of_honour':
        return [el('h3', '', [card.title]), grid('auto 0.6em 1fr 0.6em 1fr 0.6em 1fr', [
          cell('', ''), cell('', ''), cell('honour', 'CUP'), cell('', ''), cell('m', 'RUNNERS-UP'), cell('', ''), cell('m', 'PENNANT'),
          ...card.rows.flatMap((r) => [cell('m', `S${r.season}`), kit(team(r.championId)), cell('hi', team(r.championId).shortName),
            kit(team(r.runnerUpId)), cell('', team(r.runnerUpId).shortName), kit(team(r.shieldId)), cell('', team(r.shieldId).shortName)]),
        ]), ...(card.most ? [el('p', 'card-note', [`MOST CUPS: ${card.most.teamIds.map((id) => team(id).shortName.toUpperCase()).join(' AND ')}, ${card.most.cups}${card.most.teamIds.length > 1 ? ' EACH' : ''}`])] : [])];
      case 'biggest_wins':
        return [el('h3', '', [card.title]), grid('4em 0.6em 1fr 4em 0.6em 1fr', card.rows.flatMap((r) => {
          const homeWon = r.homeGoals > r.awayGoals;
          return [cell('m', `ROUND ${r.round}`), kit(team(r.homeId)), cell(homeWon ? 'hi' : '', team(r.homeId).shortName), cell('c', `${r.homeGoals}-${r.awayGoals}`), kit(team(r.awayId)), cell(homeWon ? '' : 'hi', team(r.awayId).shortName)];
        }))];
      case 'scorchers': {
        // The top two above, the teams in two columns of four beneath (Tom, 2026-10-20).
        const half = Math.ceil(card.teams.length / 2);
        const teams = (/** @type {typeof card.teams} */ rows) => grid('0.6em 1fr 2.4em 2.4em', [cell('', ''), cell('', ''), cell('m r', 'FOR'), cell('m r', 'AGST'),
          ...rows.flatMap((r) => [kit(team(r.teamId)), cell('', team(r.teamId).shortName), cell('hi r', String(r.scorchers)), cell('r', String(r.against))])]);
        return [el('h3', '', [card.title]),
          grid('0.6em auto 2.4em 1fr', card.players.flatMap((p) => [kit(team(p.teamId)), cell('', p.name), cell('hi r', String(p.scorchers)), cell('m', `SCORCHERS · ${p.goals} GOAL${p.goals === 1 ? '' : 'S'}`)])),
          el('h4', '', ['TEAMS']),
          el('div', 'card-blocks', [teams(card.teams.slice(0, half)), teams(card.teams.slice(half))])];
      }
      case 'award_race': {
        const fmt = (/** @type {string} */ award, /** @type {number} */ v) => (award === 'ironclad' ? `${Math.round(v * 100)}%` : award === 'spark' ? '' : String(v));
        return [el('h3', '', [card.title]), grid('auto 0.6em auto 2.4em 1fr 0.6em auto 2.4em', card.rows.flatMap((r) => [
          cell('m', r.name), kit(team(r.leader.teamId)), cell('', r.leader.name), cell('hi', fmt(r.award, r.leader.value)), cell('', ''),
          ...(r.second ? [kit(team(r.second.teamId)), cell('m', r.second.name), cell('m', fmt(r.award, r.second.value))] : ['', '', '']),
        ]))];
      }
      case 'records_watch':
        return [el('h3', '', [card.title]), grid('auto 0.6em auto 2.4em 1fr 2.4em 0.6em auto', [
          cell('', ''), cell('', ''), cell('m', 'THIS SEASON'), cell('', ''), cell('', ''), cell('honour', 'RECORD'), cell('', ''), cell('', ''),
          ...card.rows.flatMap((r) => [cell('m', r.words), kit(team(r.leader.teamId)), cell('', r.leader.name), cell('r', String(r.leader.value)), cell('', ''),
            cell('honour', String(r.record.value)), kit(team(r.record.teamId)), cell('', `${r.record.name} · S${r.record.season}`)]),
        ])];
      case 'rookies':
        return [el('h3', '', [card.title]),
          ...(card.outfield.length ? [grid('0.6em 1fr auto 2.4em 2.4em 2.4em', [cell('', ''), cell('', ''), cell('', ''), cell('m r', 'G'), cell('m r', 'A'), cell('m r', 'ST'),
            ...card.outfield.flatMap((r) => [kit(team(r.teamId)), cell('', r.name), cell('m', r.position), cell('hi r', String(r.goals)), cell('hi r', String(r.assists)), cell('hi r', String(r.stops))])])] : []),
          ...(card.keepers.length ? [el('h4', '', ['KEEPERS']), grid('0.6em 1fr 2.4em 2.4em', [cell('', ''), cell('', ''), cell('m r', 'SV'), cell('m r', 'SV%'),
            ...card.keepers.flatMap((r) => [kit(team(r.teamId)), cell('', r.name), cell('hi r', String(r.saves)), cell('hi r', r.pct === null ? '' : `${r.pct}%`)])])] : []),
        ];
      case 'final_table': {
        const cells = [cell('', ''), cell('', ''), cell('', ''), cell('m r', 'W-D-L'), cell('m r', 'GD'), cell('m r', 'PTS')];
        card.rows.forEach((r, i) => {
          if (i === card.cut) cells.push(el('div', 'card-cut'));
          cells.push(cell('m', String(r.position)), kit(team(r.teamId)), cell('', team(r.teamId).shortName), cell('m r', `${r.won}-${r.drawn}-${r.lost}`), cell('m r', signed(r.gd)), cell('hi r', String(r.points)));
        });
        return [el('h3', '', [card.title]), grid('1.2em 0.6em 1fr auto 2.2em 2em', cells)];
      }
      case 'playoff_stats':
        return [el('h3', '', [card.title]), el('div', 'card-blocks', card.blocks.map((b) => el('div', '', [el('h4', '', [b.title]),
          grid(b.title === 'KEEPERS' ? '0.6em 1fr auto 2em' : '0.6em 1fr 2em', b.rows.flatMap((r) => [kit(team(r.teamId)), cell('', r.name), ...(b.title === 'KEEPERS' ? [cell('m r', r.pct === null ? '' : `${r.pct}% saved`)] : []), cell('hi r', String(r.value))]))])))];
      case 'the_draft':
        return [el('h3', '', [card.title]), grid('1.4em 0.6em auto 1fr auto auto auto', card.rows.flatMap((r) => [cell('m', String(r.pick)), kit(team(r.teamId)), cell('m', team(r.teamId).abbr), cell('', r.name), cell('m', r.position), cell('m r', `AGE ${r.age}`), cell(r.role.startsWith('STAR') ? 'hi r' : 'm r', r.role)]))];
      case 'farewells':
        return [el('h3', '', [card.title]), grid('0.6em 1fr auto auto auto 1fr', card.rows.flatMap((r) => [kit(team(r.teamId)), cell('', r.name), cell('m', r.position), cell('m r', `AGE ${r.age}`), cell('hi r', `${r.seasons} SEASON${r.seasons === 1 ? '' : 'S'}`), cell('m', r.awards.join(' · '))]))];
      default:
        return [];
    }
  }

  /** A goal difference with its sign: +23, 0, -4. @param {number} n */
  const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

  /** A grid of cells, every cell its own item (empty ones too). @param {string} cols  Column widths. @param {(Node | string)[]} cells */
  function grid(cols, cells) {
    const g = el('div', 'card-grid', cells.map((c) => (typeof c === 'string' ? el('span', '', [c]) : c)));
    g.style.gridTemplateColumns = cols;
    return g;
  }
  /** @param {string} cls @param {string} text */
  function cell(cls, text) {
    return el('span', cls, [text]);
  }
  /** Last-five chips, oldest first. @param {string[]} form */
  function chips(form) {
    return el('span', 'card-chips', form.map((f) => el('span', `chip ${f}`, [f])));
  }

  return {
    /**
     * @param {Card | null} card @param {number} t
     * @param {{ glass?: boolean }} [o]  glass: over the scene (Task 102), and a new card dissolves in over the last.
     */
    show(card, t, o = {}) {
      if (!card) {
        fadeOut();
        box.hidden = true;
        box.dataset.key = '';
        kickoff = null;
        ghost?.remove();
        ghost = null;
        return;
      }
      const glass = Boolean(o.glass);
      const key = JSON.stringify(card);
      if (box.dataset.key !== key) {
        // Over the pitch, a card coming in where none was (or after the scene's glass): it fades in.
        const fade = !glass && (box.hidden || box.classList.contains('glass'));
        // One glass card to the next: the old one stays on top, fading away (cardDissolveMs).
        const ms = config.settings.transitions.cardDissolveMs;
        if (glass && !box.hidden && box.classList.contains('glass') && ms > 0) {
          ghost?.remove();
          const g = /** @type {HTMLElement} */ (box.cloneNode(true));
          g.id = 'card-ghost';
          g.style.animationDuration = `${ms}ms`;
          g.addEventListener('animationend', () => g.remove());
          box.after(g);
          ghost = g;
        }
        box.dataset.key = key;
        box.className = `overlay panel card-${card.kind}${glass ? ' glass' : ''}`;
        kickoff = null;
        box.replaceChildren(...render(card));
        box.hidden = false;
        if (fade) {
          if (box.style.visibility === 'hidden') fadePending = true;
          else fadeIn();
        }
      }
      box.hidden = false;
      // The pre-match countdown ticks every frame.
      const slot = box.querySelector('p.muted > span');
      if (kickoff !== null && slot) setText(/** @type {HTMLElement} */ (slot), countdown(kickoff - t));
    },
    /**
     * Hidden while a sweep into or out of the scene is on (Tom: the UP NEXT card sat in front of the glass lifting
     * off the studio), kept as it is so it's simply there once the sweep has passed.
     * @param {boolean} covered
     */
    cover(covered) {
      // A fade begun this frame under a sweep (the card is shown before the cover is known): it waits for the sweep.
      if (covered && fading?.playState === 'running') {
        fading.cancel();
        fading = null;
        fadePending = true;
      }
      if (!covered && fadePending && box.style.visibility === 'hidden') {
        fadePending = false;
        box.style.visibility = '';
        fadeIn();
      }
      box.style.visibility = covered ? 'hidden' : '';
      if (ghost) ghost.style.visibility = box.style.visibility;
    },
  };
}
