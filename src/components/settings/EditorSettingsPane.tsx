import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	type EditorViewMode,
	getDefaultEditorViewMode,
	isEditorViewMode,
} from "../../lib/editorMode";
import {
	DEFAULT_HEADING_PALETTE_ID,
	type HeadingPaletteId,
	isHeadingPaletteId,
} from "../../lib/headingPalettes";
import {
	DURABLE_SETTINGS,
	type EditorWidthMode,
	MAX_EDITOR_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	type UiFontFamily,
	type UiFontSize,
	isEditorWidthMode,
	loadSettings,
} from "../../lib/settings";
import { useTauriEvent } from "../../lib/tauriEvents";
import { FontSizeControl } from "./AppearanceTypographyCard";
import { HeadingPalettePicker } from "./HeadingPalettePicker";
import {
	SettingsRow,
	SettingsSection,
	SettingsToggle,
} from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";
import { DEFAULT_FONT_FAMILY, loadAvailableFonts } from "./appearanceOptions";
import { applyIfBoolean, useSettingsBoolean } from "./useSettingsBoolean";
import { useSettingsValue } from "./useSettingsValue";

const DEFAULT_EDITOR_MODE_VALUES = [
	"rich",
	"preview",
	"plain",
] as const satisfies readonly EditorViewMode[];

const EDITOR_WIDTH_VALUES = [
	"compact",
	"comfortable",
	"wide",
] as const satisfies readonly EditorWidthMode[];

export function EditorSettingsPane() {
	const { t } = useTranslation("settings.general");
	const { t: tAppearance } = useTranslation("settings.appearance");
	const [error, setError] = useState("");
	const [availableFonts, setAvailableFonts] = useState<string[]>([
		DEFAULT_FONT_FAMILY,
	]);
	const editorFontFamily = useSettingsValue<UiFontFamily>(
		DEFAULT_FONT_FAMILY,
		DURABLE_SETTINGS.editorFontFamily.write,
		setError,
	);
	const editorFontSize = useSettingsValue<UiFontSize>(
		16,
		DURABLE_SETTINGS.editorFontSize.write,
		setError,
	);
	const defaultEditorMode = useSettingsValue<EditorViewMode>(
		getDefaultEditorViewMode,
		DURABLE_SETTINGS.editorDefaultEditorMode.write,
		setError,
	);
	const editorWidthMode = useSettingsValue<EditorWidthMode>(
		"compact",
		DURABLE_SETTINGS.editorWidthMode.write,
		setError,
	);
	const showToc = useSettingsBoolean(
		true,
		DURABLE_SETTINGS.showToc.write,
		setError,
	);
	const showFrontmatter = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.editorShowFrontmatterInEditor.write,
		setError,
	);
	const colorfulHeadings = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.editorColorfulHeadings.write,
		setError,
	);
	const headingPrefixes = useSettingsBoolean(
		true,
		DURABLE_SETTINGS.editorShowHeadingPrefixes.write,
		setError,
	);
	const headingPalette = useSettingsValue<HeadingPaletteId>(
		DEFAULT_HEADING_PALETTE_ID,
		DURABLE_SETTINGS.editorHeadingPaletteId.write,
		setError,
	);
	const collapsibleHeadings = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.editorShowCollapsibleHeadings.write,
		setError,
	);
	const collapsibleLists = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.editorShowCollapsibleLists.write,
		setError,
	);
	const spellCheck = useSettingsBoolean(
		true,
		DURABLE_SETTINGS.editorSpellCheck.write,
		setError,
	);
	const beautifulTags = useSettingsBoolean(
		false,
		DURABLE_SETTINGS.editorBeautifulTags.write,
		setError,
	);

	const setShowTocChecked = showToc.setChecked;
	const setShowFrontmatterChecked = showFrontmatter.setChecked;
	const setColorfulHeadingsChecked = colorfulHeadings.setChecked;
	const setHeadingPrefixesChecked = headingPrefixes.setChecked;
	const setCollapsibleHeadingsChecked = collapsibleHeadings.setChecked;
	const setCollapsibleListsChecked = collapsibleLists.setChecked;
	const setSpellCheckChecked = spellCheck.setChecked;
	const setBeautifulTagsChecked = beautifulTags.setChecked;
	const setInitialDefaultEditorMode = defaultEditorMode.setInitialValue;
	const setDefaultEditorModeValue = defaultEditorMode.setValue;
	const setInitialHeadingPalette = headingPalette.setInitialValue;
	const setHeadingPaletteValue = headingPalette.setValue;
	const setInitialEditorWidthMode = editorWidthMode.setInitialValue;
	const setEditorWidthModeValue = editorWidthMode.setValue;
	const setInitialEditorFontFamily = editorFontFamily.setInitialValue;
	const setEditorFontFamilyValue = editorFontFamily.setValue;
	const setInitialEditorFontSize = editorFontSize.setInitialValue;
	const setEditorFontSizeValue = editorFontSize.setValue;

	useEffect(() => {
		let cancelled = false;
		void loadAvailableFonts()
			.then((fonts) => {
				if (!cancelled) setAvailableFonts(fonts);
			})
			.catch((cause: unknown) => {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		setError("");
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				setInitialDefaultEditorMode(settings.editor.defaultEditorMode);
				setInitialEditorWidthMode(settings.editor.editorWidthMode);
				setShowTocChecked(settings.ui.showToc);
				setShowFrontmatterChecked(settings.editor.showFrontmatterInEditor);
				setColorfulHeadingsChecked(settings.editor.colorfulHeadings);
				setHeadingPrefixesChecked(settings.editor.showHeadingPrefixes);
				setInitialHeadingPalette(settings.editor.headingPaletteId);
				setCollapsibleHeadingsChecked(settings.editor.showCollapsibleHeadings);
				setCollapsibleListsChecked(settings.editor.showCollapsibleLists);
				setSpellCheckChecked(settings.editor.spellCheck);
				setBeautifulTagsChecked(settings.editor.beautifulTags);
				setInitialEditorFontFamily(settings.ui.editorFontFamily);
				setInitialEditorFontSize(settings.ui.editorFontSize);
			})
			.catch((cause) => {
				if (!cancelled) {
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			});
		return () => {
			cancelled = true;
		};
	}, [
		setBeautifulTagsChecked,
		setCollapsibleHeadingsChecked,
		setCollapsibleListsChecked,
		setColorfulHeadingsChecked,
		setHeadingPrefixesChecked,
		setInitialDefaultEditorMode,
		setInitialEditorFontFamily,
		setInitialEditorFontSize,
		setInitialEditorWidthMode,
		setInitialHeadingPalette,
		setShowFrontmatterChecked,
		setShowTocChecked,
		setSpellCheckChecked,
	]);

	useTauriEvent(
		"settings:updated",
		useCallback(
			(payload) => {
				if (typeof payload.ui?.editorFontFamily === "string") {
					setEditorFontFamilyValue(payload.ui.editorFontFamily);
				}
				if (typeof payload.ui?.editorFontSize === "number") {
					setEditorFontSizeValue(payload.ui.editorFontSize);
				}
				if (isEditorViewMode(payload.editor?.defaultEditorMode)) {
					setDefaultEditorModeValue(payload.editor.defaultEditorMode);
				}
				if (isHeadingPaletteId(payload.editor?.headingPaletteId)) {
					setHeadingPaletteValue(payload.editor.headingPaletteId);
				}
				if (isEditorWidthMode(payload.editor?.editorWidthMode)) {
					setEditorWidthModeValue(payload.editor.editorWidthMode);
				}
				applyIfBoolean(payload.ui?.showToc, setShowTocChecked);
				applyIfBoolean(
					payload.editor?.showFrontmatterInEditor,
					setShowFrontmatterChecked,
				);
				applyIfBoolean(
					payload.editor?.colorfulHeadings,
					setColorfulHeadingsChecked,
				);
				applyIfBoolean(
					payload.editor?.showHeadingPrefixes,
					setHeadingPrefixesChecked,
				);
				applyIfBoolean(
					payload.editor?.showCollapsibleHeadings,
					setCollapsibleHeadingsChecked,
				);
				applyIfBoolean(
					payload.editor?.showCollapsibleLists,
					setCollapsibleListsChecked,
				);
				applyIfBoolean(payload.editor?.spellCheck, setSpellCheckChecked);
				applyIfBoolean(payload.editor?.beautifulTags, setBeautifulTagsChecked);
			},
			[
				setBeautifulTagsChecked,
				setCollapsibleHeadingsChecked,
				setCollapsibleListsChecked,
				setColorfulHeadingsChecked,
				setDefaultEditorModeValue,
				setEditorFontFamilyValue,
				setEditorFontSizeValue,
				setEditorWidthModeValue,
				setHeadingPaletteValue,
				setHeadingPrefixesChecked,
				setShowFrontmatterChecked,
				setShowTocChecked,
				setSpellCheckChecked,
			],
		),
	);

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<SettingsSection
					title={tAppearance("typography.sectionTitle")}
					description={tAppearance("typography.sectionDescription")}
				>
					<SettingsRow
						label={tAppearance("typography.editorFont.label")}
						htmlFor="settingsEditorFontFamily"
						description={tAppearance("typography.editorFont.description")}
					>
						<SettingsSelect
							id="settingsEditorFontFamily"
							value={editorFontFamily.value}
							onChange={(event) =>
								editorFontFamily.onChange(event.target.value)
							}
						>
							{(availableFonts.includes(editorFontFamily.value)
								? availableFonts
								: [editorFontFamily.value, ...availableFonts]
							).map((font) => (
								<option key={font} value={font}>
									{font}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
					<FontSizeControl
						id="settingsEditorFontSize"
						label={tAppearance("typography.editorFontSize.label")}
						description={tAppearance("typography.editorFontSize.description")}
						valueAriaLabel={tAppearance(
							"typography.editorFontSize.valueAriaLabel",
						)}
						value={editorFontSize.value}
						min={MIN_EDITOR_FONT_SIZE}
						max={MAX_EDITOR_FONT_SIZE}
						onChange={editorFontSize.onChange}
					/>
				</SettingsSection>
				<SettingsSection
					title={t("editor.sectionTitle")}
					description={t("editor.sectionDescription")}
				>
					<SettingsRow
						label={t("editor.tableOfContents.label")}
						description={t("editor.tableOfContents.description")}
					>
						<SettingsToggle
							checked={showToc.checked}
							disabled={showToc.isSaving}
							ariaLabel={t("editor.tableOfContents.ariaLabel")}
							onCheckedChange={showToc.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.showFrontmatter.label")}
						description={t("editor.showFrontmatter.description")}
					>
						<SettingsToggle
							checked={showFrontmatter.checked}
							disabled={showFrontmatter.isSaving}
							ariaLabel={t("editor.showFrontmatter.ariaLabel")}
							onCheckedChange={showFrontmatter.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.headingPrefixes.label")}
						description={t("editor.headingPrefixes.description")}
					>
						<SettingsToggle
							checked={headingPrefixes.checked}
							disabled={headingPrefixes.isSaving}
							ariaLabel={t("editor.headingPrefixes.ariaLabel")}
							onCheckedChange={headingPrefixes.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.colorfulHeadings.label")}
						description={t("editor.colorfulHeadings.description")}
						interactive={false}
					>
						<div className="colorfulHeadingsControls">
							{colorfulHeadings.checked ? (
								<HeadingPalettePicker
									value={headingPalette.value}
									disabled={headingPalette.isSaving}
									onChange={headingPalette.onChange}
								/>
							) : null}
							<SettingsToggle
								checked={colorfulHeadings.checked}
								disabled={colorfulHeadings.isSaving}
								ariaLabel={t("editor.colorfulHeadings.ariaLabel")}
								onCheckedChange={colorfulHeadings.onCheckedChange}
							/>
						</div>
					</SettingsRow>
					<SettingsRow
						label={t("editor.collapsibleHeadings.label")}
						description={t("editor.collapsibleHeadings.description")}
					>
						<SettingsToggle
							checked={collapsibleHeadings.checked}
							disabled={collapsibleHeadings.isSaving}
							ariaLabel={t("editor.collapsibleHeadings.ariaLabel")}
							onCheckedChange={collapsibleHeadings.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.collapsibleLists.label")}
						description={t("editor.collapsibleLists.description")}
					>
						<SettingsToggle
							checked={collapsibleLists.checked}
							disabled={collapsibleLists.isSaving}
							ariaLabel={t("editor.collapsibleLists.ariaLabel")}
							onCheckedChange={collapsibleLists.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.spellCheck.label")}
						description={t("editor.spellCheck.description")}
					>
						<SettingsToggle
							checked={spellCheck.checked}
							disabled={spellCheck.isSaving}
							ariaLabel={t("editor.spellCheck.ariaLabel")}
							onCheckedChange={spellCheck.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={t("editor.defaultEditorMode.label")}
						description={t("editor.defaultEditorMode.description")}
						interactive={false}
					>
						<SettingsSelect
							aria-label={t("editor.defaultEditorMode.ariaLabel")}
							value={defaultEditorMode.value}
							disabled={defaultEditorMode.isSaving}
							onChange={(event) => {
								const nextMode = event.currentTarget.value;
								if (!isEditorViewMode(nextMode)) return;
								defaultEditorMode.onChange(nextMode);
							}}
						>
							{DEFAULT_EDITOR_MODE_VALUES.map((value) => (
								<option key={value} value={value}>
									{t(`editor.defaultEditorMode.options.${value}`)}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
				</SettingsSection>
				<SettingsSection
					title={tAppearance("editorPresentation.sectionTitle")}
					description={tAppearance("editorPresentation.sectionDescription")}
				>
					<SettingsRow
						label={tAppearance("editorPresentation.beautifulTags.label")}
						description={tAppearance(
							"editorPresentation.beautifulTags.description",
						)}
					>
						<SettingsToggle
							checked={beautifulTags.checked}
							disabled={beautifulTags.isSaving}
							ariaLabel={tAppearance(
								"editorPresentation.beautifulTags.ariaLabel",
							)}
							onCheckedChange={beautifulTags.onCheckedChange}
						/>
					</SettingsRow>
					<SettingsRow
						label={tAppearance("editorPresentation.editorWidth.label")}
						description={tAppearance(
							"editorPresentation.editorWidth.description",
						)}
						interactive={false}
					>
						<SettingsSelect
							aria-label={tAppearance(
								"editorPresentation.editorWidth.ariaLabel",
							)}
							value={editorWidthMode.value}
							disabled={editorWidthMode.isSaving}
							onChange={(event) => {
								if (!isEditorWidthMode(event.currentTarget.value)) return;
								editorWidthMode.onChange(event.currentTarget.value);
							}}
						>
							{EDITOR_WIDTH_VALUES.map((value) => (
								<option key={value} value={value}>
									{tAppearance(
										`editorPresentation.editorWidth.options.${value}`,
									)}
								</option>
							))}
						</SettingsSelect>
					</SettingsRow>
				</SettingsSection>
			</div>
		</div>
	);
}
