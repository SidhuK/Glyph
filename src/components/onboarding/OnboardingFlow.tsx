import { AnimatePresence, m } from "motion/react";
import type { ReactNode } from "react";
import { OnboardingHello } from "./OnboardingHello";
import { OnboardingPreferencesPage } from "./OnboardingPreferencesPage";
import { OnboardingSpacePage } from "./OnboardingSpacePage";
import { OnboardingWelcomePage } from "./OnboardingWelcomePage";
import { OnboardingDirectionContext, pageVariants } from "./onboardingMotion";
import { type OnboardingStep, useOnboardingFlow } from "./useOnboardingFlow";

interface OnboardingFlowProps {
	/** With a space open the flow has no space step and finishes on the preferences page. */
	spaceOpen: boolean;
	headingId: string;
	onFinish: () => Promise<void>;
	onSkip?: () => void;
}

export function OnboardingFlow({ spaceOpen, headingId, onFinish, onSkip }: OnboardingFlowProps) {
	const flow = useOnboardingFlow(!spaceOpen);
	const { step, direction } = flow;

	const skipFrom = (from: OnboardingStep) => {
		if (flow.hasSpaceStep) flow.moveFrom(from, "space");
		else onSkip?.();
	};

	let page: ReactNode = null;
	if (step === "hello") {
		page = (
			<OnboardingHello
				headingId={headingId}
				onDone={() => flow.next("hello")}
				onSkip={() => skipFrom("hello")}
			/>
		);
	} else if (step === "welcome") {
		page = (
			<OnboardingWelcomePage
				headingId={headingId}
				onContinue={() => flow.next("welcome")}
				onSkip={() => skipFrom("welcome")}
			/>
		);
	} else if (step === "preferences") {
		page = (
			<OnboardingPreferencesPage
				headingId={headingId}
				isLastStep={flow.isLastStep}
				onBack={() => flow.back("preferences")}
				onContinue={() => {
					if (flow.isLastStep) void onFinish();
					else flow.next("preferences");
				}}
				onSkip={() => skipFrom("preferences")}
			/>
		);
	} else if (step === "space") {
		page = (
			<OnboardingSpacePage
				headingId={headingId}
				onBack={() => flow.back("space")}
				onOpened={onFinish}
			/>
		);
	}

	return (
		<OnboardingDirectionContext.Provider value={direction}>
			<AnimatePresence mode="wait">
				<m.section
					key={step}
					className="obPage"
					variants={pageVariants}
					initial="enter"
					animate="center"
					exit="exit"
				>
					{page}
				</m.section>
			</AnimatePresence>
		</OnboardingDirectionContext.Provider>
	);
}
