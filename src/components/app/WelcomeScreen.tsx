import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useState } from "react";
import { onWindowDragMouseDown } from "../../utils/window";
import { StepHero } from "./welcome/StepHero";
import { StepQuickStart } from "./welcome/StepQuickStart";
import { StepReady } from "./welcome/StepReady";
import { WelcomeStep } from "./welcome/WelcomeStep";

const STEP_LABELS = ["hero", "tips", "start"] as const;
const SMOOTH_EASE = [0.22, 1, 0.36, 1] as const;

interface WelcomeScreenProps {
	appName: string | null;
	lastVaultPath: string | null;
	recentVaults: string[];
	onOpenVault: () => void;
	onCreateVault: () => void;
	onContinueLastVault: () => void;
	onSelectRecentVault: (path: string) => Promise<void>;
}

export function WelcomeScreen({
	appName,
	lastVaultPath,
	recentVaults,
	onOpenVault,
	onCreateVault,
	onContinueLastVault,
	onSelectRecentVault,
}: WelcomeScreenProps) {
	const reduceMotion = useReducedMotion();
	const [step, setStep] = useState(0);

	const goNext = useCallback(() => {
		setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
	}, []);

	const goTo = useCallback((target: number) => {
		setStep(target);
	}, []);

	return (
		<>
			<div
				className="mainToolbar"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			>
				<div className="mainToolbarLeft">
					<span className="canvasTitle">Launch</span>
				</div>
			</div>
			<div className="welcomeScreen">
				<div className="welcomeAmbient" aria-hidden="true">
					<motion.div
						className="welcomeOrb welcomeOrbA"
						animate={
							reduceMotion
								? { opacity: 0.7 }
								: { x: [0, 14, 0], y: [0, -10, 0] }
						}
						transition={{
							duration: 12,
							repeat: Number.POSITIVE_INFINITY,
							ease: SMOOTH_EASE,
						}}
					/>
					<motion.div
						className="welcomeOrb welcomeOrbB"
						animate={
							reduceMotion
								? { opacity: 0.7 }
								: { x: [0, -16, 0], y: [0, 12, 0] }
						}
						transition={{
							duration: 14,
							repeat: Number.POSITIVE_INFINITY,
							ease: SMOOTH_EASE,
						}}
					/>
				</div>
				<div className="welcomeSurface">
					<AnimatePresence mode="wait">
						<WelcomeStep key={step} stepKey={step}>
							{step === 0 && <StepHero appName={appName} onNext={goNext} />}
							{step === 1 && <StepQuickStart onNext={goNext} />}
							{step === 2 && (
								<StepReady
									lastVaultPath={lastVaultPath}
									recentVaults={recentVaults}
									onOpenVault={onOpenVault}
									onCreateVault={onCreateVault}
									onContinueLastVault={onContinueLastVault}
									onSelectRecentVault={onSelectRecentVault}
								/>
							)}
						</WelcomeStep>
					</AnimatePresence>
					<div className="welcomeDots">
						{STEP_LABELS.map((label, i) => (
							<motion.button
								key={label}
								type="button"
								className={`welcomeDot ${i === step ? "welcomeDotActive" : ""}`}
								onClick={() => goTo(i)}
								layout
								transition={{
									type: "spring",
									stiffness: 400,
									damping: 30,
								}}
								aria-label={`Go to step ${i + 1}`}
							/>
						))}
					</div>
				</div>
			</div>
		</>
	);
}
