import type { UiCornerRadiusStyle } from "../../lib/settings";
import { AppearancePreviewFrame } from "./AppearancePreviewFrame";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { SettingsSegmentedPicker } from "./SettingsSegmentedPicker";
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
				interactive={false}
			>
				<SettingsSegmentedPicker
					name="settings-corner-radius"
					ariaLabel="UI shape"
					value={cornerRadiusStyle}
					options={CORNER_RADIUS_OPTIONS}
					onChange={(next) => void onCornerRadiusStyleChange(next)}
					renderPreview={() => <AppearancePreviewFrame />}
					getDataAttributes={(value) => ({
						"data-corner-radius-style": value,
					})}
				/>
			</SettingsRow>
		</SettingsSection>
	);
}
