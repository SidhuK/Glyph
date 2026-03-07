import type { UiAccent } from "../../lib/settings";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { ACCENT_OPTIONS } from "./accentOptions";

interface AppearanceAccentCardProps {
	accent: UiAccent;
	onAccentChange: (accent: UiAccent) => Promise<void>;
}

export function AppearanceAccentCard({
	accent,
	onAccentChange,
}: AppearanceAccentCardProps) {
	const selectedAccent =
		ACCENT_OPTIONS.find((option) => option.id === accent) ?? ACCENT_OPTIONS[0];

	return (
		<SettingsSection
			title="Accent"
			description="Choose the accent used for highlights, focus rings, and emphasis."
		>
			<SettingsRow
				label="Palette"
				description="Preview and select the accent that feels best for your workspace."
			>
				<div className="settingsAccentSelector">
					<div className="settingsAccentPreview" aria-hidden="true">
						<span
							className="settingsAccentPreviewSwatch"
							style={{ background: selectedAccent.color }}
						/>
						<span className="settingsAccentPreviewLabel">
							{selectedAccent.label}
						</span>
					</div>
					<div
						className="settingsAccentRow"
						role="radiogroup"
						aria-label="Accent color"
					>
						{ACCENT_OPTIONS.map((option) => (
							<button
								key={option.id}
								type="button"
								className={`settingsAccentDot ${accent === option.id ? "active" : ""}`}
								onClick={() => void onAccentChange(option.id)}
								aria-pressed={accent === option.id}
								aria-label={option.label}
								title={option.label}
							>
								<span style={{ background: option.color }} />
							</button>
						))}
					</div>
				</div>
			</SettingsRow>
		</SettingsSection>
	);
}
