import { getCurrentWindow } from "@tauri-apps/api/window";
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
import { useSearch } from "../hooks/useSearch";
import {
	loadSettings,
	reloadFromDisk,
	setAiSidebarWidth as saveAiSidebarWidth,
} from "../lib/settings";
import type { SearchResult } from "../lib/tauri";
import { useVault } from "./VaultContext";

export interface UIContextValue {
	sidebarCollapsed: boolean;
	setSidebarCollapsed: (collapsed: boolean) => void;
	sidebarViewMode: "files" | "tags";
	setSidebarViewMode: (mode: "files" | "tags") => void;
	sidebarWidth: number;
	setSidebarWidth: (width: number) => void;
	paletteOpen: boolean;
	setPaletteOpen: (open: boolean) => void;
	aiPanelOpen: boolean;
	setAiPanelOpen: React.Dispatch<React.SetStateAction<boolean>>;
	aiPanelWidth: number;
	setAiPanelWidth: (width: number) => void;
	searchQuery: string;
	setSearchQuery: (query: string) => void;
	searchResults: SearchResult[];
	isSearching: boolean;
	searchError: string;
	showSearch: boolean;
	setShowSearch: (show: boolean) => void;
	focusSearchInput: () => void;
	setSearchInputElement: (el: HTMLInputElement | null) => void;
	activePreviewPath: string | null;
	setActivePreviewPath: (path: string | null) => void;
	openMarkdownTabs: string[];
	setOpenMarkdownTabs: React.Dispatch<React.SetStateAction<string[]>>;
	activeMarkdownTabPath: string | null;
	setActiveMarkdownTabPath: (path: string | null) => void;
	dailyNotesFolder: string | null;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
	const { vaultPath } = useVault();

	const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
	const [sidebarViewMode, setSidebarViewMode] = useState<"files" | "tags">(
		"files",
	);
	const [sidebarWidth, setSidebarWidth] = useState(260);
	const [paletteOpen, setPaletteOpen] = useState(false);
	const [activePreviewPath, setActivePreviewPath] = useState<string | null>(
		null,
	);
	const [openMarkdownTabs, setOpenMarkdownTabs] = useState<string[]>([]);
	const [activeMarkdownTabPath, setActiveMarkdownTabPath] = useState<
		string | null
	>(null);
	const searchInputElRef = useRef<HTMLInputElement | null>(null);

	const [aiPanelOpen, setAiPanelOpen] = useState(false);
	const [aiPanelWidth, setAiPanelWidthState] = useState(380);
	const [dailyNotesFolder, setDailyNotesFolderState] = useState<string | null>(
		null,
	);

	useEffect(() => {
		if (vaultPath) setSidebarCollapsed(false);
		if (!vaultPath) {
			setOpenMarkdownTabs([]);
			setActiveMarkdownTabPath(null);
		}
	}, [vaultPath]);

	useEffect(() => {
		let cancelled = false;
		const loadAndApplySettings = async () => {
			const s = await loadSettings();
			if (cancelled) return;
			if (typeof s.ui.aiSidebarWidth === "number") {
				setAiPanelWidthState(s.ui.aiSidebarWidth);
			}
			if (s.dailyNotes?.folder !== undefined) {
				setDailyNotesFolderState(s.dailyNotes.folder);
			}
		};
		void loadAndApplySettings();

		const win = getCurrentWindow();
		const unlisten = win.onFocusChanged(({ payload: focused }) => {
			if (focused && !cancelled) {
				void reloadFromDisk().then(() => loadAndApplySettings());
			}
		});

		return () => {
			cancelled = true;
			unlisten.then((fn) => fn()).catch(() => {});
		};
	}, []);

	useEffect(() => {
		if (!vaultPath) return;
		void reloadFromDisk().then(() =>
			loadSettings().then((s) => {
				if (s.dailyNotes?.folder !== undefined) {
					setDailyNotesFolderState(s.dailyNotes.folder);
				}
			}),
		);
	}, [vaultPath]);

	const setAiPanelWidth = useCallback((width: number) => {
		setAiPanelWidthState(width);
		void saveAiSidebarWidth(width);
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

	const handleSetActivePreviewPath = useCallback(
		(path: string | null) => {
			if (!vaultPath && path) return;
			setActivePreviewPath(path);
		},
		[vaultPath],
	);

	const setSearchInputElement = useCallback((el: HTMLInputElement | null) => {
		searchInputElRef.current = el;
	}, []);

	const focusSearchInput = useCallback(() => {
		const el = searchInputElRef.current;
		if (!el) return;
		el.focus();
		el.select();
	}, []);

	const value: UIContextValue = useMemo(
		() => ({
			sidebarCollapsed,
			setSidebarCollapsed,
			sidebarViewMode,
			setSidebarViewMode,
			sidebarWidth,
			setSidebarWidth,
			paletteOpen,
			setPaletteOpen,
			aiPanelOpen,
			setAiPanelOpen,
			aiPanelWidth,
			setAiPanelWidth,
			searchQuery,
			setSearchQuery,
			searchResults,
			isSearching,
			searchError,
			showSearch,
			setShowSearch,
			focusSearchInput,
			setSearchInputElement,
			activePreviewPath,
			setActivePreviewPath: handleSetActivePreviewPath,
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
			aiPanelOpen,
			aiPanelWidth,
			setAiPanelWidth,
			searchQuery,
			setSearchQuery,
			searchResults,
			isSearching,
			searchError,
			showSearch,
			setShowSearch,
			focusSearchInput,
			setSearchInputElement,
			activePreviewPath,
			handleSetActivePreviewPath,
			openMarkdownTabs,
			activeMarkdownTabPath,
			dailyNotesFolder,
		],
	);

	return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUIContext(): UIContextValue {
	const ctx = useContext(UIContext);
	if (!ctx) throw new Error("useUIContext must be used within UIProvider");
	return ctx;
}
