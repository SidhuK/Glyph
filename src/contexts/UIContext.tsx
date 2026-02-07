import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useMemo,
	useState,
} from "react";
import { useAISidebar } from "../hooks/useAISidebar";
import { useSearch } from "../hooks/useSearch";
import type { SearchResult } from "../lib/tauri";
import { useVault } from "./VaultContext";

export interface UIContextValue {
	sidebarCollapsed: boolean;
	setSidebarCollapsed: (collapsed: boolean) => void;
	sidebarViewMode: "files" | "tags";
	setSidebarViewMode: (mode: "files" | "tags") => void;
	paletteOpen: boolean;
	setPaletteOpen: (open: boolean) => void;
	aiSidebarOpen: boolean;
	setAiSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
	aiSidebarWidth: number;
	aiSidebarResizing: boolean;
	handleAiResizeMouseDown: (e: React.MouseEvent) => void;
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	searchResults: SearchResult[];
	isSearching: boolean;
	searchError: string;
	showSearch: boolean;
	setShowSearch: (show: boolean) => void;
	activePreviewPath: string | null;
	setActivePreviewPath: (path: string | null) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
	const { vaultPath } = useVault();

	const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
	const [sidebarViewMode, setSidebarViewMode] = useState<"files" | "tags">(
		"files",
	);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [activePreviewPath, setActivePreviewPath] = useState<string | null>(
		null,
	);

	const {
		aiSidebarOpen,
		setAiSidebarOpen,
		aiSidebarWidth,
		isResizing: aiSidebarResizing,
		handleResizeMouseDown: handleAiResizeMouseDown,
	} = useAISidebar();

	const {
		searchQuery,
		setSearchQuery,
		searchResults,
		isSearching,
		searchError,
		showSearch,
		setShowSearch,
	} = useSearch(vaultPath);

	const handleSetActivePreviewPath = useCallback(
		(path: string | null) => {
			if (!vaultPath && path) return;
			setActivePreviewPath(path);
		},
		[vaultPath],
	);

	const value: UIContextValue = useMemo(
		() => ({
			sidebarCollapsed,
			setSidebarCollapsed,
			sidebarViewMode,
			setSidebarViewMode,
			paletteOpen,
			setPaletteOpen,
			aiSidebarOpen,
			setAiSidebarOpen,
			aiSidebarWidth,
			aiSidebarResizing,
			handleAiResizeMouseDown,
			searchQuery,
			setSearchQuery,
			searchResults,
			isSearching,
			searchError,
			showSearch,
			setShowSearch,
			activePreviewPath,
			setActivePreviewPath: handleSetActivePreviewPath,
		}),
		[
			sidebarCollapsed,
			sidebarViewMode,
			paletteOpen,
			aiSidebarOpen,
			setAiSidebarOpen,
			aiSidebarWidth,
			aiSidebarResizing,
			handleAiResizeMouseDown,
			searchQuery,
			setSearchQuery,
			searchResults,
			isSearching,
			searchError,
			showSearch,
			setShowSearch,
			activePreviewPath,
			handleSetActivePreviewPath,
		],
	);

	return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUIContext(): UIContextValue {
	const ctx = useContext(UIContext);
	if (!ctx) throw new Error("useUIContext must be used within UIProvider");
	return ctx;
}
