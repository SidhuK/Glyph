import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";

export function GeneralSettingsPane() {
	return (
		<div className="settingsPane">
			<div className="settingsGrid">
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
