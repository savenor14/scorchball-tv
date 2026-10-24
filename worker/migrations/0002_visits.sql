-- Viewers (Task 277e; docs/live.md §7): the channel says hello as it starts and every few minutes while it's showing.
-- One row a visit (a page load's random id), its viewer a salted hash of the connection (as a voter), first and last
-- seen. Never the address. Read by the Director's desk; visits over 60 days old are swept as it reads them.
CREATE TABLE visits (
  session TEXT PRIMARY KEY,
  viewer TEXT NOT NULL,
  first_at TEXT NOT NULL,
  last_at TEXT NOT NULL
);
