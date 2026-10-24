// Team crests (Task 165; src/channel/crests.js): every team's icon is drawn, each icon is a 9 × 9 grid, and a crest
// stays inside its size at every scale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centreIcon, CREST_ICONS, crestSize, drawCrest } from '../src/channel/crests.js';
import { loadConfigFromDisk } from '../src/cli/loadConfigFromDisk.js';

const config = await loadConfigFromDisk();

test('every team has its crest icon, each a 9 × 9 grid', () => {
  for (const t of config.teams.teams) assert.ok(CREST_ICONS[t.crest.icon], `${t.id}: no icon "${t.crest.icon}"`);
  for (const [name, rows] of Object.entries(CREST_ICONS)) {
    assert.equal(rows.length, 9, name);
    for (const r of rows) assert.match(r, /^[.#]{9}$/, name);
  }
});

test('a crest is drawn within its size, in every style and at scales 1 and 2', () => {
  for (const t of config.teams.teams) {
    for (const style of /** @type {const} */ (['flat', 'shaded', 'banded'])) {
      for (const scale of [1, 2]) {
        const { w, h } = crestSize(scale);
        let n = 0;
        const ctx = /** @type {any} */ ({ fillStyle: '', fillRect(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ cw, /** @type {number} */ ch) {
          n++;
          assert.ok(x >= 0 && y >= 0 && x + cw <= w && y + ch <= h, `${t.id} ${style} x${scale}: ${x},${y} outside ${w}×${h}`);
        } });
        drawCrest(ctx, 0, 0, t, { style, scale });
        assert.ok(n > 100, `${t.id} ${style}: drawn`);
      }
    }
  }
});

test('the centre circle\'s icon (Task 166): in the second colour, centred on the spot, inside the circle', () => {
  for (const t of config.teams.teams) {
    /** @type {number[][]} */
    const cells = [];
    const ctx = /** @type {any} */ ({ fillStyle: '', fillRect(/** @type {number} */ x, /** @type {number} */ y, /** @type {number} */ w, /** @type {number} */ h) {
      assert.equal(this.fillStyle, t.colours.secondary, t.id);
      cells.push([x, y, x + w, y + h]);
    } });
    centreIcon(t)(ctx, 197, 135);
    const left = Math.min(...cells.map((c) => c[0]));
    const right = Math.max(...cells.map((c) => c[2]));
    const top = Math.min(...cells.map((c) => c[1]));
    const bottom = Math.max(...cells.map((c) => c[3]));
    // Centred to within a cell (3 px), and within the 22 px circle.
    assert.ok(Math.abs((left + right) / 2 - 197.5) <= 1.5 && Math.abs((top + bottom) / 2 - 135.5) <= 1.5, `${t.id}: centred`);
    for (const [x0, y0, x1, y1] of cells) for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) assert.ok(Math.hypot(x - 197.5, y - 135.5) <= 22, `${t.id}: inside`);
  }
});
