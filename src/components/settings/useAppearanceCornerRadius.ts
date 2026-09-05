import { useCallback } from "react";
import {
	DEFAULT_UI_CORNER_RADIUS_STYLE,
	type UiCornerRadiusStyle,
} from "../../lib/settings";
import { DURABLE_SETTINGS } from "../../lib/settings/definitions";
import { useSettingsValue } from "./useSettingsValue";

interface UseAppearanceCornerRadiusOptions {
	setError: (message: string) => void;
}

export function useAppearanceCornerRadius({
	setError,
}: UseAppearanceCornerRadiusOptions) {
	const setting = useSettingsValue(
		DEFAULT_UI_CORNER_RADIUS_STYLE,
		DURABLE_SETTINGS.cornerRadiusStyle.write,
		setError,
	);

	const setCornerRadiusStyle = useCallback(
		(next: UiCornerRadiusStyle) => {
			setting.setValue(next);
		},
		[setting.setValue],
	);
	const setInitialCornerRadiusStyle = useCallback(
		(next: UiCornerRadiusStyle) => {
			setting.setInitialValue(next);
		},
		[setting.setInitialValue],
	);

	return {
		cornerRadiusStyle: setting.value,
		setCornerRadiusStyle,
		setInitialCornerRadiusStyle,
		onCornerRadiusStyleChange: setting.onChange,
	};
}
