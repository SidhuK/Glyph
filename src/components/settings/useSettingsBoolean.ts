import { useState } from "react";
import { useOptimisticSettingsToggle } from "./useOptimisticSettingsToggle";

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
	const [checked, setChecked] = useState(initial);
	const { isSaving, onCheckedChange } = useOptimisticSettingsToggle(
		checked,
		setChecked,
		save,
		setError,
	);
	return { checked, setChecked, isSaving, onCheckedChange };
}

export type SettingsBoolean = ReturnType<typeof useSettingsBoolean>;
