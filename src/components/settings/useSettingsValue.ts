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
	const persistedRef = useRef<{ value: T } | null>(null);
	const saveRequestIdRef = useRef(0);
	const setValue = useCallback((next: T) => {
		changedRef.current = true;
		persistedRef.current = { value: next };
		setValueState(next);
	}, []);
	const setInitialValue = useCallback((next: T) => {
		persistedRef.current = { value: next };
		if (!changedRef.current) setValueState(next);
	}, []);

	const onChange = useCallback(
		(next: T) => {
			const requestId = ++saveRequestIdRef.current;
			const persisted = persistedRef.current;
			const previous = value;
			setError("");
			changedRef.current = true;
			setValueState(next);
			setIsSaving(true);
			void save(next)
				.catch((cause) => {
					if (requestId !== saveRequestIdRef.current) return;
					const latestPersisted = persistedRef.current;
					changedRef.current = latestPersisted !== null;
					setValueState(
						latestPersisted !== persisted && latestPersisted
							? latestPersisted.value
							: previous,
					);
					setError(extractErrorMessage(cause));
				})
				.finally(() => {
					if (requestId !== saveRequestIdRef.current) return;
					setIsSaving(false);
				});
		},
		[save, setError, value],
	);

	return { value, setValue, setInitialValue, isSaving, onChange };
}
