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
	useReducer,
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
import { useSpace } from "./SpaceContext";

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
	aiEnabled: boolean;
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

type UIState = {
	sidebarCollapsed: boolean;
	sidebarViewMode: "files" | "tags";
	sidebarWidth: number;
	paletteOpen: boolean;
	activePreviewPath: string | null;
	openMarkdownTabs: string[];
	activeMarkdownTabPath: string | null;
	dailyNotesFolder: string | null;
	aiEnabled: boolean;
	aiPanelOpen: boolean;
	aiPanelWidth: number;
	aiAssistantMode: AiAssistantMode;
};

type UIAction =
	| { type: "setSidebarCollapsed"; value: boolean }
	| { type: "setSidebarViewMode"; value: "files" | "tags" }
	| { type: "setSidebarWidth"; value: number }
	| { type: "setPaletteOpen"; value: boolean }
	| { type: "setActivePreviewPath"; value: string | null }
	| { type: "setOpenMarkdownTabs"; value: SetStateAction<string[]> }
	| { type: "setActiveMarkdownTabPath"; value: string | null }
	| { type: "setDailyNotesFolder"; value: string | null }
	| { type: "setAiEnabled"; value: boolean }
	| { type: "setAiPanelOpen"; value: SetStateAction<boolean> }
	| { type: "setAiPanelWidth"; value: number }
	| { type: "setAiAssistantMode"; value: AiAssistantMode }
	| { type: "onSpacePathChanged"; hasSpace: boolean }
	| {
			type: "hydrateSettings";
			aiEnabled: boolean;
			aiPanelWidth?: number;
			aiAssistantMode: AiAssistantMode;
			dailyNotesFolder: string | null;
	  };

const initialUIState: UIState = {
	sidebarCollapsed: true,
	sidebarViewMode: "files",
	sidebarWidth: 260,
	paletteOpen: false,
	activePreviewPath: null,
	openMarkdownTabs: [],
	activeMarkdownTabPath: null,
	dailyNotesFolder: null,
	aiEnabled: true,
	aiPanelOpen: false,
	aiPanelWidth: 380,
	aiAssistantMode: "create",
};

function uiReducer(state: UIState, action: UIAction): UIState {
	switch (action.type) {
		case "setSidebarCollapsed":
			return { ...state, sidebarCollapsed: action.value };
		case "setSidebarViewMode":
			return { ...state, sidebarViewMode: action.value };
		case "setSidebarWidth":
			return { ...state, sidebarWidth: action.value };
		case "setPaletteOpen":
			return { ...state, paletteOpen: action.value };
		case "setActivePreviewPath":
			return { ...state, activePreviewPath: action.value };
		case "setOpenMarkdownTabs":
			return {
				...state,
				openMarkdownTabs:
					typeof action.value === "function"
						? action.value(state.openMarkdownTabs)
						: action.value,
			};
		case "setActiveMarkdownTabPath":
			return { ...state, activeMarkdownTabPath: action.value };
		case "setDailyNotesFolder":
			return { ...state, dailyNotesFolder: action.value };
		case "setAiEnabled":
			return {
				...state,
				aiEnabled: action.value,
				aiPanelOpen: action.value ? state.aiPanelOpen : false,
			};
		case "setAiPanelOpen":
			if (!state.aiEnabled) return { ...state, aiPanelOpen: false };
			return {
				...state,
				aiPanelOpen:
					typeof action.value === "function"
						? action.value(state.aiPanelOpen)
						: action.value,
			};
		case "setAiPanelWidth":
			return { ...state, aiPanelWidth: action.value };
		case "setAiAssistantMode":
			return { ...state, aiAssistantMode: action.value };
		case "onSpacePathChanged":
			return action.hasSpace
				? { ...state, sidebarCollapsed: false }
				: { ...state, openMarkdownTabs: [], activeMarkdownTabPath: null };
		case "hydrateSettings":
			return {
				...state,
				aiEnabled: action.aiEnabled,
				aiPanelOpen: action.aiEnabled ? state.aiPanelOpen : false,
				aiPanelWidth: action.aiPanelWidth ?? state.aiPanelWidth,
				aiAssistantMode: action.aiAssistantMode,
				dailyNotesFolder: action.dailyNotesFolder,
			};
		default:
			return state;
	}
}

export function UIProvider({ children }: { children: ReactNode }) {
	const { spacePath } = useSpace();
	const [state, dispatch] = useReducer(uiReducer, initialUIState);
	const {
		sidebarCollapsed,
		sidebarViewMode,
		sidebarWidth,
		paletteOpen,
		activePreviewPath,
		openMarkdownTabs,
		activeMarkdownTabPath,
		dailyNotesFolder,
		aiEnabled,
		aiPanelOpen,
		aiPanelWidth,
		aiAssistantMode,
	} = state;

	useEffect(() => {
		dispatch({ type: "onSpacePathChanged", hasSpace: Boolean(spacePath) });
	}, [spacePath]);

	useTauriEvent("settings:updated", (payload) => {
		const nextEnabled = payload.ui?.aiEnabled;
		if (typeof nextEnabled === "boolean") {
			dispatch({ type: "setAiEnabled", value: nextEnabled });
		}
		const nextMode = payload.ui?.aiAssistantMode;
		if (nextMode === "chat" || nextMode === "create") {
			dispatch({ type: "setAiAssistantMode", value: nextMode });
		}
		const nextWidth = payload.ui?.aiSidebarWidth;
		if (typeof nextWidth === "number" && Number.isFinite(nextWidth)) {
			dispatch({ type: "setAiPanelWidth", value: nextWidth });
		}
		if (payload.dailyNotes && "folder" in payload.dailyNotes) {
			dispatch({
				type: "setDailyNotesFolder",
				value: payload.dailyNotes.folder ?? null,
			});
		}
	});

	useEffect(() => {
		let cancelled = false;
		const loadAndApplySettings = async () => {
			try {
				const s = await loadSettings();
				if (cancelled) return;
				dispatch({
					type: "hydrateSettings",
					aiEnabled: s.ui.aiEnabled,
					aiPanelWidth:
						typeof s.ui.aiSidebarWidth === "number"
							? s.ui.aiSidebarWidth
							: undefined,
					aiAssistantMode: s.ui.aiAssistantMode,
					dailyNotesFolder: s.dailyNotes?.folder ?? null,
				});
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
		if (!spacePath) return;
		let cancelled = false;
		void (async () => {
			try {
				await reloadFromDisk();
				if (cancelled) return;
				const s = await loadSettings();
				if (cancelled) return;
				dispatch({
					type: "setDailyNotesFolder",
					value: s.dailyNotes?.folder ?? null,
				});
			} catch {
				// best-effort settings refresh
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [spacePath]);

	const setAiPanelWidth = useCallback((width: number) => {
		dispatch({ type: "setAiPanelWidth", value: width });
		void saveAiSidebarWidth(width);
	}, []);

	const setAiAssistantMode = useCallback((mode: AiAssistantMode) => {
		dispatch({ type: "setAiAssistantMode", value: mode });
		void saveAiAssistantMode(mode);
	}, []);

	const setSidebarCollapsed = useCallback(
		(collapsed: boolean) =>
			dispatch({ type: "setSidebarCollapsed", value: collapsed }),
		[],
	);
	const setSidebarViewMode = useCallback(
		(mode: "files" | "tags") =>
			dispatch({ type: "setSidebarViewMode", value: mode }),
		[],
	);
	const setSidebarWidth = useCallback(
		(width: number) => dispatch({ type: "setSidebarWidth", value: width }),
		[],
	);
	const setPaletteOpen = useCallback(
		(open: boolean) => dispatch({ type: "setPaletteOpen", value: open }),
		[],
	);
	const setOpenMarkdownTabs = useCallback(
		(next: SetStateAction<string[]>) =>
			dispatch({
				type: "setOpenMarkdownTabs",
				value: next,
			}),
		[],
	);
	const setActiveMarkdownTabPath = useCallback(
		(path: string | null) =>
			dispatch({ type: "setActiveMarkdownTabPath", value: path }),
		[],
	);
	const setAiPanelOpen = useCallback(
		(next: SetStateAction<boolean>) =>
			dispatch({
				type: "setAiPanelOpen",
				value: next,
			}),
		[],
	);

	const {
		searchQuery,
		setSearchQuery,
		searchResults,
		isSearching,
		searchError,
		showSearch,
		setShowSearch,
	} = useSearch(spacePath);

	const setActivePreviewPath = useCallback(
		(path: string | null) => {
			if (!spacePath && path) return;
			dispatch({ type: "setActivePreviewPath", value: path });
		},
		[spacePath],
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
		],
	);

	const aiSidebarValue = useMemo<AISidebarContextValue>(
		() => ({
			aiEnabled,
			aiPanelOpen,
			setAiPanelOpen,
			aiPanelWidth,
			setAiPanelWidth,
			aiAssistantMode,
			setAiAssistantMode,
		}),
		[
			aiEnabled,
			aiPanelOpen,
			setAiPanelOpen,
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
