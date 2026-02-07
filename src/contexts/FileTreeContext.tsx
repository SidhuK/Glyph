import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import type { DirChildSummary, FsEntry, TagCount } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { useVault } from "./VaultContext";

export interface FileTreeContextValue {
	rootEntries: FsEntry[];
	setRootEntries: React.Dispatch<React.SetStateAction<FsEntry[]>>;
	childrenByDir: Record<string, FsEntry[] | undefined>;
	setChildrenByDir: React.Dispatch<
		React.SetStateAction<Record<string, FsEntry[] | undefined>>
	>;
	dirSummariesByParent: Record<string, DirChildSummary[] | undefined>;
	setDirSummariesByParent: React.Dispatch<
		React.SetStateAction<Record<string, DirChildSummary[] | undefined>>
	>;
	expandedDirs: Set<string>;
	setExpandedDirs: React.Dispatch<React.SetStateAction<Set<string>>>;
	activeFilePath: string | null;
	setActiveFilePath: (path: string | null) => void;
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	tags: TagCount[];
	tagsError: string;
	refreshTags: () => Promise<void>;
}

const FileTreeContext = createContext<FileTreeContextValue | null>(null);

export function FileTreeProvider({ children }: { children: ReactNode }) {
	const { vaultPath, isIndexing, startIndexRebuild } = useVault();

	const [rootEntries, setRootEntries] = useState<FsEntry[]>([]);
	const [childrenByDir, setChildrenByDir] = useState<
		Record<string, FsEntry[] | undefined>
	>({});
	const [dirSummariesByParent, setDirSummariesByParent] = useState<
		Record<string, DirChildSummary[] | undefined>
	>({});
	const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
		() => new Set(),
	);
	const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
	const [tags, setTags] = useState<TagCount[]>([]);
	const [tagsError, setTagsError] = useState("");

	const refreshTags = useCallback(async () => {
		try {
			setTagsError("");
			setTags(await invoke("tags_list", { limit: 250 }));
		} catch (e) {
			setTags([]);
			setTagsError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	useEffect(() => {
		setRootEntries([]);
		setChildrenByDir({});
		setDirSummariesByParent({});
		setExpandedDirs(new Set());
		setActiveFilePath(null);
		setTags([]);
		setTagsError("");
		if (!vaultPath) return;

		let cancelled = false;
		(async () => {
			try {
				const entries = await invoke("vault_list_dir", {});
				if (!cancelled) setRootEntries(entries);
				void startIndexRebuild();
				void refreshTags();
			} catch {
				/* ignore initial load errors */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [vaultPath, startIndexRebuild, refreshTags]);

	useEffect(() => {
		if (!isIndexing && vaultPath) void refreshTags();
	}, [isIndexing, vaultPath, refreshTags]);

	const activeNoteId = activeFilePath?.toLowerCase().endsWith(".md")
		? activeFilePath
		: null;
	const activeNoteTitle = activeNoteId
		? activeNoteId.split("/").pop() || activeNoteId
		: null;

	const value = useMemo<FileTreeContextValue>(
		() => ({
			rootEntries,
			setRootEntries,
			childrenByDir,
			setChildrenByDir,
			dirSummariesByParent,
			setDirSummariesByParent,
			expandedDirs,
			setExpandedDirs,
			activeFilePath,
			setActiveFilePath,
			activeNoteId,
			activeNoteTitle,
			tags,
			tagsError,
			refreshTags,
		}),
		[
			rootEntries,
			childrenByDir,
			dirSummariesByParent,
			expandedDirs,
			activeFilePath,
			activeNoteId,
			activeNoteTitle,
			tags,
			tagsError,
			refreshTags,
		],
	);

	return (
		<FileTreeContext.Provider value={value}>
			{children}
		</FileTreeContext.Provider>
	);
}

export function useFileTreeContext(): FileTreeContextValue {
	const ctx = useContext(FileTreeContext);
	if (!ctx)
		throw new Error("useFileTreeContext must be used within FileTreeProvider");
	return ctx;
}
