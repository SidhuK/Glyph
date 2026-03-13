import { type ReactNode, useState } from "react";
import { useLicenseStatus } from "../../lib/license";
import { LicenseLockScreen } from "./LicenseLockScreen";
import { TrialBanner } from "./TrialBanner";

interface LicenseGateProps {
	children: ReactNode;
}

export function LicenseGate({ children }: LicenseGateProps) {
	const { status, loading, error, reload } = useLicenseStatus();
	const [trialBannerDismissed, setTrialBannerDismissed] = useState(false);

	if (loading) {
		return (
			<div
				className="licenseLoadingScreen"
				aria-busy="true"
				aria-label="Loading Glyph"
				role="status"
			/>
		);
	}

	if (!status || !status.can_use_app) {
		return (
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
		);
	}

	return (
		<>
			{status.mode === "trial_active" && !trialBannerDismissed ? (
				<TrialBanner
					status={status}
					onDismiss={() => setTrialBannerDismissed(true)}
				/>
			) : null}
			{children}
		</>
	);
}
