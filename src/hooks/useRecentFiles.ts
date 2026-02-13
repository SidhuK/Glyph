import { useCallback, useEffect, useState } from "react";
import {
	type RecentFile,
	addRecentFile as addRecentFileToStore,
	getRecentFiles as getRecentFilesFromStore,
} from "../lib/settings";

export interface UseRecentFilesReturn {
	recentFiles: RecentFile[];
	addRecentFile: (path: string, vaultPath: string) => Promise<void>;
	refreshRecentFiles: () => Promise<void>;
}

export function useRecentFiles(
	currentVaultPath: string | null,
	limit = 7,
): UseRecentFilesReturn {
	const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);

	const refreshRecentFiles = useCallback(async () => {
		const all = await getRecentFilesFromStore();
		// Filter to current vault only and limit
		const filtered = currentVaultPath
			? all.filter((f) => f.vaultPath === currentVaultPath).slice(0, limit)
			: all.slice(0, limit);
		setRecentFiles(filtered);
	}, [currentVaultPath, limit]);

	const addRecentFile = useCallback(
		async (path: string, vaultPath: string) => {
			await addRecentFileToStore(path, vaultPath);
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
