import { useTranslation } from "react-i18next";
import {
	MAX_UI_FONT_SIZE,
	MIN_UI_FONT_SIZE,
	type UiFontFamily,
	type UiFontSize,
} from "../../lib/settings";
import { Input } from "../ui/shadcn/input";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { SettingsSelect } from "./SettingsSelect";

interface InterfaceTypographySectionProps {
	fontFamily: UiFontFamily;
	monoFontFamily: UiFontFamily;
	uiFontSize: UiFontSize;
	availableFonts: string[];
	availableMonospaceFonts: string[];
	onFontFamilyChange: (font: UiFontFamily) => void;
	onMonoFontFamilyChange: (font: UiFontFamily) => void;
	onUiFontSizeChange: (size: UiFontSize) => void;
}

interface FontSizeControlProps {
	id: string;
	searchId?: string;
	label: string;
	description: string;
	valueAriaLabel: string;
	value: UiFontSize;
	min: number;
	max: number;
	onChange: (size: UiFontSize) => void;
}

function clampFontSize(value: number, min: number, max: number): UiFontSize {
	return Math.min(max, Math.max(min, value));
}

export function FontSizeControl({
	id,
	searchId,
	label,
	description,
	valueAriaLabel,
	value,
	min,
	max,
	onChange,
}: FontSizeControlProps) {
	return (
		<SettingsRow label={label} htmlFor={id} description={description} searchId={searchId}>
			<div className="flex w-full justify-end">
				<Input
					id={id}
					type="number"
					className="w-16 [font-variant-numeric:tabular-nums]"
					min={min}
					max={max}
					step={1}
					value={value}
					onChange={(event) => {
						const next = Number(event.target.value);
						if (!Number.isFinite(next)) return;
						onChange(clampFontSize(next, min, max));
					}}
					aria-label={valueAriaLabel}
				/>
			</div>
		</SettingsRow>
	);
}

export function InterfaceTypographySection({
	fontFamily,
	monoFontFamily,
	uiFontSize,
	availableFonts,
	availableMonospaceFonts,
	onFontFamilyChange,
	onMonoFontFamilyChange,
	onUiFontSizeChange,
}: InterfaceTypographySectionProps) {
	const { t } = useTranslation("settings.typography");

	return (
		<SettingsSection title={t("sectionTitle")} description={t("sectionDescription")}>
			<SettingsRow
				label={t("interfaceFont.label")}
				htmlFor="settingsFontFamily"
				description={t("interfaceFont.description")}
				searchId="typography-interface-font"
			>
				<SettingsSelect
					id="settingsFontFamily"
					value={fontFamily}
					onChange={(event) => onFontFamilyChange(event.target.value)}
				>
					{availableFonts.map((font) => (
						<option key={font} value={font}>
							{font}
						</option>
					))}
				</SettingsSelect>
			</SettingsRow>

			<SettingsRow
				label={t("monospaceFont.label")}
				htmlFor="settingsMonoFontFamily"
				description={t("monospaceFont.description")}
				searchId="typography-monospace-font"
			>
				<SettingsSelect
					id="settingsMonoFontFamily"
					value={monoFontFamily}
					onChange={(event) => onMonoFontFamilyChange(event.target.value)}
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
				searchId="typography-ui-font-size"
				label={t("uiFontSize.label")}
				description={t("uiFontSize.description")}
				valueAriaLabel={t("uiFontSize.valueAriaLabel")}
				value={uiFontSize}
				min={MIN_UI_FONT_SIZE}
				max={MAX_UI_FONT_SIZE}
				onChange={onUiFontSizeChange}
			/>
		</SettingsSection>
	);
}
