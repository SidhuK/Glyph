import { useCallback, useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "../lib/errorUtils";
import {
	type FileTreeSortMode,
	isFileTreeSortMode,
	loadSettings,
	setFileTreeSortMode,
} from "../lib/settings";
import { useTauriEvent } from "../lib/tauriEvents";

interface UseFileTreeSortModeOptions {
	onError?: (message: string) => void;
}

export function useFileTreeSortMode(options: UseFileTreeSortModeOptions = {}) {
	const { onError } = options;
	const [sortMode, setSortMode] = useState<FileTreeSortMode>("name-asc");
	const [isSaving, setIsSaving] = useState(false);
	const requestVersionRef = useRef(0);

	useEffect(() => {
		let cancelled = false;
		const requestVersion = requestVersionRef.current + 1;
		requestVersionRef.current = requestVersion;
		void loadSettings()
			.then((settings) => {
				if (cancelled || requestVersion !== requestVersionRef.current) return;
				setSortMode(settings.ui.fileTreeSortMode);
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		const nextSortMode = payload.ui?.fileTreeSortMode;
		if (!isFileTreeSortMode(nextSortMode)) return;
		requestVersionRef.current += 1;
		setIsSaving(false);
		setSortMode(nextSortMode);
	});

	const updateSortMode = useCallback(
		(nextSortMode: FileTreeSortMode) => {
			if (nextSortMode === sortMode) return Promise.resolve();
			const previous = sortMode;
			const requestVersion = requestVersionRef.current + 1;
			requestVersionRef.current = requestVersion;
			setSortMode(nextSortMode);
			setIsSaving(true);
			return setFileTreeSortMode(nextSortMode)
				.catch((error) => {
					if (requestVersion === requestVersionRef.current) {
						setSortMode(previous);
					}
					onError?.(extractErrorMessage(error));
				})
				.finally(() => {
					if (requestVersion === requestVersionRef.current) {
						setIsSaving(false);
					}
				});
		},
		[onError, sortMode],
	);

	return {
		sortMode,
		isSaving,
		setSortMode: updateSortMode,
	};
}
