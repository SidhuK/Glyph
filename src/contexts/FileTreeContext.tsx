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
import type { FileTreeAppearance, FsEntry, TagCount } from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { useSpace } from "./SpaceContext";

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
	activeDirPath: string | null;
	setActiveDirPath: (path: string | null) => void;
	activeFilePath: string | null;
	setActiveFilePath: (path: string | null) => void;
	activeNoteId: string | null;
	activeNoteTitle: string | null;
	itemAppearance: Record<string, FileTreeAppearance>;
	setItemAppearance: (
		path: string,
		appearance: FileTreeAppearance,
	) => Promise<void>;
	renameItemAppearance: (fromPath: string, toPath: string) => Promise<void>;
	deleteItemAppearance: (path: string) => Promise<void>;
	tags: TagCount[];
	tagsError: string;
	refreshTags: () => Promise<void>;
}

const FileTreeContext = createContext<FileTreeContextValue | null>(null);

export function FileTreeProvider({ children }: { children: ReactNode }) {
	const { spacePath, isIndexing, startIndexRebuild } = useSpace();

	const [rootEntries, setRootEntries] = useState<FsEntry[]>([]);
	const [childrenByDir, setChildrenByDir] = useState<
		Record<string, FsEntry[] | undefined>
	>({});
	const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
		() => new Set(),
	);
	const [activeDirPath, setActiveDirPath] = useState<string | null>(null);
	const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
	const [itemAppearance, setItemAppearanceState] = useState<
		Record<string, FileTreeAppearance>
	>({});
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
		setActiveDirPath(null);
		setActiveFilePath(null);
		setItemAppearanceState({});
		setTags([]);
		setTagsError("");
		if (!spacePath) return;

		let cancelled = false;
		(async () => {
			try {
				const entries = await invoke("space_list_dir", {});
				const appearance = await invoke("file_tree_appearance_list");
				if (!cancelled) {
					setRootEntries(entries);
					setItemAppearanceState(appearance);
				}
				void startIndexRebuild();
				void refreshTags();
			} catch {
				/* ignore initial load errors */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [spacePath, startIndexRebuild, refreshTags]);

	useEffect(() => {
		if (!isIndexing && spacePath) void refreshTags();
	}, [isIndexing, spacePath, refreshTags]);

	const activeNoteId = activeFilePath?.toLowerCase().endsWith(".md")
		? activeFilePath
		: null;
	const activeNoteTitle = activeNoteId
		? activeNoteId.split("/").pop() || activeNoteId
		: null;

	const setItemAppearance = useCallback<
		FileTreeContextValue["setItemAppearance"]
	>(async (path, appearance) => {
		const next = await invoke("file_tree_appearance_set", {
			path,
			color: appearance.color ?? null,
			icon: appearance.icon ?? null,
		});
		setItemAppearanceState((prev) => {
			if (next) return { ...prev, [path]: next };
			if (!(path in prev)) return prev;
			const nextMap = { ...prev };
			delete nextMap[path];
			return nextMap;
		});
	}, []);

	const renameItemAppearance = useCallback<
		FileTreeContextValue["renameItemAppearance"]
	>(async (fromPath, toPath) => {
		await invoke("file_tree_appearance_rename_path", {
			from_path: fromPath,
			to_path: toPath,
		});
		setItemAppearanceState((prev) => {
			const next: Record<string, FileTreeAppearance> = {};
			for (const [path, appearance] of Object.entries(prev)) {
				if (path === fromPath) {
					next[toPath] = appearance;
					continue;
				}
				const prefix = `${fromPath}/`;
				if (path.startsWith(prefix)) {
					next[`${toPath}/${path.slice(prefix.length)}`] = appearance;
					continue;
				}
				next[path] = appearance;
			}
			return next;
		});
	}, []);

	const deleteItemAppearance = useCallback<
		FileTreeContextValue["deleteItemAppearance"]
	>(async (path) => {
		await invoke("file_tree_appearance_delete_path", { path });
		setItemAppearanceState((prev) =>
			Object.fromEntries(
				Object.entries(prev).filter(
					([entryPath]) =>
						entryPath !== path && !entryPath.startsWith(`${path}/`),
				),
			),
		);
	}, []);

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
			activeDirPath,
			setActiveDirPath,
			activeFilePath,
			setActiveFilePath,
			activeNoteId,
			activeNoteTitle,
			itemAppearance,
			setItemAppearance,
			renameItemAppearance,
			deleteItemAppearance,
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
			activeDirPath,
			activeFilePath,
			activeNoteId,
			activeNoteTitle,
			itemAppearance,
			setItemAppearance,
			renameItemAppearance,
			deleteItemAppearance,
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
