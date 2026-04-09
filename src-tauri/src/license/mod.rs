pub mod commands;
pub mod service;
pub mod store;
pub mod types;

pub const DEFAULT_GUMROAD_PRODUCT_ID: &str = "jfc0rwnuPw7VuqCyw5ctTw==";
pub const DEFAULT_GUMROAD_PRODUCT_URL: &str = "https://karatsidhu.gumroad.com/l/sqxfay";
pub const DEFAULT_SUPPORT_URL: &str = "https://github.com/SidhuK/Glyph/issues";
pub const TRIAL_DURATION_MS: u64 = 7 * 24 * 60 * 60 * 1000;

fn env_flag_enabled(value: Option<&str>) -> bool {
    matches!(
        value.map(str::trim),
        Some("1") | Some("true") | Some("TRUE") | Some("yes") | Some("YES")
    )
}

pub fn is_official_build() -> bool {
    env_flag_enabled(option_env!("GLYPH_OFFICIAL_BUILD"))
}

pub fn is_dev_force_licensed() -> bool {
    cfg!(debug_assertions) && env_flag_enabled(option_env!("GLYPH_DEV_FORCE_LICENSED"))
}

pub fn gumroad_product_id() -> &'static str {
    option_env!("GLYPH_GUMROAD_PRODUCT_ID")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_GUMROAD_PRODUCT_ID)
}

pub fn gumroad_product_url() -> &'static str {
    option_env!("GLYPH_GUMROAD_PRODUCT_URL")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_GUMROAD_PRODUCT_URL)
}

pub fn support_url() -> &'static str {
    option_env!("GLYPH_SUPPORT_URL")
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(DEFAULT_SUPPORT_URL)
}
