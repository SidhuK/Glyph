pub mod calendar;
pub mod checklists;
pub mod commands;
pub(crate) mod db;
mod frontmatter;
mod helpers;
mod indexer;
mod links;
pub(crate) mod paths;
mod properties;
mod relationships;
pub(crate) mod schema;
pub(crate) mod search_advanced;
mod search_hybrid;
mod search_matches;
pub(crate) mod tags;
mod types;
pub(crate) mod unlinked_mentions;

pub use db::open_db;
#[cfg(test)]
pub(crate) use indexer::people_mentions_as_tags_test_lock;
pub use indexer::{
    index_note, people_mentions_as_tags_enabled, remove_note, set_people_mentions_as_tags_enabled,
};
pub(crate) use indexer::{index_note_with_conn, remove_note_with_conn};
