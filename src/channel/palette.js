// The channel's colours: one source for the canvas and the CSS overlays (applied as CSS variables at boot).
// Bright, saturated turf and high-contrast panels (vision §11). Team colours come from data/teams.json.

/**
 * A trial accent (Task 277d, accent.html): ?accent=rrggbb on the dev server only (localhost), before the palette is
 * frozen, so the canvas and the CSS both take it. Elsewhere, or in Node, null.
 */
const trialAccent = (() => {
  if (typeof location !== 'object' || !/^(localhost|127.0.0.1|[::1])$/.test(location.hostname)) return null;
  const hex = new URLSearchParams(location.search).get('accent');
  return hex && /^[0-9a-f]{6}$/i.test(hex) ? `#${hex.toLowerCase()}` : null;
})();

export const PALETTE = Object.freeze({
  // Screen
  backdrop: '#0b0c10',  // letterbox bars
  // Pitch
  turf: '#3fae4a',
  turfStripe: '#37a042',
  line: '#e9f5e1',
  board: '#2b2f3a',
  boardTop: '#4a5060',
  crease: '#d8f0d0',
  boardSide: '#e6eaf0',  // the side boards, hockey style: white with a yellow kick plate along the turf
  kickPlate: '#f2c230',
  cone: '#f07a1a',       // training cones by the dugouts (Task 69)
  dugout: '#1d2230',
  dugoutSeat: '#4a5468',  // the bench plank and its legs (Task 44)
  dugoutLip: '#353d50',   // the dugout's front edge
  netBack: '#1f4f28',     // inside the net, in shadow
  net: '#f4f7fb',         // the net's white mesh and frame (Task 44)
  apron: '#2c7d37',     // darker turf round the boards, under the dugouts
  tunnel: '#0d1016',     // inside the tunnel, toward the back (Task 46)
  tunnelWall: '#2b2f3a', // the tunnel's side walls and roof
  suit: '#1a1c22',       // the managers' black suits (Task 48)
  tracksuit: '#2a2f3a',  // the injured's training wear in the dugout, trimmed in the team's main colour (Task 185, Tom's pick B)
  stand: '#262a33',      // the stands' concrete (Broadcast mode, Task 54)
  standStep: '#1b1e25',  // the edge of each terrace step
  // The floodlights in Broadcast's stands' corners (Tom's note 14): their concrete mounts, the lamps off and on.
  mount: '#3b404b',
  mountRib: '#323641',
  mountEdge: '#4a5060',
  mountStair: '#262a33',
  mountFrame: '#14161c',
  lampOff: '#5b6170',
  lampDusk: '#ffe9b0',
  lampNight: '#fffbe6',
  staffVest: '#d8f03c',  // the groundstaff's hi-vis (AROUND THE GROUNDS)
  // Players: keepers wear a fixed contrasting kit (channel.md §9); a few skin tones, seeded per player.
  keeperHome: '#c6f03c',
  keeperAway: '#ff7ac8',
  skin1: '#f1c7a1',
  skin2: '#d9a07a',
  skin3: '#a96f4c',
  skin4: '#6e4630',
  // Broadcast panels
  panel: '#151924',
  panelEdge: '#2c3345',
  panelInk: '#f2efe6',
  panelMuted: '#9aa1b2',
  accent: trialAccent ?? '#ff8f1c',    // channel highlight (ticker tag, active row, pane heads, tooltips); Task 277d, Tom's pick B (was #ffb627)
  live: '#e8392f',
  replay: '#3a7bd5',
  // Gold is Fan Coins' alone (docs/colours.md; Tom, 2026-10-21), its own token though the heat ball's heatWarm is the
  // same hex. The world's gold (the Cup, the final's boards, the lift) is playoffArt.js's GOLD.
  gold: '#ffd23f',
  goldShade: '#b88a10',
  well: '#0d1016',     // the dark well under boxes, slots and bars
  chipInk: '#1a1d26',  // dark text on light chips, paper and bubbles
  good: '#5fd35f',     // a win (the W chip)
  // A change's kind (the moves board, the booth's table): up, down, aside (called up, the Kindling League)
  up: '#7ddc6a',
  down: '#ff6b5e',
  aside: '#8fd3ff',
  // The scene between matches (Task 96): the light bars on deep blue
  sceneTop: '#10204a',
  sceneBottom: '#04070f',
  sceneBar: '#5a96ff',
  sceneEdge: '#aad7ff',
  sceneRun: '#ffd678',
  sceneSparkle: '#cfe6ff',
  // The heat ball (sport.md §8)
  heatCool: '#ffffff',
  heatWarm: '#ffd23f',
  heatOrange: '#ff8a1f',
  heatHot: '#ff3b1f',
  heatBurn: '#fff6c8',
  ballEdge: '#111111',
});

/** Apply the palette as CSS variables (--backdrop, --turf, --panel-ink, ...) on an element. @param {HTMLElement} el */
export function applyPalette(el) {
  for (const [name, value] of Object.entries(PALETTE)) {
    el.style.setProperty(`--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, value);
  }
}
