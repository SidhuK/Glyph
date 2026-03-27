import { useCallback, useEffect, useState } from "react";
import { useLicenseStatus } from "../../lib/license";
import {
	type AutoUpdateCheckInterval,
	loadSettings,
	setAutoUpdateCheckInterval as saveAutoUpdateCheckInterval,
} from "../../lib/settings";
import { LicenseSettingsCard } from "../licensing/LicenseSettingsCard";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";

export function GeneralSettingsPane() {
	const { status: licenseStatus, loading: licenseLoading } =
		useLicenseStatus(false);
	const [autoUpdateCheckInterval, setAutoUpdateCheckIntervalState] =
		useState<AutoUpdateCheckInterval>("launch");
	const [error, setError] = useState("");

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setAutoUpdateCheckIntervalState(settings.ui.autoUpdateCheckInterval);
			} catch (cause) {
				if (!cancelled) {
					setError(
						cause instanceof Error ? cause.message : "Failed to load settings",
					);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const handleAutoUpdateToggleChange = useCallback((checked: boolean) => {
		const next: AutoUpdateCheckInterval = checked ? "12h" : "launch";
		setAutoUpdateCheckIntervalState(next);
		void saveAutoUpdateCheckInterval(next);
	}, []);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}

			<div className="settingsGrid">
				{licenseLoading || licenseStatus?.can_auto_update ? (
					<SettingsSection title="Updates">
						<SettingsRow
							label="Automatic update checks"
							description="Automatically check for updates every 12 hours while Glyph is open."
						>
							<SettingsToggle
								ariaLabel="Automatic update checks every 12 hours"
								checked={autoUpdateCheckInterval === "12h"}
								onCheckedChange={handleAutoUpdateToggleChange}
							/>
						</SettingsRow>
					</SettingsSection>
				) : null}
				<LicenseSettingsCard />
			</div>
		</div>
	);
}
