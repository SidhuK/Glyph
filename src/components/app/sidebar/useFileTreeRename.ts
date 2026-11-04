import { FILE_TREE_START_RENAME_EVENT } from "@/lib/appEvents";
import { scheduleScrollFileTreePathIntoView } from "@/lib/fileTreeScroll";
import { useCallback, useEffect, useState } from "react";
import type { SidebarContentProps } from "./sidebarContentProps";
import { useSidebarRail } from "./sidebarRailContext";

/** Inline rename state for the file tree, including the rename that follows a new note. */
export function useFileTreeRename(
	onRenameDir: SidebarContentProps["onRenameDir"],
	onOpenFile: SidebarContentProps["onOpenFile"],
) {
	const { rail } = useSidebarRail();
	const [renamingPath, setRenamingPath] = useState<string | null>(null);
	const [pendingNewNotePath, setPendingNewNotePath] = useState<string | null>(null);

	const handleStartRename = useCallback(
		(path: string) => {
			const nextPath = path.trim();
			if (!nextPath) return;
			// The rail has no visible file tree to rename in, so a new note opens right away.
			// Duplicate and Rename expand the sidebar before they ask for a rename.
			if (rail) {
				onOpenFile(nextPath);
				return;
			}
			setRenamingPath(nextPath);
			setPendingNewNotePath(nextPath);
		},
		[onOpenFile, rail],
	);

	useEffect(() => {
		const handleStartRenameEvent = (event: Event) => {
			if (!(event instanceof CustomEvent)) return;
			const detail: unknown = event.detail;
			if (typeof detail !== "object" || detail === null || !("path" in detail)) return;
			const path = detail.path;
			if (typeof path !== "string" || !path) return;
			handleStartRename(path);
		};
		window.addEventListener(FILE_TREE_START_RENAME_EVENT, handleStartRenameEvent);
		return () => window.removeEventListener(FILE_TREE_START_RENAME_EVENT, handleStartRenameEvent);
	}, [handleStartRename]);

	useEffect(() => {
		if (!renamingPath) return;
		return scheduleScrollFileTreePathIntoView(renamingPath, {
			warmupFrames: 2,
		});
	}, [renamingPath]);

	const handleCancelRename = useCallback(() => {
		setRenamingPath(null);
		setPendingNewNotePath(null);
	}, []);

	const handleCommitDirRename = useCallback(
		async (dirPath: string, nextName: string) => {
			const renamed = await onRenameDir(dirPath, nextName, "dir");
			if (renamed) {
				setRenamingPath(null);
			}
			return renamed !== null;
		},
		[onRenameDir],
	);

	const handleCommitFileRename = useCallback(
		async (path: string, nextName: string) => {
			const renamed = await onRenameDir(path, nextName, "file");
			if (!renamed) return false;
			setRenamingPath(null);
			if (pendingNewNotePath === path) {
				onOpenFile(renamed);
				setPendingNewNotePath(null);
			}
			return true;
		},
		[onOpenFile, onRenameDir, pendingNewNotePath],
	);

	return {
		renamingPath,
		handleStartRename,
		handleCancelRename,
		handleCommitDirRename,
		handleCommitFileRename,
	};
}
