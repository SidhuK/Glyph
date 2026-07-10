import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	applyUiSurfacePreferences,
	applyUiThemeSelection,
} from "../../lib/appearance";
import {
	DEFAULT_UI_TRANSLUCENT_APP,
	type EditorWidthMode,
	type ThemeMode,
	type UiDarkThemeId,
	type UiLightThemeId,
	loadSettings,
	setClassicAllNotesByDefault,
	setDatabaseShowColumnColor,
	setEditorBeautifulTags,
	setEditorWidthMode,
	setFolioMode,
	setThemeMode,
	setUiDarkThemeId,
	setUiLightThemeId,
	setUiTranslucentApp,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	DARK_THEME_OPTIONS,
	GLYPH_DEFAULT_DARK_THEME_ID,
	GLYPH_DEFAULT_LIGHT_THEME_ID,
	LIGHT_THEME_OPTIONS,
	asUiDarkThemeId,
	asUiLightThemeId,
	getUiDarkThemeOption,
	getUiLightThemeOption,
} from "../../lib/uiThemes";
import { AppearanceCornerRadiusCard } from "./AppearanceCornerRadiusCard";
import { AppearanceThemeCard } from "./AppearanceThemeCard";
import { AppearanceTypographyCard } from "./AppearanceTypographyCard";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import { useAppearanceCornerRadius } from "./useAppearanceCornerRadius";
import { useAppearanceThemeColors } from "./useAppearanceThemeColors";
import { useAppearanceTypography } from "./useAppearanceTypography";
import { applyIfBoolean, useSettingsBoolean } from "./useSettingsBoolean";

const EDITOR_WIDTH_VALUES = [
	"compact",
	"comfortable",
	"wide",
] as const satisfies readonly EditorWidthMode[];

export function AppearanceSettingsPane() {
	const { t } = useTranslation("settings.appearance");
	const { setTheme } = useTheme();
	const [themeMode, setThemeModeState] = useState<ThemeMode>("system");
	const [lightThemeId, setLightThemeIdState] = useState<UiLightThemeId>(
		GLYPH_DEFAULT_LIGHT_THEME_ID,
	);
	const [darkThemeId, setDarkThemeIdState] = useState<UiDarkThemeId>(
		GLYPH_DEFAULT_DARK_THEME_ID,
	);
	const [translucentApp, setTranslucentAppState] = useState(
		DEFAULT_UI_TRANSLUCENT_APP,
	);
	const [editorWidthMode, setEditorWidthModeState] =
		useState<EditorWidthMode>("compact");
	const [isSavingEditorWidthMode, setIsSavingEditorWidthMode] = useState(false);
	const [error, setError] = useState("");
	const beautifulTags = useSettingsBoolean(
		false,
		setEditorBeautifulTags,
		setError,
	);
	const folioMode = useSettingsBoolean(false, setFolioMode, setError);
	const classicAllNotes = useSettingsBoolean(
		false,
		setClassicAllNotesByDefault,
		setError,
	);
	const showColumnColor = useSettingsBoolean(
		true,
		setDatabaseShowColumnColor,
		setError,
	);
	const { cornerRadiusStyle, onCornerRadiusStyleChange } =
		useAppearanceCornerRadius({ setError });
	const themeAppearance = useAppearanceThemeColors({
		setError,
		lightThemeId,
		darkThemeId,
	});
	const {
		accent,
		themeColors,
		showLightColorPickers,
		showDarkColorPickers,
		showAccentPicker,
		onAppearanceSettingsLoaded,
		onAccentChange,
		onAccentReset,
		onThemeColorChange,
	} = themeAppearance;
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
	} = useAppearanceTypography({ setError });

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
				setThemeModeState(settings.ui.theme);
				setLightThemeIdState(settings.ui.lightThemeId);
				setDarkThemeIdState(settings.ui.darkThemeId);
				setTranslucentAppState(settings.ui.translucentApp);
				setBeautifulTagsChecked(settings.editor.beautifulTags);
				setEditorWidthModeState(settings.editor.editorWidthMode);
				setFolioModeChecked(settings.ui.folioMode);
				setClassicAllNotesChecked(settings.ui.classicAllNotesByDefault);
				setShowColumnColorChecked(settings.database.showColumnColor);
				onAppearanceSettingsLoaded(settings.ui.accent, settings.ui.themeColors);
				setTheme(settings.ui.theme);
				applyUiThemeSelection(
					settings.ui.lightThemeId,
					settings.ui.darkThemeId,
				);
				applyUiSurfacePreferences({
					translucentApp: settings.ui.translucentApp,
				});
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
		onAppearanceSettingsLoaded,
		setBeautifulTagsChecked,
		setClassicAllNotesChecked,
		setFolioModeChecked,
		setShowColumnColorChecked,
		setTheme,
	]);

	useTauriEvent("settings:updated", (payload) => {
		applyIfBoolean(payload.editor?.beautifulTags, setBeautifulTagsChecked);
		if (
			payload.editor?.editorWidthMode === "compact" ||
			payload.editor?.editorWidthMode === "comfortable" ||
			payload.editor?.editorWidthMode === "wide"
		) {
			setEditorWidthModeState(payload.editor.editorWidthMode);
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
			setError("");
			setThemeModeState(next);
			setTheme(next);
			try {
				await setThemeMode(next);
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[setTheme],
	);

	const onLightThemeChange = useCallback(
		async (next: UiLightThemeId | string) => {
			setError("");
			const previousLight = lightThemeId;
			const previousDark = darkThemeId;
			const normalizedNext = asUiLightThemeId(next);
			setLightThemeIdState(normalizedNext);
			applyUiThemeSelection(normalizedNext, previousDark);
			try {
				await setUiLightThemeId(normalizedNext);
			} catch (e) {
				setLightThemeIdState(previousLight);
				applyUiThemeSelection(previousLight, previousDark);
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[darkThemeId, lightThemeId],
	);

	const onDarkThemeChange = useCallback(
		async (next: UiDarkThemeId | string) => {
			setError("");
			const previousLight = lightThemeId;
			const previousDark = darkThemeId;
			const normalizedNext = asUiDarkThemeId(next);
			setDarkThemeIdState(normalizedNext);
			applyUiThemeSelection(previousLight, normalizedNext);
			try {
				await setUiDarkThemeId(normalizedNext);
			} catch (e) {
				setDarkThemeIdState(previousDark);
				applyUiThemeSelection(previousLight, previousDark);
				setError(e instanceof Error ? e.message : "Failed to save settings");
			}
		},
		[darkThemeId, lightThemeId],
	);

	const onTranslucentAppChange = useCallback(async (next: boolean) => {
		setError("");
		setTranslucentAppState(next);
		applyUiSurfacePreferences({ translucentApp: next });
		try {
			await setUiTranslucentApp(next);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to save settings");
		}
	}, []);

	const lightTheme = getUiLightThemeOption(lightThemeId);
	const darkTheme = getUiDarkThemeOption(darkThemeId);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<AppearanceThemeCard
					themeMode={themeMode}
					lightTheme={lightTheme}
					darkTheme={darkTheme}
					lightOptions={LIGHT_THEME_OPTIONS}
					darkOptions={DARK_THEME_OPTIONS}
					translucentApp={translucentApp}
					appearance={{
						accent,
						themeColors,
						showLightColorPickers,
						showDarkColorPickers,
						showAccentPicker,
					}}
					actions={{ onAccentChange, onAccentReset, onThemeColorChange }}
					onThemeModeChange={onThemeModeChange}
					onLightThemeChange={onLightThemeChange}
					onDarkThemeChange={onDarkThemeChange}
					onTranslucentAppChange={onTranslucentAppChange}
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
							value={editorWidthMode}
							disabled={isSavingEditorWidthMode}
							onChange={(event) => {
								const nextMode = event.currentTarget.value;
								if (
									nextMode !== "compact" &&
									nextMode !== "comfortable" &&
									nextMode !== "wide"
								) {
									return;
								}
								const previous = editorWidthMode;
								setError("");
								setEditorWidthModeState(nextMode);
								setIsSavingEditorWidthMode(true);
								void setEditorWidthMode(nextMode)
									.catch((cause) => {
										setEditorWidthModeState(previous);
										setError(
											cause instanceof Error ? cause.message : String(cause),
										);
									})
									.finally(() => {
										setIsSavingEditorWidthMode(false);
									});
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
