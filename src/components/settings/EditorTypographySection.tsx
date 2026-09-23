import { useTranslation } from "react-i18next";
import {
	MAX_EDITOR_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	type UiFontFamily,
	type UiFontSize,
} from "../../lib/settings";
import { FontSizeControl } from "./InterfaceTypographySection";
import { SettingsRow, SettingsSection, SettingsToggle } from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";

interface EditorTypographySectionProps {
	editorFontFamily: UiFontFamily;
	headingFontEnabled: boolean;
	headingFontFamily: UiFontFamily;
	editorFontSize: UiFontSize;
	availableFonts: string[];
	headingFontDisabled: boolean;
	headingFontFamilyDisabled: boolean;
	onEditorFontFamilyChange: (font: UiFontFamily) => void;
	onHeadingFontEnabledChange: (enabled: boolean) => void;
	onHeadingFontFamilyChange: (font: UiFontFamily) => void;
	onEditorFontSizeChange: (size: UiFontSize) => void;
}

export function EditorTypographySection({
	editorFontFamily,
	headingFontEnabled,
	headingFontFamily,
	editorFontSize,
	availableFonts,
	headingFontDisabled,
	headingFontFamilyDisabled,
	onEditorFontFamilyChange,
	onHeadingFontEnabledChange,
	onHeadingFontFamilyChange,
	onEditorFontSizeChange,
}: EditorTypographySectionProps) {
	const { t } = useTranslation("settings.typography");
	const { t: tSearch } = useTranslation("settings.search");

	return (
		<SettingsSection title={tSearch("tabs.editor")}>
			<SettingsRow
				label={t("editorFont.label")}
				htmlFor="settingsEditorFontFamily"
				description={t("editorFont.description")}
				searchId="typography-editor-font"
			>
				<SettingsSelect
					id="settingsEditorFontFamily"
					value={editorFontFamily}
					onChange={(event) => onEditorFontFamilyChange(event.target.value)}
				>
					{availableFonts.map((font) => (
						<option key={font} value={font}>
							{font}
						</option>
					))}
				</SettingsSelect>
			</SettingsRow>
			<SettingsRow
				label={t("headingFontEnabled.label")}
				description={t("headingFontEnabled.description")}
				searchId={
					headingFontEnabled ? "typography-heading-font-enabled" : "typography-heading-font"
				}
			>
				<SettingsToggle
					checked={headingFontEnabled}
					disabled={headingFontDisabled}
					ariaLabel={t("headingFontEnabled.ariaLabel")}
					onCheckedChange={onHeadingFontEnabledChange}
				/>
			</SettingsRow>
			{headingFontEnabled ? (
				<SettingsRow
					label={t("headingFont.label")}
					htmlFor="settingsHeadingFontFamily"
					description={t("headingFont.description")}
					searchId="typography-heading-font"
				>
					<SettingsSelect
						id="settingsHeadingFontFamily"
						value={headingFontFamily}
						disabled={headingFontFamilyDisabled}
						onChange={(event) => onHeadingFontFamilyChange(event.target.value)}
					>
						{availableFonts.map((font) => (
							<option key={font} value={font}>
								{font}
							</option>
						))}
					</SettingsSelect>
				</SettingsRow>
			) : null}
			<FontSizeControl
				id="settingsEditorFontSize"
				searchId="typography-editor-font-size"
				label={t("editorFontSize.label")}
				description={t("editorFontSize.description")}
				valueAriaLabel={t("editorFontSize.valueAriaLabel")}
				value={editorFontSize}
				min={MIN_EDITOR_FONT_SIZE}
				max={MAX_EDITOR_FONT_SIZE}
				onChange={onEditorFontSizeChange}
			/>
		</SettingsSection>
	);
}
