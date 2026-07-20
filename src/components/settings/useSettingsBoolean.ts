import { useSettingsValue } from "./useSettingsValue";

export function applyIfBoolean(
	value: unknown,
	set: (next: boolean) => void,
): void {
	if (typeof value === "boolean") set(value);
}

export function useSettingsBoolean(
	initial: boolean,
	save: (checked: boolean) => Promise<void>,
	setError: (message: string) => void,
) {
	const setting = useSettingsValue(initial, save, setError);
	return {
		checked: setting.value,
		setChecked: setting.setValue,
		isSaving: setting.isSaving,
		onCheckedChange: setting.onChange,
	};
}

export type SettingsBoolean = ReturnType<typeof useSettingsBoolean>;
