import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { type CustomTheme, customThemeId, customThemeOptions } from "../../lib/customThemes";
import { FILE_TREE_SORT_MODES, fileTreeSortLabel } from "../../lib/fileTreeSort";
import {
	DEFAULT_UI_TRANSLUCENT_APP,
	type ThemeMode,
	type UiDarkThemeId,
	type UiLightThemeId,
	loadSettings,
} from "../../lib/settings";
import {
	DEFAULT_FILE_TREE_SORT_MODE,
	DURABLE_SETTINGS,
	isFileTreeSortMode,
} from "../../lib/settings/definitions";
import type { FileTreeSortMode } from "../../lib/settings/model";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	DARK_THEME_OPTIONS,
	GLYPH_DEFAULT_DARK_THEME_ID,
	GLYPH_DEFAULT_LIGHT_THEME_ID,
	LIGHT_THEME_OPTIONS,
	type UiThemeOption,
	asUiDarkThemeId,
	asUiLightThemeId,
	getUiDarkThemeOption,
	getUiLightThemeOption,
} from "../../lib/uiThemes";
import { AppearanceAppIconCard } from "./AppearanceAppIconCard";
import { AppearanceCornerRadiusCard } from "./AppearanceCornerRadiusCard";
import { AppearanceCustomThemesCard } from "./AppearanceCustomThemesCard";
import { AppearanceLayoutPreview } from "./AppearancePreviewFrame";
import { AppearanceThemeCard } from "./AppearanceThemeCard";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { SettingsSegmentedPicker } from "./SettingsSegmentedPicker";
import { SettingsSelect } from "./SettingsSelect";
import { useAppearanceCornerRadius } from "./useAppearanceCornerRadius";
import { applyIfBoolean, useSettingsBoolean } from "./useSettingsBoolean";
import { useSettingsValue } from "./useSettingsValue";

export function AppearanceSettingsPane() {
	const { t } = useTranslation("settings.appearance");
	const [customThemes, setCustomThemesState] = useState<CustomTheme[]>([]);
	const [error, setError] = useState("");
	const folioMode = useSettingsBoolean(false, DURABLE_SETTINGS.folioMode.write, setError);
	const folioSortMode = useSettingsValue<FileTreeSortMode>(
		DEFAULT_FILE_TREE_SORT_MODE,
		DURABLE_SETTINGS.folioSortMode.write,
		setError,
	);
	const themeMode = useSettingsValue<ThemeMode>("system", DURABLE_SETTINGS.theme.write, setError);
	const lightThemeId = useSettingsValue<UiLightThemeId>(
		GLYPH_DEFAULT_LIGHT_THEME_ID,
		DURABLE_SETTINGS.lightThemeId.write,
		setError,
	);
	const darkThemeId = useSettingsValue<UiDarkThemeId>(
		GLYPH_DEFAULT_DARK_THEME_ID,
		DURABLE_SETTINGS.darkThemeId.write,
		setError,
	);
	const translucentApp = useSettingsValue<boolean>(
		DEFAULT_UI_TRANSLUCENT_APP,
		DURABLE_SETTINGS.translucentApp.write,
		setError,
	);
	const {
		cornerRadiusStyle,
		setCornerRadiusStyle,
		setInitialCornerRadiusStyle,
		onCornerRadiusStyleChange,
	} = useAppearanceCornerRadius({ setError });

	const setInitialFolioMode = folioMode.setInitialChecked;
	const workspaceLayout = folioMode.checked ? "folio" : "default";
	const workspaceLayoutOptions = [
		{
			value: "default",
			label: t("layout.folioMode.options.default.label"),
			description: t("layout.folioMode.options.default.description"),
		},
		{
			value: "folio",
			label: t("layout.folioMode.options.folio.label"),
			description: t("layout.folioMode.options.folio.description"),
		},
	] as const;

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				themeMode.setInitialValue(settings.ui.theme);
				lightThemeId.setInitialValue(settings.ui.lightThemeId);
				darkThemeId.setInitialValue(settings.ui.darkThemeId);
				translucentApp.setInitialValue(settings.ui.translucentApp);
				setCustomThemesState(settings.ui.customThemes);
				setInitialFolioMode(settings.ui.folioMode);
				folioSortMode.setInitialValue(settings.ui.folioSortMode);
				setInitialCornerRadiusStyle(settings.ui.cornerRadiusStyle);
			} catch (e) {
				if (!cancelled) {
					setError(e instanceof Error ? e.message : "Failed to load settings");
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [
		setInitialFolioMode,
		darkThemeId.setInitialValue,
		lightThemeId.setInitialValue,
		setInitialCornerRadiusStyle,
		themeMode.setInitialValue,
		translucentApp.setInitialValue,
		folioSortMode.setInitialValue,
	]);

	useTauriEvent("settings:updated", (payload) => {
		if (payload.ui?.customThemes) {
			setCustomThemesState(payload.ui.customThemes);
		}
		if (
			payload.ui?.theme === "system" ||
			payload.ui?.theme === "light" ||
			payload.ui?.theme === "dark"
		) {
			themeMode.setValue(payload.ui.theme);
		}
		if (payload.ui?.lightThemeId) lightThemeId.setValue(payload.ui.lightThemeId);
		if (payload.ui?.darkThemeId) darkThemeId.setValue(payload.ui.darkThemeId);
		applyIfBoolean(payload.ui?.translucentApp, translucentApp.setValue);
		applyIfBoolean(payload.ui?.folioMode, folioMode.setChecked);
		if (payload.ui?.folioSortMode && !folioSortMode.isSaving) {
			folioSortMode.setValue(payload.ui.folioSortMode);
		}
		if (payload.ui?.cornerRadiusStyle) {
			setCornerRadiusStyle(payload.ui.cornerRadiusStyle);
		}
	});

	const onThemeModeChange = useCallback(
		async (next: ThemeMode) => {
			themeMode.onChange(next);
		},
		[themeMode.onChange],
	);

	const onLightThemeChange = useCallback(
		async (next: string) => {
			lightThemeId.onChange(asUiLightThemeId(next));
		},
		[lightThemeId.onChange],
	);

	const onDarkThemeChange = useCallback(
		async (next: string) => {
			darkThemeId.onChange(asUiDarkThemeId(next));
		},
		[darkThemeId.onChange],
	);

	const onTranslucentAppChange = useCallback(
		async (next: boolean) => {
			translucentApp.onChange(next);
		},
		[translucentApp.onChange],
	);

	const persistCustomThemes = useCallback(async (next: CustomTheme[]) => {
		await DURABLE_SETTINGS.customThemes.write(next);
		setCustomThemesState(next);
	}, []);

	const onCustomThemeImport = useCallback(
		async (theme: CustomTheme) => {
			setError("");
			await persistCustomThemes([...customThemes, theme]);
		},
		[customThemes, persistCustomThemes],
	);

	const onCustomThemeRemove = useCallback(
		async (theme: CustomTheme) => {
			setError("");
			const removedId = customThemeId(theme.name);
			const nextLight =
				lightThemeId.value === removedId ? GLYPH_DEFAULT_LIGHT_THEME_ID : lightThemeId.value;
			const nextDark =
				darkThemeId.value === removedId ? GLYPH_DEFAULT_DARK_THEME_ID : darkThemeId.value;
			if (nextLight !== lightThemeId.value) {
				await DURABLE_SETTINGS.lightThemeId.write(nextLight);
				lightThemeId.setValue(nextLight);
			}
			if (nextDark !== darkThemeId.value) {
				await DURABLE_SETTINGS.darkThemeId.write(nextDark);
				darkThemeId.setValue(nextDark);
			}
			await persistCustomThemes(
				customThemes.filter((existing) => customThemeId(existing.name) !== removedId),
			);
		},
		[
			customThemes,
			darkThemeId.setValue,
			darkThemeId.value,
			lightThemeId.setValue,
			lightThemeId.value,
			persistCustomThemes,
		],
	);

	const lightOptions: readonly UiThemeOption<UiLightThemeId>[] = [
		...LIGHT_THEME_OPTIONS,
		...customThemeOptions(customThemes),
	];
	const darkOptions: readonly UiThemeOption<UiDarkThemeId>[] = [
		...DARK_THEME_OPTIONS,
		...customThemeOptions(customThemes),
	];
	const lightTheme =
		lightOptions.find((option) => option.id === lightThemeId.value) ??
		getUiLightThemeOption(lightThemeId.value);
	const darkTheme =
		darkOptions.find((option) => option.id === darkThemeId.value) ??
		getUiDarkThemeOption(darkThemeId.value);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<AppearanceAppIconCard />
				<AppearanceThemeCard
					themeMode={themeMode.value}
					lightTheme={lightTheme}
					darkTheme={darkTheme}
					lightOptions={lightOptions}
					darkOptions={darkOptions}
					translucentApp={translucentApp.value}
					onThemeModeChange={onThemeModeChange}
					onLightThemeChange={onLightThemeChange}
					onDarkThemeChange={onDarkThemeChange}
					onTranslucentAppChange={onTranslucentAppChange}
				/>
				<AppearanceCustomThemesCard
					customThemes={customThemes}
					onImport={onCustomThemeImport}
					onRemove={onCustomThemeRemove}
				/>
				<AppearanceCornerRadiusCard
					cornerRadiusStyle={cornerRadiusStyle}
					onCornerRadiusStyleChange={onCornerRadiusStyleChange}
				/>
				<SettingsSection
					title={t("layout.sectionTitle")}
					description={t("layout.sectionDescription")}
				>
					<SettingsRow
						label={t("layout.folioMode.label")}
						description={t("layout.folioMode.description")}
						interactive={false}
						searchId="appearance-layout-folio-mode"
					>
						<SettingsSegmentedPicker
							name="settings-workspace-layout"
							ariaLabel={t("layout.folioMode.ariaLabel")}
							value={workspaceLayout}
							options={workspaceLayoutOptions}
							disabled={folioMode.isSaving}
							onChange={(layout) => folioMode.onCheckedChange(layout === "folio")}
							renderPreview={(layout) => <AppearanceLayoutPreview layout={layout} />}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("layout.folioSort.label")}
						description={t("layout.folioSort.description")}
						interactive={false}
						searchId="appearance-layout-folio-sort"
					>
						<SettingsSelect
							aria-label={t("layout.folioSort.ariaLabel")}
							value={folioSortMode.value}
							disabled={folioSortMode.isSaving}
							onChange={(event) => {
								const nextSortMode = event.currentTarget.value;
								if (isFileTreeSortMode(nextSortMode)) folioSortMode.onChange(nextSortMode);
							}}
						>
							{FILE_TREE_SORT_MODES.map((mode) => (
								<option key={mode} value={mode}>
									{fileTreeSortLabel(mode)}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
