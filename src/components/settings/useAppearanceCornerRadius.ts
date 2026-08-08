import { useCallback, useEffect } from "react";
import { applyUiCornerRadius } from "../../lib/appearance";
import {
	DEFAULT_UI_CORNER_RADIUS_STYLE,
	type UiCornerRadiusStyle,
	setUiCornerRadiusStyle,
} from "../../lib/settings";
import { useSettingsValue } from "./useSettingsValue";

interface UseAppearanceCornerRadiusOptions {
	setError: (message: string) => void;
	isHydrated: boolean;
}

export function useAppearanceCornerRadius({
	setError,
	isHydrated,
}: UseAppearanceCornerRadiusOptions) {
	const setting = useSettingsValue(
		DEFAULT_UI_CORNER_RADIUS_STYLE,
		setUiCornerRadiusStyle,
		setError,
	);

	useEffect(() => {
		if (!isHydrated) return;
		applyUiCornerRadius(setting.value);
	}, [isHydrated, setting.value]);

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
	const onCornerRadiusStyleChange = useCallback(
		async (next: UiCornerRadiusStyle) => {
			setting.onChange(next);
		},
		[setting.onChange],
	);

	return {
		cornerRadiusStyle: setting.value,
		setCornerRadiusStyle,
		setInitialCornerRadiusStyle,
		onCornerRadiusStyleChange,
	};
}
