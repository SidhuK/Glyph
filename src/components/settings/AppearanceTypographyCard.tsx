import type { UiFontFamily, UiFontSize } from "../../lib/settings";

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

	return (
		<section className="settingsCard">
			<div className="settingsCardHeader">
				<div>
					<div className="settingsCardTitle">Typography</div>
					<div className="settingsCardHint">
						Set the app font and global text size.
					</div>
				</div>
			</div>
			<div className="settingsField">
				<div>
					<label className="settingsLabel" htmlFor="settingsFontFamily">
						Font
					</label>
					<div className="settingsHelp">System fonts from your machine.</div>
				</div>
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
			</div>

			<div className="settingsField">
				<div>
					<label className="settingsLabel" htmlFor="settingsMonoFontFamily">
						Mono Font
					</label>
					<div className="settingsHelp">Monospace families only.</div>
				</div>
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
			</div>

			<div className="settingsField">
				<div>
					<label className="settingsLabel" htmlFor="settingsFontSize">
						Font Size
					</label>
					<div className="settingsHelp">Numeric scale from 7 to 40.</div>
				</div>
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
					<span className="settingsRangeValue settingsRangeHoverValue">
						{fontSize}
					</span>
				</div>
			</div>
		</section>
	);
}
