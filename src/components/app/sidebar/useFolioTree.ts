import { useFileTreeContext, useUILayoutContext } from "@/contexts";
import { spaceDisplayName } from "@/lib/spaceRegistry";
import type { FsEntry } from "@/lib/tauri";
import { useEffect, useMemo } from "react";

function isSpaceContainerEntry(entry: FsEntry, spaceLabel: string): boolean {
	const normalizedSpaceLabel = spaceLabel.trim().toLocaleLowerCase();
	return (
		entry.kind === "dir" &&
		normalizedSpaceLabel.length > 0 &&
		entry.name.trim().toLocaleLowerCase() === normalizedSpaceLabel
	);
}

function folderEntries(entries: FsEntry[] | undefined): FsEntry[] {
	return (entries ?? []).filter((entry) => entry.kind === "dir");
}

function folioTreeRootEntries(
	rootEntries: FsEntry[],
	childrenByDir: Record<string, FsEntry[] | undefined>,
	spaceLabel: string,
): FsEntry[] {
	const spaceContainer = rootEntries.find((entry) => isSpaceContainerEntry(entry, spaceLabel));
	if (!spaceContainer) return folderEntries(rootEntries);
	return folderEntries([
		...rootEntries.filter((entry) => entry !== spaceContainer),
		...(childrenByDir[spaceContainer.rel_path] ?? []),
	]);
}

/** The file tree's entries: folders only in folio mode, with a folder named after the space
 * flattened into the root. */
export function useFolioTree(
	spacePath: string | null,
	onLoadDir: (dirPath: string, force?: boolean) => Promise<void>,
) {
	const { rootEntries, childrenByDir } = useFileTreeContext();
	const { folioMode } = useUILayoutContext();
	const spaceLabel = spacePath ? spaceDisplayName(spacePath) : "Glyph";
	const folioSpaceContainerPath = useMemo(() => {
		if (!folioMode) return null;
		return rootEntries.find((entry) => isSpaceContainerEntry(entry, spaceLabel))?.rel_path ?? null;
	}, [folioMode, rootEntries, spaceLabel]);
	const folioRootEntries = useMemo(
		() => folioTreeRootEntries(rootEntries, childrenByDir, spaceLabel),
		[rootEntries, childrenByDir, spaceLabel],
	);
	const folioChildrenByDir = useMemo(() => {
		const next: Record<string, FsEntry[] | undefined> = {};
		for (const [dirPath, entries] of Object.entries(childrenByDir)) {
			next[dirPath] = entries ? folderEntries(entries) : entries;
		}
		return next;
	}, [childrenByDir]);
	useEffect(() => {
		if (!folioMode || !folioSpaceContainerPath) return;
		if (childrenByDir[folioSpaceContainerPath] !== undefined) return;
		void onLoadDir(folioSpaceContainerPath);
	}, [childrenByDir, folioMode, folioSpaceContainerPath, onLoadDir]);

	return {
		rootEntries: folioMode ? folioRootEntries : rootEntries,
		childrenByDir: folioMode ? folioChildrenByDir : childrenByDir,
	};
}
