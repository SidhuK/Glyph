import type { DatabaseColumn } from "./types";

export interface DatabaseColumnIconOption {
	id: string;
	label: string;
	iconKey: string;
}

export const DATABASE_COLUMN_ICON_OPTIONS = [
	{ id: "document", label: "Document", iconKey: "Document" },
	{ id: "attachment", label: "Attachment", iconKey: "DocumentAttachmentIcon" },
	{ id: "code", label: "Code", iconKey: "DocumentCodeIcon" },
	{ id: "note", label: "Note", iconKey: "NoteIcon" },
	{ id: "book", label: "Book", iconKey: "Book02Icon" },
	{ id: "book-open", label: "Open book", iconKey: "BookOpen01Icon" },
	{ id: "bookmark", label: "Bookmark", iconKey: "Bookmark01Icon" },
	{ id: "tag", label: "Tag", iconKey: "Tag01Icon" },
	{ id: "hash", label: "Hash", iconKey: "HashtagIcon" },
	{ id: "list", label: "List", iconKey: "LeftToRightListBulletIcon" },
	{ id: "grid", label: "Grid", iconKey: "GridViewIcon" },
	{ id: "table", label: "Table", iconKey: "TableIcon" },
	{ id: "kanban", label: "Kanban", iconKey: "KanbanIcon" },
	{ id: "target", label: "Target", iconKey: "Target01Icon" },
	{ id: "flag", label: "Flag", iconKey: "Flag01Icon" },
	{ id: "star", label: "Star", iconKey: "StarIcon" },
	{ id: "sparkles", label: "Sparkles", iconKey: "SparklesIcon" },
	{ id: "idea", label: "Idea", iconKey: "BulbIcon" },
	{ id: "rocket", label: "Rocket", iconKey: "Rocket01Icon" },
	{
		id: "check-circle",
		label: "Check circle",
		iconKey: "CheckmarkCircle02Icon",
	},
	{ id: "calendar", label: "Calendar", iconKey: "Calendar03Icon" },
	{ id: "clock", label: "Clock", iconKey: "Clock01Icon" },
	{ id: "folder", label: "Folder", iconKey: "Folder01Icon" },
	{ id: "folder-open", label: "Open folder", iconKey: "FolderOpenIcon" },
	{ id: "route", label: "Route", iconKey: "Route02Icon" },
	{ id: "location", label: "Location", iconKey: "MapsLocation01Icon" },
	{ id: "link", label: "Link", iconKey: "Link01Icon" },
	{ id: "globe", label: "Globe", iconKey: "Globe02Icon" },
	{ id: "mail", label: "Mail", iconKey: "Mail01Icon" },
	{ id: "message", label: "Message", iconKey: "Message01Icon" },
	{ id: "user", label: "User", iconKey: "UserIcon" },
	{ id: "briefcase", label: "Briefcase", iconKey: "Briefcase01Icon" },
	{ id: "home", label: "Home", iconKey: "Home01Icon" },
	{ id: "shield", label: "Shield", iconKey: "Shield01Icon" },
	{ id: "settings", label: "Settings", iconKey: "Settings01Icon" },
	{ id: "chart", label: "Chart", iconKey: "ChartIcon" },
	{ id: "analytics", label: "Analytics", iconKey: "Analytics01Icon" },
	{ id: "database", label: "Database", iconKey: "DatabaseIcon" },
	{ id: "source", label: "Source", iconKey: "SourceCodeIcon" },
	{ id: "terminal", label: "Terminal", iconKey: "CodeIcon" },
	{ id: "image", label: "Image", iconKey: "Image01Icon" },
	{ id: "camera", label: "Camera", iconKey: "Camera01Icon" },
	{ id: "video", label: "Video", iconKey: "Video01Icon" },
	{ id: "music", label: "Music", iconKey: "MusicNote01Icon" },
	{ id: "headphones", label: "Headphones", iconKey: "HeadphonesIcon" },
	{ id: "brush", label: "Brush", iconKey: "PaintBrush04Icon" },
	{ id: "task", label: "Task", iconKey: "TaskDone01Icon" },
	{ id: "archive", label: "Archive", iconKey: "Archive01Icon" },
	{ id: "ai", label: "AI idea", iconKey: "AiIdeaIcon" },
	{ id: "reminder", label: "Reminder", iconKey: "AppleReminderIcon" },
	{ id: "activity", label: "Activity", iconKey: "Activity01Icon" },
	{ id: "workflow", label: "Workflow", iconKey: "WorkflowCircle01Icon" },
] as const satisfies readonly DatabaseColumnIconOption[];

const DATABASE_COLUMN_ICON_BY_ID = new Map<string, DatabaseColumnIconOption>(
	DATABASE_COLUMN_ICON_OPTIONS.map((option) => [option.id, option]),
);

const BUILT_IN_DATABASE_COLUMN_ICONS: Record<
	Exclude<DatabaseColumn["type"], "property">,
	string
> = {
	title: "document",
	tags: "tag",
	path: "route",
	created: "calendar",
	updated: "clock",
};

const PROPERTY_KIND_DATABASE_COLUMN_ICONS: Record<string, string> = {
	text: "document",
	url: "link",
	number: "hash",
	date: "calendar",
	datetime: "clock",
	checkbox: "check-circle",
	list: "list",
	tags: "tag",
	yaml: "source",
};

export function getDatabaseColumnIconOption(
	iconName: string | null | undefined,
): DatabaseColumnIconOption | null {
	if (!iconName) return null;
	return DATABASE_COLUMN_ICON_BY_ID.get(iconName) ?? null;
}

export function defaultDatabaseColumnIconName(
	column: Pick<DatabaseColumn, "type" | "property_kind">,
): string {
	if (column.type === "property") {
		return (
			PROPERTY_KIND_DATABASE_COLUMN_ICONS[column.property_kind ?? ""] ??
			"document"
		);
	}
	return BUILT_IN_DATABASE_COLUMN_ICONS[column.type];
}

export function resolveDatabaseColumnIconName(
	column: Pick<DatabaseColumn, "type" | "property_kind" | "icon">,
): string {
	const customIcon = getDatabaseColumnIconOption(column.icon);
	if (customIcon) return customIcon.id;
	return defaultDatabaseColumnIconName(column);
}
