import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	clearCurrentVaultPath,
	loadSettings,
	setCurrentVaultPath,
} from "../lib/settings";
import { type AppInfo, TauriInvokeError, invoke } from "../lib/tauri";

export interface VaultContextValue {
	info: AppInfo | null;
	error: string;
	setError: (error: string) => void;
	vaultPath: string | null;
	lastVaultPath: string | null;
	vaultSchemaVersion: number | null;
	recentVaults: string[];
	isIndexing: boolean;
	settingsLoaded: boolean;
	startIndexRebuild: () => Promise<void>;
	onOpenVault: () => Promise<void>;
	onOpenVaultAtPath: (path: string) => Promise<void>;
	onContinueLastVault: () => Promise<void>;
	onCreateVault: () => Promise<void>;
	closeVault: () => Promise<void>;
}

const VaultContext = createContext<VaultContextValue | null>(null);

const extractError = (err: unknown): string =>
	err instanceof TauriInvokeError
		? err.message
		: err instanceof Error
			? err.message
			: String(err);

export function VaultProvider({ children }: { children: ReactNode }) {
	const [info, setInfo] = useState<AppInfo | null>(null);
	const [error, setError] = useState("");
	const [vaultPath, setVaultPath] = useState<string | null>(null);
	const [lastVaultPath, setLastVaultPath] = useState<string | null>(null);
	const [vaultSchemaVersion, setVaultSchemaVersion] = useState<number | null>(
		null,
	);
	const [recentVaults, setRecentVaults] = useState<string[]>([]);
	const [isIndexing, setIsIndexing] = useState(false);
	const [settingsLoaded, setSettingsLoaded] = useState(false);

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
				setRecentVaults(settings.recentVaults);
				setLastVaultPath(settings.currentVaultPath);
				setSettingsLoaded(true);

				if (settings.currentVaultPath) {
					try {
						const vaultInfo = await invoke("vault_open", {
							path: settings.currentVaultPath,
						});
						if (!cancelled) {
							setVaultPath(vaultInfo.root);
							setVaultSchemaVersion(vaultInfo.schema_version);
						}
					} catch {
						if (!cancelled) setSettingsLoaded(true);
					}
				}
			} catch (err) {
				if (!cancelled) {
					setError(extractError(err));
					setSettingsLoaded(true);
				}
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

	const applyVaultSelection = useCallback(
		async (path: string, mode: "open" | "create") => {
			setError("");
			try {
				const vaultInfo =
					mode === "create"
						? await invoke("vault_create", { path })
						: await invoke("vault_open", { path });
				await setCurrentVaultPath(vaultInfo.root);
				setRecentVaults((prev) =>
					[vaultInfo.root, ...prev.filter((p) => p !== vaultInfo.root)].slice(
						0,
						20,
					),
				);
				setLastVaultPath(vaultInfo.root);
				setVaultPath(vaultInfo.root);
				setVaultSchemaVersion(vaultInfo.schema_version);
			} catch (err) {
				setError(extractError(err));
			}
		},
		[],
	);

	const closeVault = useCallback(async () => {
		setError("");
		try {
			await invoke("vault_close");
			await clearCurrentVaultPath();
			setVaultPath(null);
			setVaultSchemaVersion(null);
		} catch (err) {
			setError(extractError(err));
		}
	}, []);

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

	const onOpenVaultAtPath = useCallback(
		async (path: string) => applyVaultSelection(path, "open"),
		[applyVaultSelection],
	);

	const onContinueLastVault = useCallback(async () => {
		if (lastVaultPath) await onOpenVaultAtPath(lastVaultPath);
	}, [lastVaultPath, onOpenVaultAtPath]);

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

	const value = useMemo<VaultContextValue>(
		() => ({
			info,
			error,
			setError,
			vaultPath,
			lastVaultPath,
			vaultSchemaVersion,
			recentVaults,
			isIndexing,
			settingsLoaded,
			startIndexRebuild,
			onOpenVault,
			onOpenVaultAtPath,
			onContinueLastVault,
			onCreateVault,
			closeVault,
		}),
		[
			info,
			error,
			vaultPath,
			lastVaultPath,
			vaultSchemaVersion,
			recentVaults,
			isIndexing,
			settingsLoaded,
			startIndexRebuild,
			onOpenVault,
			onOpenVaultAtPath,
			onContinueLastVault,
			onCreateVault,
			closeVault,
		],
	);

	return (
		<VaultContext.Provider value={value}>{children}</VaultContext.Provider>
	);
}

export function useVault(): VaultContextValue {
	const ctx = useContext(VaultContext);
	if (!ctx) throw new Error("useVault must be used within VaultProvider");
	return ctx;
}
