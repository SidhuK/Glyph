use serde::Serialize;

#[derive(Serialize)]
pub struct NoteMeta {
    pub id: String,
    pub title: String,
    pub created: String,
    pub updated: String,
}

#[derive(Serialize)]
pub struct NoteDoc {
    pub meta: NoteMeta,
    pub markdown: String,
    pub etag: String,
    pub mtime_ms: u64,
}

#[derive(Serialize)]
pub struct NoteWriteResult {
    pub meta: NoteMeta,
    pub etag: String,
    pub mtime_ms: u64,
}

#[derive(Serialize)]
pub struct AttachmentResult {
    pub asset_rel_path: String,
    pub markdown: String,
}
