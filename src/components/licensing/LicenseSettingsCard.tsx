import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import {
	activateLicenseKey,
	clearLocalLicense,
	formatLicenseDate,
	formatTrialRemaining,
	useLicenseStatus,
} from "../../lib/license";
import type { LicenseStatus } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";

function statusPillClassName(status: LicenseStatus | null): string {
	if (!status) return "settingsPill";
	switch (status.mode) {
		case "licensed":
			return "settingsPill settingsPillOk";
		case "trial_active":
			return "settingsPill settingsPillWarn";
		case "trial_expired":
			return "settingsPill settingsPillError";
		default:
			return "settingsPill settingsPillInfo";
	}
}

function statusLabel(status: LicenseStatus | null): string {
	if (!status) return "Loading";
	switch (status.mode) {
		case "licensed":
			return "Licensed";
		case "trial_active":
			return "Trial Active";
		case "trial_expired":
			return "Trial Expired";
		default:
			return "Community Build";
	}
}

export function LicenseSettingsCard() {
	const { status, loading, error, reload } = useLicenseStatus(false);
	const [licenseKey, setLicenseKey] = useState("");
	const [actionError, setActionError] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (!successMessage) return;
		const timer = window.setTimeout(() => setSuccessMessage(""), 2200);
		return () => window.clearTimeout(timer);
	}, [successMessage]);

	const handleActivate = async () => {
		if (isSubmitting) return;

		const normalizedLicenseKey = licenseKey.trim();
		if (!normalizedLicenseKey) {
			setSuccessMessage("");
			setActionError("Please provide a license key");
			return;
		}

		setActionError("");
		setSuccessMessage("");
		setIsSubmitting(true);
		try {
			await activateLicenseKey(normalizedLicenseKey);
			setLicenseKey("");
			setSuccessMessage("License activated.");
			await reload();
		} catch (cause) {
			setActionError(
				cause instanceof Error ? cause.message : "Failed to activate license",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleClear = async () => {
		setActionError("");
		setSuccessMessage("");
		setIsSubmitting(true);
		try {
			await clearLocalLicense();
			setSuccessMessage("Local activation removed.");
			await reload();
		} catch (cause) {
			setActionError(
				cause instanceof Error
					? cause.message
					: "Failed to remove local activation",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<section className="settingsCard">
			<div className="settingsCardHeader">
				<div>
					<div className="settingsCardTitle">License</div>
					<div className="settingsCardHint">
						Manage the 48-hour trial and your Gumroad activation for this build.
					</div>
				</div>
				<span className={statusPillClassName(status)}>
					{statusLabel(status)}
				</span>
			</div>

			{error ? <div className="settingsError">{error}</div> : null}
			{actionError ? <div className="settingsError">{actionError}</div> : null}
			{successMessage ? (
				<div className="settingsKeySaved">{successMessage}</div>
			) : null}

			<div className="settingsField">
				<div>
					<div className="settingsLabel">Build Type</div>
					<div className="settingsValue">
						{status?.is_official_build ? "Official release" : "Community build"}
					</div>
				</div>
			</div>

			{status?.mode === "trial_active" || status?.mode === "trial_expired" ? (
				<div className="settingsField">
					<div>
						<div className="settingsLabel">Trial Status</div>
						<div className="settingsValue">
							{formatTrialRemaining(status.trial_remaining_seconds)}
						</div>
					</div>
				</div>
			) : null}

			{status?.mode === "licensed" ? (
				<>
					<div className="settingsField">
						<div>
							<div className="settingsLabel">Activated</div>
							<div className="settingsValue">
								{formatLicenseDate(status.activated_at_ms)}
							</div>
						</div>
					</div>
					<div className="settingsField">
						<div>
							<div className="settingsLabel">License Key</div>
							<div className="settingsValue">
								{status.license_key_masked ?? "Stored locally"}
							</div>
						</div>
					</div>
				</>
			) : null}

			{status?.is_official_build ? (
				<div className="settingsField licenseSettingsField">
					<div>
						<div className="settingsLabel">Activate Glyph</div>
						<div className="settingsCardHint">
							Enter your Gumroad license key to unlock Glyph forever on this
							device.
						</div>
					</div>
					<div className="licenseSettingsInputWrap">
						<input
							id="settings-license-key"
							type="text"
							autoComplete="off"
							spellCheck={false}
							aria-label="Gumroad license key"
							placeholder="XXXX-XXXX-XXXX-XXXX"
							value={licenseKey}
							onChange={(event) => setLicenseKey(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									void handleActivate();
								}
							}}
						/>
						<div className="settingsActions">
							<Button
								type="button"
								size="sm"
								onClick={() => void handleActivate()}
								disabled={loading || isSubmitting}
							>
								{isSubmitting ? "Verifying..." : "Activate"}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => status && void openUrl(status.purchase_url)}
							>
								Buy
							</Button>
						</div>
					</div>
				</div>
			) : null}

			<div className="settingsField">
				<div>
					<div className="settingsLabel">Help</div>
					<div className="settingsCardHint">
						Questions about licensing, lost keys, or purchase issues.
					</div>
				</div>
				<div className="settingsActions">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => status && void openUrl(status.support_url)}
					>
						Open Support
					</Button>
					{status?.is_official_build && status.mode === "licensed" ? (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							onClick={() => void handleClear()}
							disabled={isSubmitting}
						>
							Remove Local Activation
						</Button>
					) : null}
				</div>
			</div>
		</section>
	);
}
