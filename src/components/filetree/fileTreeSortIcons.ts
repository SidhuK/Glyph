import {
	CalendarArrowDownIcon,
	CalendarArrowUpIcon,
	ClockArrowDownIcon,
	ClockArrowUpIcon,
	SortingAZ01Icon,
	SortingZA01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { FileTreeSortMode } from "../../lib/settings";

export const FILE_TREE_SORT_ICONS = {
	"name-asc": SortingAZ01Icon,
	"name-desc": SortingZA01Icon,
	"modified-desc": ClockArrowDownIcon,
	"modified-asc": ClockArrowUpIcon,
	"created-desc": CalendarArrowDownIcon,
	"created-asc": CalendarArrowUpIcon,
} as const satisfies Record<FileTreeSortMode, IconSvgElement>;
