import { useId } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { OnboardingFlow } from "./OnboardingFlow";
import { OnboardingFrame } from "./OnboardingFrame";
import { useOnboardingControls } from "./OnboardingProvider";
import { OnboardingWelcomeBack } from "./OnboardingWelcomeBack";
import { focusOnMount } from "./onboardingMotion";

/** The no-space state: the full flow until it is complete, then a short welcome. */
export function OnboardingScreen() {
	const { t } = useTranslation("shell");
	const { ready, loadError, retryLoad, isActive, runId } = useOnboardingControls();
	const headingId = useId();
	if (loadError) {
		return (
			<OnboardingFrame>
				<div className="onboardingWelcomeBack obContent" role="alert">
					<h1 className="obTitle">{t("onboarding.errors.loadTitle")}</h1>
					<p className="onboardingError">
						{t("onboarding.errors.loadSettings", { message: extractErrorMessage(loadError) })}
					</p>
					<div className="obWelcomeBackActions">
						<button
							ref={focusOnMount}
							type="button"
							className="obButton"
							data-variant="primary"
							onClick={retryLoad}
						>
							{t("onboarding.actions.retry")}
						</button>
					</div>
				</div>
			</OnboardingFrame>
		);
	}
	if (!ready) return null;
	return (
		<OnboardingFrame>
			{isActive ? (
				<OnboardingFlow key={runId} spaceOpen={false} headingId={headingId} />
			) : (
				<OnboardingWelcomeBack />
			)}
		</OnboardingFrame>
	);
}
