use std::env;
use std::fs;
use std::path::Path;

fn read_dotenv_value(path: &Path, key: &str) -> Option<String> {
    let contents = fs::read_to_string(path).ok()?;
    for line in contents.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let (entry_key, raw_value) = trimmed.split_once('=')?;
        if entry_key.trim() != key {
            continue;
        }
        return Some(
            raw_value
                .trim()
                .trim_matches('"')
                .trim_matches('\'')
                .to_string(),
        );
    }
    None
}

fn main() {
    println!("cargo:rerun-if-env-changed=GLYPH_DEV_FORCE_LICENSED");
    println!("cargo:rerun-if-env-changed=GLYPH_DEV_FORCE_TRIAL");
    println!("cargo:rerun-if-changed=.env");
    println!("cargo:rerun-if-changed=.env.local");

    let dev_force_licensed = env::var("GLYPH_DEV_FORCE_LICENSED")
        .ok()
        .or_else(|| read_dotenv_value(Path::new(".env.local"), "GLYPH_DEV_FORCE_LICENSED"))
        .or_else(|| read_dotenv_value(Path::new(".env"), "GLYPH_DEV_FORCE_LICENSED"));
    let dev_force_trial = env::var("GLYPH_DEV_FORCE_TRIAL")
        .ok()
        .or_else(|| read_dotenv_value(Path::new(".env.local"), "GLYPH_DEV_FORCE_TRIAL"))
        .or_else(|| read_dotenv_value(Path::new(".env"), "GLYPH_DEV_FORCE_TRIAL"));

    if let Some(value) = dev_force_licensed {
        println!("cargo:rustc-env=GLYPH_DEV_FORCE_LICENSED={value}");
    }
    if let Some(value) = dev_force_trial {
        println!("cargo:rustc-env=GLYPH_DEV_FORCE_TRIAL={value}");
    }

    tauri_build::build()
}
