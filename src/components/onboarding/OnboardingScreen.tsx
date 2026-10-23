import { useId } from "react";
import { OnboardingFlow } from "./OnboardingFlow";
import { OnboardingFrame } from "./OnboardingFrame";
import { useOnboardingControls } from "./OnboardingProvider";
import { OnboardingWelcomeBack } from "./OnboardingWelcomeBack";

/** The no-space state: the full flow until it is complete, then a short welcome. */
export function OnboardingScreen() {
	const { ready, isActive, runId, complete } = useOnboardingControls();
	const headingId = useId();
	if (!ready) return null;
	return (
		<OnboardingFrame>
			{isActive ? (
				<OnboardingFlow key={runId} spaceOpen={false} headingId={headingId} onFinish={complete} />
			) : (
				<OnboardingWelcomeBack />
			)}
		</OnboardingFrame>
	);
}
