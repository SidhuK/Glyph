import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	applyUiSurfacePreferences,
	applyUiThemeSelection,
} from "../../lib/appearance";
import {
	type CustomTheme,
	applyCustomThemes,
	customThemeId,
	customThemeOptions,
} from "../../lib/customThemes";
import {
	DEFAULT_UI_TRANSLUCENT_APP,
	type EditorWidthMode,
	type ThemeMode,
	type UiDarkThemeId,
	type UiLightThemeId,
	loadSettings,
} from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
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
import { AppearanceCornerRadiusCard } from "./AppearanceCornerRadiusCard";
import { AppearanceCustomThemesCard } from "./AppearanceCustomThemesCard";
import { AppearanceThemeCard } from "./AppearanceThemeCard";
import { AppearanceTypographyCard } from "./AppearanceTypographyCard";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import { useAppearanceCornerRadius } from "./useAppearanceCornerRadius";
import { useAppearanceTypography } from "./useAppearanceTypography";
import { applyIfBoolean, useSettingsBoolean } from "./useSettingsBoolean";
import { useSettingsValue } from "./useSettingsValue";

const EDITOR_WIDTH_VALUES = [
	"compact",
	"comfortable",
	"wide",
] as const satisfies readonly EditorWidthMode[];

export function AppearanceSettingsPane() {
	const { t } = useTranslation("settings.appearance");
	const { setTheme } = useTheme();
	const [customThemes, setCustomThemesState] = useState<CustomTheme[]>([]);
	const [error, setError] = useState("");
	const [isHydrated, setIsHydrated] = useState(false);
	const themeMode = useSettingsValue<ThemeMode>(
		"system",
		DURABLE_SETTINGS.theme.write,
		setError,
	);
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
	const editorWidthMode = useSettingsValue<EditorWidthMode>(
		"compact",
		DURABLE_SETTINGS.editorWidthMode.write,
		setError,
	);
	const beautifulTags = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.editorBeautifulTags.write,
		setError,
	);
	const folioMode = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.folioMode.write,
		setError,
	);
	const classicAllNotes = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.classicAllNotesByDefault.write,
		setError,
	);
	const showColumnColor = useSettingsBoolean(
		true,
		DURABLE_SETTINGS.databaseShowColumnColor.write,
		setError,
	);
	const {
		cornerRadiusStyle,
		setCornerRadiusStyle,
		setInitialCornerRadiusStyle,
		onCornerRadiusStyleChange,
	} = useAppearanceCornerRadius({ setError, isHydrated });
	const {
		fontFamily,
		editorFontFamily,
		monoFontFamily,
		uiFontSize,
		editorFontSize,
		availableFonts,
		availableMonospaceFonts,
		onFontFamilyChange,
		onEditorFontFamilyChange,
		onMonoFontFamilyChange,
		onUiFontSizeChange,
		onEditorFontSizeChange,
		setInitialTypography,
		setFontFamily,
		setEditorFontFamily,
		setMonoFontFamily,
		setUiFontSize,
		setEditorFontSize,
	} = useAppearanceTypography({ setError, isHydrated });

	const setBeautifulTagsChecked = beautifulTags.setChecked;
	const setFolioModeChecked = folioMode.setChecked;
	const setClassicAllNotesChecked = classicAllNotes.setChecked;
	const setShowColumnColorChecked = showColumnColor.setChecked;

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
				setBeautifulTagsChecked(settings.editor.beautifulTags);
				editorWidthMode.setInitialValue(settings.editor.editorWidthMode);
				setFolioModeChecked(settings.ui.folioMode);
				setClassicAllNotesChecked(settings.ui.classicAllNotesByDefault);
				setShowColumnColorChecked(settings.database.showColumnColor);
				setInitialCornerRadiusStyle(settings.ui.cornerRadiusStyle);
				setInitialTypography(settings);
				setIsHydrated(true);
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
		setBeautifulTagsChecked,
		setClassicAllNotesChecked,
		setFolioModeChecked,
		setShowColumnColorChecked,
		darkThemeId.setInitialValue,
		editorWidthMode.setInitialValue,
		lightThemeId.setInitialValue,
		setInitialCornerRadiusStyle,
		setInitialTypography,
		themeMode.setInitialValue,
		translucentApp.setInitialValue,
	]);

	useEffect(() => {
		if (!isHydrated) return;
		setTheme(themeMode.value);
	}, [isHydrated, setTheme, themeMode.value]);

	useEffect(() => {
		if (!isHydrated) return;
		applyUiThemeSelection(lightThemeId.value, darkThemeId.value);
	}, [darkThemeId.value, isHydrated, lightThemeId.value]);

	useEffect(() => {
		if (!isHydrated) return;
		applyUiSurfacePreferences({ translucentApp: translucentApp.value });
	}, [isHydrated, translucentApp.value]);

	useEffect(() => {
		if (!isHydrated) return;
		applyCustomThemes(customThemes);
	}, [customThemes, isHydrated]);

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
		if (payload.ui?.lightThemeId)
			lightThemeId.setValue(payload.ui.lightThemeId);
		if (payload.ui?.darkThemeId) darkThemeId.setValue(payload.ui.darkThemeId);
		applyIfBoolean(payload.ui?.translucentApp, translucentApp.setValue);
		if (payload.ui?.cornerRadiusStyle) {
			setCornerRadiusStyle(payload.ui.cornerRadiusStyle);
		}
		if (typeof payload.ui?.fontFamily === "string") {
			setFontFamily(payload.ui.fontFamily);
		}
		if (typeof payload.ui?.editorFontFamily === "string") {
			setEditorFontFamily(payload.ui.editorFontFamily);
		}
		if (typeof payload.ui?.monoFontFamily === "string") {
			setMonoFontFamily(payload.ui.monoFontFamily);
		}
		if (typeof payload.ui?.fontSize === "number") {
			setUiFontSize(payload.ui.fontSize);
		}
		if (typeof payload.ui?.editorFontSize === "number") {
			setEditorFontSize(payload.ui.editorFontSize);
		}
		applyIfBoolean(payload.editor?.beautifulTags, setBeautifulTagsChecked);
		if (
			payload.editor?.editorWidthMode === "compact" ||
			payload.editor?.editorWidthMode === "comfortable" ||
			payload.editor?.editorWidthMode === "wide"
		) {
			editorWidthMode.setValue(payload.editor.editorWidthMode);
		}
		applyIfBoolean(payload.ui?.folioMode, setFolioModeChecked);
		applyIfBoolean(
			payload.ui?.classicAllNotesByDefault,
			setClassicAllNotesChecked,
		);
		applyIfBoolean(
			payload.database?.showColumnColor,
			setShowColumnColorChecked,
		);
	});

	const onThemeModeChange = useCallback(
		async (next: ThemeMode) => {
			themeMode.onChange(next);
		},
		[themeMode.onChange],
	);

	const onLightThemeChange = useCallback(
		async (next: UiLightThemeId | string) => {
			lightThemeId.onChange(asUiLightThemeId(next));
		},
		[lightThemeId.onChange],
	);

	const onDarkThemeChange = useCallback(
		async (next: UiDarkThemeId | string) => {
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
				lightThemeId.value === removedId
					? GLYPH_DEFAULT_LIGHT_THEME_ID
					: lightThemeId.value;
			const nextDark =
				darkThemeId.value === removedId
					? GLYPH_DEFAULT_DARK_THEME_ID
					: darkThemeId.value;
			if (nextLight !== lightThemeId.value) {
				await DURABLE_SETTINGS.lightThemeId.write(nextLight);
				lightThemeId.setValue(nextLight);
			}
			if (nextDark !== darkThemeId.value) {
				await DURABLE_SETTINGS.darkThemeId.write(nextDark);
				darkThemeId.setValue(nextDark);
			}
			await persistCustomThemes(
				customThemes.filter(
					(existing) => customThemeId(existing.name) !== removedId,
				),
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
				<AppearanceTypographyCard
					fontFamily={fontFamily}
					editorFontFamily={editorFontFamily}
					monoFontFamily={monoFontFamily}
					uiFontSize={uiFontSize}
					editorFontSize={editorFontSize}
					availableFonts={availableFonts}
					availableMonospaceFonts={availableMonospaceFonts}
					onFontFamilyChange={onFontFamilyChange}
					onEditorFontFamilyChange={onEditorFontFamilyChange}
					onMonoFontFamilyChange={onMonoFontFamilyChange}
					onUiFontSizeChange={onUiFontSizeChange}
					onEditorFontSizeChange={onEditorFontSizeChange}
				/>
				<SettingsSection
					title={t("layout.sectionTitle")}
					description={t("layout.sectionDescription")}
				>
					<SettingsRow
						label={t("layout.folioMode.label")}
						description={t("layout.folioMode.description")}
					>
						<SettingsToggle
							checked={folioMode.checked}
							disabled={folioMode.isSaving}
							ariaLabel={t("layout.folioMode.ariaLabel")}
							onCheckedChange={folioMode.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("layout.classicAllNotes.label")}
						description={t("layout.classicAllNotes.description")}
					>
						<SettingsToggle
							checked={classicAllNotes.checked}
							disabled={classicAllNotes.isSaving}
							ariaLabel={t("layout.classicAllNotes.ariaLabel")}
							onCheckedChange={classicAllNotes.onCheckedChange}
						/>
					</SettingsRow>
				</SettingsSection>
				<SettingsSection
					title={t("editorPresentation.sectionTitle")}
					description={t("editorPresentation.sectionDescription")}
				>
					<SettingsRow
						label={t("editorPresentation.beautifulTags.label")}
						description={t("editorPresentation.beautifulTags.description")}
					>
						<SettingsToggle
							checked={beautifulTags.checked}
							disabled={beautifulTags.isSaving}
							ariaLabel={t("editorPresentation.beautifulTags.ariaLabel")}
							onCheckedChange={beautifulTags.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editorPresentation.editorWidth.label")}
						description={t("editorPresentation.editorWidth.description")}
						interactive={false}
					>
						<SettingsSelect
							aria-label={t("editorPresentation.editorWidth.ariaLabel")}
							value={editorWidthMode.value}
							disabled={editorWidthMode.isSaving}
							onChange={(event) => {
								const nextMode = event.currentTarget.value;
								if (
									nextMode !== "compact" &&
									nextMode !== "comfortable" &&
									nextMode !== "wide"
								) {
									return;
								}
								editorWidthMode.onChange(nextMode);
							}}
						>
							{EDITOR_WIDTH_VALUES.map((value) => (
								<option key={value} value={value}>
									{t(`editorPresentation.editorWidth.options.${value}`)}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
				</SettingsSection>
				<SettingsSection
					title={t("database.sectionTitle")}
					description={t("database.sectionDescription")}
				>
					<SettingsRow
						label={t("database.showColumnColor.label")}
						description={t("database.showColumnColor.description")}
					>
						<SettingsToggle
							checked={showColumnColor.checked}
							disabled={showColumnColor.isSaving}
							ariaLabel={t("database.showColumnColor.ariaLabel")}
							onCheckedChange={showColumnColor.onCheckedChange}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
