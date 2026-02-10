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
	onNewFileInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
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
	onNewFileInDir,
	onNewFolderInDir,
	onRenameDir,
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
	const { onOpenVault } = useVault();
	const { sidebarCollapsed, sidebarWidth } = useUIContext();
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
							onOpenVault={onOpenVault}
							onOpenCommandPalette={onOpenCommandPalette}
						/>
						<SidebarContent
							onToggleDir={onToggleDir}
							onSelectDir={onSelectDir}
							onOpenFile={onOpenFile}
							onNewFileInDir={onNewFileInDir}
							onNewFolderInDir={onNewFolderInDir}
							onRenameDir={onRenameDir}
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
