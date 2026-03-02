use reqwest::StatusCode;
use serde::Deserialize;

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
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| LicenseServiceError {
            code: LicenseServiceErrorCode::Service,
            message: format!("Failed to initialize license verification: {e}"),
        })?;

    let response = client
        .post(GUMROAD_VERIFY_URL)
        .form(&[
            ("product_id", gumroad_product_id()),
            ("license_key", license_key),
        ])
        .send()
        .await
        .map_err(|e| {
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
        .map_err(|_| LicenseServiceError {
            code: LicenseServiceErrorCode::Service,
            message: "Gumroad returned an unexpected response while verifying your key."
                .to_string(),
        })?;

    if status.is_success() && payload.success {
        return Ok(());
    }

    let message = payload
        .message
        .unwrap_or_else(|| "That license key is invalid for Glyph.".to_string());

    Err(LicenseServiceError {
        code: if status.is_client_error() {
            LicenseServiceErrorCode::InvalidLicense
        } else {
            LicenseServiceErrorCode::Service
        },
        message,
    })
}
