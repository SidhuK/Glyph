import { Close } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { formatTrialRemaining } from "../../lib/license";
import type { LicenseStatus } from "../../lib/tauri";
import { openSettingsWindow } from "../../lib/windows";
import { Button } from "../ui/shadcn/button";

interface TrialBannerProps {
	status: LicenseStatus;
	onDismiss: () => void;
}

export function TrialBanner({ status, onDismiss }: TrialBannerProps) {
	return (
		<output className="licenseTrialBanner" aria-live="polite">
			<div className="licenseTrialBannerCopy">
				<span className="settingsPill settingsPillWarn">Trial</span>
				<div>
					<div className="licenseTrialBannerTitle">
						Your Glyph trial is active
					</div>
					<div className="licenseTrialBannerMeta">
						{formatTrialRemaining(status.trial_remaining_seconds)}
					</div>
				</div>
			</div>

			<div className="licenseTrialBannerActions">
				<button
					type="button"
					className="licenseTrialBannerDismiss"
					onClick={onDismiss}
					aria-label="Dismiss trial banner"
					title="Dismiss"
				>
					<HugeiconsIcon icon={Close} size={14} />
				</button>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => void openSettingsWindow("general")}
				>
					Enter License Key
				</Button>
				<Button
					type="button"
					variant="default"
					size="sm"
					onClick={() => void openUrl(status.purchase_url)}
				>
					Buy on Gumroad
				</Button>
			</div>
		</output>
	);
}
