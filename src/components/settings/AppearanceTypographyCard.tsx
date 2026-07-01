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
					aria-label={`${label} value`}
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
	return (
		<SettingsSection
			title="Typography"
			description="Tune interface type, code styling, and reading scale independently."
		>
			<SettingsRow
				label="Interface font"
				htmlFor="settingsFontFamily"
				description="Used for navigation, settings, and most UI copy across Glyph."
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
				label="Editor font"
				htmlFor="settingsEditorFontFamily"
				description="Used for regular note text outside inline code and code blocks."
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
				label="Monospace font"
				htmlFor="settingsMonoFontFamily"
				description="Used for markdown source, inline code, and developer-oriented surfaces."
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
				label="UI font size"
				description="Adjust the base size used by menus, panes, controls, and settings."
				value={uiFontSize}
				min={MIN_UI_FONT_SIZE}
				max={MAX_UI_FONT_SIZE}
				onChange={onUiFontSizeChange}
			/>

			<FontSizeControl
				id="settingsEditorFontSize"
				label="Editor font size"
				description="Adjust the reading size for the note editor, markdown preview, and raw text editing."
				value={editorFontSize}
				min={MIN_EDITOR_FONT_SIZE}
				max={MAX_EDITOR_FONT_SIZE}
				onChange={onEditorFontSizeChange}
			/>
		</SettingsSection>
	);
}
