import { ArchiveArrowDownIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getShortcutTooltip } from "../../lib/shortcuts";
import { onWindowDragMouseDown } from "../../utils/window";
import { LayoutAlignLeft } from "../Icons";
import { WindowChromeIconButton } from "./WindowChromeIconButton";
import { WindowChromeUpdateButton } from "./WindowChromeUpdateButton";

interface SidebarHeaderProps {
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
	spacePath: string | null;
	recentSpaces: string[];
	onOpenSpace: () => Promise<void>;
	onOpenRecentSpaceAtPath: (path: string) => Promise<void>;
	updateReady: boolean;
	updateVersion: string | null;
	onInstallUpdate: () => void;
}

function formatSpaceLabel(path: string): string {
	const normalized = path.replace(/\\/g, "/").replace(/\/+$/, "");
	const parts = normalized.split("/").filter(Boolean);
	if (parts.length === 0) return path;
	return parts[parts.length - 1] ?? path;
}

export function SidebarHeader({
	sidebarCollapsed,
	onToggleSidebar,
	spacePath,
	recentSpaces,
	onOpenSpace,
	onOpenRecentSpaceAtPath,
	updateReady,
	updateVersion,
	onInstallUpdate,
}: SidebarHeaderProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement | null>(null);

	const displayRecentSpaces = useMemo(
		() =>
			recentSpaces.filter((path) => path && path !== spacePath).slice(0, 10),
		[recentSpaces, spacePath],
	);
	const menuWidth = 300;

	useEffect(() => {
		if (!menuOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (!(event.target instanceof Node)) return;
			if (menuRef.current?.contains(event.target)) return;
			setMenuOpen(false);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMenuOpen(false);
		};
		window.addEventListener("pointerdown", handlePointerDown);
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("pointerdown", handlePointerDown);
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [menuOpen]);

	const handleOpenPicker = useCallback(() => {
		setMenuOpen(false);
		void onOpenSpace();
	}, [onOpenSpace]);

	const handleSwitchToRecent = useCallback(
		(path: string) => {
			setMenuOpen(false);
			void onOpenRecentSpaceAtPath(path);
		},
		[onOpenRecentSpaceAtPath],
	);

	return (
		<>
			<div
				aria-hidden="true"
				className="sidebarDragLayer"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			/>
			<div className="sidebarHeader" data-tauri-drag-region>
				<div className="sidebarActions">
					<WindowChromeIconButton
						ariaLabel={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
						ariaPressed={!sidebarCollapsed}
						onClick={onToggleSidebar}
						title={`${sidebarCollapsed ? "Expand" : "Collapse"} sidebar (${getShortcutTooltip({ meta: true, shift: true, key: "b" })})`}
					>
						<LayoutAlignLeft size={14} />
					</WindowChromeIconButton>
					<div ref={menuRef} className="sidebarHeaderSpaceMenu">
						<WindowChromeIconButton
							ariaLabel="Open recent spaces"
							ariaPressed={menuOpen}
							onClick={() => setMenuOpen((value) => !value)}
							title="Recent spaces"
						>
							<HugeiconsIcon
								icon={ArchiveArrowDownIcon}
								size={14}
								strokeWidth={0.9}
							/>
						</WindowChromeIconButton>
						<AnimatePresence>
							{menuOpen ? (
								<m.div
									className="sidebarHeaderSpaceMenuPanel"
									style={{ width: `${menuWidth}px` }}
									initial={{ opacity: 0, y: -6, scale: 0.98 }}
									animate={{ opacity: 1, y: 0, scale: 1 }}
									exit={{ opacity: 0, y: -4, scale: 0.985 }}
									transition={{ duration: 0.14, ease: "easeOut" }}
								>
									<div className="sidebarHeaderSpaceMenuTitle">
										Recent Spaces
									</div>
									{displayRecentSpaces.length > 0 ? (
										displayRecentSpaces.map((path) => (
											<button
												key={path}
												type="button"
												className="sidebarHeaderSpaceMenuItem"
												onClick={() => handleSwitchToRecent(path)}
												title={path}
											>
												<span className="sidebarHeaderSpaceMenuItemName">
													{formatSpaceLabel(path)}
												</span>
												<span className="sidebarHeaderSpaceMenuItemPath">
													{path}
												</span>
											</button>
										))
									) : (
										<div className="sidebarHeaderSpaceMenuEmpty">
											No recent spaces yet.
										</div>
									)}
									<button
										type="button"
										className="sidebarHeaderSpaceMenuAction"
										onClick={handleOpenPicker}
									>
										Open Space...
									</button>
								</m.div>
							) : null}
						</AnimatePresence>
					</div>
					<WindowChromeUpdateButton
						updateReady={updateReady}
						updateVersion={updateVersion}
						onInstallUpdate={onInstallUpdate}
					/>
				</div>
			</div>
		</>
	);
}
