import { useCallback, useEffect, useRef } from "react";
import { scheduleScrollFileTreePathIntoView } from "../../lib/fileTreeScroll";

export function useFileTreeCreateFolderScroll(
	onRequestCreateFolder: (dirPath: string) => Promise<string | null>,
) {
	const cancelScrollRef = useRef<(() => void) | null>(null);

	useEffect(() => {
		return () => {
			cancelScrollRef.current?.();
		};
	}, []);

	const requestTokenRef = useRef(0);

	return useCallback(
		async (dirPath: string) => {
			const requestToken = ++requestTokenRef.current;
			cancelScrollRef.current?.();
			cancelScrollRef.current = null;
			const createdPath = await onRequestCreateFolder(dirPath);
			if (requestTokenRef.current !== requestToken) return null;
			if (!createdPath) return null;
			cancelScrollRef.current = scheduleScrollFileTreePathIntoView(
				createdPath,
				{ focus: true },
			);
			return createdPath;
		},
		[onRequestCreateFolder],
	);
}
