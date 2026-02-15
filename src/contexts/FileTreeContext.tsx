import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { extractErrorMessage } from "../lib/errorUtils";
import type { FsEntry, TagCount } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { useVault } from "./VaultContext";

export interface FileTreeContextValue {
	rootEntries: FsEntry[];
	updateRootEntries: (
		next: FsEntry[] | ((prev: FsEntry[]) => FsEntry[]),
	) => void;
	childrenByDir: Record<string, FsEntry[] | undefined>;
	updateChildrenByDir: (
		next:
			| Record<string, FsEntry[] | undefined>
			| ((
					prev: Record<string, FsEntry[] | undefined>,
			  ) => Record<string, FsEntry[] | undefined>),
	) => void;
	expandedDirs: Set<string>;
	updateExpandedDirs: (
		next: Set<string> | ((prev: Set<string>) => Set<string>),
	) => void;
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
			setTagsError(extractErrorMessage(e));
		}
	}, []);

	useEffect(() => {
		setRootEntries([]);
		setChildrenByDir({});
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
	const memoizedActiveNoteId = useMemo(() => activeNoteId, [activeNoteId]);
	const memoizedActiveNoteTitle = useMemo(
		() => activeNoteTitle,
		[activeNoteTitle],
	);

	const updateRootEntries = useCallback<
		FileTreeContextValue["updateRootEntries"]
	>((next) => {
		setRootEntries((prev) =>
			typeof next === "function"
				? (next as (value: FsEntry[]) => FsEntry[])(prev)
				: next,
		);
	}, []);

	const updateChildrenByDir = useCallback<
		FileTreeContextValue["updateChildrenByDir"]
	>((next) => {
		setChildrenByDir((prev) =>
			typeof next === "function"
				? (
						next as (
							value: Record<string, FsEntry[] | undefined>,
						) => Record<string, FsEntry[] | undefined>
					)(prev)
				: next,
		);
	}, []);

	const updateExpandedDirs = useCallback<
		FileTreeContextValue["updateExpandedDirs"]
	>((next) => {
		setExpandedDirs((prev) =>
			typeof next === "function"
				? (next as (value: Set<string>) => Set<string>)(prev)
				: next,
		);
	}, []);

	const value = useMemo<FileTreeContextValue>(
		() => ({
			rootEntries,
			updateRootEntries,
			childrenByDir,
			updateChildrenByDir,
			expandedDirs,
			updateExpandedDirs,
			activeFilePath,
			setActiveFilePath,
			activeNoteId: memoizedActiveNoteId,
			activeNoteTitle: memoizedActiveNoteTitle,
			tags,
			tagsError,
			refreshTags,
		}),
		[
			rootEntries,
			updateRootEntries,
			childrenByDir,
			updateChildrenByDir,
			expandedDirs,
			updateExpandedDirs,
			activeFilePath,
			memoizedActiveNoteId,
			memoizedActiveNoteTitle,
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
