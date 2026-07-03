import { useCallback, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";

export function useOptimisticSettingsToggle(
	checked: boolean,
	setChecked: (checked: boolean) => void,
	save: (checked: boolean) => Promise<void>,
	setError: (message: string) => void,
) {
	const [isSaving, setIsSaving] = useState(false);

	const onCheckedChange = useCallback(
		(next: boolean) => {
			const previous = checked;
			setError("");
			setChecked(next);
			setIsSaving(true);
			void save(next)
				.catch((cause) => {
					setChecked(previous);
					setError(extractErrorMessage(cause));
				})
				.finally(() => {
					setIsSaving(false);
				});
		},
		[checked, save, setChecked, setError],
	);

	return { isSaving, onCheckedChange };
}
