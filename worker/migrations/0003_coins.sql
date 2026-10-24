-- Fan Coins, version 2 (Tom, 2026-10-17; docs/channel.md §29.6; src/channel/coinRules.js): coins banked with the
-- service, spends shared with everyone watching. A viewer is a random id the browser keeps (no accounts); a household
-- is a salted hash of the connection (as for votes), never the address.

-- A viewer's coins. credited: the moment (ms) their banking has reached, a minute on for each coin banked.
CREATE TABLE wallets (
  viewer TEXT PRIMARY KEY,
  household TEXT NOT NULL,
  balance INTEGER NOT NULL DEFAULT 0,
  credited INTEGER NOT NULL,
  first_at TEXT NOT NULL
);

-- What each household has banked on a viewer's day, against the daily cap.
CREATE TABLE earnings (
  household TEXT NOT NULL,
  day TEXT NOT NULL,
  coins INTEGER NOT NULL,
  PRIMARY KEY (household, day)
);

-- Every spend, kept (a match's chants, flags and shouts can be shown again on its re-airs later). One spend a slot in
-- each queue: a second taking the same slot at the same moment is refused, not doubled.
CREATE TABLE spends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  viewer TEXT NOT NULL,
  household TEXT NOT NULL,
  kind TEXT NOT NULL,
  queue TEXT NOT NULL,
  slot INTEGER NOT NULL,
  side TEXT,
  choice TEXT NOT NULL,
  player TEXT,
  match TEXT,
  starts INTEGER NOT NULL,
  until INTEGER NOT NULL,
  at TEXT NOT NULL,
  UNIQUE (queue, slot)
);
CREATE INDEX spends_by_until ON spends (until);
CREATE INDEX spends_by_queue ON spends (queue, until);
CREATE INDEX spends_by_viewer ON spends (viewer, kind, until);
CREATE INDEX spends_by_match ON spends (match);
