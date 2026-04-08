import { useLicenseStatus } from "../../lib/license";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";

export function GeneralSettingsPane() {
	const { status: licenseStatus, loading: licenseLoading } =
		useLicenseStatus(false);

	return (
		<div className="settingsPane">
			<div className="settingsGrid">
				{licenseLoading || licenseStatus?.can_auto_update ? (
					<SettingsSection title="Updates">
						<SettingsRow
							label="Automatic update checks"
							description="Glyph checks for updates when the app opens and again every 3 hours while it stays open. When an update is ready, the update button appears and installs it only when you click."
							stacked
							interactive={false}
						>
							<p className="settingsHint">Automatic updates are always on.</p>
						</SettingsRow>
					</SettingsSection>
				) : null}
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
