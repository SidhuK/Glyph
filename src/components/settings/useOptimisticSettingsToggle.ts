import { useCallback, useRef, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";

export function useOptimisticSettingsToggle(
	checked: boolean,
	setChecked: (checked: boolean) => void,
	save: (checked: boolean) => Promise<void>,
	setError: (message: string) => void,
) {
	const [isSaving, setIsSaving] = useState(false);
	const saveRequestIdRef = useRef(0);

	const onCheckedChange = useCallback(
		(next: boolean) => {
			const requestId = ++saveRequestIdRef.current;
			const previous = checked;
			setError("");
			setChecked(next);
			setIsSaving(true);
			void save(next)
				.catch((cause) => {
					if (requestId !== saveRequestIdRef.current) return;
					setChecked(previous);
					setError(extractErrorMessage(cause));
				})
				.finally(() => {
					if (requestId !== saveRequestIdRef.current) return;
					setIsSaving(false);
				});
		},
		[checked, save, setChecked, setError],
	);

	return { isSaving, onCheckedChange };
}
