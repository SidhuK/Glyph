import { openUrl } from "@tauri-apps/plugin-opener";
import { formatTrialRemaining } from "../../lib/license";
import type { LicenseStatus } from "../../lib/tauri";
import { openSettingsWindow } from "../../lib/windows";
import { Button } from "../ui/shadcn/button";

interface TrialBannerProps {
	status: LicenseStatus;
}

export function TrialBanner({ status }: TrialBannerProps) {
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
