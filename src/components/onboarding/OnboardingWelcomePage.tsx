import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { CheckListIcon, File01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { m } from "motion/react";
import { useTranslation } from "react-i18next";
import glyphIconUrl from "../../../src-tauri/icons/icon.png";
import { OnboardingPage } from "./OnboardingPage";
import { revealVariants } from "./onboardingMotion";

const FEATURE_ICON_SIZE = 28;

const FEATURES = [
	{ id: "markdown", icon: File01Icon },
	{ id: "organize", icon: CheckListIcon },
	{ id: "tools", icon: SparklesIcon },
] as const;

interface OnboardingWelcomePageProps {
	headingId: string;
	onContinue: () => void;
	onSkip: () => void;
}

export function OnboardingWelcomePage({
	headingId,
	onContinue,
	onSkip,
}: OnboardingWelcomePageProps) {
	const { t } = useTranslation("shell");
	return (
		<OnboardingPage
			headingId={headingId}
			title={t("onboarding.welcome.title")}
			icon={<img className="onboardingAppIcon" src={glyphIconUrl} alt="" />}
			onPrimary={onContinue}
			onEscape={onSkip}
			footer={
				<>
					<div className="obFooterLeading">
						<button type="button" className="obButton" data-variant="plain" onClick={onSkip}>
							{t("onboarding.actions.skip")}
						</button>
					</div>
					<div className="obFooterTrailing">
						<button type="button" className="obButton" data-variant="primary" onClick={onContinue}>
							{t("onboarding.actions.continue")}
						</button>
					</div>
				</>
			}
		>
			<ul className="obFeatureList">
				{FEATURES.map((feature) => (
					<m.li key={feature.id} className="obFeatureRow" variants={revealVariants}>
						<span className="obFeatureIcon" aria-hidden="true">
							<HugeiconsIcon icon={feature.icon} size={FEATURE_ICON_SIZE} />
						</span>
						<span className="obFeatureText">
							<span className="obFeatureTitle">
								{t(`onboarding.welcome.features.${feature.id}.title`)}
							</span>
							<span className="obFeatureBody">
								{t(`onboarding.welcome.features.${feature.id}.body`)}
							</span>
						</span>
					</m.li>
				))}
			</ul>
		</OnboardingPage>
	);
}
