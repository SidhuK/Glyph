import { motion, useReducedMotion } from "motion/react";
import { AiLattice } from "../../Icons";

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
					<AiLattice size={28} />
				</div>
				<div className="welcomeTitle">{appName ?? "Lattice"}</div>
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
