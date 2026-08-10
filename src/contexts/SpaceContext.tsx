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
import { loadSettings, setCurrentSpacePath } from "../lib/settings";
import { invoke } from "../lib/tauri";
import { toast } from "../lib/toast";

interface SpaceContextValue {
	setError: (error: string) => void;
	spacePath: string | null;
	welcomeNotePath: string | null;
	recentSpaces: string[];
	isIndexing: boolean;
	settingsLoaded: boolean;
	consumeWelcomeNotePath: () => void;
	startIndexRebuild: () => Promise<void>;
	startIndexSync: () => Promise<void>;
	onOpenSpace: () => Promise<void>;
	/** Resolves to whether the space is now open. */
	onOpenSpaceAtPath: (path: string) => Promise<boolean>;
	onCreateSpace: () => Promise<void>;
	closeSpace: () => Promise<void>;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

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
	const [recentSpaces, setRecentSpaces] = useState<string[]>([]);
	const [isIndexing, setIsIndexing] = useState(false);
	const [settingsLoaded, setSettingsLoaded] = useState(false);
	const isOpeningSpaceRef = useRef(false);
	const currentSpacePathRef = useRef<string | null>(spacePath);
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
		syncRecentSpacesMenu(
			recentSpaces.filter((path) => path !== spacePath).slice(0, 20),
		);
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

				const currentWindowSpaceInfo = await invoke("space_get_current_info");
				if (currentWindowSpaceInfo) {
					if (!cancelled) {
						setSpacePath(currentWindowSpaceInfo.root);
						setWelcomeNotePath(
							currentWindowSpaceInfo.welcome_note_path ?? null,
						);
					}
				} else if (settings.currentSpacePath) {
					try {
						const spaceInfo = await invoke("space_open", {
							path: settings.currentSpacePath,
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
				setRecentSpaces((prev) => normalizeRecentSpaces(prev, spaceInfo.root));
				await setCurrentSpacePath(spaceInfo.root);
				return true;
			} catch (err) {
				setError(extractErrorMessage(err));
				return false;
			} finally {
				isOpeningSpaceRef.current = false;
			}
		},
		[],
	);

	const closeSpace = useCallback(async () => {
		try {
			await invoke("space_close");
			clearAiPanelCaches();
			clearInlineImageHydrationCache();
			invalidateNavigationPrefetch();
			setSpacePath(null);
			setWelcomeNotePath(null);
		} catch (err) {
			setError(extractErrorMessage(err));
		}
	}, []);

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

	const value = useMemo<SpaceContextValue>(
		() => ({
			setError,
			spacePath,
			welcomeNotePath,
			recentSpaces,
			isIndexing,
			settingsLoaded,
			consumeWelcomeNotePath,
			startIndexRebuild,
			startIndexSync,
			onOpenSpace,
			onOpenSpaceAtPath,
			onCreateSpace,
			closeSpace,
		}),
		[
			spacePath,
			welcomeNotePath,
			recentSpaces,
			isIndexing,
			settingsLoaded,
			consumeWelcomeNotePath,
			startIndexRebuild,
			startIndexSync,
			onOpenSpace,
			onOpenSpaceAtPath,
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
