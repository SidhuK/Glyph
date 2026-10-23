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
const ACTION_SECONDS = 0.3;

interface OnboardingHelloProps {
	headingId: string;
	onDone: () => void;
	onSkip: () => void;
}

/** A greeting that waits for "Get Started"; Escape skips setup entirely. */
export function OnboardingHello({ headingId, onDone, onSkip }: OnboardingHelloProps) {
	const { t, i18n } = useTranslation("shell");
	const reduceMotion = useReducedMotion() === true;
	const [greeted, setGreeted] = useState(false);
	const showAction = greeted || reduceMotion;
	const label = t("onboarding.hello.title");

	return (
		<div
			ref={focusOnMount}
			tabIndex={-1}
			className="obHello"
			onKeyDown={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					onSkip();
				} else if (event.key === "Enter" && showAction && event.target === event.currentTarget) {
					event.preventDefault();
					onDone();
				}
			}}
		>
			<m.img
				src={glyphIconUrl}
				alt=""
				aria-hidden="true"
				className="obHelloIcon"
				initial={reduceMotion ? false : { opacity: 0, scale: 0.9 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: ICON_SECONDS, ease: ICON_EASE }}
			/>
			{i18n.language.startsWith("en") ? (
				<OnboardingHelloPath
					id={headingId}
					label={label}
					animated={!reduceMotion}
					onDrawn={() => setGreeted(true)}
				/>
			) : (
				<m.h1
					id={headingId}
					className="obHelloWord"
					initial={reduceMotion ? false : { opacity: 0, filter: "blur(8px)" }}
					animate={{ opacity: 1, filter: "blur(0px)" }}
					transition={{ duration: WORD_SECONDS, delay: WORD_DELAY_SECONDS, ease: ICON_EASE }}
					onAnimationComplete={() => setGreeted(true)}
				>
					{label}
				</m.h1>
			)}
			<div className="obHelloAction">
				{showAction ? (
					<m.button
						type="button"
						className="obButton"
						data-variant="primary"
						data-size="xl"
						initial={reduceMotion ? false : { opacity: 0 }}
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
