import {
	Activity01Icon,
	AiIdeaIcon,
	AppleReminderIcon,
	Archive01Icon,
	Book02Icon,
	BookOpen01Icon,
	Bookmark01Icon,
	Briefcase01Icon,
	BulbIcon,
	Calendar03Icon,
	Camera01Icon,
	ChartIcon,
	CheckmarkCircle02Icon,
	Clock01Icon,
	CodeIcon,
	DatabaseIcon,
	Document,
	DocumentAttachmentIcon,
	DocumentCodeIcon,
	Flag01Icon,
	Folder01Icon,
	FolderOpenIcon,
	Globe02Icon,
	GridViewIcon,
	HashtagIcon,
	HeadphonesIcon,
	Home01Icon,
	Image01Icon,
	KanbanIcon,
	LeftToRightListBulletIcon,
	Link01Icon,
	Mail01Icon,
	MapsLocation01Icon,
	Message01Icon,
	MusicNote01Icon,
	NoteIcon,
	PaintBrush04Icon,
	Rocket01Icon,
	Route02Icon,
	Settings01Icon,
	Shield01Icon,
	SourceCodeIcon,
	SparklesIcon,
	StarIcon,
	TableIcon,
	Tag01Icon,
	Target01Icon,
	TaskDone01Icon,
	UserIcon,
	Video01Icon,
	WorkflowCircle01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import {
	getDatabaseColumnIconOption,
	resolveDatabaseColumnIconName,
} from "../../lib/database/columnIcons";
import type { DatabaseColumn } from "../../lib/database/types";

interface DatabaseColumnIconProps {
	column?: Pick<DatabaseColumn, "type" | "property_kind" | "icon">;
	iconName?: string | null;
	size?: number;
	className?: string;
}

const DATABASE_COLUMN_ICONS_BY_KEY: Record<
	string,
	ComponentProps<typeof HugeiconsIcon>["icon"]
> = {
	Activity01Icon,
	AiIdeaIcon,
	AppleReminderIcon,
	Archive01Icon,
	Book02Icon,
	BookOpen01Icon,
	Bookmark01Icon,
	Briefcase01Icon,
	BulbIcon,
	Calendar03Icon,
	Camera01Icon,
	ChartIcon,
	CheckmarkCircle02Icon,
	Clock01Icon,
	CodeIcon,
	DatabaseIcon,
	Document,
	DocumentAttachmentIcon,
	DocumentCodeIcon,
	Flag01Icon,
	Folder01Icon,
	FolderOpenIcon,
	Globe02Icon,
	GridViewIcon,
	HashtagIcon,
	HeadphonesIcon,
	Home01Icon,
	Image01Icon,
	KanbanIcon,
	LeftToRightListBulletIcon,
	Link01Icon,
	Mail01Icon,
	MapsLocation01Icon,
	Message01Icon,
	MusicNote01Icon,
	NoteIcon,
	PaintBrush04Icon,
	Rocket01Icon,
	Route02Icon,
	Settings01Icon,
	Shield01Icon,
	SourceCodeIcon,
	SparklesIcon,
	StarIcon,
	TableIcon,
	Tag01Icon,
	Target01Icon,
	TaskDone01Icon,
	UserIcon,
	Video01Icon,
	WorkflowCircle01Icon,
};

function iconDefinition(iconName: string) {
	const option = getDatabaseColumnIconOption(iconName);
	if (!option) return Document;
	if (typeof option.iconKey !== "string") return Document;
	return DATABASE_COLUMN_ICONS_BY_KEY[option.iconKey] ?? Document;
}

export function DatabaseColumnIcon({
	column,
	iconName,
	size = 14,
	className,
}: DatabaseColumnIconProps) {
	const resolvedIconName =
		iconName ?? (column ? resolveDatabaseColumnIconName(column) : "document");
	return (
		<HugeiconsIcon
			icon={iconDefinition(resolvedIconName)}
			size={size}
			className={className}
		/>
	);
}
