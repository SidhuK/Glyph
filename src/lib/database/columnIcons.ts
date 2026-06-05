import type { DatabaseColumn } from "./types";

export type IconCategory =
	| "write"
	| "media"
	| "food"
	| "weather"
	| "sort"
	| "find"
	| "talk"
	| "time"
	| "do"
	| "fun"
	| "science";

export const ICON_CATEGORY_LABELS: Record<IconCategory, string> = {
	write: "Write",
	media: "Media",
	food: "Food",
	weather: "Weather",
	sort: "Sort",
	find: "Find",
	talk: "Talk",
	time: "Time",
	do: "Do",
	fun: "Fun",
	science: "Science",
};

export interface DatabaseColumnIconOption {
	id: string;
	label: string;
	iconKey: string;
	category: IconCategory;
}

export const DATABASE_COLUMN_ICON_OPTIONS = [
	// ── Write ──────────────────────────────────────────
	{
		id: "text-font",
		label: "Text",
		iconKey: "TextFontIcon",
		category: "write",
	},
	{ id: "document", label: "Document", iconKey: "Document", category: "write" },
	{
		id: "attachment",
		label: "Attachment",
		iconKey: "DocumentAttachmentIcon",
		category: "write",
	},
	{ id: "code", label: "Code", iconKey: "DocumentCodeIcon", category: "write" },
	{ id: "note", label: "Note", iconKey: "NoteIcon", category: "write" },
	{ id: "note-02", label: "Note", iconKey: "Note02Icon", category: "write" },
	{
		id: "note-done",
		label: "Done note",
		iconKey: "NoteDoneIcon",
		category: "write",
	},
	{
		id: "note-add",
		label: "Add note",
		iconKey: "NoteAddIcon",
		category: "write",
	},
	{
		id: "note-edit",
		label: "Edit note",
		iconKey: "NoteEditIcon",
		category: "write",
	},
	{
		id: "notebook",
		label: "Notebook",
		iconKey: "NotebookIcon",
		category: "write",
	},
	{ id: "book", label: "Book", iconKey: "Book02Icon", category: "write" },
	{
		id: "book-open",
		label: "Open book",
		iconKey: "BookOpen01Icon",
		category: "write",
	},
	{
		id: "book-open-check",
		label: "Book check",
		iconKey: "BookOpenCheckIcon",
		category: "write",
	},
	{
		id: "book-heart",
		label: "Book love",
		iconKey: "BookHeartIcon",
		category: "write",
	},
	{
		id: "bookmark",
		label: "Bookmark",
		iconKey: "Bookmark01Icon",
		category: "write",
	},
	{
		id: "bookmark-02",
		label: "Bookmark",
		iconKey: "Bookmark02Icon",
		category: "write",
	},
	{
		id: "clipboard",
		label: "Clipboard",
		iconKey: "ClipboardIcon",
		category: "write",
	},
	{ id: "pencil", label: "Pencil", iconKey: "PencilIcon", category: "write" },
	{
		id: "feather",
		label: "Feather",
		iconKey: "FeatherIcon",
		category: "write",
	},

	// ── Media ─────────────────────────────────────────
	{ id: "image", label: "Image", iconKey: "Image01Icon", category: "media" },
	{ id: "camera", label: "Camera", iconKey: "Camera01Icon", category: "media" },
	{ id: "video", label: "Video", iconKey: "Video01Icon", category: "media" },
	{ id: "film", label: "Film", iconKey: "Film01Icon", category: "media" },
	{
		id: "music",
		label: "Music",
		iconKey: "MusicNote01Icon",
		category: "media",
	},
	{
		id: "headphones",
		label: "Headphones",
		iconKey: "HeadphonesIcon",
		category: "media",
	},
	{
		id: "brush",
		label: "Brush",
		iconKey: "PaintBrush04Icon",
		category: "media",
	},
	{ id: "brush-02", label: "Brush", iconKey: "BrushIcon", category: "media" },
	{ id: "eraser", label: "Eraser", iconKey: "EraserIcon", category: "media" },
	{
		id: "drawing-mode",
		label: "Draw",
		iconKey: "DrawingModeIcon",
		category: "media",
	},

	// ── Food ──────────────────────────────────────────
	{ id: "coffee", label: "Coffee", iconKey: "Coffee01Icon", category: "food" },
	{ id: "tea", label: "Tea", iconKey: "TeaIcon", category: "food" },
	{ id: "pizza", label: "Pizza", iconKey: "Pizza01Icon", category: "food" },
	{
		id: "hamburger",
		label: "Burger",
		iconKey: "Hamburger01Icon",
		category: "food",
	},
	{
		id: "french-fries",
		label: "Fries",
		iconKey: "FrenchFries01Icon",
		category: "food",
	},
	{ id: "sushi", label: "Sushi", iconKey: "Sushi01Icon", category: "food" },
	{ id: "bread", label: "Bread", iconKey: "Bread01Icon", category: "food" },
	{
		id: "croissant",
		label: "Croissant",
		iconKey: "CroissantIcon",
		category: "food",
	},
	{ id: "salad", label: "Salad", iconKey: "SaladIcon", category: "food" },
	{
		id: "rice-bowl",
		label: "Rice",
		iconKey: "RiceBowl01Icon",
		category: "food",
	},
	{ id: "noodles", label: "Noodles", iconKey: "NoodlesIcon", category: "food" },
	{ id: "steak", label: "Steak", iconKey: "SteakIcon", category: "food" },
	{ id: "cookie", label: "Cookie", iconKey: "CookieIcon", category: "food" },

	// ── Weather ───────────────────────────────────────
	{
		id: "droplet",
		label: "Droplet",
		iconKey: "DropletIcon",
		category: "weather",
	},
	{
		id: "rain-drop",
		label: "Rain drop",
		iconKey: "RainDropIcon",
		category: "weather",
	},
	{ id: "rain", label: "Rain", iconKey: "RainIcon", category: "weather" },
	{ id: "snow", label: "Snow", iconKey: "SnowIcon", category: "weather" },
	{
		id: "cloud-snow",
		label: "Snow cloud",
		iconKey: "CloudSnowIcon",
		category: "weather",
	},
	{
		id: "moon-cloud",
		label: "Moon cloud",
		iconKey: "MoonCloudIcon",
		category: "weather",
	},
	{
		id: "umbrella",
		label: "Umbrella",
		iconKey: "UmbrellaIcon",
		category: "weather",
	},
	{
		id: "temperature",
		label: "Temperature",
		iconKey: "TemperatureIcon",
		category: "weather",
	},
	{
		id: "thermometer",
		label: "Thermometer",
		iconKey: "ThermometerIcon",
		category: "weather",
	},
	{
		id: "humidity",
		label: "Humidity",
		iconKey: "HumidityIcon",
		category: "weather",
	},
	{
		id: "rainbow",
		label: "Rainbow",
		iconKey: "RainbowIcon",
		category: "weather",
	},

	// ── Sort ──────────────────────────────────────────
	{ id: "tag", label: "Tag", iconKey: "Tag01Icon", category: "sort" },
	{ id: "hash", label: "Hash", iconKey: "HashtagIcon", category: "sort" },
	{
		id: "list",
		label: "List",
		iconKey: "LeftToRightListBulletIcon",
		category: "sort",
	},
	{ id: "grid", label: "Grid", iconKey: "GridViewIcon", category: "sort" },
	{ id: "table", label: "Table", iconKey: "TableIcon", category: "sort" },
	{ id: "kanban", label: "Kanban", iconKey: "KanbanIcon", category: "sort" },
	{ id: "cloud", label: "Cloud", iconKey: "CloudIcon", category: "sort" },
	{ id: "filter", label: "Filter", iconKey: "FilterIcon", category: "sort" },
	{ id: "inbox", label: "Inbox", iconKey: "InboxIcon", category: "sort" },
	{
		id: "archive",
		label: "Archive",
		iconKey: "Archive01Icon",
		category: "sort",
	},
	{
		id: "archive-02",
		label: "Archive",
		iconKey: "Archive02Icon",
		category: "sort",
	},
	{
		id: "database",
		label: "Database",
		iconKey: "DatabaseIcon",
		category: "sort",
	},
	{ id: "chart", label: "Chart", iconKey: "ChartIcon", category: "sort" },
	{ id: "folder", label: "Folder", iconKey: "Folder01Icon", category: "sort" },
	{
		id: "folder-open",
		label: "Open folder",
		iconKey: "FolderOpenIcon",
		category: "sort",
	},
	{ id: "shield", label: "Shield", iconKey: "Shield01Icon", category: "sort" },
	{
		id: "settings",
		label: "Settings",
		iconKey: "Settings01Icon",
		category: "sort",
	},

	// ── Find ──────────────────────────────────────────
	{ id: "route", label: "Route", iconKey: "Route02Icon", category: "find" },
	{
		id: "location",
		label: "Location",
		iconKey: "MapsLocation01Icon",
		category: "find",
	},
	{ id: "link", label: "Link", iconKey: "Link01Icon", category: "find" },
	{ id: "globe", label: "Globe", iconKey: "Globe02Icon", category: "find" },
	{ id: "home", label: "Home", iconKey: "Home01Icon", category: "find" },
	{ id: "pin", label: "Pin", iconKey: "PinLocation01Icon", category: "find" },
	{ id: "pin-off", label: "Pin off", iconKey: "PinOffIcon", category: "find" },
	{ id: "search", label: "Search", iconKey: "Search01Icon", category: "find" },
	{ id: "help", label: "Help", iconKey: "HelpCircleIcon", category: "find" },
	{
		id: "compass",
		label: "Compass",
		iconKey: "Compass01Icon",
		category: "find",
	},
	{
		id: "question",
		label: "Question",
		iconKey: "QuestionIcon",
		category: "find",
	},

	// ── Talk ──────────────────────────────────────────
	{ id: "mail", label: "Mail", iconKey: "Mail01Icon", category: "talk" },
	{
		id: "message",
		label: "Message",
		iconKey: "Message01Icon",
		category: "talk",
	},
	{ id: "user", label: "User", iconKey: "UserIcon", category: "talk" },
	{
		id: "briefcase",
		label: "Briefcase",
		iconKey: "Briefcase01Icon",
		category: "talk",
	},
	{ id: "smile", label: "Smile", iconKey: "SmileIcon", category: "talk" },
	{ id: "wink", label: "Wink", iconKey: "WinkIcon", category: "talk" },
	{ id: "happy", label: "Happy", iconKey: "HappyIcon", category: "talk" },
	{ id: "shocked", label: "Shocked", iconKey: "ShockedIcon", category: "talk" },
	{ id: "tongue", label: "Tongue", iconKey: "TongueIcon", category: "talk" },
	{ id: "heart", label: "Heart", iconKey: "HeartAddIcon", category: "talk" },

	// ── Time ──────────────────────────────────────────
	{
		id: "calendar",
		label: "Calendar",
		iconKey: "Calendar03Icon",
		category: "time",
	},
	{ id: "clock", label: "Clock", iconKey: "Clock01Icon", category: "time" },
	{ id: "timer", label: "Timer", iconKey: "Timer01Icon", category: "time" },
	{
		id: "alarm-clock",
		label: "Alarm clock",
		iconKey: "AlarmClockIcon",
		category: "time",
	},
	{
		id: "stopwatch",
		label: "Stopwatch",
		iconKey: "StopWatchIcon",
		category: "time",
	},
	{ id: "moon", label: "Moon", iconKey: "MoonIcon", category: "time" },
	{ id: "sun", label: "Sun", iconKey: "Sun01Icon", category: "time" },
	{
		id: "reminder",
		label: "Reminder",
		iconKey: "AppleReminderIcon",
		category: "time",
	},
	{
		id: "activity",
		label: "Activity",
		iconKey: "Activity01Icon",
		category: "time",
	},
	{
		id: "workflow",
		label: "Workflow",
		iconKey: "WorkflowCircle01Icon",
		category: "time",
	},

	// ── Do ────────────────────────────────────────────
	{ id: "target", label: "Target", iconKey: "Target01Icon", category: "do" },
	{ id: "target-02", label: "Target", iconKey: "Target02Icon", category: "do" },
	{ id: "flag", label: "Flag", iconKey: "Flag01Icon", category: "do" },
	{ id: "star", label: "Star", iconKey: "StarIcon", category: "do" },
	{ id: "idea", label: "Idea", iconKey: "BulbIcon", category: "do" },
	{ id: "rocket", label: "Rocket", iconKey: "Rocket01Icon", category: "do" },
	{
		id: "check-circle",
		label: "Check circle",
		iconKey: "CheckmarkCircle02Icon",
		category: "do",
	},
	{
		id: "checkmark-badge",
		label: "Badge check",
		iconKey: "CheckmarkBadge01Icon",
		category: "do",
	},
	{
		id: "checkmark-circle",
		label: "Check circle",
		iconKey: "CheckmarkCircle01Icon",
		category: "do",
	},
	{
		id: "checklist",
		label: "Checklist",
		iconKey: "CheckListIcon",
		category: "do",
	},
	{ id: "task", label: "Task", iconKey: "TaskDone01Icon", category: "do" },
	{
		id: "status",
		label: "Status",
		iconKey: "CheckmarkCircle02Icon",
		category: "do",
	},
	{
		id: "priority",
		label: "Priority",
		iconKey: "MediumSignalIcon",
		category: "do",
	},
	{ id: "zap", label: "Zap", iconKey: "ZapIcon", category: "do" },
	{ id: "puzzle", label: "Puzzle", iconKey: "PuzzleIcon", category: "do" },

	// ── Fun ───────────────────────────────────────────
	{
		id: "sparkles",
		label: "Sparkles",
		iconKey: "SparklesIcon",
		category: "fun",
	},
	{
		id: "star-face",
		label: "Star face",
		iconKey: "StarFaceIcon",
		category: "fun",
	},
	{ id: "crown", label: "Crown", iconKey: "CrownIcon", category: "fun" },
	{ id: "fire", label: "Fire", iconKey: "Fire02Icon", category: "fun" },
	{
		id: "fireworks",
		label: "Fireworks",
		iconKey: "FireworksIcon",
		category: "fun",
	},
	{ id: "award", label: "Award", iconKey: "Award01Icon", category: "fun" },
	{ id: "ribbon", label: "Ribbon", iconKey: "RibbonIcon", category: "fun" },
	{ id: "dice", label: "Dice", iconKey: "DiceIcon", category: "fun" },
	{ id: "alien", label: "Alien", iconKey: "Alien01Icon", category: "fun" },
	{ id: "skull", label: "Skull", iconKey: "SkullIcon", category: "fun" },
	{
		id: "magic-wand",
		label: "Magic wand",
		iconKey: "MagicWand01Icon",
		category: "fun",
	},
	{
		id: "campfire",
		label: "Campfire",
		iconKey: "CampfireIcon",
		category: "fun",
	},
	{ id: "cactus", label: "Cactus", iconKey: "CactusIcon", category: "fun" },

	// ── Science ───────────────────────────────────────
	{ id: "dna", label: "DNA", iconKey: "DnaIcon", category: "science" },
	{ id: "brain", label: "Brain", iconKey: "BrainIcon", category: "science" },
	{
		id: "microscope",
		label: "Microscope",
		iconKey: "MicroscopeIcon",
		category: "science",
	},
	{
		id: "test-tube",
		label: "Test tube",
		iconKey: "TestTubeIcon",
		category: "science",
	},
	{ id: "magnet", label: "Magnet", iconKey: "MagnetIcon", category: "science" },
	{
		id: "physics",
		label: "Physics",
		iconKey: "PhysicsIcon",
		category: "science",
	},
	{
		id: "gravity",
		label: "Gravity",
		iconKey: "GravityIcon",
		category: "science",
	},
	{
		id: "biohazard",
		label: "Biohazard",
		iconKey: "BiohazardIcon",
		category: "science",
	},
	{
		id: "eco-lab",
		label: "Eco lab",
		iconKey: "EcoLabIcon",
		category: "science",
	},
	{
		id: "celsius",
		label: "Celsius",
		iconKey: "CelsiusIcon",
		category: "science",
	},
	{
		id: "source",
		label: "Source",
		iconKey: "SourceCodeIcon",
		category: "science",
	},
	{
		id: "terminal",
		label: "Terminal",
		iconKey: "CodeIcon",
		category: "science",
	},
	{ id: "ai", label: "AI idea", iconKey: "AiIdeaIcon", category: "science" },
] as const satisfies readonly DatabaseColumnIconOption[];

const DATABASE_COLUMN_ICON_BY_ID = new Map<string, DatabaseColumnIconOption>(
	DATABASE_COLUMN_ICON_OPTIONS.map((option) => [option.id, option]),
);

const BUILT_IN_DATABASE_COLUMN_ICONS: Record<
	Exclude<DatabaseColumn["type"], "property">,
	string
> = {
	title: "text-font",
	tags: "tag",
	path: "route",
	folder: "folder",
	created: "calendar",
	updated: "clock",
	linked_notes: "link",
};

const PROPERTY_KIND_DATABASE_COLUMN_ICONS: Record<string, string> = {
	text: "document",
	url: "link",
	date: "calendar",
	checkbox: "check-circle",
	tags: "tag",
	status: "status",
	priority: "priority",
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
