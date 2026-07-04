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
	loadSettings,
	normalizeOpenSpacePaths,
	updateOnboardingSettings,
	updateSpaceSwitcherState,
} from "../lib/settings";
import { type AppInfo, invoke } from "../lib/tauri";

export type OpenSpace = {
	path: string;
	label: string;
};

export type SpaceSwitchDirection = -1 | 0 | 1;

interface SpaceContextValue {
	info: AppInfo | null;
	error: string;
	setError: (error: string) => void;
	spacePath: string | null;
	openSpaces: OpenSpace[];
	activeSpaceIndex: number;
	switchDirection: SpaceSwitchDirection;
	spaceSchemaVersion: number | null;
	onboardingNotePath: string | null;
	recentSpaces: string[];
	isIndexing: boolean;
	settingsLoaded: boolean;
	consumeOnboardingNotePath: () => void;
	startIndexRebuild: () => Promise<void>;
	startIndexSync: () => Promise<void>;
	switchSpace: (path: string) => Promise<void>;
	switchToNextSpace: () => Promise<void>;
	switchToPreviousSpace: () => Promise<void>;
	onOpenSpace: () => Promise<void>;
	onOpenSpaceAtPath: (path: string) => Promise<void>;
	onCreateSpace: () => Promise<void>;
	closeSpace: () => Promise<void>;
}

const SpaceContext = createContext<SpaceContextValue | null>(null);

function formatSpaceLabel(path: string): string {
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const parts = normalized.split("/").filter(Boolean);
	if (parts.length === 0) return path;
	return parts[parts.length - 1] ?? path;
}

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

function neighborPath(openPaths: string[], activePath: string): string | null {
	const index = openPaths.indexOf(activePath);
	if (index < 0) return null;
	return openPaths[index + 1] ?? openPaths[index - 1] ?? null;
}

function rewriteMountedOpenPath(
	openPaths: string[],
	requestedPath: string,
	canonicalRoot: string,
): string[] {
	const normalized = normalizeOpenSpacePaths(openPaths);
	let replaced = false;
	const rewritten = normalized.map((path) => {
		if (path !== requestedPath && path !== canonicalRoot) return path;
		replaced = true;
		return canonicalRoot;
	});
	return normalizeOpenSpacePaths(
		replaced ? rewritten : [...rewritten, canonicalRoot],
	);
}

function clearSpaceCaches(): void {
	clearAiPanelCaches();
	clearInlineImageHydrationCache();
	invalidateNavigationPrefetch();
}

export function SpaceProvider({ children }: { children: ReactNode }) {
	const [info, setInfo] = useState<AppInfo | null>(null);
	const [error, setError] = useState("");
	const [spacePath, setSpacePath] = useState<string | null>(null);
	const [openPaths, setOpenPaths] = useState<string[]>([]);
	const [spaceSchemaVersion, setSpaceSchemaVersion] = useState<number | null>(
		null,
	);
	const [onboardingNotePath, setOnboardingNotePath] = useState<string | null>(
		null,
	);
	const [recentSpaces, setRecentSpaces] = useState<string[]>([]);
	const [isIndexing, setIsIndexing] = useState(false);
	const [settingsLoaded, setSettingsLoaded] = useState(false);
	const [switchDirection, setSwitchDirection] =
		useState<SpaceSwitchDirection>(0);
	const isOpeningSpaceRef = useRef(false);
	const currentSpacePathRef = useRef<string | null>(spacePath);
	const activeSpaceIndexRef = useRef(-1);
	const indexSyncRef = useRef<{
		spacePath: string;
		promise: Promise<void>;
	} | null>(null);
	currentSpacePathRef.current = spacePath;

	const openSpaces = useMemo<OpenSpace[]>(
		() =>
			openPaths.map((path) => ({
				path,
				label: formatSpaceLabel(path),
			})),
		[openPaths],
	);

	const activeSpaceIndex = useMemo(
		() => (spacePath ? openPaths.indexOf(spacePath) : -1),
		[openPaths, spacePath],
	);
	activeSpaceIndexRef.current = activeSpaceIndex;

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
		let cancelled = false;
		(async () => {
			try {
				const appInfo = await invoke("app_info");
				if (!cancelled) setInfo(appInfo);
			} catch (err) {
				if (!cancelled) setError(extractErrorMessage(err));
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

				let persistedOpenPaths = normalizeOpenSpacePaths(
					settings.openSpacePaths,
				);
				if (persistedOpenPaths.length === 0 && settings.currentSpacePath) {
					persistedOpenPaths = [settings.currentSpacePath];
				}

				const activePath =
					settings.currentSpacePath ?? persistedOpenPaths[0] ?? null;

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
				let mountedSpaceInfo = currentWindowSpaceInfo;
				if (currentWindowSpaceInfo) {
					if (!cancelled) {
						setSpacePath(currentWindowSpaceInfo.root);
						setSpaceSchemaVersion(currentWindowSpaceInfo.schema_version);
						setOnboardingNotePath(
							currentWindowSpaceInfo.onboarding_note_path ?? null,
						);
					}
				} else if (activePath) {
					try {
						mountedSpaceInfo = await invoke("space_open", {
							path: activePath,
						});
						if (!cancelled) {
							setSpacePath(mountedSpaceInfo.root);
							setSpaceSchemaVersion(mountedSpaceInfo.schema_version);
							setOnboardingNotePath(
								mountedSpaceInfo.onboarding_note_path ?? null,
							);
						}
					} catch (err) {
						if (!cancelled) setError(extractErrorMessage(err));
					}
				}

				if (cancelled) return;
				if (mountedSpaceInfo) {
					const nextOpenPaths = rewriteMountedOpenPath(
						persistedOpenPaths,
						activePath ?? mountedSpaceInfo.root,
						mountedSpaceInfo.root,
					);
					setOpenPaths(nextOpenPaths);
					setRecentSpaces(
						normalizeRecentSpaces(settings.recentSpaces, mountedSpaceInfo.root),
					);
					await updateSpaceSwitcherState({
						currentPath: mountedSpaceInfo.root,
						openPaths: nextOpenPaths,
					});
				} else {
					setOpenPaths(persistedOpenPaths);
					setRecentSpaces(
						normalizeRecentSpaces(settings.recentSpaces, activePath),
					);
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
		} catch {
			/* index is derived; ignore */
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

	const mountSpace = useCallback(
		async (path: string, mode: "open" | "create") => {
			const spaceInfo =
				mode === "create"
					? await invoke("space_create", { path })
					: await invoke("space_open", { path });

			clearSpaceCaches();
			setSpacePath(spaceInfo.root);
			setSpaceSchemaVersion(spaceInfo.schema_version);
			setOnboardingNotePath(spaceInfo.onboarding_note_path ?? null);
			void updateOnboardingSettings({ launcherSeen: true });

			return spaceInfo;
		},
		[],
	);

	const persistSwitcherState = useCallback(
		async (
			currentPath: string | null,
			nextOpenPaths: string[],
			requestedPath?: string,
		) => {
			const normalizedOpenPaths = currentPath
				? rewriteMountedOpenPath(
						nextOpenPaths,
						requestedPath ?? currentPath,
						currentPath,
					)
				: normalizeOpenSpacePaths(nextOpenPaths);
			await updateSpaceSwitcherState({
				currentPath,
				openPaths: normalizedOpenPaths,
			});
			setOpenPaths(normalizedOpenPaths);
			if (currentPath) {
				setRecentSpaces((prev) =>
					normalizeRecentSpaces(
						[currentPath, ...prev.filter((p) => p !== currentPath)],
						currentPath,
					),
				);
			}
		},
		[],
	);

	const activateSpace = useCallback(
		async (
			path: string,
			mode: "open" | "create",
			updateOpenPaths: (current: string[], target: string) => string[],
		) => {
			const trimmed = path.trim();
			if (!trimmed) return;
			if (isOpeningSpaceRef.current) return;
			isOpeningSpaceRef.current = true;
			setError("");
			try {
				const nextOpenPaths = updateOpenPaths(openPaths, trimmed);
				const previousIndex = activeSpaceIndexRef.current;
				const nextIndex = openPaths.indexOf(trimmed);
				const appendedIndex = nextOpenPaths.indexOf(trimmed);
				const targetIndex = nextIndex >= 0 ? nextIndex : appendedIndex;
				if (
					previousIndex >= 0 &&
					targetIndex >= 0 &&
					previousIndex !== targetIndex
				) {
					setSwitchDirection(targetIndex > previousIndex ? 1 : -1);
				} else {
					setSwitchDirection(0);
				}

				const spaceInfo = await mountSpace(trimmed, mode);
				await persistSwitcherState(spaceInfo.root, nextOpenPaths, trimmed);
			} catch (err) {
				setError(extractErrorMessage(err));
				throw err;
			} finally {
				isOpeningSpaceRef.current = false;
			}
		},
		[mountSpace, openPaths, persistSwitcherState],
	);

	const switchSpace = useCallback(
		async (path: string) =>
			activateSpace(path, "open", (currentOpenPaths) => currentOpenPaths),
		[activateSpace],
	);

	const applySpaceSelection = useCallback(
		async (path: string, mode: "open" | "create") =>
			activateSpace(path, mode, (currentOpenPaths, target) =>
				currentOpenPaths.includes(target)
					? currentOpenPaths
					: [...currentOpenPaths, target],
			),
		[activateSpace],
	);

	const closeSpace = useCallback(async () => {
		const activePath = currentSpacePathRef.current;
		if (!activePath) return;
		const nextOpenPaths = openPaths.filter((path) => path !== activePath);
		const neighbor = neighborPath(openPaths, activePath);
		if (neighbor) {
			await activateSpace(neighbor, "open", () => nextOpenPaths);
			return;
		}

		if (isOpeningSpaceRef.current) return;
		isOpeningSpaceRef.current = true;
		setError("");
		try {
			await invoke("space_close");
			clearSpaceCaches();
			setSpacePath(null);
			setSpaceSchemaVersion(null);
			setOnboardingNotePath(null);
			await persistSwitcherState(null, nextOpenPaths);
		} catch (err) {
			setError(extractErrorMessage(err));
			throw err;
		} finally {
			isOpeningSpaceRef.current = false;
		}
	}, [activateSpace, openPaths, persistSwitcherState]);

	const switchToNextSpace = useCallback(async () => {
		const index = activeSpaceIndexRef.current;
		if (index < 0 || index >= openPaths.length - 1) return;
		await switchSpace(openPaths[index + 1]);
	}, [openPaths, switchSpace]);

	const switchToPreviousSpace = useCallback(async () => {
		const index = activeSpaceIndexRef.current;
		if (index <= 0) return;
		await switchSpace(openPaths[index - 1]);
	}, [openPaths, switchSpace]);

	const consumeOnboardingNotePath = useCallback(() => {
		setOnboardingNotePath(null);
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
			openSpaces,
			activeSpaceIndex,
			switchDirection,
			spaceSchemaVersion,
			onboardingNotePath,
			recentSpaces,
			isIndexing,
			settingsLoaded,
			consumeOnboardingNotePath,
			startIndexRebuild,
			startIndexSync,
			switchSpace,
			switchToNextSpace,
			switchToPreviousSpace,
			onOpenSpace,
			onOpenSpaceAtPath,
			onCreateSpace,
			closeSpace,
		}),
		[
			info,
			error,
			spacePath,
			openSpaces,
			activeSpaceIndex,
			switchDirection,
			spaceSchemaVersion,
			onboardingNotePath,
			recentSpaces,
			isIndexing,
			settingsLoaded,
			consumeOnboardingNotePath,
			startIndexRebuild,
			startIndexSync,
			switchSpace,
			switchToNextSpace,
			switchToPreviousSpace,
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
