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
import {
	DEFAULT_FOLIO_SCOPE,
	type FolioScope,
} from "../components/folio/folioScopes";
import type { SettingsTab } from "../components/settings/settingsConfig";
import {
	type AiAssistantMode,
	loadSettings,
	reloadFromDisk,
	setAiAssistantMode as saveAiAssistantMode,
	setFolioMode as saveFolioMode,
	setShowToc as saveShowToc,
} from "../lib/settings";
import { useTauriEvent } from "../lib/tauriEvents";
import { useSpace } from "./SpaceContext";

export interface UILayoutContextValue {
	sidebarCollapsed: boolean;
	setSidebarCollapsed: (collapsed: boolean) => void;
	zenModeActive: boolean;
	setZenModeActive: (active: boolean) => void;
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
	templateFolder: string | null;
	dailyNoteTemplatePath: string | null;
	showToc: boolean;
	setShowToc: (show: boolean) => void;
	folioMode: boolean;
	setFolioMode: (enabled: boolean) => void;
	folioScope: FolioScope;
	setFolioScope: (scope: FolioScope) => void;
	settingsMode: boolean;
	settingsTab: SettingsTab;
	openSettings: (tab?: SettingsTab) => void;
	closeSettings: () => void;
	setSettingsTab: (tab: SettingsTab) => void;
}

export interface AISidebarContextValue {
	aiEnabled: boolean;
	aiPanelOpen: boolean;
	setAiPanelOpen: Dispatch<SetStateAction<boolean>>;
	aiAssistantMode: AiAssistantMode;
	setAiAssistantMode: (mode: AiAssistantMode) => void;
}

const UILayoutContext = createContext<UILayoutContextValue | null>(null);
const AISidebarContext = createContext<AISidebarContextValue | null>(null);

type UIState = {
	sidebarCollapsed: boolean;
	zenModeActive: boolean;
	sidebarWidth: number;
	paletteOpen: boolean;
	activePreviewPath: string | null;
	openMarkdownTabs: string[];
	activeMarkdownTabPath: string | null;
	dailyNotesFolder: string | null;
	templateFolder: string | null;
	dailyNoteTemplatePath: string | null;
	showToc: boolean;
	folioMode: boolean;
	folioScope: FolioScope;
	settingsMode: boolean;
	settingsTab: SettingsTab;
	aiEnabled: boolean;
	aiPanelOpen: boolean;
	aiAssistantMode: AiAssistantMode;
	zenStateSnapshot: {
		sidebarCollapsed: boolean;
		aiPanelOpen: boolean;
	} | null;
};

type UIAction =
	| { type: "setSidebarCollapsed"; value: boolean }
	| { type: "setZenModeActive"; value: boolean }
	| { type: "setSidebarWidth"; value: number }
	| { type: "setPaletteOpen"; value: boolean }
	| { type: "setActivePreviewPath"; value: string | null }
	| { type: "setOpenMarkdownTabs"; value: SetStateAction<string[]> }
	| { type: "setActiveMarkdownTabPath"; value: string | null }
	| { type: "setDailyNotesFolder"; value: string | null }
	| { type: "setTemplateFolder"; value: string | null }
	| { type: "setDailyNoteTemplatePath"; value: string | null }
	| { type: "setShowToc"; value: boolean }
	| { type: "setFolioMode"; value: boolean }
	| { type: "setFolioScope"; value: FolioScope }
	| { type: "setAiEnabled"; value: boolean }
	| { type: "setAiPanelOpen"; value: SetStateAction<boolean> }
	| { type: "setAiAssistantMode"; value: AiAssistantMode }
	| { type: "openSettings"; tab?: SettingsTab }
	| { type: "closeSettings" }
	| { type: "setSettingsTab"; value: SettingsTab }
	| { type: "onSpacePathChanged"; hasSpace: boolean }
	| {
			type: "hydrateSettings";
			aiEnabled: boolean;
			aiAssistantMode: AiAssistantMode;
			dailyNotesFolder: string | null;
			templateFolder: string | null;
			dailyNoteTemplatePath: string | null;
			showToc: boolean;
			folioMode: boolean;
	  };

const initialUIState: UIState = {
	sidebarCollapsed: true,
	zenModeActive: false,
	sidebarWidth: 260,
	paletteOpen: false,
	activePreviewPath: null,
	openMarkdownTabs: [],
	activeMarkdownTabPath: null,
	dailyNotesFolder: null,
	templateFolder: null,
	dailyNoteTemplatePath: null,
	showToc: true,
	folioMode: false,
	folioScope: DEFAULT_FOLIO_SCOPE,
	settingsMode: false,
	settingsTab: "general" as SettingsTab,
	aiEnabled: true,
	aiPanelOpen: false,
	aiAssistantMode: "create",
	zenStateSnapshot: null,
};

function uiReducer(state: UIState, action: UIAction): UIState {
	switch (action.type) {
		case "setSidebarCollapsed":
			return { ...state, sidebarCollapsed: action.value };
		case "setZenModeActive":
			if (action.value) {
				if (state.zenModeActive) return state;
				return {
					...state,
					zenModeActive: true,
					sidebarCollapsed: true,
					aiPanelOpen: false,
					zenStateSnapshot: {
						sidebarCollapsed: state.sidebarCollapsed,
						aiPanelOpen: state.aiPanelOpen,
					},
				};
			}
			return {
				...state,
				zenModeActive: false,
				sidebarCollapsed:
					state.zenStateSnapshot?.sidebarCollapsed ?? state.sidebarCollapsed,
				aiPanelOpen: state.aiEnabled
					? (state.zenStateSnapshot?.aiPanelOpen ?? state.aiPanelOpen)
					: false,
				zenStateSnapshot: null,
			};
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
		case "setTemplateFolder":
			return { ...state, templateFolder: action.value };
		case "setDailyNoteTemplatePath":
			return { ...state, dailyNoteTemplatePath: action.value };
		case "setShowToc":
			return { ...state, showToc: action.value };
		case "setFolioMode":
			return {
				...state,
				folioMode: action.value,
				folioScope: action.value ? DEFAULT_FOLIO_SCOPE : state.folioScope,
			};
		case "setFolioScope":
			return { ...state, folioScope: action.value };
		case "setAiEnabled":
			return {
				...state,
				aiEnabled: action.value,
				aiPanelOpen: action.value ? state.aiPanelOpen : false,
				zenStateSnapshot:
					action.value || !state.zenStateSnapshot
						? state.zenStateSnapshot
						: { ...state.zenStateSnapshot, aiPanelOpen: false },
			};
		case "setAiPanelOpen":
			if (!state.aiEnabled) return { ...state, aiPanelOpen: false };
			if (state.zenModeActive) {
				// During zen mode the AI panel is always suppressed; also clear
				// the snapshot so it won't re-open when zen exits if the caller
				// tried to open it while zen mode was active.
				return {
					...state,
					aiPanelOpen: false,
					zenStateSnapshot: state.zenStateSnapshot
						? { ...state.zenStateSnapshot, aiPanelOpen: false }
						: state.zenStateSnapshot,
				};
			}
			return {
				...state,
				aiPanelOpen:
					typeof action.value === "function"
						? action.value(state.aiPanelOpen)
						: action.value,
			};
		case "setAiAssistantMode":
			return { ...state, aiAssistantMode: action.value };
		case "openSettings":
			return {
				...state,
				settingsMode: true,
				settingsTab: action.tab ?? state.settingsTab,
				sidebarCollapsed: false,
			};
		case "closeSettings":
			return { ...state, settingsMode: false };
		case "setSettingsTab":
			return { ...state, settingsTab: action.value };
		case "onSpacePathChanged":
			return action.hasSpace
				? {
						...state,
						sidebarCollapsed: false,
						zenModeActive: false,
						zenStateSnapshot: null,
					}
				: {
						...state,
						openMarkdownTabs: [],
						activeMarkdownTabPath: null,
						zenModeActive: false,
						zenStateSnapshot: null,
					};
		case "hydrateSettings":
			return {
				...state,
				aiEnabled: action.aiEnabled,
				aiPanelOpen: action.aiEnabled ? state.aiPanelOpen : false,
				aiAssistantMode: action.aiAssistantMode,
				dailyNotesFolder: action.dailyNotesFolder,
				templateFolder: action.templateFolder,
				dailyNoteTemplatePath: action.dailyNoteTemplatePath,
				showToc: action.showToc,
				folioMode: action.folioMode,
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
		zenModeActive,
		sidebarWidth,
		paletteOpen,
		activePreviewPath,
		openMarkdownTabs,
		activeMarkdownTabPath,
		dailyNotesFolder,
		templateFolder,
		dailyNoteTemplatePath,
		showToc,
		folioMode,
		folioScope,
		settingsMode,
		settingsTab,
		aiEnabled,
		aiPanelOpen,
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
		const nextShowToc = payload.ui?.showToc;
		if (typeof nextShowToc === "boolean") {
			dispatch({ type: "setShowToc", value: nextShowToc });
		}
		const nextFolioMode = payload.ui?.folioMode;
		if (typeof nextFolioMode === "boolean") {
			dispatch({ type: "setFolioMode", value: nextFolioMode });
		}
		if (payload.dailyNotes && "folder" in payload.dailyNotes) {
			dispatch({
				type: "setDailyNotesFolder",
				value: payload.dailyNotes.folder ?? null,
			});
		}
		if (payload.templates && "folder" in payload.templates) {
			dispatch({
				type: "setTemplateFolder",
				value: payload.templates.folder ?? null,
			});
		}
		if (payload.templates && "dailyNoteTemplate" in payload.templates) {
			dispatch({
				type: "setDailyNoteTemplatePath",
				value: payload.templates.dailyNoteTemplate ?? null,
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
					aiAssistantMode: s.ui.aiAssistantMode,
					dailyNotesFolder: s.dailyNotes?.folder ?? null,
					templateFolder: s.templates?.folder ?? null,
					dailyNoteTemplatePath: s.templates?.dailyNoteTemplate ?? null,
					showToc: s.ui.showToc,
					folioMode: s.ui.folioMode,
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
				dispatch({
					type: "setTemplateFolder",
					value: s.templates?.folder ?? null,
				});
				dispatch({
					type: "setDailyNoteTemplatePath",
					value: s.templates?.dailyNoteTemplate ?? null,
				});
			} catch {
				// best-effort settings refresh
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [spacePath]);

	const setAiAssistantMode = useCallback((mode: AiAssistantMode) => {
		dispatch({ type: "setAiAssistantMode", value: mode });
		void saveAiAssistantMode(mode);
	}, []);

	const setShowToc = useCallback((show: boolean) => {
		dispatch({ type: "setShowToc", value: show });
		void saveShowToc(show);
	}, []);

	const setFolioMode = useCallback((enabled: boolean) => {
		dispatch({ type: "setFolioMode", value: enabled });
		void saveFolioMode(enabled);
	}, []);

	const setFolioScope = useCallback(
		(scope: FolioScope) => dispatch({ type: "setFolioScope", value: scope }),
		[],
	);

	const setSidebarCollapsed = useCallback(
		(collapsed: boolean) =>
			dispatch({ type: "setSidebarCollapsed", value: collapsed }),
		[],
	);
	const setZenModeActive = useCallback(
		(active: boolean) => dispatch({ type: "setZenModeActive", value: active }),
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

	const openSettings = useCallback(
		(tab?: SettingsTab) => dispatch({ type: "openSettings", tab }),
		[],
	);
	const closeSettings = useCallback(
		() => dispatch({ type: "closeSettings" }),
		[],
	);
	const setSettingsTab = useCallback(
		(tab: SettingsTab) => dispatch({ type: "setSettingsTab", value: tab }),
		[],
	);

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
			zenModeActive,
			setZenModeActive,
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
			templateFolder,
			dailyNoteTemplatePath,
			showToc,
			setShowToc,
			folioMode,
			setFolioMode,
			folioScope,
			setFolioScope,
			settingsMode,
			settingsTab,
			openSettings,
			closeSettings,
			setSettingsTab,
		}),
		[
			sidebarCollapsed,
			setSidebarCollapsed,
			zenModeActive,
			setZenModeActive,
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
			templateFolder,
			dailyNoteTemplatePath,
			showToc,
			setShowToc,
			folioMode,
			setFolioMode,
			folioScope,
			setFolioScope,
			settingsMode,
			settingsTab,
			openSettings,
			closeSettings,
			setSettingsTab,
		],
	);

	const aiSidebarValue = useMemo<AISidebarContextValue>(
		() => ({
			aiEnabled,
			aiPanelOpen,
			setAiPanelOpen,
			aiAssistantMode,
			setAiAssistantMode,
		}),
		[
			aiEnabled,
			aiPanelOpen,
			setAiPanelOpen,
			aiAssistantMode,
			setAiAssistantMode,
		],
	);

	return (
		<UILayoutContext.Provider value={layoutValue}>
			<AISidebarContext.Provider value={aiSidebarValue}>
				{children}
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
