import { useTheme } from "next-themes";
import { useCallback, useEffect, useState } from "react";
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

const EDITOR_WIDTH_OPTIONS = [
	{ label: "Compact", value: "compact" },
	{ label: "Comfortable", value: "comfortable" },
	{ label: "Wide", value: "wide" },
] as const satisfies readonly { label: string; value: EditorWidthMode }[];

export function AppearanceSettingsPane() {
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
					title="Layout"
					description="Choose how Glyph presents your workspace and All Notes."
				>
					<SettingsRow
						label="Folio Mode"
						description="Show navigation, notes, and editor in a three-column workspace."
					>
						<SettingsToggle
							checked={folioMode.checked}
							disabled={folioMode.isSaving}
							ariaLabel="Folio Mode"
							onCheckedChange={folioMode.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label="Classic All Notes grid"
						description="Open All Notes as the simple grid instead of the activity timeline."
					>
						<SettingsToggle
							checked={classicAllNotes.checked}
							disabled={classicAllNotes.isSaving}
							ariaLabel="Classic All Notes grid"
							onCheckedChange={classicAllNotes.onCheckedChange}
						/>
					</SettingsRow>
				</SettingsSection>
				<SettingsSection
					title="Editor presentation"
					description="Choose how notes look while you edit them."
				>
					<SettingsRow
						label="Beautiful Tags"
						description="Enable the experimental Beautiful Tags presentation for tags."
					>
						<SettingsToggle
							checked={beautifulTags.checked}
							disabled={beautifulTags.isSaving}
							ariaLabel="Beautiful Tags"
							onCheckedChange={beautifulTags.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label="Editor width"
						description="Compact keeps lines shorter, Comfortable gives a little bit more room, and Wide uses the full editor width."
						interactive={false}
					>
						<SettingsSelect
							aria-label="Editor width"
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
							{EDITOR_WIDTH_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
				</SettingsSection>
				<SettingsSection
					title="Database"
					description="Choose how databases are presented across Glyph."
				>
					<SettingsRow
						label="Show database column color"
						description="Keep the lane pill and tag colors while toggling the full column tint."
					>
						<SettingsToggle
							checked={showColumnColor.checked}
							disabled={showColumnColor.isSaving}
							ariaLabel="Show database column color"
							onCheckedChange={showColumnColor.onCheckedChange}
						/>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
