import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Command,
    FolderOpen,
    FolderPlus,
    PanelLeftClose,
    PanelLeftOpen,
    Settings,
    Sparkles,
    X,
} from "../Icons";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";

interface WindowTitleBarProps {
    sidebarCollapsed: boolean;
    onToggleSidebar: () => void;
    spacePath: string | null;
    onOpenCommandPalette: () => void;
    onOpenSpace: () => void;
    onCreateSpace: () => void;
    onOpenSettings: () => void;
    onOpenAiSettings: () => void;
    aiEnabled: boolean;
    aiPanelOpen: boolean;
    onToggleAiPanel: () => void;
}

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
    onOpenSpace,
    onCreateSpace,
    onOpenSettings,
    onOpenAiSettings,
    aiEnabled,
    aiPanelOpen,
    onToggleAiPanel,
}: WindowTitleBarProps) {
    const [isMaximized, setIsMaximized] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const currentWindow = useMemo(() => getCurrentWindow(), []);
    const spaceLabel = useMemo(() => getSpaceLabel(spacePath), [spacePath]);

    useEffect(() => {
        const syncMaximized = () => {
            void currentWindow
                .isMaximized()
                .then(setIsMaximized)
                .catch(() => { });
        };

        syncMaximized();

        let unlisten: (() => void) | undefined;
        void currentWindow
            .onResized(syncMaximized)
            .then((dispose) => {
                unlisten = dispose;
            })
            .catch(() => { });

        window.addEventListener("resize", syncMaximized);

        return () => {
            window.removeEventListener("resize", syncMaximized);
            unlisten?.();
        };
    }, [currentWindow]);

    const handleMinimize = useCallback(() => {
        void currentWindow.minimize().catch((error) => {
            console.error("Failed to minimize window", error);
        });
    }, [currentWindow]);

    const handleToggleMaximize = useCallback(() => {
        void currentWindow
            .isMaximized()
            .then((maximized) =>
                maximized ? currentWindow.unmaximize() : currentWindow.maximize(),
            )
            .catch((error) => {
                console.error("Failed to toggle maximize state", error);
            });
    }, [currentWindow]);

    const handleClose = useCallback(() => {
        void currentWindow.close().catch(() => { });
    }, [currentWindow]);

    const runMenuAction = useCallback((action: () => void) => {
        setMenuOpen(false);
        action();
    }, []);

    return (
        <header className="windowTitleBar">
            <div
                className="windowTitleBarLeading windowTitleBarDragSurface"
                data-tauri-drag-region
                onDoubleClick={handleToggleMaximize}
            >
                <button
                    type="button"
                    className="windowTitleBarSidebarToggle"
                    onClick={onToggleSidebar}
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
                            {/* <ControlKey size={15} /> */}
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
                            {aiEnabled && (
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
                            )}
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
                        className={`windowChromeGlyph windowChromeGlyphMaximize ${isMaximized ? "is-maximized" : ""
                            }`}
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
        </header>
    );
}