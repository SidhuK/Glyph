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
	const clampFontSize = (value: number): UiFontSize => {
		return Math.min(maxFontSize, Math.max(minFontSize, value));
	};

	return (
		<section className="settingsCard">
			<div className="settingsCardHeader">
				<div>
					<div className="settingsCardTitle">Typography</div>
					<div className="settingsCardHint">
						Tune fonts and base UI scale for readability.
					</div>
				</div>
			</div>
			<div className="settingsField">
				<div>
					<label className="settingsLabel" htmlFor="settingsFontFamily">
						Font
					</label>
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
					<span className="settingsRangeValue settingsRangeHoverValue">
						{fontSize}
					</span>
				</div>
			</div>
		</section>
	);
}
