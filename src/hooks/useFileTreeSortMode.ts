import { useCallback } from "react";
import { useFileTreeContext } from "../contexts";
import { extractErrorMessage } from "../lib/errorUtils";
import type { FileTreeSortMode } from "../lib/settings";

interface UseFileTreeSortModeOptions {
	onError?: (message: string) => void;
}

export function useFileTreeSortMode(options: UseFileTreeSortModeOptions = {}) {
	const { onError } = options;
	const {
		fileTreeSortMode: sortMode,
		isSavingFileTreeSortMode: isSaving,
		setFileTreeSortMode,
	} = useFileTreeContext();

	const setSortMode = useCallback(
		(nextSortMode: FileTreeSortMode) =>
			setFileTreeSortMode(nextSortMode).catch((error) => {
				onError?.(extractErrorMessage(error));
			}),
		[onError, setFileTreeSortMode],
	);

	return {
		sortMode,
		isSaving,
		setSortMode,
	};
}
