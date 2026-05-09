import {
	type ReactNode,
	createContext,
	use,
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useRef,
} from "react";
import { extractErrorMessage } from "../lib/errorUtils";
import { valueReducer } from "../lib/reactState";
import { loadSettings } from "../lib/settings";
import type {
	FileTreeAppearance,
	FsEntry,
	PersonCount,
	TagCount,
} from "../lib/tauri";
import { invoke } from "../lib/tauri";
import { useTauriEvent } from "../lib/tauriEvents";
import { useSpace } from "./SpaceContext";

interface FileTreeContextValue {
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
	pinnedFiles: string[];
	refreshPinnedFiles: () => Promise<void>;
	togglePinnedFile: (path: string) => Promise<void>;
	renamePinnedPath: (fromPath: string, toPath: string) => Promise<void>;
	deletePinnedPath: (path: string) => Promise<void>;
	itemAppearance: Record<string, FileTreeAppearance>;
	setItemAppearance: (
		path: string,
		appearance: FileTreeAppearance,
	) => Promise<void>;
	renameItemAppearance: (fromPath: string, toPath: string) => Promise<void>;
	deleteItemAppearance: (path: string) => Promise<void>;
	tags: TagCount[];
	people: PersonCount[];
	tagsError: string;
	refreshTags: () => Promise<void>;
}

const FileTreeContext = createContext<FileTreeContextValue | null>(null);

// Tags and people share a page size so metadata lists do not silently truncate.
const TAG_METADATA_PAGE_SIZE = 500;

async function fetchAllTags(): Promise<TagCount[]> {
	const fetchPage = async (offset: number): Promise<TagCount[]> => {
		const page = await invoke("tags_list", {
			limit: TAG_METADATA_PAGE_SIZE,
			offset,
		});
		if (page.length < TAG_METADATA_PAGE_SIZE) return page;
		return [...page, ...(await fetchPage(offset + TAG_METADATA_PAGE_SIZE))];
	};
	return fetchPage(0);
}

async function fetchAllPeople(): Promise<PersonCount[]> {
	const fetchPage = async (offset: number): Promise<PersonCount[]> => {
		const page = await invoke("people_list", {
			limit: TAG_METADATA_PAGE_SIZE,
			offset,
		});
		if (page.length < TAG_METADATA_PAGE_SIZE) return page;
		return [...page, ...(await fetchPage(offset + TAG_METADATA_PAGE_SIZE))];
	};
	return fetchPage(0);
}

export function FileTreeProvider(props: { children: ReactNode }) {
	return useFileTreeProvider(props);
}

function useFileTreeProvider({ children }: { children: ReactNode }) {
	const { spacePath, isIndexing, startIndexRebuild } = useSpace();

	const [rootEntries, setRootEntries] = useReducer(valueReducer<FsEntry[]>, []);
	const [childrenByDir, setChildrenByDir] = useReducer(
		valueReducer<Record<string, FsEntry[] | undefined>>,
		{},
	);
	const [expandedDirs, setExpandedDirs] = useReducer(
		valueReducer<Set<string>>,
		undefined,
		() => new Set<string>(),
	);
	const [activeDirPath, setActiveDirPath] = useReducer(
		valueReducer<string | null>,
		null,
	);
	const [activeFilePath, setActiveFilePath] = useReducer(
		valueReducer<string | null>,
		null,
	);
	const [pinnedFiles, setPinnedFiles] = useReducer(valueReducer<string[]>, []);
	const [itemAppearance, setItemAppearanceState] = useReducer(
		valueReducer<Record<string, FileTreeAppearance>>,
		{},
	);
	const [tags, setTags] = useReducer(valueReducer<TagCount[]>, []);
	const [people, setPeople] = useReducer(valueReducer<PersonCount[]>, []);
	const [tagsError, setTagsError] = useReducer(valueReducer<string>, "");
	const peopleMentionsEnabledRef = useRef(false);
	const tagsRequestIdRef = useRef(0);
	const currentSpacePathRef = useRef<string | null>(spacePath);
	const pinnedFilesRefreshTimerRef = useRef<number | null>(null);
	currentSpacePathRef.current = spacePath;

	// biome-ignore lint/correctness/useExhaustiveDependencies: clear pending refreshes when the active space changes.
	useEffect(
		() => () => {
			if (pinnedFilesRefreshTimerRef.current !== null) {
				window.clearTimeout(pinnedFilesRefreshTimerRef.current);
				pinnedFilesRefreshTimerRef.current = null;
			}
		},
		[spacePath],
	);

	const refreshTags = useCallback(async () => {
		const requestId = tagsRequestIdRef.current + 1;
		tagsRequestIdRef.current = requestId;
		const peopleEnabled = peopleMentionsEnabledRef.current;
		try {
			if (requestId === tagsRequestIdRef.current) {
				setTagsError("");
			}
			const [nextTags, nextPeople] = await Promise.all([
				fetchAllTags(),
				peopleEnabled ? fetchAllPeople() : Promise.resolve([] as PersonCount[]),
			]);
			if (requestId !== tagsRequestIdRef.current) {
				return;
			}
			setTags(nextTags);
			setPeople(nextPeople);
		} catch (e) {
			if (requestId !== tagsRequestIdRef.current) {
				return;
			}
			setTags([]);
			setPeople([]);
			setTagsError(extractErrorMessage(e));
		}
	}, []);

	useEffect(() => {
		let cancelled = false;
		void loadSettings()
			.then((settings) => {
				if (cancelled) return;
				peopleMentionsEnabledRef.current =
					settings.editor.enablePeopleMentionsAsTags;
				if (currentSpacePathRef.current) {
					void refreshTags();
				}
			})
			.catch(() => {
				if (cancelled) return;
				peopleMentionsEnabledRef.current = false;
				if (currentSpacePathRef.current) {
					void refreshTags();
				}
			});
		return () => {
			cancelled = true;
		};
	}, [refreshTags]);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.editor?.enablePeopleMentionsAsTags === "boolean") {
			peopleMentionsEnabledRef.current =
				payload.editor.enablePeopleMentionsAsTags;
			if (!payload.editor.enablePeopleMentionsAsTags) {
				setPeople([]);
			}
			if (currentSpacePathRef.current) {
				void refreshTags();
			}
		}
	});
	const resetTreeState = useCallback(() => {
		setRootEntries([]);
		setChildrenByDir({});
		setExpandedDirs(new Set());
		setActiveDirPath(null);
		setActiveFilePath(null);
		setPinnedFiles([]);
		setItemAppearanceState({});
		setTags([]);
		setPeople([]);
		setTagsError("");
	}, []);
	const applyRootEntries = useCallback((entries: FsEntry[]) => {
		setRootEntries(entries);
	}, []);
	const applyItemAppearance = useCallback(
		(appearance: Record<string, FileTreeAppearance>) => {
			setItemAppearanceState(appearance);
		},
		[],
	);
	const applyPinnedFiles = useCallback((files: string[]) => {
		setPinnedFiles(files);
	}, []);

	useEffect(() => {
		resetTreeState();
		if (!spacePath) return;

		let cancelled = false;
		(async () => {
			try {
				const entries = await invoke("space_list_dir", {});
				if (!cancelled) {
					applyRootEntries(entries);
					void startIndexRebuild();
					void refreshTags();
				}
			} catch {
				/* ignore initial load errors */
			}
			try {
				const appearance = await invoke("file_tree_appearance_list");
				if (!cancelled) {
					applyItemAppearance(appearance);
				}
			} catch {
				/* ignore appearance load errors */
			}
			try {
				const files = await invoke("pinned_files_list");
				if (!cancelled) {
					applyPinnedFiles(files);
				}
			} catch {
				/* ignore pinned file load errors */
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [
		spacePath,
		startIndexRebuild,
		refreshTags,
		resetTreeState,
		applyRootEntries,
		applyItemAppearance,
		applyPinnedFiles,
	]);

	useEffect(() => {
		if (!isIndexing && spacePath) void refreshTags();
	}, [isIndexing, spacePath, refreshTags]);

	const refreshPinnedFiles = useCallback(async () => {
		if (!spacePath) {
			setPinnedFiles([]);
			return;
		}
		try {
			const currentSpacePath = spacePath;
			const files = await invoke("pinned_files_list");
			if (currentSpacePathRef.current !== currentSpacePath) return;
			setPinnedFiles(files);
		} catch {
			if (currentSpacePathRef.current === spacePath) {
				setPinnedFiles([]);
			}
		}
	}, [spacePath]);

	useTauriEvent("space:fs_changed", (payload) => {
		if (!spacePath) return;
		if (!payload.removed) return;
		if (pinnedFilesRefreshTimerRef.current !== null) {
			window.clearTimeout(pinnedFilesRefreshTimerRef.current);
		}
		pinnedFilesRefreshTimerRef.current = window.setTimeout(() => {
			pinnedFilesRefreshTimerRef.current = null;
			void refreshPinnedFiles();
		}, 150);
	});

	const activeNoteId = activeFilePath?.toLowerCase().endsWith(".md")
		? activeFilePath
		: null;
	const activeNoteTitle = activeNoteId
		? activeNoteId.split("/").pop() || activeNoteId
		: null;

	const togglePinnedFile = useCallback<
		FileTreeContextValue["togglePinnedFile"]
	>(
		async (path) => {
			const currentSpacePath = spacePath;
			if (currentSpacePathRef.current !== currentSpacePath) return;
			const next = await invoke("pinned_files_toggle", { path });
			if (currentSpacePathRef.current === currentSpacePath) {
				setPinnedFiles(next);
			}
		},
		[spacePath],
	);

	const renamePinnedPath = useCallback<
		FileTreeContextValue["renamePinnedPath"]
	>(
		async (fromPath, toPath) => {
			const currentSpacePath = spacePath;
			if (currentSpacePathRef.current !== currentSpacePath) return;
			const next = await invoke("pinned_files_rename_path", {
				from_path: fromPath,
				to_path: toPath,
			});
			if (currentSpacePathRef.current === currentSpacePath) {
				setPinnedFiles(next);
			}
		},
		[spacePath],
	);

	const deletePinnedPath = useCallback<
		FileTreeContextValue["deletePinnedPath"]
	>(
		async (path) => {
			const currentSpacePath = spacePath;
			if (currentSpacePathRef.current !== currentSpacePath) return;
			const next = await invoke("pinned_files_delete_path", { path });
			if (currentSpacePathRef.current === currentSpacePath) {
				setPinnedFiles(next);
			}
		},
		[spacePath],
	);

	const setItemAppearance = useCallback<
		FileTreeContextValue["setItemAppearance"]
	>(
		async (path, appearance) => {
			const currentSpacePath = spacePath;
			if (currentSpacePathRef.current !== currentSpacePath) return;
			const next = await invoke("file_tree_appearance_set", {
				path,
				color: appearance.color ?? null,
				icon: appearance.icon ?? null,
			});
			if (currentSpacePathRef.current === currentSpacePath) {
				setItemAppearanceState((prev) => {
					if (next) return { ...prev, [path]: next };
					if (!(path in prev)) return prev;
					const nextMap = { ...prev };
					delete nextMap[path];
					return nextMap;
				});
			}
		},
		[spacePath],
	);

	const renameItemAppearance = useCallback<
		FileTreeContextValue["renameItemAppearance"]
	>(
		async (fromPath, toPath) => {
			const currentSpacePath = spacePath;
			await invoke("file_tree_appearance_rename_path", {
				from_path: fromPath,
				to_path: toPath,
			});
			if (currentSpacePathRef.current !== currentSpacePath) return;
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
		},
		[spacePath],
	);

	const deleteItemAppearance = useCallback<
		FileTreeContextValue["deleteItemAppearance"]
	>(
		async (path) => {
			const currentSpacePath = spacePath;
			await invoke("file_tree_appearance_delete_path", { path });
			if (currentSpacePathRef.current !== currentSpacePath) return;
			setItemAppearanceState((prev) =>
				Object.fromEntries(
					Object.entries(prev).filter(
						([entryPath]) =>
							entryPath !== path && !entryPath.startsWith(`${path}/`),
					),
				),
			);
		},
		[spacePath],
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
			activeDirPath,
			setActiveDirPath,
			activeFilePath,
			setActiveFilePath,
			activeNoteId,
			activeNoteTitle,
			pinnedFiles,
			refreshPinnedFiles,
			togglePinnedFile,
			renamePinnedPath,
			deletePinnedPath,
			itemAppearance,
			setItemAppearance,
			renameItemAppearance,
			deleteItemAppearance,
			tags,
			people,
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
			pinnedFiles,
			refreshPinnedFiles,
			togglePinnedFile,
			renamePinnedPath,
			deletePinnedPath,
			itemAppearance,
			setItemAppearance,
			renameItemAppearance,
			deleteItemAppearance,
			tags,
			people,
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
	const ctx = use(FileTreeContext);
	if (!ctx)
		throw new Error("useFileTreeContext must be used within FileTreeProvider");
	return ctx;
}
