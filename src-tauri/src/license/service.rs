use reqwest::StatusCode;
use serde::Deserialize;
use tracing::trace;

use crate::license::gumroad_product_id;

const GUMROAD_VERIFY_URL: &str = "https://api.gumroad.com/v2/licenses/verify";

#[derive(Debug, Clone, Copy)]
pub enum LicenseServiceErrorCode {
    InvalidLicense,
    Network,
    Service,
}

impl LicenseServiceErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidLicense => "invalid_license",
            Self::Network => "network_error",
            Self::Service => "service_error",
        }
    }
}

pub struct LicenseServiceError {
    pub code: LicenseServiceErrorCode,
    pub message: String,
}

#[derive(Deserialize)]
struct GumroadVerifyResponse {
    success: bool,
    #[serde(default)]
    message: Option<String>,
}

pub async fn verify_license_key(license_key: &str) -> Result<(), LicenseServiceError> {
    let product_id = gumroad_product_id();
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| LicenseServiceError {
            code: LicenseServiceErrorCode::Service,
            message: format!("Failed to initialize license verification: {e}"),
        })?;

    trace!(
        product_id = product_id,
        url = GUMROAD_VERIFY_URL,
        "verifying Gumroad license key"
    );

    let response = client
        .post(GUMROAD_VERIFY_URL)
        .form(&[
            ("product_id", product_id),
            ("license_key", license_key),
        ])
        .send()
        .await
        .map_err(|e| {
            trace!(
                product_id = product_id,
                url = GUMROAD_VERIFY_URL,
                timeout = e.is_timeout(),
                "gumroad license verification request failed"
            );
            let message = if e.is_timeout() {
                "License verification timed out. Check your connection and try again."
                    .to_string()
            } else {
                "Could not reach Gumroad to verify this license key.".to_string()
            };
            LicenseServiceError {
                code: LicenseServiceErrorCode::Network,
                message,
            }
        })?;

    if response.status() == StatusCode::TOO_MANY_REQUESTS {
        trace!(
            product_id = product_id,
            url = GUMROAD_VERIFY_URL,
            status = %response.status(),
            "gumroad license verification rate limited"
        );
        return Err(LicenseServiceError {
            code: LicenseServiceErrorCode::Service,
            message: "Too many verification attempts. Please wait a moment and try again."
                .to_string(),
        });
    }

    let status = response.status();
    let payload = response
        .json::<GumroadVerifyResponse>()
        .await
        .map_err(|error| {
            trace!(
                product_id = product_id,
                url = GUMROAD_VERIFY_URL,
                status = %status,
                "gumroad returned an unparseable verification response: {error}"
            );
            LicenseServiceError {
                code: LicenseServiceErrorCode::Service,
                message: "Gumroad returned an unexpected response while verifying your key."
                    .to_string(),
            }
        })?;

    if status.is_success() && payload.success {
        trace!(
            product_id = product_id,
            url = GUMROAD_VERIFY_URL,
            status = %status,
            "gumroad license verification succeeded"
        );
        return Ok(());
    }

    let message = payload
        .message
        .unwrap_or_else(|| "That license key is invalid for Glyph.".to_string());

    let code = if status.is_client_error() {
        LicenseServiceErrorCode::InvalidLicense
    } else {
        LicenseServiceErrorCode::Service
    };

    trace!(
        product_id = product_id,
        url = GUMROAD_VERIFY_URL,
        status = %status,
        error_code = code.as_str(),
        "gumroad license verification rejected"
    );

    Err(LicenseServiceError { code, message })
}
