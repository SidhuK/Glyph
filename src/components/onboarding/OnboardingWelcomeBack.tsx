import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import glyphIconUrl from "../../../src-tauri/icons/icon.png";
import { GlyphBloom } from "../easter-eggs/glyph-bloom/GlyphBloom";
import { useSpaceSelections } from "./OnboardingSpaceChoices";
import { pageVariants, revealVariants } from "./onboardingMotion";

/** The no-space screen once onboarding is complete. */
export function OnboardingWelcomeBack() {
	const { t } = useTranslation("shell");
	const selections = useSpaceSelections();
	return (
		<m.div
			className="onboardingWelcomeBack obContent"
			custom={1}
			variants={pageVariants}
			initial="enter"
			animate="center"
		>
			<m.div className="obWelcomeBackIcon" variants={revealVariants}>
				<GlyphBloom iconUrl={glyphIconUrl} />
			</m.div>
			<m.h1 className="obTitle" variants={revealVariants}>
				{t("onboarding.welcomeBack.title")}
			</m.h1>
			<m.p className="obSubtitle" variants={revealVariants}>
				{t("onboarding.welcomeBack.subtitle")}
			</m.p>
			<m.div className="obWelcomeBackActions" variants={revealVariants}>
				<button
					type="button"
					className="obButton"
					data-variant="primary"
					disabled={selections.busy}
					aria-busy={selections.create.isPending}
					onClick={selections.startCreate}
				>
					{t("onboarding.welcomeBack.create")}
				</button>
				<button
					type="button"
					className="obButton"
					data-variant="default"
					disabled={selections.busy}
					aria-busy={selections.open.isPending}
					onClick={selections.startOpen}
				>
					{t("onboarding.welcomeBack.open")}
				</button>
			</m.div>
			{selections.error ? (
				<p role="alert" className="onboardingError">
					{selections.error.message}
				</p>
			) : null}
		</m.div>
	);
}
