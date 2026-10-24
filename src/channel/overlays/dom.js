// Small DOM helpers shared by the overlays.

/** @param {string} id */
export const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Set text only when it changes, so the frame loop doesn't touch the DOM needlessly. @param {HTMLElement} el @param {string} text */
export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

/**
 * Create an element with an optional class and children.
 * @param {string} tag @param {string} [cls] @param {(Node | string)[]} [children]
 */
export function el(tag, cls = '', children = []) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  node.append(...children);
  return node;
}

/** A kit swatch in a team's colours. @param {{ colours: { primary: string, secondary: string } }} team @param {string} [cls] */
export function kit(team, cls = 'kit') {
  const span = el('span', cls);
  span.style.background = team.colours.primary;
  span.style.setProperty('--kit2', team.colours.secondary);
  return span;
}

/** "1d 4h", "2h 05m", "4m 09s". @param {number} ms */
export function countdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const [d, h, m] = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60];
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Game clock as mm:ss. @param {number} seconds */
export const mmss = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
