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
import { SettingsRow, SettingsSection } from "../settings/SettingsScaffold";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";

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
		<SettingsSection
			title="License"
			description="Manage your trial, activate Glyph, and open purchase or support links."
			aside={
				<span className={statusPillClassName(status)}>
					{statusLabel(status)}
				</span>
			}
		>
			{error ? <div className="settingsError">{error}</div> : null}
			{actionError ? <div className="settingsError">{actionError}</div> : null}
			{successMessage ? (
				<div className="settingsKeySaved">{successMessage}</div>
			) : null}

			{status?.mode === "trial_active" || status?.mode === "trial_expired" ? (
				<SettingsRow
					label="Trial status"
					description="Remaining time on the current trial for this device."
				>
					<div className="settingsValue">
						{formatTrialRemaining(status.trial_remaining_seconds)}
					</div>
				</SettingsRow>
			) : null}

			{status?.mode === "licensed" ? (
				<>
					<SettingsRow
						label="Activated"
						description="Date this device was successfully activated."
					>
						<div className="settingsValue">
							{formatLicenseDate(status.activated_at_ms)}
						</div>
					</SettingsRow>
					<SettingsRow
						label="License key"
						description="Masked locally stored key for this device."
					>
						<div className="settingsValue">
							{status.license_key_masked ?? "Stored locally"}
						</div>
					</SettingsRow>
				</>
			) : null}

			{status?.is_official_build ? (
				<SettingsRow
					label="Activate Glyph"
					htmlFor="settings-license-key"
					description="Enter your license key to unlock Glyph permanently on this device."
					stacked
					className="licenseSettingsField"
				>
					<div className="licenseSettingsInputWrap">
						<Input
							id="settings-license-key"
							type="text"
							autoComplete="off"
							spellCheck={false}
							aria-label="License key"
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
				</SettingsRow>
			) : null}

			<SettingsRow
				label="Help"
				description="Questions about licensing, lost keys, or purchase issues."
			>
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
			</SettingsRow>
		</SettingsSection>
	);
}
