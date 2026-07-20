import { useCallback, useRef, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";

export function useSettingsValue<T>(
	initial: T | (() => T),
	save: (value: T) => Promise<void>,
	setError: (message: string) => void,
) {
	const [value, setValueState] = useState<T>(initial);
	const [isSaving, setIsSaving] = useState(false);
	const changedRef = useRef(false);
	const saveRequestIdRef = useRef(0);
	const setValue = useCallback((next: T) => {
		changedRef.current = true;
		setValueState(next);
	}, []);
	const setInitialValue = useCallback((next: T) => {
		if (!changedRef.current) setValueState(next);
	}, []);

	const onChange = useCallback(
		(next: T) => {
			const requestId = ++saveRequestIdRef.current;
			const previous = value;
			setError("");
			setValue(next);
			setIsSaving(true);
			void save(next)
				.catch((cause) => {
					if (requestId !== saveRequestIdRef.current) return;
					setValue(previous);
					setError(extractErrorMessage(cause));
				})
				.finally(() => {
					if (requestId !== saveRequestIdRef.current) return;
					setIsSaving(false);
				});
		},
		[save, setError, setValue, value],
	);

	return { value, setValue, setInitialValue, isSaving, onChange };
}
