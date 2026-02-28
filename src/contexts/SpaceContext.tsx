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
import { clearInlineImageHydrationCache } from "../components/editor/hooks/useHydrateInlineImages";
import { trackIndexRebuildStarted, trackSpaceOpened } from "../lib/analytics";
import {
	clearCurrentSpacePath,
	loadSettings,
	setCurrentSpacePath,
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
		let cancelled = false;
		(async () => {
			try {
				const settings = await loadSettings();
				if (cancelled) return;
				setRecentSpaces(settings.recentSpaces);
				setLastSpacePath(settings.currentSpacePath);

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
			void trackIndexRebuildStarted();
			await invoke("index_rebuild");
		} catch {
			/* index is derived; ignore */
		} finally {
			setIsIndexing(false);
		}
	}, []);

	const applySpaceSelection = useCallback(
		async (
			path: string,
			mode: "open" | "create",
			source: "continue_last" | "open_dialog" | "open_recent" | "create_dialog",
		) => {
			if (isOpeningSpaceRef.current) return;
			isOpeningSpaceRef.current = true;
			setError("");
			try {
				if (spacePath) {
					await invoke("space_close");
					await clearCurrentSpacePath();
					clearInlineImageHydrationCache();
					setSpacePath(null);
					setSpaceSchemaVersion(null);
				}
				const spaceInfo =
					mode === "create"
						? await invoke("space_create", { path })
						: await invoke("space_open", { path });
				await setCurrentSpacePath(spaceInfo.root);
				setRecentSpaces((prev) =>
					[spaceInfo.root, ...prev.filter((p) => p !== spaceInfo.root)].slice(
						0,
						20,
					),
				);
				setLastSpacePath(spaceInfo.root);
				setSpacePath(spaceInfo.root);
				setSpaceSchemaVersion(spaceInfo.schema_version);
				void trackSpaceOpened({
					source,
					spaceSchemaVersion: spaceInfo.schema_version,
				});
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
			clearInlineImageHydrationCache();
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
		if (path) await applySpaceSelection(path, "open", "open_dialog");
	}, [applySpaceSelection]);

	const onOpenSpaceAtPath = useCallback(
		async (path: string) => applySpaceSelection(path, "open", "open_recent"),
		[applySpaceSelection],
	);

	const onContinueLastSpace = useCallback(async () => {
		if (lastSpacePath)
			await applySpaceSelection(lastSpacePath, "open", "continue_last");
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
		if (path) await applySpaceSelection(path, "create", "create_dialog");
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
