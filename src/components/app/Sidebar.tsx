import { cn } from "@/lib/utils";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { memo } from "react";
import { useUILayoutContext } from "../../contexts";
import type { GitSyncStatus } from "../../lib/tauri";
import { onWindowDragMouseDown } from "../../utils/window";
import { SidebarContent } from "./SidebarContent";
import { SidebarHeader } from "./SidebarHeader";
import { SidebarSettingsContent } from "./SidebarSettingsContent";

interface SidebarProps {
	onToggleDir: (dirPath: string) => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewNote: () => void;
	onNewFileInDir: (dirPath: string) => void;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onNewDatabaseInDir: (dirPath: string) => Promise<string | null>;
	onNewFolderInDir: (dirPath: string) => Promise<string | null>;
	onDuplicateFile: (path: string) => Promise<string | null>;
	onRenameDir: (
		dirPath: string,
		nextName: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	onSelectTag: (tag: string) => void;
	sidebarCollapsed: boolean;
	onToggleSidebar: () => void;
	spacePath: string | null;
	recentSpaces: string[];
	onOpenSpace: () => Promise<void>;
	onOpenRecentSpaceAtPath: (path: string) => Promise<void>;
	gitSyncStatus: GitSyncStatus | null;
	onOpenSettings: () => void;
	onOpenAllDocs: () => void;
	onOpenCalendar: () => void;
	onOpenDatabases: (databaseId?: string | null) => void;
	onPrefetchCalendar: () => void;
	onPrefetchDatabases: (databaseId?: string | null) => void;
	onPrefetchAllDocs: () => void;
	onPrefetchFile: (relPath: string) => void;
	updateReady: boolean;
	updateVersion: string | null;
	onInstallUpdate: () => void;
}

export const Sidebar = memo(function Sidebar({
	onToggleDir,
	onSelectDir,
	onOpenFile,
	onNewNote,
	onNewFileInDir,
	onCreateFromTemplateInDir,
	onNewDatabaseInDir,
	onNewFolderInDir,
	onDuplicateFile,
	onRenameDir,
	onDeletePath,
	onSelectTag,
	sidebarCollapsed,
	onToggleSidebar,
	spacePath,
	recentSpaces,
	onOpenSpace,
	onOpenRecentSpaceAtPath,
	gitSyncStatus,
	onOpenSettings,
	onOpenAllDocs,
	onOpenCalendar,
	onOpenDatabases,
	onPrefetchCalendar,
	onPrefetchDatabases,
	onPrefetchAllDocs,
	onPrefetchFile,
	updateReady,
	updateVersion,
	onInstallUpdate,
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
									onMouseDown={onWindowDragMouseDown}
								/>
								<div
									className="sidebarHeader"
									data-tauri-drag-region
									onMouseDown={onWindowDragMouseDown}
								/>
								<SidebarSettingsContent />
							</>
						) : (
							<>
								<SidebarHeader
									sidebarCollapsed={sidebarCollapsed}
									onToggleSidebar={onToggleSidebar}
									spacePath={spacePath}
									recentSpaces={recentSpaces}
									onOpenSpace={onOpenSpace}
									onOpenRecentSpaceAtPath={onOpenRecentSpaceAtPath}
									updateReady={updateReady}
									updateVersion={updateVersion}
									onInstallUpdate={onInstallUpdate}
								/>
								<SidebarContent
									onToggleDir={onToggleDir}
									onSelectDir={onSelectDir}
									onOpenFile={onOpenFile}
									onNewNote={onNewNote}
									onNewFileInDir={onNewFileInDir}
									onCreateFromTemplateInDir={onCreateFromTemplateInDir}
									onNewDatabaseInDir={onNewDatabaseInDir}
									onNewFolderInDir={onNewFolderInDir}
									onDuplicateFile={onDuplicateFile}
									onRenameDir={onRenameDir}
									onDeletePath={onDeletePath}
									onSelectTag={onSelectTag}
									onOpenCalendar={onOpenCalendar}
									onOpenDatabases={onOpenDatabases}
									onPrefetchCalendar={onPrefetchCalendar}
									onPrefetchDatabases={onPrefetchDatabases}
									onPrefetchAllDocs={onPrefetchAllDocs}
									onPrefetchFile={onPrefetchFile}
									gitSyncStatus={gitSyncStatus}
									onOpenSettings={onOpenSettings}
									onOpenAllDocs={onOpenAllDocs}
								/>
							</>
						)}
					</m.div>
				)}
			</AnimatePresence>
		</m.aside>
	);
});
