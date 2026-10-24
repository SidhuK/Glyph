import { m, useReducedMotion } from "motion/react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import glyphIconUrl from "../../../src-tauri/icons/icon.png";
import { OnboardingHelloPath } from "./OnboardingHelloPath";
import { focusOnMount } from "./onboardingMotion";

const ICON_SECONDS = 0.6;
const ICON_EASE = [0.16, 1, 0.3, 1] as const;
const WORD_SECONDS = 0.8;
const WORD_DELAY_SECONDS = 0.4;
const WORD_START_SCALE = 0.96;
const ACTION_SECONDS = 0.3;

interface OnboardingHelloProps {
	headingId: string;
	onDone: () => void;
	onSkip: () => void;
}

/** A greeting that waits for "Get Started"; any click or key jumps the intro to its end, Escape skips setup. */
export function OnboardingHello({ headingId, onDone, onSkip }: OnboardingHelloProps) {
	const { t, i18n } = useTranslation("shell");
	const reduceMotion = useReducedMotion() === true;
	const [greeted, setGreeted] = useState(false);
	const [introSkipped, setIntroSkipped] = useState(false);
	const animated = !reduceMotion && !introSkipped;
	const showAction = greeted || !animated;
	// Remounting with `initial={false}` is how a running motion animation jumps to its end state.
	const introKey = introSkipped ? "still" : "intro";
	const label = t("onboarding.hello.title");

	return (
		<div
			ref={focusOnMount}
			tabIndex={-1}
			className="obHello"
			onClick={() => {
				if (!showAction) setIntroSkipped(true);
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onSkip();
				} else if (!showAction) {
					event.preventDefault();
					setIntroSkipped(true);
				} else if (event.key === "Enter" && event.target === event.currentTarget) {
					event.preventDefault();
					onDone();
				}
			}}
		>
			<m.img
				key={introKey}
				src={glyphIconUrl}
				alt=""
				aria-hidden="true"
				className="obHelloIcon"
				initial={animated ? { opacity: 0, scale: 0.9 } : false}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: ICON_SECONDS, ease: ICON_EASE }}
			/>
			{i18n.language.startsWith("en") ? (
				<OnboardingHelloPath
					key={introKey}
					id={headingId}
					label={label}
					animated={animated}
					onDrawn={() => setGreeted(true)}
				/>
			) : (
				<m.h1
					key={introKey}
					id={headingId}
					className="obHelloWord"
					initial={animated ? { opacity: 0, scale: WORD_START_SCALE } : false}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: WORD_SECONDS, delay: WORD_DELAY_SECONDS, ease: ICON_EASE }}
					onAnimationComplete={() => setGreeted(true)}
				>
					{label}
				</m.h1>
			)}
			<div className="obHelloAction">
				{showAction ? (
					<m.button
						ref={focusOnMount}
						type="button"
						className="obButton"
						data-variant="primary"
						data-size="xl"
						initial={animated ? { opacity: 0 } : false}
						animate={{ opacity: 1 }}
						transition={{ duration: ACTION_SECONDS }}
						onClick={onDone}
					>
						{t("onboarding.hello.getStarted")}
					</m.button>
				) : null}
			</div>
		</div>
	);
}
