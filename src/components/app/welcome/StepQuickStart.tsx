import { m, useReducedMotion } from "motion/react";
import { FileText, FolderOpen, Search } from "../../Icons";

const quickStartSteps = [
	{
		icon: FolderOpen,
		title: "Open folder",
		description: "Choose your local space folder.",
	},
	{
		icon: FileText,
		title: "Browse files",
		description: "Open notes from your folders.",
	},
	{
		icon: Search,
		title: "Find fast",
		description: "Use search and tags to jump back in.",
	},
] as const;

interface StepQuickStartProps {
	onNext: () => void;
}

export function StepQuickStart({ onNext }: StepQuickStartProps) {
	const reduceMotion = useReducedMotion();

	return (
		<div className="welcomeStepQuickStart">
			<div className="welcomeStepTitle">Three things to know</div>
			<div className="welcomeOnboardingList">
				{quickStartSteps.map((step, index) => (
					<m.div
						key={step.title}
						className="welcomeOnboardingCard"
						initial={{
							opacity: 0,
							y: reduceMotion ? 0 : 10,
							scale: reduceMotion ? 1 : 0.99,
						}}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						transition={{
							delay: reduceMotion ? 0 : index * 0.08,
							type: "spring",
							stiffness: 360,
							damping: 30,
						}}
						whileHover={
							reduceMotion
								? undefined
								: {
										y: -3,
										scale: 1.01,
										transition: { duration: 0.18 },
									}
						}
					>
						<div className="welcomeOnboardingIcon">
							<step.icon size={18} strokeWidth={1.6} />
						</div>
						<div className="welcomeOnboardingTitle">{step.title}</div>
						<div className="welcomeOnboardingBody">{step.description}</div>
					</m.div>
				))}
			</div>
			<m.button
				type="button"
				className="welcomeGetStarted"
				onClick={onNext}
				whileHover={reduceMotion ? undefined : { scale: 1.04, y: -2 }}
				whileTap={reduceMotion ? undefined : { scale: 0.97 }}
				transition={{ type: "spring", stiffness: 400, damping: 25 }}
			>
				Next →
			</m.button>
		</div>
	);
}
