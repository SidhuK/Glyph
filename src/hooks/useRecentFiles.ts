import { useCallback, useEffect, useState } from "react";
import {
	type RecentFile,
	addRecentFile as addRecentFileToStore,
	getRecentFiles as getRecentFilesFromStore,
} from "../lib/settings";

export interface UseRecentFilesReturn {
	recentFiles: RecentFile[];
	addRecentFile: (path: string, spacePath: string) => Promise<void>;
	refreshRecentFiles: () => Promise<void>;
}

export function useRecentFiles(
	currentSpacePath: string | null,
	limit = 7,
): UseRecentFilesReturn {
	const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

	const refreshRecentFiles = useCallback(async () => {
		try {
			const all = await getRecentFilesFromStore();
			const filtered = currentSpacePath
				? all.filter((f) => f.spacePath === currentSpacePath).slice(0, limit)
				: all.slice(0, limit);
			setRecentFiles(filtered);
		} catch {
			setRecentFiles([]);
		}
	}, [currentSpacePath, limit]);

	const addRecentFile = useCallback(
		async (path: string, spacePath: string) => {
			await addRecentFileToStore(path, spacePath);
			await refreshRecentFiles();
		},
		[refreshRecentFiles],
	);

	useEffect(() => {
		void refreshRecentFiles();
	}, [refreshRecentFiles]);

	return {
		recentFiles,
		addRecentFile,
		refreshRecentFiles,
	};
}
