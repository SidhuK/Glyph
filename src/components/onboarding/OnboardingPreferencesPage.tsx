import { useTranslation } from "react-i18next";
import { LANGUAGE_OPTIONS } from "../../i18n/locales";
import type { EditorViewMode } from "../../lib/editorMode";
import { extractErrorMessage } from "../../lib/errorUtils";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { SettingsSelect } from "../settings/SettingsSelect";
import { getThemeModeOptions } from "../settings/themeModeOptions";
import { OnboardingPage } from "./OnboardingPage";
import { OnboardingPreferenceRow } from "./OnboardingPreferenceRow";
import { OnboardingSegmented } from "./OnboardingSegmented";
import { useOnboardingSetting } from "./useOnboardingSetting";

const TEXT_SIZES = [12, 13, 14, 16, 18] as const;
const EDITOR_MODES = ["rich", "preview", "plain"] as const satisfies readonly EditorViewMode[];

interface OnboardingPreferencesPageProps {
	headingId: string;
	isLastStep: boolean;
	onBack: () => void;
	onContinue: () => void;
	onSkip: () => void;
}

export function OnboardingPreferencesPage({
	headingId,
	isLastStep,
	onBack,
	onContinue,
	onSkip,
}: OnboardingPreferencesPageProps) {
	const { t } = useTranslation("shell");
	const { t: tGeneral } = useTranslation("settings.general");
	const theme = useOnboardingSetting(DURABLE_SETTINGS.theme);
	const language = useOnboardingSetting(DURABLE_SETTINGS.language);
	const editorMode = useOnboardingSetting(DURABLE_SETTINGS.editorDefaultEditorMode);
	const fontSize = useOnboardingSetting(DURABLE_SETTINGS.fontSize);
	const error = theme.error ?? language.error ?? editorMode.error ?? fontSize.error;
	const sizes: readonly number[] = TEXT_SIZES.some((size) => size === fontSize.value)
		? TEXT_SIZES
		: [...TEXT_SIZES, fontSize.value].sort((a, b) => a - b);

	return (
		<OnboardingPage
			headingId={headingId}
			title={t("onboarding.preferences.title")}
			subtitle={t("onboarding.preferences.subtitle")}
			onPrimary={onContinue}
			onEscape={onSkip}
			footer={
				<>
					<div className="obFooterLeading">
						<button type="button" className="obButton" data-variant="plain" onClick={onBack}>
							{t("onboarding.actions.back")}
						</button>
						<button type="button" className="obButton" data-variant="plain" onClick={onSkip}>
							{t("onboarding.actions.skip")}
						</button>
					</div>
					<div className="obFooterTrailing">
						<button type="button" className="obButton" data-variant="primary" onClick={onContinue}>
							{t(isLastStep ? "onboarding.actions.done" : "onboarding.actions.continue")}
						</button>
					</div>
				</>
			}
		>
			<ul className="obGroupedBox">
				<OnboardingPreferenceRow
					id="onboarding-theme"
					label={t("onboarding.preferences.appearance")}
				>
					<OnboardingSegmented
						labelledBy="onboarding-theme-label"
						value={theme.value}
						options={getThemeModeOptions().map(({ value, label }) => ({ value, label }))}
						onChange={theme.onChange}
					/>
				</OnboardingPreferenceRow>
				<OnboardingPreferenceRow
					id="onboarding-language"
					label={t("onboarding.preferences.language")}
				>
					<SettingsSelect
						id="onboarding-language"
						className="obPopUp"
						aria-label={t("onboarding.preferences.language")}
						value={language.value}
						options={LANGUAGE_OPTIONS.map((option) => ({
							value: option.id,
							label: option.nativeLabel,
						}))}
						onValueChange={language.onChange}
					/>
				</OnboardingPreferenceRow>
				<OnboardingPreferenceRow
					id="onboarding-editor-mode"
					label={t("onboarding.preferences.editorMode")}
				>
					<SettingsSelect
						id="onboarding-editor-mode"
						className="obPopUp"
						aria-label={t("onboarding.preferences.editorMode")}
						value={editorMode.value}
						options={EDITOR_MODES.map((mode) => ({
							value: mode,
							label: tGeneral(`editor.defaultEditorMode.options.${mode}`),
						}))}
						onValueChange={editorMode.onChange}
					/>
				</OnboardingPreferenceRow>
				<OnboardingPreferenceRow
					id="onboarding-text-size"
					label={t("onboarding.preferences.textSize")}
				>
					<SettingsSelect
						id="onboarding-text-size"
						className="obPopUp"
						aria-label={t("onboarding.preferences.textSize")}
						value={fontSize.value}
						options={sizes.map((size) => ({
							value: size,
							label: t("onboarding.preferences.textSizeValue", { size }),
						}))}
						onValueChange={fontSize.onChange}
					/>
				</OnboardingPreferenceRow>
			</ul>
			{error ? (
				<p role="alert" className="onboardingError">
					{t("onboarding.errors.savePreference", { message: extractErrorMessage(error) })}
				</p>
			) : null}
		</OnboardingPage>
	);
}
