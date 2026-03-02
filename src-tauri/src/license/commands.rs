use tauri::AppHandle;
use tracing::error;

use super::service::verify_license_key;
use super::store::{license_path, read_record, write_record};
use super::types::{
    build_status, ensure_trial_window, ensure_trial_window_from_activation, hash_license_key,
    mask_license_key, normalize_license_key, LicenseActivateResult,
};
use super::is_official_build;

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[tauri::command]
pub fn license_bootstrap_status(app: AppHandle) -> Result<super::types::LicenseStatus, String> {
    let current_ms = now_ms();

    if !is_official_build() {
        return Ok(build_status(&Default::default(), current_ms));
    }

    let path = license_path(&app)?;
    let mut record = read_record(&path).map_err(|read_error| {
        error!(
            path = %path.display(),
            "failed to read license record during bootstrap: {read_error}"
        );
        "Failed to read local license status.".to_string()
    })?;
    let mut changed = false;

    if record.version == 0 {
        record.version = 1;
        changed = true;
    }

    if !record.licensed {
        changed |= ensure_trial_window(&mut record, current_ms);
    }

    if changed {
        write_record(&path, &record)?;
    }

    Ok(build_status(&record, current_ms))
}

#[tauri::command]
pub async fn license_activate(
    app: AppHandle,
    license_key: String,
) -> Result<LicenseActivateResult, String> {
    let current_ms = now_ms();

    if !is_official_build() {
        return Ok(LicenseActivateResult {
            status: build_status(&Default::default(), current_ms),
        });
    }

    let normalized_key = normalize_license_key(&license_key)?;
    let path = license_path(&app)?;
    let mut record = read_record(&path).map_err(|read_error| {
        error!(
            path = %path.display(),
            "failed to read license record during activation: {read_error}"
        );
        "Failed to read local license status.".to_string()
    })?;

    if record.version == 0 {
        record.version = 1;
    }

    ensure_trial_window_from_activation(&mut record, current_ms);

    if let Err(error) = verify_license_key(&normalized_key).await {
        record.last_error_code = Some(error.code.as_str().to_string());
        if let Err(write_error) = write_record(&path, &record) {
            error!(
                path = %path.display(),
                error_code = error.code.as_str(),
                "failed to write license record after activation failure: {write_error}"
            );
        }
        return Err(error.message);
    }

    record.licensed = true;
    record.activated_at_ms = Some(current_ms);
    record.last_verified_at_ms = Some(current_ms);
    record.license_key_hash = Some(hash_license_key(&normalized_key));
    record.license_key_masked = Some(mask_license_key(&normalized_key));
    record.last_error_code = None;

    write_record(&path, &record)?;

    Ok(LicenseActivateResult {
        status: build_status(&record, current_ms),
    })
}

#[tauri::command]
pub fn license_clear_local(app: AppHandle) -> Result<LicenseActivateResult, String> {
    let current_ms = now_ms();

    if !is_official_build() {
        return Ok(LicenseActivateResult {
            status: build_status(&Default::default(), current_ms),
        });
    }

    let path = license_path(&app)?;
    let mut record = read_record(&path).map_err(|read_error| {
        error!(
            path = %path.display(),
            "failed to read license record while clearing activation: {read_error}"
        );
        "Failed to read local license status.".to_string()
    })?;
    let had_activation_at_ms = record.activated_at_ms;

    record.version = 1;
    record.licensed = false;
    record.activated_at_ms = None;
    record.last_verified_at_ms = None;
    record.license_key_hash = None;
    record.license_key_masked = None;
    record.last_error_code = None;

    if record.trial_started_at_ms.is_none() || record.trial_expires_at_ms.is_none() {
        ensure_trial_window(&mut record, had_activation_at_ms.unwrap_or(current_ms));
    }

    write_record(&path, &record)?;

    Ok(LicenseActivateResult {
        status: build_status(&record, current_ms),
    })
}
