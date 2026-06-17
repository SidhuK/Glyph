import { cn } from "@/lib/utils";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { memo } from "react";
import { useUILayoutContext } from "../../contexts";
import { SidebarContent } from "./SidebarContent";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarSettingsContent } from "./SidebarSettingsContent";

interface SidebarProps {
	onToggleDir: (dirPath: string) => void;
	onLoadDir: (dirPath: string, force?: boolean) => Promise<void>;
	onExpandAllDirs: () => Promise<void>;
	onCollapseAllDirs: () => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewNote: () => void;
	onNewFileInDir: (dirPath: string) => void;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onDuplicateFile: (path: string) => Promise<string | null>;
	onRenameDir: (
		dirPath: string,
		nextName: string,
		kind: "dir" | "file",
	) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	onMovePath: (
		fromPath: string,
		toDirPath: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
	onSelectTag: (tag: string) => void;
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
	spacePath: string | null;
	onOpenAllDocs: () => void;
	onOpenPinnedDocs: () => void;
	onOpenConnections: () => void;
	onOpenDatabases: (databaseId?: string | null) => void;
	activeTopSection:
		| "all-notes"
		| "connections"
		| "databases"
		| "pinned-notes"
		| null;
	onPrefetchDatabases: (databaseId?: string | null) => void;
	onPrefetchAllDocs: () => void;
	onPrefetchFile: (relPath: string) => void;
}

export const Sidebar = memo(function Sidebar({
	onToggleDir,
	onLoadDir,
	onExpandAllDirs,
	onCollapseAllDirs,
	onSelectDir,
	onOpenFile,
	onNewNote,
	onNewFileInDir,
	onCreateFromTemplateInDir,
	onNewFolderInDir,
	onDuplicateFile,
	onRenameDir,
	onDeletePath,
	onMovePath,
	onSelectTag,
	sidebarCollapsed,
	onToggleSidebar,
	spacePath,
	onOpenAllDocs,
	onOpenPinnedDocs,
	onOpenConnections,
	onOpenDatabases,
	activeTopSection,
	onPrefetchDatabases,
	onPrefetchAllDocs,
	onPrefetchFile,
}: SidebarProps) {
	const { sidebarWidth, settingsMode } = useUILayoutContext();
	const shouldReduceMotion = useReducedMotion();
	const sidebarState = sidebarCollapsed ? "collapsed" : "expanded";

	return (
		<m.aside
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
					<m.div
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
						{settingsMode ? (
							<>
								<div
									aria-hidden="true"
									className="sidebarDragLayer"
									data-tauri-drag-region
								/>
								<div className="sidebarHeader" data-tauri-drag-region />
								<SidebarSettingsContent />
							</>
						) : (
							<>
								<SidebarHeader
									sidebarCollapsed={sidebarCollapsed}
									onToggleSidebar={onToggleSidebar}
								/>
								<SidebarContent
									onToggleDir={onToggleDir}
									onLoadDir={onLoadDir}
									onExpandAllDirs={onExpandAllDirs}
									onCollapseAllDirs={onCollapseAllDirs}
									onSelectDir={onSelectDir}
									onOpenFile={onOpenFile}
									onNewNote={onNewNote}
									onNewFileInDir={onNewFileInDir}
									onCreateFromTemplateInDir={onCreateFromTemplateInDir}
									onNewFolderInDir={onNewFolderInDir}
									onDuplicateFile={onDuplicateFile}
									onRenameDir={onRenameDir}
									onDeletePath={onDeletePath}
									onMovePath={onMovePath}
									onSelectTag={onSelectTag}
									onOpenDatabases={onOpenDatabases}
									onPrefetchDatabases={onPrefetchDatabases}
									onPrefetchAllDocs={onPrefetchAllDocs}
									onPrefetchFile={onPrefetchFile}
									onOpenAllDocs={onOpenAllDocs}
									onOpenPinnedDocs={onOpenPinnedDocs}
									onOpenConnections={onOpenConnections}
									spacePath={spacePath}
									activeTopSection={activeTopSection}
								/>
							</>
						)}
					</m.div>
				)}
			</AnimatePresence>
		</m.aside>
	);
});
