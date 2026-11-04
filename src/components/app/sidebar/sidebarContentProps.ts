import type { useShortcutBindings } from "@/hooks/useShortcutBindings";
import type { PeriodKind } from "@/lib/periodNotes";
import type { OpenPeriodNoteAtDate } from "../calendar/useCalendarView";

export type SidebarGetBinding = ReturnType<typeof useShortcutBindings>["getBinding"];

export type SidebarTopSection =
	| "agent"
	| "all-notes"
	| "inbox"
	| "archive"
	| "connections"
	| "databases"
	| "tasks"
	| null;

export interface SidebarContentProps {
	onToggleDir: (dirPath: string) => void;
	onLoadDir: (dirPath: string, force?: boolean) => Promise<void>;
	onExpandAllDirs: () => Promise<void>;
	onCollapseAllDirs: () => void;
	onSelectDir: (dirPath: string) => void;
	onOpenFile: (relPath: string) => void;
	onNewNote: () => void;
	onNewCanvas: () => void;
	newNoteFolder: string;
	onNewFileInDir: (dirPath: string) => void;
	onCreateFromTemplateInDir: (dirPath: string) => void;
	onImportFilesInDir: (dirPath: string) => void;
	onImportFolderInDir: (dirPath: string) => void;
	onImportPathsInDir: (paths: string[], dirPath: string) => void;
	onRequestCreateFolder: (dirPath: string) => Promise<string | null>;
	onDuplicateFile: (path: string) => Promise<string | null>;
	onRenameDir: (dirPath: string, nextName: string, kind: "dir" | "file") => Promise<string | null>;
	onDeletePath: (path: string, kind: "dir" | "file") => Promise<boolean>;
	onMovePath: (
		fromPath: string,
		toDirPath: string,
		kind?: "dir" | "file",
	) => Promise<string | null>;
	onSelectTag: (tag: string) => void;
	onOpenDatabases: (databaseId?: string | null) => void;
	onPrefetchDatabases: (databaseId?: string | null) => void;
	onPrefetchAllDocs: () => void;
	onPrefetchFile: (relPath: string) => void;
	onOpenAllDocs: () => void;
	onOpenTasks: () => void;
	onOpenInbox: () => void;
	onOpenArchive: () => void;
	onOpenConnections: () => void;
	onOpenAgent: () => void;
	spacePath: string | null;
	activeTopSection: SidebarTopSection;
	onOpenSearch: () => void;
	onOpenPeriodNote: (kind: PeriodKind) => void;
	onOpenPeriodNoteAtDate: OpenPeriodNoteAtDate;
	onOpenQuickNote: () => void;
	onCreateFromTemplate: () => void;
	onGitSyncNow: () => void;
}
