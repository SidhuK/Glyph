use crate::license::{gumroad_product_url, is_official_build, support_url, TRIAL_DURATION_MS};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LicenseMode {
    CommunityBuild,
    Licensed,
    TrialActive,
    TrialExpired,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LicenseStatus {
    pub mode: LicenseMode,
    pub can_use_app: bool,
    pub is_official_build: bool,
    pub purchase_url: String,
    pub support_url: String,
    #[serde(default)]
    pub trial_started_at_ms: Option<u64>,
    #[serde(default)]
    pub trial_expires_at_ms: Option<u64>,
    #[serde(default)]
    pub trial_remaining_seconds: Option<u64>,
    #[serde(default)]
    pub activated_at_ms: Option<u64>,
    #[serde(default)]
    pub license_key_masked: Option<String>,
    #[serde(default)]
    pub error_code: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LicenseActivateResult {
    pub status: LicenseStatus,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
pub struct LicenseRecord {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub trial_started_at_ms: Option<u64>,
    #[serde(default)]
    pub trial_expires_at_ms: Option<u64>,
    #[serde(default)]
    pub licensed: bool,
    #[serde(default)]
    pub activated_at_ms: Option<u64>,
    #[serde(default)]
    pub license_key_masked: Option<String>,
    #[serde(default)]
    pub license_key_hash: Option<String>,
    #[serde(default)]
    pub last_verified_at_ms: Option<u64>,
    #[serde(default)]
    pub last_error_code: Option<String>,
}

fn default_version() -> u32 {
    1
}

pub fn normalize_license_key(raw: &str) -> Result<String, String> {
    let normalized: String = raw
        .trim()
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>()
        .to_ascii_uppercase();

    if normalized.is_empty() {
        return Err("Enter a license key to continue.".to_string());
    }

    Ok(normalized)
}

pub fn mask_license_key(license_key: &str) -> String {
    let trimmed = license_key.trim();
    if trimmed.len() <= 8 {
        return "****".to_string();
    }
    let prefix = &trimmed[..4];
    let suffix = &trimmed[trimmed.len() - 4..];
    format!("{prefix}-****-{suffix}")
}

pub fn hash_license_key(license_key: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(license_key.as_bytes());
    format!("sha256:{}", hex::encode(hasher.finalize()))
}

pub fn ensure_trial_window(record: &mut LicenseRecord, started_at_ms: u64) -> bool {
    if record.trial_started_at_ms.is_some() && record.trial_expires_at_ms.is_some() {
        return false;
    }

    record.version = 1;
    record.trial_started_at_ms = Some(started_at_ms);
    record.trial_expires_at_ms = Some(started_at_ms.saturating_add(TRIAL_DURATION_MS));
    true
}

pub fn ensure_trial_window_from_activation(record: &mut LicenseRecord, fallback_now_ms: u64) -> bool {
    let base = record.activated_at_ms.unwrap_or(fallback_now_ms);
    ensure_trial_window(record, base)
}

pub fn build_status(record: &LicenseRecord, now_ms: u64) -> LicenseStatus {
    if !is_official_build() {
        return LicenseStatus {
            mode: LicenseMode::CommunityBuild,
            can_use_app: true,
            is_official_build: false,
            purchase_url: gumroad_product_url().to_string(),
            support_url: support_url().to_string(),
            trial_started_at_ms: None,
            trial_expires_at_ms: None,
            trial_remaining_seconds: None,
            activated_at_ms: None,
            license_key_masked: None,
            error_code: None,
        };
    }

    if record.licensed {
        return LicenseStatus {
            mode: LicenseMode::Licensed,
            can_use_app: true,
            is_official_build: true,
            purchase_url: gumroad_product_url().to_string(),
            support_url: support_url().to_string(),
            trial_started_at_ms: record.trial_started_at_ms,
            trial_expires_at_ms: record.trial_expires_at_ms,
            trial_remaining_seconds: None,
            activated_at_ms: record.activated_at_ms,
            license_key_masked: record.license_key_masked.clone(),
            error_code: record.last_error_code.clone(),
        };
    }

    let trial_expires_at_ms = record.trial_expires_at_ms;
    let trial_started_at_ms = record.trial_started_at_ms;
    let trial_remaining_seconds = trial_expires_at_ms.map(|expires_at_ms| {
        expires_at_ms
            .saturating_sub(now_ms)
            .saturating_add(999)
            .checked_div(1000)
            .unwrap_or(0)
    });

    let mode = match trial_expires_at_ms {
        Some(expires_at_ms) if expires_at_ms > now_ms => LicenseMode::TrialActive,
        _ => LicenseMode::TrialExpired,
    };

    LicenseStatus {
        mode,
        can_use_app: matches!(mode, LicenseMode::TrialActive),
        is_official_build: true,
        purchase_url: gumroad_product_url().to_string(),
        support_url: support_url().to_string(),
        trial_started_at_ms,
        trial_expires_at_ms,
        trial_remaining_seconds: if matches!(mode, LicenseMode::TrialActive) {
            trial_remaining_seconds
        } else {
            Some(0)
        },
        activated_at_ms: None,
        license_key_masked: None,
        error_code: record.last_error_code.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_license_keys() {
        let normalized =
            normalize_license_key(" 38b1a8b4-9ae64752-ae8c53e8-08ba26eb \n").unwrap();
        assert_eq!(normalized, "38B1A8B4-9AE64752-AE8C53E8-08BA26EB");
    }

    #[test]
    fn creates_trial_window_once() {
        let mut record = LicenseRecord::default();
        assert!(ensure_trial_window(&mut record, 1_000));
        assert_eq!(record.trial_started_at_ms, Some(1_000));
        assert_eq!(record.trial_expires_at_ms, Some(1_000 + TRIAL_DURATION_MS));
        assert!(!ensure_trial_window(&mut record, 2_000));
        assert_eq!(record.trial_started_at_ms, Some(1_000));
    }

    #[test]
    fn masks_license_key() {
        assert_eq!(
            mask_license_key("38B1A8B4-9AE64752-AE8C53E8-08BA26EB"),
            "38B1-****-26EB"
        );
    }
}
