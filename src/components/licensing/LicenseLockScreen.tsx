import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { activateLicenseKey, formatTrialRemaining } from "../../lib/license";
import type { LicenseStatus } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";

interface LicenseLockScreenProps {
	status: LicenseStatus | null;
	error?: string;
	onActivated: (status: LicenseStatus) => void;
	onRetry: () => void;
}

export function LicenseLockScreen({
	status,
	error,
	onActivated,
	onRetry,
}: LicenseLockScreenProps) {
	const [licenseKey, setLicenseKey] = useState("");
	const [submitError, setSubmitError] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleActivate = async () => {
		setSubmitError("");
		setIsSubmitting(true);
		try {
			const result = await activateLicenseKey(licenseKey);
			onActivated(result.status);
		} catch (cause) {
			setSubmitError(
				cause instanceof Error ? cause.message : "Failed to verify license key",
			);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="licenseLockScreen">
			<div className="licenseLockPanel">
				<div className="licenseLockEyebrow">Official Release</div>
				<h1 className="licenseLockTitle">Glyph requires a license key</h1>
				<p className="licenseLockBody">
					This official build includes a 48-hour free trial. After that, a
					lifetime Gumroad license unlocks Glyph forever on all of your devices.
				</p>
				{status?.mode === "trial_expired" ? (
					<div className="licenseLockMetaRow">
						<span className="settingsPill settingsPillError">Trial Ended</span>
						<span className="licenseLockMetaText">
							{formatTrialRemaining(status.trial_remaining_seconds)}
						</span>
					</div>
				) : null}

				<div className="licenseLockField">
					<label className="settingsLabel" htmlFor="license-key-input">
						License Key
					</label>
					<input
						id="license-key-input"
						type="text"
						autoComplete="off"
						spellCheck={false}
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
				</div>

				{submitError ? (
					<div className="settingsError">{submitError}</div>
				) : null}
				{error ? <div className="settingsError">{error}</div> : null}

				<div className="licenseLockActions">
					<Button
						type="button"
						size="lg"
						onClick={() => void handleActivate()}
						disabled={isSubmitting}
					>
						{isSubmitting ? "Verifying..." : "Activate License"}
					</Button>
					<Button
						type="button"
						variant="outline"
						size="lg"
						onClick={() => status && void openUrl(status.purchase_url)}
					>
						Buy on Gumroad
					</Button>
				</div>

				<div className="licenseLockLinks">
					<Button
						type="button"
						variant="link"
						size="sm"
						className="licenseLockLinkButton"
						onClick={onRetry}
					>
						Retry Status Check
					</Button>
					{status ? (
						<Button
							type="button"
							variant="link"
							size="sm"
							className="licenseLockLinkButton"
							onClick={() => void openUrl(status.support_url)}
						>
							Get Support
						</Button>
					) : null}
				</div>
			</div>
		</div>
	);
}
