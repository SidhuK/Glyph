import { AiBrain04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion, useReducedMotion } from "motion/react";

interface StepHeroProps {
	appName: string | null;
	onNext: () => void;
}

export function StepHero({ appName, onNext }: StepHeroProps) {
	const reduceMotion = useReducedMotion();

	return (
		<div className="welcomeStepHero">
			<div className="welcomeBrand">
				<div className="welcomeBrandIcon" aria-hidden="true">
					<HugeiconsIcon icon={AiBrain04Icon} size={28} />
				</div>
				<div className="welcomeTitle">{appName ?? "Cipher"}</div>
			</div>
			<div className="welcomeSubtitle">
				A simple space for notes and canvases.
			</div>
			<motion.button
				type="button"
				className="welcomeGetStarted"
				onClick={onNext}
				whileHover={reduceMotion ? undefined : { scale: 1.04, y: -2 }}
				whileTap={reduceMotion ? undefined : { scale: 0.97 }}
				transition={{ type: "spring", stiffness: 400, damping: 25 }}
			>
				Get Started →
			</motion.button>
		</div>
	);
}
