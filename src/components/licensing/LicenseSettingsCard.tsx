import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDateDisplayFormat } from "../../contexts";
import {
	activateLicenseKey,
	clearLocalLicense,
	formatLicenseDate,
	formatTrialRemaining,
	useLicenseStatus,
} from "../../lib/license";
import { SettingsRow, SettingsSection } from "../settings/SettingsScaffold";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";

export function LicenseSettingsCard() {
	const { t } = useTranslation("settings.general", { keyPrefix: "license" });
	const dateDisplayFormat = useDateDisplayFormat();
	const { status, error, reload } = useLicenseStatus(false);
	const [licenseKey, setLicenseKey] = useState("");
	const [actionError, setActionError] = useState("");
	const [successMessage, setSuccessMessage] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const successMessageTimerRef = useRef<number | null>(null);

	const clearSuccessMessageTimer = useCallback(() => {
		if (successMessageTimerRef.current === null) return;
		window.clearTimeout(successMessageTimerRef.current);
		successMessageTimerRef.current = null;
	}, []);

	const scheduleSuccessMessageReset = () => {
		clearSuccessMessageTimer();
		successMessageTimerRef.current = window.setTimeout(() => {
			successMessageTimerRef.current = null;
			setSuccessMessage("");
		}, 2200);
	};

	useEffect(() => () => clearSuccessMessageTimer(), [clearSuccessMessageTimer]);

	const handleActivate = async () => {
		if (isSubmitting) return;

		const normalizedLicenseKey = licenseKey.trim();
		if (!normalizedLicenseKey) {
			setSuccessMessage("");
			setActionError(t("errors.keyRequired"));
			return;
		}

		setActionError("");
		setSuccessMessage("");
		clearSuccessMessageTimer();
		setIsSubmitting(true);
		try {
			await activateLicenseKey(normalizedLicenseKey);
			setLicenseKey("");
			await reload();
			setSuccessMessage(t("messages.activated"));
			scheduleSuccessMessageReset();
		} catch (cause) {
			setActionError(cause instanceof Error ? cause.message : t("errors.activateFailed"));
		} finally {
			setIsSubmitting(false);
		}
	};

	const handleClear = async () => {
		setActionError("");
		setSuccessMessage("");
		clearSuccessMessageTimer();
		setIsSubmitting(true);
		try {
			await clearLocalLicense();
			setSuccessMessage(t("messages.removed"));
			scheduleSuccessMessageReset();
			await reload();
		} catch (cause) {
			setActionError(cause instanceof Error ? cause.message : t("errors.removeFailed"));
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<SettingsSection title={t("sectionTitle")}>
			{error ? <div className="settingsError">{error}</div> : null}
			{actionError ? <div className="settingsError">{actionError}</div> : null}
			{successMessage ? <div className="settingsKeySaved">{successMessage}</div> : null}

			{status?.mode === "trial_active" || status?.mode === "trial_expired" ? (
				<SettingsRow
					label={t("trialStatus.label")}
					description={t("trialStatus.description")}
					interactive={false}
				>
					<div className="settingsValue">
						{formatTrialRemaining(status.trial_remaining_seconds)}
					</div>
				</SettingsRow>
			) : null}

			{status?.mode === "licensed" ? (
				<>
					<SettingsRow label={t("activated")} interactive={false}>
						<div className="settingsValue">
							{formatLicenseDate(status.activated_at_ms, dateDisplayFormat)}
						</div>
					</SettingsRow>
					<SettingsRow label={t("licenseKey")} interactive={false}>
						<div className="settingsValue">{status.license_key_masked ?? t("storedLocally")}</div>
					</SettingsRow>
				</>
			) : null}

			{status?.mode === "community_build" ? (
				<SettingsRow
					label={t("officialBuild.label")}
					description={t("officialBuild.description")}
					stacked
					interactive={false}
				>
					<div className="settingsActions">
						<Button
							type="button"
							size="sm"
							variant="outline"
							onClick={() => void openUrl(status.purchase_url)}
						>
							{t("buyOfficial")}
						</Button>
					</div>
				</SettingsRow>
			) : null}

			{status?.is_official_build ? (
				<SettingsRow
					label={t("activate.label")}
					htmlFor="settings-license-key"
					description={t("activate.description")}
					stacked
					className="licenseSettingsField"
				>
					<div className="licenseSettingsInputWrap">
						<Input
							id="settings-license-key"
							type="text"
							autoComplete="off"
							spellCheck={false}
							aria-label={t("licenseKey")}
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
								variant="default"
								onClick={() => void handleActivate()}
								disabled={isSubmitting}
							>
								{isSubmitting ? t("activate.verifying") : t("activate.action")}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => status && void openUrl(status.purchase_url)}
							>
								{t("activate.buy")}
							</Button>
						</div>
					</div>
				</SettingsRow>
			) : null}

			<SettingsRow label={t("help.label")} description={t("help.description")}>
				<div className="settingsActions">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => status && void openUrl(status.support_url)}
					>
						{t("help.openSupport")}
					</Button>
					{status?.is_official_build && status.mode === "licensed" ? (
						<Button
							type="button"
							size="sm"
							variant="destructive"
							onClick={() => void handleClear()}
							disabled={isSubmitting}
						>
							{t("help.removeActivation")}
						</Button>
					) : null}
				</div>
			</SettingsRow>
		</SettingsSection>
	);
}
