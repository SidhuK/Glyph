import { SortByDown02Icon, SortByUp02Icon } from "@hugeicons/core-free-icons";
import type { DatabaseSort } from "../../lib/database/types";

export const SORT_DIRECTION_ICONS = {
	asc: SortByUp02Icon,
	desc: SortByDown02Icon,
} as const satisfies Record<DatabaseSort["direction"], unknown>;
