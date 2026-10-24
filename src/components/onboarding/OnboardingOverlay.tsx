import { useId } from "react";
import { OnboardingFlow } from "./OnboardingFlow";
import { OnboardingFrame } from "./OnboardingFrame";

interface OnboardingOverlayProps {
	onDismiss: () => void;
}

/** Replays onboarding above an open space; Escape closes it. */
export function OnboardingOverlay({ onDismiss }: OnboardingOverlayProps) {
	const headingId = useId();
	return (
		<OnboardingFrame
			className="onboardingOverlay"
			role="dialog"
			aria-modal
			aria-labelledby={headingId}
		>
			<OnboardingFlow spaceOpen headingId={headingId} onSkip={onDismiss} />
		</OnboardingFrame>
	);
}
