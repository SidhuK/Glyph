import { useTranslation } from "react-i18next";
import {
	MAX_EDITOR_FONT_SIZE,
	MAX_UI_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	MIN_UI_FONT_SIZE,
	type UiFontFamily,
	type UiFontSize,
} from "../../lib/settings";
import { Input } from "../ui/shadcn/input";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";

interface AppearanceTypographyCardProps {
	fontFamily: UiFontFamily;
	editorFontFamily: UiFontFamily;
	monoFontFamily: UiFontFamily;
	uiFontSize: UiFontSize;
	editorFontSize: UiFontSize;
	availableFonts: string[];
	availableMonospaceFonts: string[];
	onFontFamilyChange: (font: UiFontFamily) => Promise<void>;
	onEditorFontFamilyChange: (font: UiFontFamily) => Promise<void>;
	onMonoFontFamilyChange: (font: UiFontFamily) => Promise<void>;
	onUiFontSizeChange: (size: UiFontSize) => Promise<void>;
	onEditorFontSizeChange: (size: UiFontSize) => Promise<void>;
}

interface FontSizeControlProps {
	id: string;
	label: string;
	description: string;
	value: UiFontSize;
	min: number;
	max: number;
	onChange: (size: UiFontSize) => Promise<void>;
	valueAriaLabel: string;
}

function clampFontSize(value: number, min: number, max: number): UiFontSize {
	return Math.min(max, Math.max(min, value));
}

function FontSizeControl({
	id,
	label,
	description,
	value,
	min,
	max,
	onChange,
	valueAriaLabel,
}: FontSizeControlProps) {
	return (
		<SettingsRow label={label} htmlFor={id} description={description}>
			<div className="flex w-full justify-end">
				<Input
					id={id}
					type="number"
					className="w-14 text-right [font-variant-numeric:tabular-nums]"
					min={min}
					max={max}
					step={1}
					value={value}
					onChange={(event) => {
						const next = Number(event.target.value);
						if (!Number.isFinite(next)) return;
						void onChange(clampFontSize(next, min, max));
					}}
					aria-label={valueAriaLabel}
				/>
			</div>
		</SettingsRow>
	);
}

export function AppearanceTypographyCard({
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
}: AppearanceTypographyCardProps) {
	const { t } = useTranslation("settings");
	return (
		<SettingsSection
			title={t("appearance.typography.title")}
			description={t("appearance.typography.description")}
		>
			<SettingsRow
				label={t("appearance.typography.interfaceFont")}
				htmlFor="settingsFontFamily"
				description={t("appearance.typography.interfaceFontDescription")}
			>
				<SettingsSelect
					id="settingsFontFamily"
					value={fontFamily}
					onChange={(event) => void onFontFamilyChange(event.target.value)}
				>
					{availableFonts.map((font) => (
						<option key={font} value={font}>
							{font}
						</option>
					))}
				</SettingsSelect>
			</SettingsRow>

			<SettingsRow
				label={t("appearance.typography.editorFont")}
				htmlFor="settingsEditorFontFamily"
				description={t("appearance.typography.editorFontDescription")}
			>
				<SettingsSelect
					id="settingsEditorFontFamily"
					value={editorFontFamily}
					onChange={(event) =>
						void onEditorFontFamilyChange(event.target.value)
					}
				>
					{availableFonts.map((font) => (
						<option key={font} value={font}>
							{font}
						</option>
					))}
				</SettingsSelect>
			</SettingsRow>

			<SettingsRow
				label={t("appearance.typography.monospaceFont")}
				htmlFor="settingsMonoFontFamily"
				description={t("appearance.typography.monospaceFontDescription")}
			>
				<SettingsSelect
					id="settingsMonoFontFamily"
					value={monoFontFamily}
					onChange={(event) => void onMonoFontFamilyChange(event.target.value)}
				>
					{availableMonospaceFonts.map((font) => (
						<option key={font} value={font}>
							{font}
						</option>
					))}
				</SettingsSelect>
			</SettingsRow>

			<FontSizeControl
				id="settingsUiFontSize"
				label={t("appearance.typography.uiFontSize")}
				description={t("appearance.typography.uiFontSizeDescription")}
				value={uiFontSize}
				min={MIN_UI_FONT_SIZE}
				max={MAX_UI_FONT_SIZE}
				onChange={onUiFontSizeChange}
				valueAriaLabel={t("appearance.typography.fontSizeValue", {
					label: t("appearance.typography.uiFontSize"),
				})}
			/>

			<FontSizeControl
				id="settingsEditorFontSize"
				label={t("appearance.typography.editorFontSize")}
				description={t("appearance.typography.editorFontSizeDescription")}
				value={editorFontSize}
				min={MIN_EDITOR_FONT_SIZE}
				max={MAX_EDITOR_FONT_SIZE}
				onChange={onEditorFontSizeChange}
				valueAriaLabel={t("appearance.typography.fontSizeValue", {
					label: t("appearance.typography.editorFontSize"),
				})}
			/>
		</SettingsSection>
	);
}
