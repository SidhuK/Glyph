import type { ReactNode } from "react";
import { useLicenseStatus } from "../../lib/license";
import { LicenseLockScreen } from "./LicenseLockScreen";
import { TrialBanner } from "./TrialBanner";

interface LicenseGateProps {
	children: ReactNode;
}

export function LicenseGate({ children }: LicenseGateProps) {
	const { status, loading, error, reload } = useLicenseStatus();

	if (loading) {
		return (
			<div className="licenseLoadingScreen">
				<div className="licenseLoadingPanel">
					<h1>Loading Glyph</h1>
					<p>Checking your trial and license status.</p>
				</div>
			</div>
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
			{status.mode === "trial_active" ? <TrialBanner status={status} /> : null}
			{children}
		</>
	);
}
