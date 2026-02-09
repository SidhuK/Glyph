import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useUIContext, useVault } from "../../contexts";
import type { CanvasLibraryMeta } from "../../lib/canvases";
import { cn } from "../../utils/cn";
import { SidebarContent } from "./SidebarContent";
import { SidebarHeader } from "./SidebarHeader";

interface SidebarProps {
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewFile: () => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
	onOpenSearchAsCanvas: (query: string) => void;
	onSelectSearchNote: (id: string) => void;
	onSelectTag: (tag: string) => void;
	canvases: CanvasLibraryMeta[];
	activeCanvasId: string | null;
	onSelectCanvas: (id: string) => void;
	onCreateCanvas: () => void;
	onAddNotesToCanvas: (paths: string[]) => Promise<void>;
	onCreateNoteInCanvas: () => void;
	onRenameCanvas: (id: string, title: string) => Promise<void>;
	onOpenCommandPalette: () => void;
}

export function Sidebar({
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFile,
	onNewFileInDir,
	onNewFolderInDir,
	onRenameDir,
	onOpenSearchAsCanvas,
	onSelectSearchNote,
	onSelectTag,
	canvases,
	activeCanvasId,
	onSelectCanvas,
	onCreateCanvas,
	onAddNotesToCanvas,
	onCreateNoteInCanvas,
	onRenameCanvas,
	onOpenCommandPalette,
}: SidebarProps) {
	// Contexts
	const { vaultPath, onOpenVault, onCreateVault } = useVault();
	const { sidebarCollapsed, sidebarWidth } = useUIContext();
	const { showSearch, setShowSearch } = useUIContext();
	const shouldReduceMotion = useReducedMotion();
	const sidebarState = sidebarCollapsed ? "collapsed" : "expanded";

	return (
		<motion.aside
			data-slot="sidebar"
			data-sidebar="sidebar"
			data-state={sidebarState}
			data-collapsible={sidebarCollapsed ? "offcanvas" : ""}
			className={cn("sidebar", sidebarCollapsed && "sidebarCollapsed")}
			style={{ width: sidebarCollapsed ? 0 : sidebarWidth }}
			layout
			transition={
				shouldReduceMotion
					? { type: "tween", duration: 0 }
					: { type: "spring", stiffness: 400, damping: 30 }
			}
		>
			<AnimatePresence>
				{!sidebarCollapsed && (
					<motion.div
						key="sidebar-content"
						data-slot="sidebar-inner"
						className="sidebarContentRoot"
						initial={shouldReduceMotion ? false : { opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={shouldReduceMotion ? {} : { opacity: 0 }}
						transition={
							shouldReduceMotion ? { duration: 0 } : { duration: 0.15 }
						}
					>
						<SidebarHeader
							vaultPath={vaultPath}
							showSearch={showSearch}
							setShowSearch={setShowSearch}
							onOpenVault={onOpenVault}
							onCreateVault={onCreateVault}
							onOpenCommandPalette={onOpenCommandPalette}
						/>
						<SidebarContent
							onToggleDir={onToggleDir}
							onSelectDir={onSelectDir}
							onOpenFile={onOpenFile}
							onNewFile={onNewFile}
							onNewFileInDir={onNewFileInDir}
							onNewFolderInDir={onNewFolderInDir}
							onRenameDir={onRenameDir}
							onOpenSearchAsCanvas={onOpenSearchAsCanvas}
							onSelectSearchNote={onSelectSearchNote}
							onSelectTag={onSelectTag}
							canvases={canvases}
							activeCanvasId={activeCanvasId}
							onSelectCanvas={onSelectCanvas}
							onCreateCanvas={onCreateCanvas}
							onAddNotesToCanvas={onAddNotesToCanvas}
							onCreateNoteInCanvas={onCreateNoteInCanvas}
							onRenameCanvas={onRenameCanvas}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.aside>
	);
}
