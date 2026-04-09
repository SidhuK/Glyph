import { type ReactNode, useState } from "react";
import { UpdaterProvider } from "../../contexts/UpdaterContext";
import { useAutoUpdater } from "../../hooks/useAutoUpdater";
import { useLicenseStatus } from "../../lib/license";
import { LicenseLockScreen } from "./LicenseLockScreen";
import { TrialBanner } from "./TrialBanner";

interface LicenseGateProps {
	children: ReactNode;
}

export function LicenseGate({ children }: LicenseGateProps) {
	const { status, loading, error, reload } = useLicenseStatus();
	const [trialBannerDismissed, setTrialBannerDismissed] = useState(false);
	const autoUpdater = useAutoUpdater(status?.can_auto_update ?? false);

	if (loading) {
		return (
			<div
				className="licenseLoadingScreen"
				aria-busy="true"
				aria-label="Loading Glyph"
				aria-live="polite"
			>
				<div className="licenseLoadingPanel">
					<h1>Loading Glyph</h1>
					<p>Checking your local setup so the app can open safely.</p>
				</div>
			</div>
		);
	}

	if (!status || !status.can_use_app) {
		return (
			<UpdaterProvider value={autoUpdater}>
				<LicenseLockScreen
					status={status}
					error={error}
					onActivated={() => {
						void reload();
					}}
					onRetry={() => {
						void reload();
					}}
				/>
			</UpdaterProvider>
		);
	}

	return (
		<UpdaterProvider value={autoUpdater}>
			{status.mode === "trial_active" && !trialBannerDismissed ? (
				<TrialBanner
					status={status}
					onDismiss={() => setTrialBannerDismissed(true)}
				/>
			) : null}
			{children}
		</UpdaterProvider>
	);
}
