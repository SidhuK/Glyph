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
import { extractErrorMessage } from "../lib/errorUtils";
import { invalidateNavigationPrefetch } from "../lib/navigationPrefetch";
import {
	loadRegisteredSpacePaths,
	loadSettings,
	removeRegisteredSpacePath,
	setCurrentSpacePath,
} from "../lib/settings";
import {
	buildSpaceDefinitions,
	loadSpaceIconOverrides,
	type SpaceDefinition,
	type SpaceIconOverrides,
	writeSpaceIconOverride,
} from "../lib/spaceRegistry";
import { invoke } from "../lib/tauri";
import { useTauriEvent } from "../lib/tauriEvents";
import { toast } from "../lib/toast";

interface SpaceContextValue {
	setError: (error: string) => void;
	spacePath: string | null;
	welcomeNotePath: string | null;
	spaces: SpaceDefinition[];
	switchingSpacePath: string | null;
	isIndexing: boolean;
	settingsLoaded: boolean;
	consumeWelcomeNotePath: () => void;
	startIndexRebuild: () => Promise<void>;
	startIndexSync: () => Promise<void>;
	onOpenSpace: () => Promise<void>;
	/** Resolves to whether the space is now open. */
	onOpenSpaceAtPath: (path: string) => Promise<boolean>;
	onCreateSpace: () => Promise<void>;
	setSpaceIcon: (path: string, iconName: string | null) => Promise<void>;
	removeSpaceFromSwitcher: (path: string) => Promise<void>;
	closeSpace: () => Promise<void>;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

function normalizeSpacePaths(paths: readonly string[], currentSpacePath: string | null): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const pushUnique = (value: string | null) => {
		if (!value) return;
		if (seen.has(value)) return;
		seen.add(value);
		out.push(value);
	};
	for (const value of paths) pushUnique(value);
	const normalized = out.slice(-20);
	const current = currentSpacePath;
	if (!current || normalized.includes(current)) return normalized;
	if (normalized.length === 20) normalized.shift();
	normalized.push(current);
	return normalized;
}

// Space-level errors surface as top toasts; there is no persistent error state.
function setError(message: string) {
	if (message) toast.error(message, { id: "glyph-space-error" });
}

async function selectSpaceFolder(): Promise<string | null> {
	const { open } = await import("@tauri-apps/plugin-dialog");
	const selection = await open({
		title: "Select a space folder",
		directory: true,
		multiple: false,
	});
	if (!selection) return null;
	return Array.isArray(selection) ? (selection[0] ?? null) : selection;
}

export function SpaceProvider({ children }: { children: ReactNode }) {
	const [spacePath, setSpacePath] = useState<string | null>(null);
	const [welcomeNotePath, setWelcomeNotePath] = useState<string | null>(null);
	const [spacePaths, setSpacePaths] = useState<string[]>([]);
	const [spaceIconOverrides, setSpaceIconOverrides] = useState<SpaceIconOverrides>({});
	const [switchingSpacePath, setSwitchingSpacePath] = useState<string | null>(null);
	const [isIndexing, setIsIndexing] = useState(false);
	const [settingsLoaded, setSettingsLoaded] = useState(false);
	const isOpeningSpaceRef = useRef(false);
	const currentSpacePathRef = useRef<string | null>(spacePath);
	const registryRefreshIdRef = useRef(0);
	const indexSyncRef = useRef<{
		spacePath: string;
		promise: Promise<void>;
	} | null>(null);
	currentSpacePathRef.current = spacePath;
	useEffect(() => {
		if (!spacePath) indexSyncRef.current = null;
	}, [spacePath]);

	const syncRecentSpacesMenu = useCallback((spaces: string[]) => {
		void invoke("set_recent_spaces_menu", {
			recent_spaces: spaces,
		}).catch((error) => {
			console.warn("Failed to sync native recent spaces menu", error);
		});
	}, []);

	useEffect(() => {
		syncRecentSpacesMenu(spacePaths.filter((path) => path !== spacePath).slice(0, 20));
	}, [spacePaths, spacePath, syncRecentSpacesMenu]);

	const refreshSpaceRegistry = useCallback(
		async ({ currentSpacePath }: { currentSpacePath?: string | null } = {}) => {
			const refreshId = ++registryRefreshIdRef.current;
			const [registeredPaths, iconOverrides] = await Promise.all([
				loadRegisteredSpacePaths(),
				loadSpaceIconOverrides(),
			]);
			if (refreshId !== registryRefreshIdRef.current) return;
			const activePath =
				currentSpacePath === undefined ? currentSpacePathRef.current : currentSpacePath;
			setSpacePaths(normalizeSpacePaths(registeredPaths, activePath));
			setSpaceIconOverrides(iconOverrides);
		},
		[],
	);

	useTauriEvent("space:registry_updated", (payload) => {
		switch (payload.kind) {
			case "icons":
			case "paths":
				void refreshSpaceRegistry().catch((error) => {
					console.warn("Failed to refresh the space registry", error);
				});
				return;
			default: {
				const exhaustive: never = payload;
				return exhaustive;
			}
		}
	});

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			try {
				const [settings, iconOverrides] = await Promise.all([
					loadSettings(),
					loadSpaceIconOverrides(),
				]);
				if (cancelled) return;
				const savedSpacePath =
					settings.currentSpacePath && settings.recentSpaces.includes(settings.currentSpacePath)
						? settings.currentSpacePath
						: null;
				setSpacePaths(normalizeSpacePaths(settings.recentSpaces, savedSpacePath));
				setSpaceIconOverrides(iconOverrides);
				try {
					await invoke("index_set_people_mentions_as_tags_enabled", {
						enabled: settings.editor.enablePeopleMentionsAsTags,
					});
				} catch (error) {
					console.warn("Failed to sync people mentions setting with index runtime", error);
				}

				const currentWindowSpaceInfo = await invoke("space_get_current_info");
				if (currentWindowSpaceInfo) {
					if (!cancelled) {
						setSpacePath(currentWindowSpaceInfo.root);
						setWelcomeNotePath(currentWindowSpaceInfo.welcome_note_path ?? null);
						setSpacePaths((prev) => normalizeSpacePaths(prev, currentWindowSpaceInfo.root));
					}
				} else if (savedSpacePath) {
					try {
						const spaceInfo = await invoke("space_open", {
							path: savedSpacePath,
						});
						if (!cancelled) {
							setSpacePath(spaceInfo.root);
							setWelcomeNotePath(spaceInfo.welcome_note_path ?? null);
						}
					} catch {}
				}
			} catch (err) {
				if (!cancelled) {
					setError(extractErrorMessage(err));
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
		} finally {
			setIsIndexing(false);
		}
	}, []);

	const startIndexSync = useCallback((): Promise<void> => {
		const currentSpacePath = currentSpacePathRef.current;
		if (!currentSpacePath) return Promise.resolve();
		if (indexSyncRef.current?.spacePath === currentSpacePath) {
			return indexSyncRef.current.promise;
		}

		setIsIndexing(true);
		const promise = invoke("index_sync")
			.then(() => undefined)
			.catch(() => {
				/* the index is derived and will retry on the next open */
			})
			.finally(() => {
				if (indexSyncRef.current?.promise === promise) {
					indexSyncRef.current = null;
				}
				if (
					currentSpacePathRef.current === currentSpacePath ||
					currentSpacePathRef.current === null
				) {
					setIsIndexing(false);
				}
			});
		indexSyncRef.current = { spacePath: currentSpacePath, promise };
		return promise;
	}, []);

	const applySpaceSelection = useCallback(
		async (path: string, mode: "open" | "create"): Promise<boolean> => {
			if (isOpeningSpaceRef.current) return false;
			isOpeningSpaceRef.current = true;
			setSwitchingSpacePath(path);
			try {
				if (path === currentSpacePathRef.current) return true;
				const spaceInfo =
					mode === "create"
						? await invoke("space_create", { path })
						: await invoke("space_open", { path });
				clearAiPanelCaches();
				clearInlineImageHydrationCache();
				invalidateNavigationPrefetch();
				setSpacePath(spaceInfo.root);
				setWelcomeNotePath(spaceInfo.welcome_note_path ?? null);
				setSpacePaths((prev) => normalizeSpacePaths(prev, spaceInfo.root));
				try {
					await setCurrentSpacePath(spaceInfo.root);
					await refreshSpaceRegistry({ currentSpacePath: spaceInfo.root });
				} catch (err) {
					setError(extractErrorMessage(err));
				}
				return true;
			} catch (err) {
				setError(extractErrorMessage(err));
				return false;
			} finally {
				isOpeningSpaceRef.current = false;
				setSwitchingSpacePath(null);
			}
		},
		[refreshSpaceRegistry],
	);

	const setSpaceIcon = useCallback(
		async (path: string, iconName: string | null) => {
			try {
				await writeSpaceIconOverride(path, iconName);
				await refreshSpaceRegistry();
			} catch (err) {
				setError(extractErrorMessage(err));
			}
		},
		[refreshSpaceRegistry],
	);

	const removeSpaceFromSwitcher = useCallback(
		async (path: string) => {
			try {
				await removeRegisteredSpacePath({ path });
				await refreshSpaceRegistry();
			} catch (err) {
				setError(extractErrorMessage(err));
			}
		},
		[refreshSpaceRegistry],
	);

	const closeSpace = useCallback(async () => {
		const closingSpacePath = currentSpacePathRef.current;
		try {
			await invoke("space_close");
			clearAiPanelCaches();
			clearInlineImageHydrationCache();
			invalidateNavigationPrefetch();
			setSpacePath(null);
			setWelcomeNotePath(null);
			if (closingSpacePath) {
				await removeRegisteredSpacePath({ path: closingSpacePath });
				await refreshSpaceRegistry({ currentSpacePath: null });
			}
		} catch (err) {
			setError(extractErrorMessage(err));
		}
	}, [refreshSpaceRegistry]);

	const consumeWelcomeNotePath = useCallback(() => {
		setWelcomeNotePath(null);
	}, []);

	const onOpenSpace = useCallback(async () => {
		const path = await selectSpaceFolder();
		if (path) await applySpaceSelection(path, "open");
	}, [applySpaceSelection]);

	const onOpenSpaceAtPath = useCallback(
		async (path: string) => applySpaceSelection(path, "open"),
		[applySpaceSelection],
	);

	const onCreateSpace = useCallback(async () => {
		const path = await selectSpaceFolder();
		if (path) await applySpaceSelection(path, "create");
	}, [applySpaceSelection]);

	const spaces = useMemo(
		() => buildSpaceDefinitions(spacePaths, spaceIconOverrides),
		[spaceIconOverrides, spacePaths],
	);

	const value = useMemo<SpaceContextValue>(
		() => ({
			setError,
			spacePath,
			welcomeNotePath,
			spaces,
			switchingSpacePath,
			isIndexing,
			settingsLoaded,
			consumeWelcomeNotePath,
			startIndexRebuild,
			startIndexSync,
			onOpenSpace,
			onOpenSpaceAtPath,
			onCreateSpace,
			setSpaceIcon,
			removeSpaceFromSwitcher,
			closeSpace,
		}),
		[
			spacePath,
			welcomeNotePath,
			spaces,
			switchingSpacePath,
			isIndexing,
			settingsLoaded,
			consumeWelcomeNotePath,
			startIndexRebuild,
			startIndexSync,
			onOpenSpace,
			onOpenSpaceAtPath,
			onCreateSpace,
			setSpaceIcon,
			removeSpaceFromSwitcher,
			closeSpace,
		],
	);

	return <SpaceContext.Provider value={value}>{children}</SpaceContext.Provider>;
}

export function useSpace(): SpaceContextValue {
	const ctx = useContext(SpaceContext);
	if (!ctx) throw new Error("useSpace must be used within SpaceProvider");
	return ctx;
}
