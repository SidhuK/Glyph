import { useTranslation } from "react-i18next";
import type { UiCornerRadiusStyle } from "../../lib/settings";
import { AppearancePreviewFrame } from "./AppearancePreviewFrame";
import { SettingsRow, SettingsSection } from "./SettingsScaffold";
import { SettingsSegmentedPicker } from "./SettingsSegmentedPicker";
import { getCornerRadiusOptions } from "./cornerRadiusOptions";

interface AppearanceCornerRadiusCardProps {
	cornerRadiusStyle: UiCornerRadiusStyle;
	onCornerRadiusStyleChange: (style: UiCornerRadiusStyle) => Promise<void>;
}

export function AppearanceCornerRadiusCard({
	cornerRadiusStyle,
	onCornerRadiusStyleChange,
}: AppearanceCornerRadiusCardProps) {
	const { t } = useTranslation("settings.appearance");
	return (
		<SettingsSection
			title={t("shape.sectionTitle")}
			description={t("shape.sectionDescription")}
		>
			<SettingsRow
				label={t("shape.corners.label")}
				description={t("shape.corners.description")}
				interactive={false}
			>
				<SettingsSegmentedPicker
					name="settings-corner-radius"
					ariaLabel={t("shape.corners.ariaLabel")}
					value={cornerRadiusStyle}
					options={getCornerRadiusOptions()}
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
