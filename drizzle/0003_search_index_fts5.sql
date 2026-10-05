-- Hand-written migration: FTS5 virtual table for full-text search (design D10).
-- Drizzle cannot model virtual tables, so this is managed manually.
--
-- One row per non-purged entity. `entity_id` and `type` are UNINDEXED because
-- they are used only for joins / filters, not for text matching.
-- `tokenize='unicode61 remove_diacritics 2'` normalises accented characters.
CREATE VIRTUAL TABLE `search_index` USING fts5(
  entity_id UNINDEXED,
  type UNINDEXED,
  title,
  body,
  tokenize='unicode61 remove_diacritics 2'
);
