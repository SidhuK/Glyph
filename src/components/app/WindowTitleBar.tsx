import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shortcut } from "../../lib/shortcuts";
import {
    formatShortcutPartsForPlatform,
    isMacOS,
} from "../../lib/shortcuts/platform";
import {
    CircleHelp,
    Command,
    Edit,
    File,
    FolderOpen,
    FolderPlus,
    PanelLeftClose,
    PanelLeftOpen,
    Save,
    Search,
    Settings,
    Sparkles,
    X,
} from "../Icons";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";

interface WindowTitleBarProps {
    sidebarCollapsed: boolean;
    onToggleSidebar: () => void;
    spacePath: string | null;
    onOpenCommandPalette: () => void;
    onNewNote: () => void;
    onOpenDailyNote: () => void;
    onSaveNote: () => void;
    onCloseTab: () => void;
    onOpenSpace: () => void;
    onCreateSpace: () => void;
    onRevealSpace: () => void;
    onOpenSpaceSettings: () => void;
    onOpenSettings: () => void;
    onOpenAbout: () => void;
    onOpenAiSettings: () => void;
    aiEnabled: boolean;
    aiPanelOpen: boolean;
    onToggleAiPanel: () => void;
    showWindowsMenuBar: boolean;
}

interface TitleBarMenuAction {
    label: string;
    shortcut?: Shortcut;
    action: () => void;
    icon: typeof Command;
}

interface TitleBarMenuSection {
    label: string;
    items: Array<TitleBarMenuAction | { separator: true }>;
    hidden?: boolean;
}

const MENU_SEPARATOR = { separator: true } as const;
const MENU_OPEN_DELAY_MS = 65;
const MENU_CLOSE_DELAY_MS = 55;

function getSpaceLabel(spacePath: string | null): string {
    if (!spacePath) return "Offline-first notes";
    const segments = spacePath.split(/[/\\]+/).filter(Boolean);
    return segments[segments.length - 1] ?? spacePath;
}

export function WindowTitleBar({
    sidebarCollapsed,
    onToggleSidebar,
    spacePath,
    onOpenCommandPalette,
    onNewNote,
    onOpenDailyNote,
    onSaveNote,
    onCloseTab,
    onOpenSpace,
    onCreateSpace,
    onRevealSpace,
    onOpenSpaceSettings,
    onOpenSettings,
    onOpenAbout,
    onOpenAiSettings,
    aiEnabled,
    aiPanelOpen,
    onToggleAiPanel,
    showWindowsMenuBar,
}: WindowTitleBarProps) {
    const [isMaximized, setIsMaximized] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [activeMenuLabel, setActiveMenuLabel] = useState<string | null>(null);
    const activeMenuLabelRef = useRef<string | null>(null);
    const openMenuTimeoutRef = useRef<number | null>(null);
    const closeMenuTimeoutRef = useRef<number | null>(null);
    const currentWindow = useMemo<ReturnType<typeof getCurrentWindow> | null>(() => {
        try {
            return getCurrentWindow();
            // used for minimize, maximize, and close to work instead of silently doing nothing.
            // so that titlebar always resolves the current Tauri window directly, while still falling back safely during plain browser rendering.
        } catch {
            // Return null if Tauri is unavailable during browser-only rendering.
            return null;
        }
    }, []);
    const spaceLabel = useMemo(() => getSpaceLabel(spacePath), [spacePath]);
    const revealSpaceLabel = useMemo(
        () => (isMacOS() ? "Reveal in Finder" : "Reveal in Explorer"),
        [],
    );

    const setActiveMenu = useCallback((label: string | null) => {
        if (activeMenuLabelRef.current === label) return;
        activeMenuLabelRef.current = label;
        setActiveMenuLabel(label);
    }, []);

    const clearOpenMenuTimeout = useCallback(() => {
        if (openMenuTimeoutRef.current !== null) {
            window.clearTimeout(openMenuTimeoutRef.current);
            openMenuTimeoutRef.current = null;
        }
    }, []);

    const clearCloseMenuTimeout = useCallback(() => {
        if (closeMenuTimeoutRef.current !== null) {
            window.clearTimeout(closeMenuTimeoutRef.current);
            closeMenuTimeoutRef.current = null;
        }
    }, []);

    const clearMenuTimeouts = useCallback(() => {
        clearOpenMenuTimeout();
        clearCloseMenuTimeout();
    }, [clearCloseMenuTimeout, clearOpenMenuTimeout]);

    const scheduleMenuOpen = useCallback((label: string) => {
        clearOpenMenuTimeout();
        if (activeMenuLabelRef.current === label) return;
        openMenuTimeoutRef.current = window.setTimeout(() => {
            setActiveMenu(label);
            openMenuTimeoutRef.current = null;
        }, MENU_OPEN_DELAY_MS);
    }, [clearOpenMenuTimeout, setActiveMenu]);

    const scheduleMenuClose = useCallback(() => {
        clearMenuTimeouts();
        closeMenuTimeoutRef.current = window.setTimeout(() => {
            setActiveMenu(null);
            closeMenuTimeoutRef.current = null;
        }, MENU_CLOSE_DELAY_MS);
    }, [clearMenuTimeouts, setActiveMenu]);

    useEffect(() => {
        if (!currentWindow) return; // Skip if Tauri not available

        const syncMaximized = () => {
            void currentWindow.isMaximized().then(setIsMaximized).catch(() => { });
        };

        syncMaximized();

        let isMounted = true;
        let unlisten: (() => void) | undefined;
        void currentWindow
            .onResized(syncMaximized)
            .then((dispose: () => void) => {
                if (isMounted) {
                    unlisten = dispose;
                    return;
                }
                dispose();
            })
            .catch(() => { });

        window.addEventListener("resize", syncMaximized);

        return () => {
            isMounted = false;
            window.removeEventListener("resize", syncMaximized);
            unlisten?.();
            clearMenuTimeouts();
        };
    }, [clearMenuTimeouts, currentWindow]);

    const handleMinimize = useCallback(() => {
        if (!currentWindow) return;
        void currentWindow.minimize().catch((error: Error) => {
            console.error("Failed to minimize window", error);
        });
    }, [currentWindow]);

    const handleToggleMaximize = useCallback(() => {
        if (!currentWindow) return;
        void currentWindow
            .isMaximized()
            .then((maximized: boolean) =>
                maximized ? currentWindow.unmaximize() : currentWindow.maximize(),
            )
            .catch((error: Error) => {
                console.error("Failed to toggle maximize state", error);
            });
    }, [currentWindow]);

    const handleClose = useCallback(() => {
        if (!currentWindow) return;
        void currentWindow.close().catch((error: Error) => {
            console.error("Failed to close window", error);
        });
    }, [currentWindow]);

    const runMenuAction = useCallback((action: () => void) => {
        clearMenuTimeouts();
        setMenuOpen(false);
        setActiveMenu(null);
        action();
    }, [clearMenuTimeouts, setActiveMenu]);

    const setMenuOpenState = useCallback((label: string, open: boolean) => {
        clearMenuTimeouts();
        if (open) {
            setActiveMenu(label);
            return;
        }
        if (activeMenuLabelRef.current !== label) return;
        scheduleMenuClose();
    }, [clearMenuTimeouts, scheduleMenuClose, setActiveMenu]);

    const handleMenuTriggerPointerEnter = useCallback((label: string) => {
        clearCloseMenuTimeout();
        if (!activeMenuLabelRef.current) return;
        scheduleMenuOpen(label);
    }, [clearCloseMenuTimeout, scheduleMenuOpen]);

    const topMenus = useMemo<TitleBarMenuSection[]>(
        () => [
            {
                label: "Glyph",
                items: [
                    { label: "Settings", action: onOpenSettings, icon: Settings },
                    { label: "About Glyph", action: onOpenAbout, icon: CircleHelp },
                ],
            },
            {
                label: "File",
                items: [
                    {
                        label: "New note",
                        shortcut: { key: "n", meta: true },
                        action: onNewNote,
                        icon: Edit,
                    },
                    {
                        label: "Open daily note",
                        shortcut: { key: "d", meta: true, shift: true },
                        action: onOpenDailyNote,
                        icon: File,
                    },
                    MENU_SEPARATOR,
                    {
                        label: "Save",
                        shortcut: { key: "s", meta: true },
                        action: onSaveNote,
                        icon: Save,
                    },
                    {
                        label: "Close tab",
                        shortcut: { key: "w", meta: true },
                        action: onCloseTab,
                        icon: X,
                    },
                ],
            },
            {
                label: "Space",
                items: [
                    {
                        label: "Open space",
                        shortcut: { key: "o", meta: true },
                        action: onOpenSpace,
                        icon: FolderOpen,
                    },
                    {
                        label: "Create space",
                        shortcut: { key: "n", meta: true, shift: true },
                        action: onCreateSpace,
                        icon: FolderPlus,
                    },
                    MENU_SEPARATOR,
                    {
                        label: revealSpaceLabel,
                        action: onRevealSpace,
                        icon: FolderOpen,
                    },
                    {
                        label: "Space settings",
                        action: onOpenSpaceSettings,
                        icon: Settings,
                    },
                ],
            },
            {
                label: "AI",
                hidden: !aiEnabled,
                items: [
                    {
                        label: aiPanelOpen ? "Hide AI panel" : "Show AI panel",
                        shortcut: { key: "a", meta: true, shift: true },
                        action: onToggleAiPanel,
                        icon: Sparkles,
                    },
                    {
                        label: "AI settings",
                        action: onOpenAiSettings,
                        icon: Sparkles,
                    },
                ],
            },
            {
                label: "View",
                items: [
                    {
                        label: sidebarCollapsed ? "Show sidebar" : "Hide sidebar",
                        action: onToggleSidebar,
                        icon: sidebarCollapsed ? PanelLeftOpen : PanelLeftClose,
                    },
                    {
                        label: "Command palette",
                        shortcut: { key: "k", meta: true },
                        action: onOpenCommandPalette,
                        icon: Search,
                    },
                ],
            },
            {
                label: "Help",
                items: [
                    { label: "Settings", action: onOpenSettings, icon: Settings },
                    { label: "About Glyph", action: onOpenAbout, icon: CircleHelp },
                ],
            },
        ].filter((section) => !section.hidden),
        [
            aiEnabled,
            aiPanelOpen,
            onCloseTab,
            onCreateSpace,
            onNewNote,
            onOpenAbout,
            onOpenAiSettings,
            onOpenCommandPalette,
            onOpenDailyNote,
            onOpenSettings,
            onOpenSpace,
            onOpenSpaceSettings,
            onRevealSpace,
            revealSpaceLabel,
            onSaveNote,
            onToggleAiPanel,
            onToggleSidebar,
            sidebarCollapsed,
        ],
    );

    return (
        <header className={`windowTitleBar${showWindowsMenuBar ? " has-menu-bar" : ""}`}>
            <div className="windowTitleBarMainRow">
                <div
                    className="windowTitleBarLeading windowTitleBarDragSurface"
                    data-tauri-drag-region
                    onDoubleClick={handleToggleMaximize}
                >
                    <button
                        type="button"
                        className="windowTitleBarSidebarToggle"
                        onClick={onToggleSidebar}
                        onDoubleClick={(event) => event.stopPropagation()}
                        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                        data-window-drag-ignore
                    >
                        {sidebarCollapsed ? (
                            <PanelLeftOpen size={30} strokeWidth={3} />
                        ) : (
                            <PanelLeftClose size={30} strokeWidth={3} />
                        )}
                    </button>
                    <div className="windowTitleBarBrand">
                        <div className="windowTitleBarLogo" aria-hidden="true">
                            G
                        </div>
                        <div className="windowTitleBarMeta">
                            <span className="windowTitleBarName">Glyph</span>
                            <span className="windowTitleBarSubtitle">{spaceLabel}</span>
                        </div>
                    </div>
                </div>
                <div
                    className="windowTitleBarCenter windowTitleBarDragSurface"
                    data-tauri-drag-region
                    onDoubleClick={handleToggleMaximize}
                >
                    <div className="windowTitleBarChip">{spaceLabel}</div>
                </div>
                <div className="windowTitleBarControls" data-window-drag-ignore>
                    <Popover open={menuOpen} onOpenChange={setMenuOpen}>
                        <PopoverTrigger asChild>
                            <button
                                type="button"
                                className="windowChromeButton windowChromeButtonMenu"
                                aria-label="Open app menu"
                                title="App menu"
                            >
                                <Command size={16} />
                            </button>
                        </PopoverTrigger>
                        <PopoverContent
                            align="end"
                            side="bottom"
                            sideOffset={8}
                            className="windowTitleBarMenu"
                        >
                            <div className="windowTitleBarMenuSection">
                                <button
                                    type="button"
                                    className="windowTitleBarMenuItem"
                                    onClick={() => runMenuAction(onOpenCommandPalette)}
                                >
                                    <Command size={14} />
                                    <span>Command palette</span>
                                </button>
                                <button
                                    type="button"
                                    className="windowTitleBarMenuItem"
                                    onClick={() => runMenuAction(onOpenSpace)}
                                >
                                    <FolderOpen size={14} />
                                    <span>Open space</span>
                                </button>
                                <button
                                    type="button"
                                    className="windowTitleBarMenuItem"
                                    onClick={() => runMenuAction(onCreateSpace)}
                                >
                                    <FolderPlus size={14} />
                                    <span>Create space</span>
                                </button>
                            </div>
                            <div className="windowTitleBarMenuDivider" />
                            <div className="windowTitleBarMenuSection">
                                <button
                                    type="button"
                                    className="windowTitleBarMenuItem"
                                    onClick={() => runMenuAction(onOpenSettings)}
                                >
                                    <Settings size={14} />
                                    <span>Settings</span>
                                </button>
                                {aiEnabled ? (
                                    <>
                                        <button
                                            type="button"
                                            className="windowTitleBarMenuItem"
                                            onClick={() => runMenuAction(onToggleAiPanel)}
                                        >
                                            <Sparkles size={14} />
                                            <span>{aiPanelOpen ? "Hide AI panel" : "Show AI panel"}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="windowTitleBarMenuItem"
                                            onClick={() => runMenuAction(onOpenAiSettings)}
                                        >
                                            <Sparkles size={14} />
                                            <span>AI settings</span>
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </PopoverContent>
                    </Popover>
                    <button
                        type="button"
                        className="windowChromeButton"
                        onClick={handleMinimize}
                        aria-label="Minimize window"
                        title="Minimize"
                    >
                        <span className="windowChromeGlyph windowChromeGlyphMinimize" />
                    </button>
                    <button
                        type="button"
                        className="windowChromeButton"
                        onClick={handleToggleMaximize}
                        aria-label={isMaximized ? "Restore window" : "Maximize window"}
                        title={isMaximized ? "Restore" : "Maximize"}
                    >
                        <span
                            className={`windowChromeGlyph windowChromeGlyphMaximize ${isMaximized ? "is-maximized" : ""}`}
                        />
                    </button>
                    <button
                        type="button"
                        className="windowChromeButton windowChromeButtonClose"
                        onClick={handleClose}
                        aria-label="Close window"
                        title="Close"
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>
            {showWindowsMenuBar ? (
                <div
                    className="windowTitleBarMenuBar"
                    data-window-drag-ignore
                    onPointerEnter={clearCloseMenuTimeout}
                    onPointerLeave={scheduleMenuClose}
                >
                    {topMenus.map((menu) => (
                        <DropdownMenu
                            key={menu.label}
                            modal={false}
                            open={activeMenuLabel === menu.label}
                            onOpenChange={(open) => setMenuOpenState(menu.label, open)}
                        >
                            <DropdownMenuTrigger asChild>
                                <button
                                    type="button"
                                    className="windowTitleBarMenuBarTrigger"
                                    onPointerEnter={() => handleMenuTriggerPointerEnter(menu.label)}
                                >
                                    <span>{menu.label}</span>
                                </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                                align="start"
                                sideOffset={10}
                                className="windowTitleBarDropdown"
                                onPointerEnter={clearMenuTimeouts}
                                onPointerLeave={scheduleMenuClose}
                            >
                                {menu.items.map((item, index) =>
                                    "separator" in item ? (
                                        <DropdownMenuSeparator key={`${menu.label}-sep-${index}`} />
                                    ) : (
                                        <DropdownMenuItem
                                            key={`${menu.label}-${item.label}`}
                                            className="windowTitleBarDropdownItem"
                                            onSelect={() => runMenuAction(item.action)}
                                        >
                                            <item.icon size={14} />
                                            <span>{item.label}</span>
                                            {item.shortcut ? (
                                                <DropdownMenuShortcut className="windowTitleBarDropdownShortcut">
                                                    {formatShortcutPartsForPlatform(item.shortcut).map((part, partIndex) => (
                                                        <span
                                                            key={`${item.label}-${part}-${partIndex}`}
                                                            className="windowTitleBarShortcutKey"
                                                        >
                                                            {part}
                                                        </span>
                                                    ))}
                                                </DropdownMenuShortcut>
                                            ) : null}
                                        </DropdownMenuItem>
                                    ),
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ))}
                </div>
            ) : null}
        </header>
    );
}