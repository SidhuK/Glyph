use serde::Serialize;

#[derive(Serialize)]
pub struct FsEntry {
    pub name: String,
    pub rel_path: String,
    pub kind: String,
    pub is_markdown: bool,
}

#[derive(Serialize)]
pub struct TextFileDoc {
    pub rel_path: String,
    pub text: String,
    pub etag: String,
    pub mtime_ms: u64,
}

#[derive(Serialize)]
pub struct TextFileWriteResult {
    pub etag: String,
    pub mtime_ms: u64,
}

#[derive(Serialize, Clone)]
pub struct RecentMarkdown {
    pub rel_path: String,
    pub name: String,
    pub mtime_ms: u64,
}

#[derive(Serialize)]
pub struct DirChildSummary {
    pub dir_rel_path: String,
    pub name: String,
    pub total_files_recursive: u32,
    pub total_markdown_recursive: u32,
    pub recent_markdown: Vec<RecentMarkdown>,
    pub truncated: bool,
}

#[derive(Serialize, Clone)]
pub struct RecentEntry {
    pub rel_path: String,
    pub name: String,
    pub is_markdown: bool,
    pub mtime_ms: u64,
}

#[derive(Serialize)]
pub struct TextFileDocBatch {
    pub rel_path: String,
    pub text: Option<String>,
    pub etag: Option<String>,
    pub mtime_ms: u64,
    pub error: Option<String>,
}
