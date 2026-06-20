use rusqlite::Connection;

pub fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        r#"
CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL COLLATE NOCASE,
  created TEXT NOT NULL,
  updated TEXT NOT NULL,
  path TEXT NOT NULL,
  etag TEXT NOT NULL,
  preview TEXT NOT NULL DEFAULT '',
  checklist_total INTEGER NOT NULL DEFAULT 0,
  checklist_completed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS notes_title_idx ON notes(title);
CREATE INDEX IF NOT EXISTS notes_title_nocase_idx ON notes(title COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS links (
  from_id TEXT NOT NULL,
  to_id TEXT,
  to_title TEXT,
  kind TEXT NOT NULL,
  PRIMARY KEY (from_id, to_id, to_title, kind)
);

CREATE INDEX IF NOT EXISTS links_to_id_idx ON links(to_id);

CREATE TABLE IF NOT EXISTS note_relationships (
  from_id TEXT NOT NULL,
  field_key TEXT NOT NULL,
  to_id TEXT,
  to_title TEXT,
  target_title TEXT NOT NULL,
  ordinal INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (from_id, field_key, target_title, ordinal)
);

CREATE INDEX IF NOT EXISTS note_relationships_from_idx ON note_relationships(from_id);
CREATE INDEX IF NOT EXISTS note_relationships_to_id_idx ON note_relationships(to_id);
CREATE INDEX IF NOT EXISTS note_relationships_to_title_idx ON note_relationships(to_title);

CREATE TABLE IF NOT EXISTS tags (
  note_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  is_explicit INTEGER NOT NULL DEFAULT 0 CHECK (is_explicit IN (0,1)),
  PRIMARY KEY (note_id, tag)
);

CREATE INDEX IF NOT EXISTS tags_tag_idx ON tags(tag);

CREATE TABLE IF NOT EXISTS note_properties (
  note_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value_type TEXT NOT NULL,
  value_text TEXT NOT NULL,
  value_json TEXT NOT NULL,
  ordinal INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (note_id, key)
);

CREATE INDEX IF NOT EXISTS note_properties_key_idx ON note_properties(key);
CREATE INDEX IF NOT EXISTS note_properties_lookup_idx ON note_properties(key, value_text);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  tokenize = 'porter'
);

CREATE TABLE IF NOT EXISTS indexed_files (
  path TEXT PRIMARY KEY,
  modified_ns INTEGER NOT NULL,
  size INTEGER NOT NULL
);
"#,
    )
    .map_err(|e| e.to_string())
}
