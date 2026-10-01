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
		<div
			className="appearancePickerModes"
			role="radiogroup"
			aria-label={t("appearancePicker.modeLabel")}
		>
			{PICKER_MODES.map((mode) => (
				<button
					key={mode}
					type="button"
					role="radio"
					aria-checked={value === mode}
					className="appearancePickerMode"
					onClick={() => onChange(mode)}
				>
					{t(`appearancePicker.modes.${mode}`)}
				</button>
			))}
		</div>
	);
}
