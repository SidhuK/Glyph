import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { clearAiPanelCaches } from "../components/ai/cache";
import { clearInlineImageHydrationCache } from "../components/editor/hooks/useHydrateInlineImages";
import { invalidateNavigationPrefetch } from "../lib/navigationPrefetch";
import {
	clearCurrentSpacePath,
	loadSettings,
	setCurrentSpacePath,
	updateOnboardingSettings,
} from "../lib/settings";
import { type AppInfo, TauriInvokeError, invoke } from "../lib/tauri";

export interface SpaceContextValue {
	info: AppInfo | null;
	error: string;
	setError: (error: string) => void;
	spacePath: string | null;
	lastSpacePath: string | null;
	spaceSchemaVersion: number | null;
	recentSpaces: string[];
	isIndexing: boolean;
	settingsLoaded: boolean;
	startIndexRebuild: () => Promise<void>;
	onOpenSpace: () => Promise<void>;
	onOpenSpaceAtPath: (path: string) => Promise<void>;
	onContinueLastSpace: () => Promise<void>;
	onCreateSpace: () => Promise<void>;
	closeSpace: () => Promise<void>;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

const extractError = (err: unknown): string =>
	err instanceof TauriInvokeError
		? err.message
		: err instanceof Error
			? err.message
			: String(err);

function normalizeRecentSpaces(
	recent: string[],
	currentSpacePath: string | null,
): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const pushUnique = (value: string | null) => {
		if (!value) return;
		const trimmed = value.trim();
		if (!trimmed || seen.has(trimmed)) return;
		seen.add(trimmed);
		out.push(trimmed);
	};
	pushUnique(currentSpacePath);
	for (const value of recent) pushUnique(value);
	return out.slice(0, 20);
}

function recentSpacesForMenu(
	recentSpaces: string[],
	currentSpacePath: string | null,
): string[] {
	return recentSpaces
		.map((path) => path.trim())
		.filter((path) => path && path !== currentSpacePath)
		.slice(0, 20);
}

export function SpaceProvider({ children }: { children: ReactNode }) {
	const [info, setInfo] = useState<AppInfo | null>(null);
	const [error, setError] = useState("");
	const [spacePath, setSpacePath] = useState<string | null>(null);
	const [lastSpacePath, setLastSpacePath] = useState<string | null>(null);
	const [spaceSchemaVersion, setSpaceSchemaVersion] = useState<number | null>(
		null,
	);
	const [recentSpaces, setRecentSpaces] = useState<string[]>([]);
	const [isIndexing, setIsIndexing] = useState(false);
	const [settingsLoaded, setSettingsLoaded] = useState(false);
	const isOpeningSpaceRef = useRef(false);

	const syncRecentSpacesMenu = useCallback((spaces: string[]) => {
		void invoke("set_recent_spaces_menu", {
			recent_spaces: spaces,
		}).catch((error) => {
			console.warn("Failed to sync native recent spaces menu", error);
		});
	}, []);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const appInfo = await invoke("app_info");
				if (!cancelled) setInfo(appInfo);
			} catch (err) {
				if (!cancelled) setError(extractError(err));
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		syncRecentSpacesMenu(recentSpacesForMenu(recentSpaces, spacePath));
	}, [recentSpaces, spacePath, syncRecentSpacesMenu]);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setRecentSpaces(
					normalizeRecentSpaces(
						settings.recentSpaces,
						settings.currentSpacePath ?? null,
					),
				);
				setLastSpacePath(
					settings.currentSpacePath ?? settings.recentSpaces[0] ?? null,
				);
				try {
					await invoke("index_set_people_mentions_as_tags_enabled", {
						enabled: settings.editor.enablePeopleMentionsAsTags,
					});
				} catch (error) {
					console.warn(
						"Failed to sync people mentions setting with index runtime",
						error,
					);
				}

				if (settings.currentSpacePath) {
					try {
						const spaceInfo = await invoke("space_open", {
							path: settings.currentSpacePath,
						});
						if (!cancelled) {
							setSpacePath(spaceInfo.root);
							setSpaceSchemaVersion(spaceInfo.schema_version);
						}
					} catch {}
				}
			} catch (err) {
				if (!cancelled) {
					setError(extractError(err));
				}
			} finally {
				if (!cancelled) setSettingsLoaded(true);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, []);

	const startIndexRebuild = useCallback(async (): Promise<void> => {
		setIsIndexing(true);
		try {
			await invoke("index_rebuild");
		} catch {
			/* index is derived; ignore */
		} finally {
			setIsIndexing(false);
		}
	}, []);

	const applySpaceSelection = useCallback(
		async (path: string, mode: "open" | "create") => {
			if (isOpeningSpaceRef.current) return;
			isOpeningSpaceRef.current = true;
			setError("");
			try {
				if (spacePath) {
					await invoke("space_close");
					await clearCurrentSpacePath();
					clearAiPanelCaches();
					clearInlineImageHydrationCache();
					invalidateNavigationPrefetch();
					setSpacePath(null);
					setSpaceSchemaVersion(null);
				}
				const spaceInfo =
					mode === "create"
						? await invoke("space_create", { path })
						: await invoke("space_open", { path });
				await setCurrentSpacePath(spaceInfo.root);
				setRecentSpaces((prev) =>
					normalizeRecentSpaces(
						[spaceInfo.root, ...prev.filter((p) => p !== spaceInfo.root)],
						spaceInfo.root,
					),
				);
				void updateOnboardingSettings({ launcherSeen: true });
				setLastSpacePath(spaceInfo.root);
				setSpacePath(spaceInfo.root);
				setSpaceSchemaVersion(spaceInfo.schema_version);
			} catch (err) {
				setError(extractError(err));
			} finally {
				isOpeningSpaceRef.current = false;
			}
		},
		[spacePath],
	);

	const closeSpace = useCallback(async () => {
		setError("");
		try {
			await invoke("space_close");
			await clearCurrentSpacePath();
			clearAiPanelCaches();
			clearInlineImageHydrationCache();
			invalidateNavigationPrefetch();
			setSpacePath(null);
			setSpaceSchemaVersion(null);
		} catch (err) {
			setError(extractError(err));
		}
	}, []);

	const onOpenSpace = useCallback(async () => {
		const { open } = await import("@tauri-apps/plugin-dialog");
		const selection = await open({
			title: "Select a space folder",
			directory: true,
			multiple: false,
		});
		if (!selection) return;
		const path = Array.isArray(selection) ? selection[0] : selection;
		if (path) await applySpaceSelection(path, "open");
	}, [applySpaceSelection]);

	const onOpenSpaceAtPath = useCallback(
		async (path: string) => applySpaceSelection(path, "open"),
		[applySpaceSelection],
	);

	const onContinueLastSpace = useCallback(async () => {
		if (lastSpacePath) await applySpaceSelection(lastSpacePath, "open");
	}, [lastSpacePath, applySpaceSelection]);

	const onCreateSpace = useCallback(async () => {
		const { open } = await import("@tauri-apps/plugin-dialog");
		const selection = await open({
			title: "Select a space folder",
			directory: true,
			multiple: false,
		});
		if (!selection) return;
		const path = Array.isArray(selection) ? selection[0] : selection;
		if (path) await applySpaceSelection(path, "create");
	}, [applySpaceSelection]);

	const value = useMemo<SpaceContextValue>(
		() => ({
			info,
			error,
			setError,
			spacePath,
			lastSpacePath,
			spaceSchemaVersion,
			recentSpaces,
			isIndexing,
			settingsLoaded,
			startIndexRebuild,
			onOpenSpace,
			onOpenSpaceAtPath,
			onContinueLastSpace,
			onCreateSpace,
			closeSpace,
		}),
		[
			info,
			error,
			spacePath,
			lastSpacePath,
			spaceSchemaVersion,
			recentSpaces,
			isIndexing,
			settingsLoaded,
			startIndexRebuild,
			onOpenSpace,
			onOpenSpaceAtPath,
			onContinueLastSpace,
			onCreateSpace,
			closeSpace,
		],
	);

	return (
		<SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>
	);
}

export function useSpace(): SpaceContextValue {
	const ctx = useContext(SpaceContext);
	if (!ctx) throw new Error("useSpace must be used within SpaceProvider");
	return ctx;
}
