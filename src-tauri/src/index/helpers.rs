use std::ffi::OsStr;

pub use crate::utils::{sha256_hex, to_slash as path_to_slash_string};

pub fn should_skip_entry(name: &OsStr) -> bool {
    name.to_string_lossy().starts_with('.')
}
