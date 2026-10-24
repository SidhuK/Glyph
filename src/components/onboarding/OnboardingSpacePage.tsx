import { useTranslation } from "react-i18next";
import { OnboardingPage } from "./OnboardingPage";
import { OnboardingSpaceChoices } from "./OnboardingSpaceChoices";

interface OnboardingSpacePageProps {
	headingId: string;
	onBack: () => void;
	beforeSelect: () => Promise<void>;
}

export function OnboardingSpacePage({ headingId, onBack, beforeSelect }: OnboardingSpacePageProps) {
	const { t } = useTranslation("shell");
	return (
		<OnboardingPage
			headingId={headingId}
			title={t("onboarding.space.title")}
			subtitle={t("onboarding.space.subtitle")}
			footer={
				<div className="obFooterLeading">
					<button type="button" className="obButton" data-variant="plain" onClick={onBack}>
						{t("onboarding.actions.back")}
					</button>
				</div>
			}
		>
			<OnboardingSpaceChoices beforeSelect={beforeSelect} />
		</OnboardingPage>
	);
}
