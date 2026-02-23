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
  preview TEXT NOT NULL DEFAULT ''
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

CREATE TABLE IF NOT EXISTS tags (
  note_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  PRIMARY KEY (note_id, tag)
);

CREATE INDEX IF NOT EXISTS tags_tag_idx ON tags(tag);

CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  id UNINDEXED,
  title,
  body,
  tokenize = 'porter'
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL,
  note_path TEXT NOT NULL,
  line_start INTEGER NOT NULL,
  line_end INTEGER NOT NULL,
  list_path TEXT NOT NULL,
  indent INTEGER NOT NULL DEFAULT 0,
  raw_text TEXT NOT NULL,
  text_norm TEXT NOT NULL,
  checked INTEGER NOT NULL CHECK (checked IN (0,1)),
  status TEXT NOT NULL CHECK (status IN ('todo','in_progress','done','cancelled')),
  priority INTEGER NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 4),
  due_date TEXT,
  scheduled_date TEXT,
  start_date TEXT,
  completed_at TEXT,
  recurrence_rule TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  project TEXT,
  section TEXT,
  source_hash TEXT NOT NULL,
  note_etag TEXT NOT NULL,
  note_updated TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS tasks_note_loc_uidx
ON tasks(note_id, list_path, line_start);

CREATE INDEX IF NOT EXISTS tasks_bucket_idx
ON tasks(checked, scheduled_date, due_date, priority, note_updated DESC);

CREATE INDEX IF NOT EXISTS tasks_note_idx ON tasks(note_id);
CREATE INDEX IF NOT EXISTS tasks_schedule_idx ON tasks(scheduled_date);
CREATE INDEX IF NOT EXISTS tasks_due_idx ON tasks(due_date);

CREATE VIRTUAL TABLE IF NOT EXISTS tasks_fts USING fts5(
  task_id UNINDEXED,
  text,
  tags,
  project,
  tokenize = 'porter'
);
"#,
    )
    .map_err(|e| e.to_string())
}
