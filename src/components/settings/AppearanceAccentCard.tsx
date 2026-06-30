import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import type { UiAccent } from "../../lib/settings";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { ACCENT_OPTIONS } from "./accentOptions";

interface AppearanceAccentCardProps {
	accent: UiAccent;
	description: string;
	onAccentChange: (accent: UiAccent) => Promise<void>;
}

export function AppearanceAccentCard({
	accent,
	description,
	onAccentChange,
}: AppearanceAccentCardProps) {
	const { t } = useTranslation("settings");
	return (
		<SettingsSection
			title={t("appearance.accent.title")}
			description={description}
		>
			<SettingsRow
				label={t("appearance.accent.palette")}
				description={t("appearance.accent.paletteDescription")}
			>
				<div className="settingsAccentPicker">
					<div
						className="settingsAccentOptions"
						role="radiogroup"
						aria-label={t("appearance.accent.accentColor")}
					>
						{ACCENT_OPTIONS.map((option) => {
							const accentLabel = t(`appearance.accents.${option.id}`, {
								defaultValue: option.label,
							});
							return (
								<label
									key={option.id}
									className={cn(
										"settingsAccentDot",
										accent === option.id && "is-active",
									)}
									title={accentLabel}
									style={
										{
											"--settings-accent-swatch": option.color,
										} as CSSProperties
									}
								>
									<input
										type="radio"
										name="settings-accent"
										checked={accent === option.id}
										onChange={() => void onAccentChange(option.id)}
										className="settingsAccentInput"
										aria-label={accentLabel}
									/>
									<span className="settingsAccentDotInner" aria-hidden="true" />
								</label>
							);
						})}
					</div>
				</div>
			</SettingsRow>
		</SettingsSection>
	);
}
