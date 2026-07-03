pub(crate) mod paths;
pub mod calendar;
pub mod checklists;
pub mod commands;
pub(crate) mod db;
mod frontmatter;
mod helpers;
mod indexer;
mod links;
mod properties;
mod relationships;
pub(crate) mod schema;
pub(crate) mod search_advanced;
mod search_hybrid;
pub(crate) mod tags;
mod types;

pub use db::open_db;
#[cfg(test)]
pub(crate) use indexer::people_mentions_as_tags_test_lock;
pub use indexer::{
    index_note, people_mentions_as_tags_enabled, remove_note, set_people_mentions_as_tags_enabled,
};
