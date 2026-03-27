import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { type ComponentType, useMemo, useState } from "react";
import { Calendar, Command, FileText, X } from "../Icons";
import type { IconProps } from "../Icons/NavigationIcons";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";

interface GettingStartedPaneProps {
	commandShortcutParts: string[];
	showDailyNoteAction: boolean;
	onCreateNote: () => void;
	onOpenCommandPalette: () => void;
	onOpenDailyNote: () => void;
	onDismiss: () => void;
}

interface Step {
	key: string;
	title: string;
	description: string;
	icon: ComponentType<IconProps>;
}

const RING_SIZE = 40;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function buildSteps(showDailyNote: boolean): Step[] {
	const steps: Step[] = [
		{
			key: "note",
			title: "Create your first note",
			description:
				"Start writing here, and when you're ready you can also point Glyph at an existing folder of Markdown notes. Your files stay as plain .md in your folder.",
			icon: FileText,
		},
		{
			key: "command",
			title: "Try the command palette",
			description: "Jump to commands, files, and actions from one place.",
			icon: Command,
		},
	];
	if (showDailyNote) {
		steps.push({
			key: "daily",
			title: "Open today's daily note",
			description:
				"A dated note is created in your daily notes folder. Set the folder path in Settings → Daily Notes.",
			icon: Calendar,
		});
	}
	return steps;
}

function ProgressRing({
	progress,
	currentValue,
	totalValue,
	complete,
	reduced,
}: {
	progress: number;
	currentValue: number;
	totalValue: number;
	complete: boolean;
	reduced: boolean;
}) {
	const transition = reduced
		? { duration: 0 }
		: { ...springPresets.gentle, duration: 0.6 };

	return (
		<div
			className="starterProgressRing"
			role="progressbar"
			aria-label="Getting started progress"
			aria-valuemin={0}
			aria-valuemax={totalValue}
			aria-valuenow={currentValue}
			tabIndex={0}
		>
			<svg
				width={RING_SIZE}
				height={RING_SIZE}
				viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
			>
				<title>Getting started progress ring</title>
				<circle
					cx={RING_SIZE / 2}
					cy={RING_SIZE / 2}
					r={RING_RADIUS}
					fill="none"
					stroke="var(--border-light)"
					strokeWidth={RING_STROKE}
				/>
				<m.circle
					cx={RING_SIZE / 2}
					cy={RING_SIZE / 2}
					r={RING_RADIUS}
					fill="none"
					stroke="var(--interactive-accent)"
					strokeWidth={RING_STROKE}
					strokeLinecap="round"
					strokeDasharray={RING_CIRCUMFERENCE}
					style={{
						rotate: "-90deg",
						transformOrigin: "center",
					}}
					animate={{
						strokeDashoffset: RING_CIRCUMFERENCE * (1 - progress),
					}}
					transition={transition}
				/>
			</svg>
			<AnimatePresence>
				{complete && (
					<m.div
						className="starterProgressRingCheck"
						initial={{ scale: 0.95, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={reduced ? { duration: 0 } : springPresets.bouncy}
					>
						<HugeiconsIcon
							icon={CheckmarkCircle02Icon}
							size={18}
							color="var(--interactive-accent)"
						/>
					</m.div>
				)}
			</AnimatePresence>
		</div>
	);
}

export function GettingStartedPane({
	commandShortcutParts,
	showDailyNoteAction,
	onCreateNote,
	onOpenCommandPalette,
	onOpenDailyNote,
	onDismiss,
}: GettingStartedPaneProps) {
	const steps = useMemo(
		() => buildSteps(showDailyNoteAction),
		[showDailyNoteAction],
	);
	const [currentStep, setCurrentStep] = useState(0);
	const reduced = useReducedMotion() ?? false;
	const complete = currentStep >= steps.length;
	const progress = steps.length > 0 ? currentStep / steps.length : 0;

	const handlers: Record<string, () => void> = {
		note: onCreateNote,
		command: onOpenCommandPalette,
		daily: onOpenDailyNote,
	};

	function advance() {
		setCurrentStep((s) => s + 1);
	}

	function handleAction(key: string) {
		handlers[key]?.();
		advance();
	}

	const stepTransition = reduced
		? { duration: 0 }
		: { ...springPresets.snappy, duration: 0.15 };

	return (
		<div className="starterPane">
			<div className="starterPaneHeader">
				<div>
					<div className="starterPaneTitle">Getting started</div>
				</div>
				<div className="starterPaneHeaderRight">
					<ProgressRing
						progress={progress}
						currentValue={Math.min(currentStep, steps.length)}
						totalValue={steps.length}
						complete={complete}
						reduced={reduced}
					/>
					<button
						type="button"
						className="starterDismissButton"
						onClick={onDismiss}
						aria-label="Dismiss getting started"
					>
						<X size={14} />
					</button>
				</div>
			</div>

			<AnimatePresence mode="wait">
				{complete ? (
					<m.div
						key="completion"
						className="starterCompletion"
						initial={{ scale: 0.9, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						transition={reduced ? { duration: 0 } : springPresets.bouncy}
					>
						<p className="starterStepTitle">You're all set!</p>
						<p className="starterStepBody">
							Your space is ready. Start writing and exploring.
						</p>
						<Button onClick={onDismiss}>Start writing</Button>
					</m.div>
				) : (
					<m.div
						key={steps[currentStep].key}
						className="starterStepCard"
						initial={{ x: 40, opacity: 0 }}
						animate={{ x: 0, opacity: 1 }}
						exit={{ x: -40, opacity: 0 }}
						transition={stepTransition}
					>
						<div className="starterStepIcon">
							{(() => {
								const Icon = steps[currentStep].icon;
								return <Icon size={20} strokeWidth={1.7} />;
							})()}
						</div>
						<div>
							<div className="starterStepTitle">{steps[currentStep].title}</div>
							<div className="starterStepBody">
								{steps[currentStep].description}
							</div>
							{steps[currentStep].key === "command" && (
								<div className="starterShortcut starterShortcutRow">
									{commandShortcutParts.map((part) => (
										<kbd key={part}>{part}</kbd>
									))}
								</div>
							)}
						</div>
						<div className="starterStepActions">
							<Button
								size="sm"
								onClick={() => handleAction(steps[currentStep].key)}
							>
								{steps[currentStep].key === "note"
									? "Create note"
									: steps[currentStep].key === "command"
										? "Open palette"
										: "Open daily note"}
							</Button>
							<Button size="sm" variant="ghost" onClick={advance}>
								Skip
							</Button>
						</div>
					</m.div>
				)}
			</AnimatePresence>

			{!complete && (
				<div className="starterDots">
					{steps.map((step, i) => (
						<m.div
							key={step.key}
							className={`starterDot ${i <= currentStep ? "starterDotActive" : ""}`}
							animate={{
								scale: i === currentStep ? 1.3 : 1,
								backgroundColor:
									i <= currentStep
										? "var(--interactive-accent)"
										: "var(--border-default)",
							}}
							transition={reduced ? { duration: 0 } : springPresets.gentle}
						/>
					))}
				</div>
			)}
		</div>
	);
}
