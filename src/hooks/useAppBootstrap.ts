import { useCallback, useEffect, useState } from "react";
import { loadSettings, setCurrentVaultPath } from "../lib/settings";
import type { AppInfo, DirChildSummary, FsEntry, TagCount } from "../lib/tauri";
import { TauriInvokeError, invoke } from "../lib/tauri";

export interface AppState {
	info: AppInfo | null;
	error: string;
	setError: (error: string) => void;
	vaultPath: string | null;
	vaultSchemaVersion: number | null;
	recentVaults: string[];
	rootEntries: FsEntry[];
	setRootEntries: (entries: FsEntry[]) => void;
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
	isIndexing: boolean;
	tags: TagCount[];
	tagsError: string;
	refreshTags: () => Promise<void>;
	startIndexRebuild: () => Promise<void>;
	resetVaultUiState: () => void;
	onOpenVault: () => Promise<void>;
	onCreateVault: () => Promise<void>;
	closeVault: () => Promise<void>;
}

export function useAppBootstrap(): AppState {
	const [info, setInfo] = useState<AppInfo | null>(null);
	const [error, setError] = useState<string>("");
	const [vaultPath, setVaultPath] = useState<string | null>(null);
	const [vaultSchemaVersion, setVaultSchemaVersion] = useState<number | null>(
		null,
	);
	const [recentVaults, setRecentVaults] = useState<string[]>([]);
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
	const [isIndexing, setIsIndexing] = useState(false);
	const [tags, setTags] = useState<TagCount[]>([]);
	const [tagsError, setTagsError] = useState("");

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const appInfo = await invoke("app_info");
				if (!cancelled) setInfo(appInfo);
			} catch (err) {
				const message =
					err instanceof TauriInvokeError
						? err.message
						: err instanceof Error
							? err.message
							: String(err);
				if (!cancelled) setError(message);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setRecentVaults(settings.recentVaults);

				if (settings.currentVaultPath) {
					setVaultPath(settings.currentVaultPath);
					try {
						const opened = await invoke("vault_open", {
							path: settings.currentVaultPath,
						});
						if (!cancelled) setVaultSchemaVersion(opened.schema_version);
						const entries = await invoke("vault_list_dir", {});
						if (!cancelled) setRootEntries(entries);
					} catch {
						if (!cancelled) {
							setVaultSchemaVersion(null);
							setVaultPath(null);
						}
					}
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				if (!cancelled) setError(message);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const refreshTags = useCallback(async () => {
		try {
			setTagsError("");
			const list = await invoke("tags_list", { limit: 250 });
			setTags(list);
		} catch (e) {
			setTags([]);
			setTagsError(e instanceof Error ? e.message : String(e));
		}
	}, []);

	const startIndexRebuild = useCallback(async (): Promise<void> => {
		setIsIndexing(true);
		try {
			await invoke("index_rebuild");
		} catch {
			// Index is derived; navigation can proceed without it.
		} finally {
			setIsIndexing(false);
		}
		void refreshTags();
	}, [refreshTags]);

	const resetVaultUiState = useCallback(() => {
		setRootEntries([]);
		setChildrenByDir({});
		setDirSummariesByParent({});
		setExpandedDirs(new Set());
		setActiveFilePath(null);
		setTags([]);
		setTagsError("");
	}, []);

	const applyVaultSelection = useCallback(
		async (path: string, mode: "open" | "create") => {
			setError("");
			try {
				const vaultInfo =
					mode === "create"
						? await invoke("vault_create", { path })
						: await invoke("vault_open", { path });
				await setCurrentVaultPath(vaultInfo.root);
				setRecentVaults((prev) => {
					const next = [
						vaultInfo.root,
						...prev.filter((p) => p !== vaultInfo.root),
					];
					return next.slice(0, 20);
				});
				setVaultPath(vaultInfo.root);
				setVaultSchemaVersion(vaultInfo.schema_version);
				resetVaultUiState();

				const entries = await invoke("vault_list_dir", {});
				setRootEntries(entries);
				void startIndexRebuild();
				void refreshTags();
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				setError(message);
			}
		},
		[refreshTags, resetVaultUiState, startIndexRebuild],
	);

	const closeVault = useCallback(async () => {
		setError("");
		try {
			await invoke("vault_close");
			setVaultPath(null);
			setVaultSchemaVersion(null);
			resetVaultUiState();
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			setError(message);
		}
	}, [resetVaultUiState]);

	const onOpenVault = useCallback(async () => {
		const { open } = await import("@tauri-apps/plugin-dialog");
		const selection = await open({
			title: "Select a vault folder",
			directory: true,
			multiple: false,
		});
		if (!selection) return;
		const path = Array.isArray(selection) ? selection[0] : selection;
		if (path) await applyVaultSelection(path, "open");
	}, [applyVaultSelection]);

	const onCreateVault = useCallback(async () => {
		const { open } = await import("@tauri-apps/plugin-dialog");
		const selection = await open({
			title: "Select a vault folder",
			directory: true,
			multiple: false,
		});
		if (!selection) return;
		const path = Array.isArray(selection) ? selection[0] : selection;
		if (path) await applyVaultSelection(path, "create");
	}, [applyVaultSelection]);

	const activeNoteId = activeFilePath?.toLowerCase().endsWith(".md")
		? activeFilePath
		: null;
	const activeNoteTitle = activeNoteId
		? activeNoteId.split("/").pop() || activeNoteId
		: null;

	return {
		info,
		error,
		setError,
		vaultPath,
		vaultSchemaVersion,
		recentVaults,
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
		isIndexing,
		tags,
		tagsError,
		refreshTags,
		startIndexRebuild,
		resetVaultUiState,
		onOpenVault,
		onCreateVault,
		closeVault,
	};
}
