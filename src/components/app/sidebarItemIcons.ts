import {
	AiBrain04Icon,
	Archive03Icon,
	Calendar03Icon,
	CalendarsIcon,
	ChartRelationshipIcon,
	CheckmarkSquare02Icon,
	Database01Icon,
	Files02Icon,
	InboxIcon,
	Layout01Icon,
	PlusSignIcon,
	Refresh04Icon,
	SearchIcon,
	StickyNote03Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { SidebarVisibilityKey } from "../../lib/settings/model";

export const SIDEBAR_ITEM_ICONS = {
	agent: AiBrain04Icon,
	newNote: PlusSignIcon,
	inbox: InboxIcon,
	allNotes: Files02Icon,
	archive: Archive03Icon,
	databases: Database01Icon,
	tasks: CheckmarkSquare02Icon,
	connections: ChartRelationshipIcon,
	calendar: CalendarsIcon,
	search: SearchIcon,
	periodNotes: Calendar03Icon,
	quickNote: StickyNote03Icon,
	templates: Layout01Icon,
	gitSync: Refresh04Icon,
} as const satisfies Record<Exclude<SidebarVisibilityKey, "newCanvas">, IconSvgElement>;
