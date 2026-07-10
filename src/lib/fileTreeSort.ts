import { i18n } from "../i18n";
import type { FileTreeSortMode } from "./settings";

export const FILE_TREE_SORT_MODES = [
	"name-asc",
	"name-desc",
	"modified-desc",
	"modified-asc",
	"created-desc",
	"created-asc",
] as const satisfies readonly FileTreeSortMode[];

const FILE_TREE_SORT_LABEL_KEYS = {
	"name-asc": "sort.nameAsc",
	"name-desc": "sort.nameDesc",
	"modified-desc": "sort.modifiedNewest",
	"modified-asc": "sort.modifiedOldest",
	"created-desc": "sort.createdNewest",
	"created-asc": "sort.createdOldest",
} as const satisfies Record<FileTreeSortMode, string>;

export function fileTreeSortLabel(sortMode: FileTreeSortMode): string {
	return i18n.t(`shell:${FILE_TREE_SORT_LABEL_KEYS[sortMode]}`);
}
