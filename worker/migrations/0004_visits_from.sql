-- Where a visit came in (getting the word out, docs/launch-plan.md, 2026-10-22): the tag on the link it was opened by
-- (?from=hn), 1–16 lower-case letters, digits or dashes, or null for a visit that came another way. Kept from the
-- visit's first hello that carries one; nothing about the viewer.
ALTER TABLE visits ADD COLUMN came_from TEXT;
