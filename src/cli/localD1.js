// A D1-shaped database over Node's own SQLite (Fan Coins version 2, 2026-10-17): the dev server runs the audience
// service's own code against it (worker/coins.js), and the tests use it in memory, so both behave as the hosted service.
// The service's migrations (worker/migrations/) are applied in order, each once.
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const MIGRATIONS = new URL('../../worker/migrations/', import.meta.url);

/**
 * @param {string} [file]  Where the database is kept (':memory:' by default).
 * @returns {{ prepare: (sql: string) => any, db: DatabaseSync }}
 */
export function localD1(file = ':memory:') {
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY)');
  const done = new Set(db.prepare('SELECT name FROM _migrations').all().map((r) => String(r.name)));
  for (const name of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(name)) continue;
    db.exec(readFileSync(new URL(name, MIGRATIONS), 'utf8'));
    db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(name);
  }
  /** @param {string} sql */
  const prepare = (sql) => {
    const stmt = db.prepare(sql);
    /** @param {any[]} args */
    const bound = (args) => ({
      run: async () => ({ meta: { changes: Number(stmt.run(...args).changes) } }),
      first: async () => stmt.get(...args) ?? null,
      all: async () => ({ results: stmt.all(...args) }),
    });
    return { bind: (/** @type {any[]} */ ...args) => bound(args), ...bound([]) };
  };
  return { prepare, db };
}
