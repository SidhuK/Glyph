import { getCurrentWindow } from "@tauri-apps/api/window";
import {
	type Dispatch,
	type ReactNode,
	type SetStateAction,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { useSearch } from "../hooks/useSearch";
import {
	type AiAssistantMode,
	loadSettings,
	reloadFromDisk,
	setAiAssistantMode as saveAiAssistantMode,
	setAiSidebarWidth as saveAiSidebarWidth,
} from "../lib/settings";
import type { SearchResult } from "../lib/tauri";
import { useTauriEvent } from "../lib/tauriEvents";
import { useVault } from "./VaultContext";

export interface UILayoutContextValue {
	sidebarCollapsed: boolean;
	setSidebarCollapsed: (collapsed: boolean) => void;
	sidebarViewMode: "files" | "tags";
	setSidebarViewMode: (mode: "files" | "tags") => void;
	sidebarWidth: number;
	setSidebarWidth: (width: number) => void;
	paletteOpen: boolean;
	setPaletteOpen: (open: boolean) => void;
	activePreviewPath: string | null;
	setActivePreviewPath: (path: string | null) => void;
	openMarkdownTabs: string[];
	setOpenMarkdownTabs: Dispatch<SetStateAction<string[]>>;
	activeMarkdownTabPath: string | null;
	setActiveMarkdownTabPath: (path: string | null) => void;
	dailyNotesFolder: string | null;
}

export interface AISidebarContextValue {
	aiPanelOpen: boolean;
	setAiPanelOpen: Dispatch<SetStateAction<boolean>>;
	aiPanelWidth: number;
	setAiPanelWidth: (width: number) => void;
	aiAssistantMode: AiAssistantMode;
	setAiAssistantMode: (mode: AiAssistantMode) => void;
}

export interface SearchUIContextValue {
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	searchResults: SearchResult[];
	isSearching: boolean;
	searchError: string;
	showSearch: boolean;
	setShowSearch: (show: boolean) => void;
}

export type UIContextValue = UILayoutContextValue &
	AISidebarContextValue &
	SearchUIContextValue;

const UILayoutContext = createContext<UILayoutContextValue | null>(null);
const AISidebarContext = createContext<AISidebarContextValue | null>(null);
const SearchUIContext = createContext<SearchUIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
	const { vaultPath } = useVault();

	const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
	const [sidebarViewMode, setSidebarViewMode] = useState<"files" | "tags">(
		"files",
	);
	const [sidebarWidth, setSidebarWidth] = useState(260);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [activePreviewPath, setActivePreviewPathState] = useState<
		string | null
	>(null);
	const [openMarkdownTabs, setOpenMarkdownTabs] = useState<string[]>([]);
	const [activeMarkdownTabPath, setActiveMarkdownTabPath] = useState<
		string | null
	>(null);
	const [dailyNotesFolder, setDailyNotesFolderState] = useState<string | null>(
		null,
	);

	const [aiPanelOpen, setAiPanelOpen] = useState(false);
	const [aiPanelWidth, setAiPanelWidthState] = useState(380);
	const [aiAssistantMode, setAiAssistantModeState] =
		useState<AiAssistantMode>("create");

	useEffect(() => {
		if (vaultPath) setSidebarCollapsed(false);
		if (!vaultPath) {
			setOpenMarkdownTabs([]);
			setActiveMarkdownTabPath(null);
		}
	}, [vaultPath]);

	useTauriEvent("settings:updated", (payload) => {
		const nextMode = payload.ui?.aiAssistantMode;
		if (nextMode === "chat" || nextMode === "create") {
			setAiAssistantModeState(nextMode);
		}
		const nextWidth = payload.ui?.aiSidebarWidth;
		if (typeof nextWidth === "number" && Number.isFinite(nextWidth)) {
			setAiPanelWidthState(nextWidth);
		}
		if (payload.dailyNotes && "folder" in payload.dailyNotes) {
			setDailyNotesFolderState(payload.dailyNotes.folder ?? null);
		}
	});

	useEffect(() => {
		let cancelled = false;
		const loadAndApplySettings = async () => {
			try {
				const s = await loadSettings();
				if (cancelled) return;
				if (typeof s.ui.aiSidebarWidth === "number") {
					setAiPanelWidthState(s.ui.aiSidebarWidth);
				}
				setAiAssistantModeState(s.ui.aiAssistantMode);
				setDailyNotesFolderState(s.dailyNotes?.folder ?? null);
			} catch {
				// best-effort settings hydration
			}
		};

		void loadAndApplySettings();
		const win = getCurrentWindow();
		const unlisten = win.onFocusChanged(({ payload: focused }) => {
			if (!focused || cancelled) return;
			void (async () => {
				try {
					await reloadFromDisk();
					if (cancelled) return;
					await loadAndApplySettings();
				} catch {
					// best-effort refresh
				}
			})();
		});

		return () => {
			cancelled = true;
			unlisten.then((fn) => fn()).catch(() => {});
		};
	}, []);

	useEffect(() => {
		if (!vaultPath) return;
		let cancelled = false;
		void (async () => {
			try {
				await reloadFromDisk();
				if (cancelled) return;
				const s = await loadSettings();
				if (cancelled) return;
				setDailyNotesFolderState(s.dailyNotes?.folder ?? null);
			} catch {
				// best-effort settings refresh
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [vaultPath]);

	const setAiPanelWidth = useCallback((width: number) => {
		setAiPanelWidthState(width);
		void saveAiSidebarWidth(width);
	}, []);

	const setAiAssistantMode = useCallback((mode: AiAssistantMode) => {
		setAiAssistantModeState(mode);
		void saveAiAssistantMode(mode);
	}, []);

	const {
		searchQuery,
		setSearchQuery,
		searchResults,
		isSearching,
		searchError,
		showSearch,
		setShowSearch,
	} = useSearch(vaultPath);

	const setActivePreviewPath = useCallback(
		(path: string | null) => {
			if (!vaultPath && path) return;
			setActivePreviewPathState(path);
		},
		[vaultPath],
	);

	const layoutValue = useMemo<UILayoutContextValue>(
		() => ({
			sidebarCollapsed,
			setSidebarCollapsed,
			sidebarViewMode,
			setSidebarViewMode,
			sidebarWidth,
			setSidebarWidth,
			paletteOpen,
			setPaletteOpen,
			activePreviewPath,
			setActivePreviewPath,
			openMarkdownTabs,
			setOpenMarkdownTabs,
			activeMarkdownTabPath,
			setActiveMarkdownTabPath,
			dailyNotesFolder,
		}),
		[
			sidebarCollapsed,
			sidebarViewMode,
			sidebarWidth,
			paletteOpen,
			activePreviewPath,
			setActivePreviewPath,
			openMarkdownTabs,
			activeMarkdownTabPath,
			dailyNotesFolder,
		],
	);

	const aiSidebarValue = useMemo<AISidebarContextValue>(
		() => ({
			aiPanelOpen,
			setAiPanelOpen,
			aiPanelWidth,
			setAiPanelWidth,
			aiAssistantMode,
			setAiAssistantMode,
		}),
		[
			aiPanelOpen,
			aiPanelWidth,
			setAiPanelWidth,
			aiAssistantMode,
			setAiAssistantMode,
		],
	);

	const searchValue = useMemo<SearchUIContextValue>(
		() => ({
			searchQuery,
			setSearchQuery,
			searchResults,
			isSearching,
			searchError,
			showSearch,
			setShowSearch,
		}),
		[
			searchQuery,
			setSearchQuery,
			searchResults,
			isSearching,
			searchError,
			showSearch,
			setShowSearch,
		],
	);

	return (
		<UILayoutContext.Provider value={layoutValue}>
			<AISidebarContext.Provider value={aiSidebarValue}>
				<SearchUIContext.Provider value={searchValue}>
					{children}
				</SearchUIContext.Provider>
			</AISidebarContext.Provider>
		</UILayoutContext.Provider>
	);
}

export function useUILayoutContext(): UILayoutContextValue {
	const ctx = useContext(UILayoutContext);
	if (!ctx)
		throw new Error("useUILayoutContext must be used within UIProvider");
	return ctx;
}

export function useAISidebarContext(): AISidebarContextValue {
	const ctx = useContext(AISidebarContext);
	if (!ctx)
		throw new Error("useAISidebarContext must be used within UIProvider");
	return ctx;
}

export function useSearchUIContext(): SearchUIContextValue {
	const ctx = useContext(SearchUIContext);
	if (!ctx)
		throw new Error("useSearchUIContext must be used within UIProvider");
	return ctx;
}

export function useUIContext(): UIContextValue {
	return {
		...useUILayoutContext(),
		...useAISidebarContext(),
		...useSearchUIContext(),
	};
}
