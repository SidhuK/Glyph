import {
	type ReactNode,
	createContext,
	useContext,
	useEffect,
	useMemo,
	useRef,
} from "react";
import { useViewLoader } from "../hooks/useViewLoader";
import type { ViewDoc } from "../lib/views";
import { useVault } from "./VaultContext";

export interface ViewContextValue {
	activeViewDoc: ViewDoc | null;
	canvasLoadingMessage: string;
	activeViewDocRef: React.RefObject<ViewDoc | null>;
	activeViewPathRef: React.RefObject<string | null>;
	setActiveViewDoc: (doc: ViewDoc | null) => void;
	loadAndBuildFolderView: (dir: string) => Promise<void>;
	loadAndBuildSearchView: (query: string) => Promise<void>;
	loadAndBuildTagView: (tag: string) => Promise<void>;
}

const ViewContext = createContext<ViewContextValue | null>(null);

export function ViewProvider({ children }: { children: ReactNode }) {
	const { vaultPath, setError, startIndexRebuild } = useVault();
	const initialViewLoadVaultRef = useRef<string | null>(null);
	const activeViewDocSnapshotRef = useRef<ViewDoc | null>(null);

	const {
		activeViewDoc,
		canvasLoadingMessage,
		activeViewDocRef,
		activeViewPathRef,
		setActiveViewDoc,
		loadAndBuildFolderView,
		loadAndBuildSearchView,
		loadAndBuildTagView,
	} = useViewLoader({ setError, startIndexRebuild });

	useEffect(() => {
		activeViewDocSnapshotRef.current = activeViewDoc;
	}, [activeViewDoc]);

	useEffect(() => {
		if (!vaultPath) {
			initialViewLoadVaultRef.current = null;
			return;
		}
		if (
			activeViewDocSnapshotRef.current ||
			initialViewLoadVaultRef.current === vaultPath
		)
			return;
		initialViewLoadVaultRef.current = vaultPath;
		void loadAndBuildFolderView("").finally(() => {
			if (initialViewLoadVaultRef.current === vaultPath)
				initialViewLoadVaultRef.current = null;
		});
	}, [vaultPath, loadAndBuildFolderView]);

	const value = useMemo<ViewContextValue>(
		() => ({
			activeViewDoc,
			canvasLoadingMessage,
			activeViewDocRef,
			activeViewPathRef,
			setActiveViewDoc,
			loadAndBuildFolderView,
			loadAndBuildSearchView,
			loadAndBuildTagView,
		}),
		[
			activeViewDoc,
			canvasLoadingMessage,
			activeViewDocRef,
			activeViewPathRef,
			setActiveViewDoc,
			loadAndBuildFolderView,
			loadAndBuildSearchView,
			loadAndBuildTagView,
		],
	);

	return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}

export function useViewContext(): ViewContextValue {
	const ctx = useContext(ViewContext);
	if (!ctx) throw new Error("useViewContext must be used within ViewProvider");
	return ctx;
}
