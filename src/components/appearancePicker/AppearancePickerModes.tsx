import { ToggleGroup, ToggleGroupItem } from "@/components/ui/shadcn/toggle-group";
import { useTranslation } from "react-i18next";
import type { AppearancePickerMode } from "./useAppearancePickerGroups";

const PICKER_MODES = ["icons", "emoji"] as const satisfies readonly AppearancePickerMode[];

interface AppearancePickerModesProps {
	value: AppearancePickerMode;
	onChange: (mode: AppearancePickerMode) => void;
}

export function AppearancePickerModes({ value, onChange }: AppearancePickerModesProps) {
	const { t } = useTranslation("shell");
	return (
		<ToggleGroup
			className="appearancePickerModes"
			aria-label={t("appearancePicker.modeLabel")}
			value={value}
			onValueChange={onChange}
		>
			{PICKER_MODES.map((mode) => (
				<ToggleGroupItem key={mode} value={mode} className="appearancePickerMode">
					{t(`appearancePicker.modes.${mode}`)}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}
