CREATE VIRTUAL TABLE IF NOT EXISTS titles_fts
USING fts5(
  title,
  original_title,
  content='titles',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 2'
);

CREATE TRIGGER IF NOT EXISTS titles_fts_after_insert
AFTER INSERT ON titles
BEGIN
  INSERT INTO titles_fts(
    rowid,
    title,
    original_title
  )
  VALUES (
    new.rowid,
    new.title,
    new.original_title
  );
END;

CREATE TRIGGER IF NOT EXISTS titles_fts_after_delete
AFTER DELETE ON titles
BEGIN
  INSERT INTO titles_fts(
    titles_fts,
    rowid,
    title,
    original_title
  )
  VALUES (
    'delete',
    old.rowid,
    old.title,
    old.original_title
  );
END;

CREATE TRIGGER IF NOT EXISTS titles_fts_after_update
AFTER UPDATE ON titles
BEGIN
  INSERT INTO titles_fts(
    titles_fts,
    rowid,
    title,
    original_title
  )
  VALUES (
    'delete',
    old.rowid,
    old.title,
    old.original_title
  );

  INSERT INTO titles_fts(
    rowid,
    title,
    original_title
  )
  VALUES (
    new.rowid,
    new.title,
    new.original_title
  );
END;

INSERT INTO titles_fts(
  titles_fts
)
VALUES (
  'rebuild'
);

CREATE INDEX IF NOT EXISTS idx_titles_catalog_v2
ON titles(
  status,
  category,
  featured DESC,
  updated_at DESC,
  created_at DESC
);

PRAGMA optimize;
