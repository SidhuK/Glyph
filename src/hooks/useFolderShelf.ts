import { useEffect, useRef, useState } from "react";
import type { FsEntry, RecentEntry } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import type { ViewDoc } from "../lib/views";

const MAX_FOLDER_SHELF_CACHE_SIZE = 30;

export interface UseFolderShelfResult {
	folderShelfSubfolders: FsEntry[];
	folderShelfRecents: RecentEntry[];
}

export function useFolderShelf(
	vaultPath: string | null,
	activeViewDoc: ViewDoc | null,
): UseFolderShelfResult {
	const [folderShelfSubfolders, setFolderShelfSubfolders] = useState<FsEntry[]>(
		[],
	);
	const [folderShelfRecents, setFolderShelfRecents] = useState<RecentEntry[]>(
		[],
	);

	const folderShelfCacheRef = useRef(
		new Map<string, { subfolders: FsEntry[]; recents: RecentEntry[] }>(),
	);
	const previousVaultPathRef = useRef<string | null>(vaultPath);

	useEffect(() => {
		if (previousVaultPathRef.current === vaultPath) return;
		previousVaultPathRef.current = vaultPath;
		folderShelfCacheRef.current.clear();
	}, [vaultPath]);

	useEffect(() => {
		if (!vaultPath) return;
		if (!activeViewDoc) return;
		if (activeViewDoc.kind !== "folder") return;

		const dir = activeViewDoc.selector || "";
		const cached = folderShelfCacheRef.current.get(dir);
		if (cached) {
			setFolderShelfSubfolders(cached.subfolders);
			setFolderShelfRecents(cached.recents);
		} else {
			setFolderShelfSubfolders([]);
			setFolderShelfRecents([]);
		}

		let cancelled = false;
		(async () => {
			try {
				const [entries, recents] = await Promise.all([
					invoke("vault_list_dir", { dir: dir || null }),
					invoke("vault_dir_recent_entries", { dir: dir || null, limit: 5 }),
				]);
				if (cancelled) return;
				const subfolders = entries
					.filter((e) => e.kind === "dir")
					.sort((a, b) =>
						a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
					);
				const next = { subfolders, recents };
				folderShelfCacheRef.current.set(dir, next);
				if (folderShelfCacheRef.current.size > MAX_FOLDER_SHELF_CACHE_SIZE) {
					const oldestKey = folderShelfCacheRef.current.keys().next().value;
					if (oldestKey != null) folderShelfCacheRef.current.delete(oldestKey);
				}
				setFolderShelfSubfolders(next.subfolders);
				setFolderShelfRecents(next.recents);
			} catch {
				// ignore: shelf is convenience UI
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [activeViewDoc, vaultPath]);

	return {
		folderShelfSubfolders,
		folderShelfRecents,
	};
}
