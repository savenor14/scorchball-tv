-- The audience service's database (the launch, Task 276; docs/live.md §7): Cloudflare D1, SQLite.
-- A voter is a salted hash of the connection's address (the salt a secret), never the address itself.

-- One vote per connection per poll: a second is ignored, not counted.
CREATE TABLE votes (
  poll_id TEXT NOT NULL,
  voter TEXT NOT NULL,
  option_id TEXT NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (poll_id, voter)
);

CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  text TEXT NOT NULL,
  on_air TEXT NOT NULL,
  voter TEXT NOT NULL
);

-- A connection's notes, for the rate limit.
CREATE INDEX notes_by_voter ON notes (voter, at);
