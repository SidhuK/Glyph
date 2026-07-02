import { cn } from "@/lib/utils";
import type { CSSProperties } from "react";
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
	return (
		<SettingsSection title="Accent" description={description}>
			<SettingsRow
				label="Palette"
				description="Applies to links, buttons, focus rings, and emphasis."
			>
				<div className="settingsAccentPicker">
					<div
						className="settingsAccentOptions"
						role="radiogroup"
						aria-label="Accent color"
					>
						{ACCENT_OPTIONS.map((option) => (
							<label
								key={option.id}
								className={cn(
									"settingsAccentDot",
									accent === option.id && "is-active",
								)}
								title={option.label}
								style={
									{ "--settings-accent-swatch": option.color } as CSSProperties
								}
							>
								<input
									type="radio"
									name="settings-accent"
									checked={accent === option.id}
									onChange={() => void onAccentChange(option.id)}
									className="settingsAccentInput"
									aria-label={option.label}
								/>
								<span className="settingsAccentDotInner" aria-hidden="true" />
							</label>
						))}
					</div>
				</div>
			</SettingsRow>
		</SettingsSection>
	);
}
