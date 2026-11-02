import { useTranslation } from "react-i18next";
import { useIsDarkTheme } from "../../../hooks/useIsDarkTheme";
import { type CustomUiThemeId, customThemeOptions } from "../../../lib/customThemes";
import { extractErrorMessage } from "../../../lib/errorUtils";
import { DURABLE_SETTINGS } from "../../../lib/settings";
import {
	DARK_THEME_OPTIONS,
	LIGHT_THEME_OPTIONS,
	type UiThemeOption,
	asUiDarkThemeId,
	asUiLightThemeId,
} from "../../../lib/uiThemes";
import { SettingsSection } from "../SettingsScaffold";
import type { ThemeCardMode } from "./ThemeCard";
import { ThemeCardRow } from "./ThemeCardRow";
import {
	pendingOr,
	useAppearanceSettingsQuery,
	useSettingWrite,
} from "./useAppearanceThemeSettings";
import { useRemoveCustomTheme } from "./useCustomThemeMutations";

interface ThemeChoiceSectionProps {
	mode: ThemeCardMode;
	builtIns: readonly UiThemeOption<string>[];
	selectedId: string | undefined;
	onSelect: (id: string) => void;
	selectError: unknown;
}

/** "Light theme" / "Dark theme": a titled panel holding that mode's card row. */
function ThemeChoiceSection({
	mode,
	builtIns,
	selectedId,
	onSelect,
	selectError,
}: ThemeChoiceSectionProps) {
	const { t } = useTranslation("settings.appearance");
	const isDark = useIsDarkTheme();
	const settings = useAppearanceSettingsQuery();
	const remove = useRemoveCustomTheme();
	const title = t(`themeCards.${mode}`);
	const active = (mode === "dark") === isDark;
	const error = settings.error ?? selectError ?? remove.error;

	return (
		<SettingsSection
			title={title}
			titleSuffix={active ? t("themeCards.activeSuffix") : undefined}
			searchId={`appearance-${mode}-theme`}
		>
			{settings.data ? (
				<ThemeCardRow
					mode={mode}
					label={title}
					builtIns={builtIns}
					customOptions={customThemeOptions(settings.data.ui.customThemes)}
					selectedId={selectedId}
					onSelect={onSelect}
					onRemove={(id: CustomUiThemeId) => remove.mutate(id)}
					removing={remove.isPending}
				/>
			) : null}
			{error ? (
				<div className="settingsError" role="alert">
					{extractErrorMessage(error)}
				</div>
			) : null}
		</SettingsSection>
	);
}

export function LightThemeSection() {
	const settings = useAppearanceSettingsQuery();
	const select = useSettingWrite(DURABLE_SETTINGS.lightThemeId);
	return (
		<ThemeChoiceSection
			mode="light"
			builtIns={LIGHT_THEME_OPTIONS}
			selectedId={pendingOr(select, settings.data?.ui.lightThemeId)}
			onSelect={(id) => select.mutate(asUiLightThemeId(id))}
			selectError={select.error}
		/>
	);
}

export function DarkThemeSection() {
	const settings = useAppearanceSettingsQuery();
	const select = useSettingWrite(DURABLE_SETTINGS.darkThemeId);
	return (
		<ThemeChoiceSection
			mode="dark"
			builtIns={DARK_THEME_OPTIONS}
			selectedId={pendingOr(select, settings.data?.ui.darkThemeId)}
			onSelect={(id) => select.mutate(asUiDarkThemeId(id))}
			selectError={select.error}
		/>
	);
}
