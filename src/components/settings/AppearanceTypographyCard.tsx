import type { UiFontFamily, UiFontSize } from "../../lib/settings";

interface AppearanceTypographyCardProps {
	fontFamily: UiFontFamily;
	fontSize: UiFontSize;
	availableFonts: string[];
	fontSizeOptions: number[];
	onFontFamilyChange: (font: UiFontFamily) => Promise<void>;
	onFontSizeChange: (size: UiFontSize) => Promise<void>;
}

export function AppearanceTypographyCard({
	fontFamily,
	fontSize,
	availableFonts,
	fontSizeOptions,
	onFontFamilyChange,
	onFontSizeChange,
}: AppearanceTypographyCardProps) {
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
					<label className="settingsLabel" htmlFor="settingsFontSize">
						Font Size
					</label>
					<div className="settingsHelp">Numeric scale from 7 to 40.</div>
				</div>
				<select
					id="settingsFontSize"
					value={fontSize}
					onChange={(event) =>
						void onFontSizeChange(Number(event.target.value))
					}
				>
					{fontSizeOptions.map((size) => (
						<option key={size} value={size}>
							{size}
						</option>
					))}
				</select>
			</div>
		</section>
	);
}
