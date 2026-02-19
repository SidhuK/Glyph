import { m, useReducedMotion } from "motion/react";
import { type ReactNode, useMemo } from "react";

interface WelcomeStepProps {
	stepKey: number;
	children: ReactNode;
}

export function WelcomeStep({ stepKey, children }: WelcomeStepProps) {
	const reduceMotion = useReducedMotion();

	const variants = useMemo(
		() => ({
			enter: {
				x: reduceMotion ? 0 : 60,
				opacity: 0,
			},
			center: {
				x: 0,
				opacity: 1,
			},
			exit: {
				x: reduceMotion ? 0 : -60,
				opacity: 0,
			},
		}),
		[reduceMotion],
	);

	const transition = reduceMotion
		? { duration: 0 }
		: { type: "spring" as const, stiffness: 300, damping: 30 };

	return (
		<m.div
			key={stepKey}
			className="welcomeStepContent"
			variants={variants}
			initial="enter"
			animate="center"
			exit="exit"
			transition={transition}
		>
			{children}
		</m.div>
	);
}
