import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { memo } from "react";
import { useUILayoutContext, useVault } from "../../contexts";
import { cn } from "@/lib/utils";
import { SidebarContent } from "./SidebarContent";
import { SidebarHeader } from "./SidebarHeader";

interface SidebarProps {
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewFileInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	onSelectTag: (tag: string) => void;
	onOpenCommandPalette: () => void;
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
	onOpenDailyNote: () => void;
	isDailyNoteCreating: boolean;
}

export const Sidebar = memo(function Sidebar({
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewFileInDir,
	onNewFolderInDir,
	onRenameDir,
	onDeletePath,
	onSelectTag,
	onOpenCommandPalette,
	sidebarCollapsed,
	onToggleSidebar,
	onOpenDailyNote,
	isDailyNoteCreating,
}: SidebarProps) {
	// Contexts
	const { onOpenVault } = useVault();
	const { sidebarWidth } = useUILayoutContext();
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
							sidebarCollapsed={sidebarCollapsed}
							onToggleSidebar={onToggleSidebar}
						/>
						<SidebarContent
							onToggleDir={onToggleDir}
							onSelectDir={onSelectDir}
							onOpenFile={onOpenFile}
							onNewFileInDir={onNewFileInDir}
							onNewFolderInDir={onNewFolderInDir}
							onRenameDir={onRenameDir}
							onDeletePath={onDeletePath}
							onSelectTag={onSelectTag}
							onOpenDailyNote={onOpenDailyNote}
							isDailyNoteCreating={isDailyNoteCreating}
						/>
					</motion.div>
				)}
			</AnimatePresence>
		</motion.aside>
	);
});
