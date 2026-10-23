import { useCallback, useState } from "react";

export type OnboardingStep = "hello" | "welcome" | "preferences" | "space";

const STEPS_WITH_SPACE: readonly OnboardingStep[] = ["hello", "welcome", "preferences", "space"];
const STEPS_WITHOUT_SPACE: readonly OnboardingStep[] = ["hello", "welcome", "preferences"];

interface FlowPosition {
	index: number;
	direction: 1 | -1;
}

/** Steps advance only from the step the caller saw, so late or repeated events are no-ops. */
export function useOnboardingFlow(includeSpaceStep: boolean) {
	const steps = includeSpaceStep ? STEPS_WITH_SPACE : STEPS_WITHOUT_SPACE;
	const [position, setPosition] = useState<FlowPosition>({ index: 0, direction: 1 });
	const index = Math.min(position.index, steps.length - 1);
	const step = steps[index] ?? "hello";

	const moveFrom = useCallback(
		(from: OnboardingStep, to: OnboardingStep) => {
			setPosition((current) => {
				const currentIndex = Math.min(current.index, steps.length - 1);
				const targetIndex = steps.indexOf(to);
				if (steps[currentIndex] !== from || targetIndex < 0) return current;
				return { index: targetIndex, direction: targetIndex >= currentIndex ? 1 : -1 };
			});
		},
		[steps],
	);

	const next = useCallback(
		(from: OnboardingStep) => {
			const target = steps[steps.indexOf(from) + 1];
			if (target) moveFrom(from, target);
		},
		[moveFrom, steps],
	);

	const back = useCallback(
		(from: OnboardingStep) => {
			const target = steps[steps.indexOf(from) - 1];
			if (target && target !== "hello") moveFrom(from, target);
		},
		[moveFrom, steps],
	);

	return {
		step,
		direction: position.direction,
		isLastStep: index === steps.length - 1,
		hasSpaceStep: includeSpaceStep,
		next,
		back,
		moveFrom,
	};
}
