import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TFunction } from "i18next";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { type ComponentType, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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

function buildSteps(t: TFunction<"ui">, showDailyNote: boolean): Step[] {
	const steps: Step[] = [
		{
			key: "note",
			title: t("onboarding.firstNoteTitle"),
			description: t("onboarding.firstNoteDescription"),
			icon: FileText,
		},
		{
			key: "command",
			title: t("onboarding.paletteTitle"),
			description: t("onboarding.paletteDescription"),
			icon: Command,
		},
	];
	if (showDailyNote) {
		steps.push({
			key: "daily",
			title: t("onboarding.dailyTitle"),
			description: t("onboarding.dailyDescription"),
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
	const { t } = useTranslation("ui");
	const transition = reduced
		? { duration: 0 }
		: { ...springPresets.gentle, duration: 0.6 };

	return (
		<div
			className="starterProgressRing"
			role="progressbar"
			aria-label={t("onboarding.progress")}
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
				<title>{t("onboarding.progressRing")}</title>
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
							size="var(--icon-xl)"
							strokeWidth={0.9}
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
	const { t } = useTranslation("ui");
	const steps = useMemo(
		() => buildSteps(t, showDailyNoteAction),
		[showDailyNoteAction, t],
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
					<div className="starterPaneTitle">{t("onboarding.title")}</div>
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
						aria-label={t("onboarding.dismiss")}
					>
						<X size="var(--icon-md)" />
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
						<p className="starterStepTitle">{t("onboarding.completeTitle")}</p>
						<p className="starterStepBody">
							{t("onboarding.completeDescription")}
						</p>
						<Button onClick={onDismiss}>{t("onboarding.startWriting")}</Button>
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
								return <Icon size="var(--icon-2xl)" />;
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
									? t("onboarding.createNote")
									: steps[currentStep].key === "command"
										? t("onboarding.openPalette")
										: t("onboarding.openDailyNote")}
							</Button>
							<Button size="sm" variant="ghost" onClick={advance}>
								{t("onboarding.skip")}
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
