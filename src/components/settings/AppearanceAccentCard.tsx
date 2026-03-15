import { cn } from "@/lib/utils";
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
	const selectedAccent =
		ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0];

	return (
		<SettingsSection title="Accent" description={description}>
			<SettingsRow
				label="Palette"
				description="Preview and select the accent that feels best for your workspace."
			>
				<div className="settingsAccentPicker">
					<div className="settingsAccentCurrent" aria-hidden="true">
						<span
							className="settingsAccentSwatch"
							style={{ background: selectedAccent.color }}
						/>
						<span className="settingsAccentName">{selectedAccent.label}</span>
					</div>
					<div className="settingsAccentOptions" role="radiogroup" aria-label="Accent color">
						{ACCENT_OPTIONS.map((option) => (
							<button
								key={option.id}
								type="button"
								role="radio"
								aria-checked={accent === option.id}
								onClick={() => void onAccentChange(option.id)}
								className={cn(
									"settingsAccentDot",
									accent === option.id && "is-active",
								)}
								aria-label={option.label}
								title={option.label}
								style={{ "--settings-accent-swatch": option.color } as React.CSSProperties}
							>
								<span />
							</button>
						))}
					</div>
				</div>
			</SettingsRow>
		</SettingsSection>
	);
}
