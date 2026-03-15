import {
	MAX_EDITOR_FONT_SIZE,
	MAX_UI_FONT_SIZE,
	MIN_EDITOR_FONT_SIZE,
	MIN_UI_FONT_SIZE,
	type UiFontFamily,
	type UiFontSize,
} from "../../lib/settings";
import { Input } from "../ui/shadcn/input";
import { Slider } from "../ui/shadcn/slider";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";

interface AppearanceTypographyCardProps {
	fontFamily: UiFontFamily;
	monoFontFamily: UiFontFamily;
	uiFontSize: UiFontSize;
	editorFontSize: UiFontSize;
	availableFonts: string[];
	availableMonospaceFonts: string[];
	uiFontSizeOptions: number[];
	editorFontSizeOptions: number[];
	onFontFamilyChange: (font: UiFontFamily) => Promise<void>;
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
			<div className="flex w-full items-center gap-3">
				<Slider
					id={id}
					className="flex-1"
					min={min}
					max={max}
					step={1}
					value={[value]}
					onValueChange={(nextValues: number[]) => {
						const [next] = nextValues;
						if (typeof next !== "number") return;
						void onChange(next);
					}}
					aria-label={label}
				/>
				<Input
					type="number"
					className="w-20 min-w-20 text-right [font-variant-numeric:tabular-nums]"
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
	monoFontFamily,
	uiFontSize,
	editorFontSize,
	availableFonts,
	availableMonospaceFonts,
	uiFontSizeOptions,
	editorFontSizeOptions,
	onFontFamilyChange,
	onMonoFontFamilyChange,
	onUiFontSizeChange,
	onEditorFontSizeChange,
}: AppearanceTypographyCardProps) {
	const minUiFontSize = uiFontSizeOptions[0] ?? MIN_UI_FONT_SIZE;
	const maxUiFontSize =
		uiFontSizeOptions[uiFontSizeOptions.length - 1] ?? MAX_UI_FONT_SIZE;
	const minEditorFontSize = editorFontSizeOptions[0] ?? MIN_EDITOR_FONT_SIZE;
	const maxEditorFontSize =
		editorFontSizeOptions[editorFontSizeOptions.length - 1] ??
		MAX_EDITOR_FONT_SIZE;

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
				<select
					id="settingsFontFamily"
					value={fontFamily}
					onChange={(event) => void onFontFamilyChange(event.target.value)}
				>
					{availableFonts.map((font) => (
						<option key={font} value={font}>
							{font}
						</option>
					))}
				</select>
			</SettingsRow>

			<SettingsRow
				label="Monospace font"
				htmlFor="settingsMonoFontFamily"
				description="Used for markdown source, inline code, and developer-oriented surfaces."
			>
				<select
					id="settingsMonoFontFamily"
					value={monoFontFamily}
					onChange={(event) => void onMonoFontFamilyChange(event.target.value)}
				>
					{availableMonospaceFonts.map((font) => (
						<option key={font} value={font}>
							{font}
						</option>
					))}
				</select>
			</SettingsRow>

			<FontSizeControl
				id="settingsUiFontSize"
				label="UI font size"
				description="Adjust the base size used by menus, panes, controls, and settings."
				value={uiFontSize}
				min={minUiFontSize}
				max={maxUiFontSize}
				onChange={onUiFontSizeChange}
			/>

			<FontSizeControl
				id="settingsEditorFontSize"
				label="Editor font size"
				description="Adjust the reading size for the note editor, markdown preview, and raw text editing."
				value={editorFontSize}
				min={minEditorFontSize}
				max={maxEditorFontSize}
				onChange={onEditorFontSizeChange}
			/>
		</SettingsSection>
	);
}
