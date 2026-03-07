import type { UiFontFamily, UiFontSize } from "../../lib/settings";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";

interface AppearanceTypographyCardProps {
	fontFamily: UiFontFamily;
	monoFontFamily: UiFontFamily;
	fontSize: UiFontSize;
	availableFonts: string[];
	availableMonospaceFonts: string[];
	fontSizeOptions: number[];
	onFontFamilyChange: (font: UiFontFamily) => Promise<void>;
	onMonoFontFamilyChange: (font: UiFontFamily) => Promise<void>;
	onFontSizeChange: (size: UiFontSize) => Promise<void>;
}

export function AppearanceTypographyCard({
	fontFamily,
	monoFontFamily,
	fontSize,
	availableFonts,
	availableMonospaceFonts,
	fontSizeOptions,
	onFontFamilyChange,
	onMonoFontFamilyChange,
	onFontSizeChange,
}: AppearanceTypographyCardProps) {
	const minFontSize = fontSizeOptions[0] ?? 7;
	const maxFontSize = fontSizeOptions[fontSizeOptions.length - 1] ?? 40;
	const clampFontSize = (value: number): UiFontSize => {
		return Math.min(maxFontSize, Math.max(minFontSize, value));
	};

	return (
		<SettingsSection
			title="Typography"
			description="Tune interface type and overall scale for comfort and readability."
		>
			<SettingsRow
				label="Interface font"
				htmlFor="settingsFontFamily"
				description="Used for most UI copy across Glyph."
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
				description="Used anywhere Glyph needs fixed-width text."
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

			<SettingsRow
				label="Font size"
				htmlFor="settingsFontSize"
				description="Adjust the base interface text size used throughout the app."
			>
				<div className="settingsRange">
					<input
						id="settingsFontSize"
						type="range"
						min={minFontSize}
						max={maxFontSize}
						step={1}
						value={fontSize}
						onChange={(event) =>
							void onFontSizeChange(Number(event.target.value))
						}
						aria-label="Font size"
					/>
					<input
						type="number"
						className="settingsRangeNumber"
						min={minFontSize}
						max={maxFontSize}
						step={1}
						value={fontSize}
						onChange={(event) => {
							const next = Number(event.target.value);
							if (!Number.isFinite(next)) return;
							void onFontSizeChange(clampFontSize(next));
						}}
						aria-label="Font size value"
					/>
				</div>
			</SettingsRow>
		</SettingsSection>
	);
}
