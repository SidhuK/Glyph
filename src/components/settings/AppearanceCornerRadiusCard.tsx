import { cn } from "@/lib/utils";
import type { UiCornerRadiusStyle } from "../../lib/settings";
import { AppearancePreviewFrame } from "./AppearancePreviewFrame";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { CORNER_RADIUS_OPTIONS } from "./cornerRadiusOptions";

interface AppearanceCornerRadiusCardProps {
	cornerRadiusStyle: UiCornerRadiusStyle;
	onCornerRadiusStyleChange: (style: UiCornerRadiusStyle) => Promise<void>;
}

export function AppearanceCornerRadiusCard({
	cornerRadiusStyle,
	onCornerRadiusStyleChange,
}: AppearanceCornerRadiusCardProps) {
	return (
		<SettingsSection
			title="Shape"
			description="Choose how rounded panels, buttons, and windows look across the app."
		>
			<SettingsRow
				label="Corners"
				description="Applies everywhere — sidebars, dialogs, inputs, and cards."
			>
				<div className="settingsSegmentedPicker">
					<div
						className="settingsSegmentedTrack"
						role="radiogroup"
						aria-label="UI shape"
					>
						{CORNER_RADIUS_OPTIONS.map((option) => (
							<label
								key={option.id}
								className={cn(
									"settingsSegmentedOption",
									cornerRadiusStyle === option.id && "is-active",
								)}
								data-corner-radius-style={option.id}
								title={option.description}
							>
								<input
									type="radio"
									name="settings-corner-radius"
									checked={cornerRadiusStyle === option.id}
									onChange={() => void onCornerRadiusStyleChange(option.id)}
									className="settingsSegmentedInput"
									aria-label={option.label}
								/>
								<AppearancePreviewFrame />
								<span className="settingsSegmentedLabel">{option.label}</span>
							</label>
						))}
					</div>
				</div>
			</SettingsRow>
		</SettingsSection>
	);
}
