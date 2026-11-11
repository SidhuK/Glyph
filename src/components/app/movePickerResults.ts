import type { FsEntry } from "../../lib/tauri";
import { basename, displayFolderFromPath, parentDir } from "../../utils/path";
import type { PaletteResult } from "./paletteResults";

type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Rows mount without virtualization, so a large space lists its best matches; typing narrows. */
const MOVE_RESULT_LIMIT = 50;

/** A folder a note can move into, with the notes directly inside it. "" is the space root. */
export interface MoveFolder {
	path: string;
	noteCount: number;
}

/** Folders from one recursive listing, root first, each with its direct note count. */
export function moveFoldersFromEntries(entries: readonly FsEntry[]): MoveFolder[] {
	const counts = new Map<string, number>([["", 0]]);
	for (const entry of entries) {
		if (entry.kind === "dir" && !counts.has(entry.rel_path)) counts.set(entry.rel_path, 0);
	}
	for (const entry of entries) {
		if (entry.kind !== "file" || !entry.is_markdown) continue;
		const folder = parentDir(entry.rel_path);
		counts.set(folder, (counts.get(folder) ?? 0) + 1);
	}
	return [...counts]
		.map(([path, noteCount]) => ({ path, noteCount }))
		.sort((a, b) => (a.path === "" ? -1 : b.path === "" ? 1 : a.path.localeCompare(b.path)));
}

interface BuildMoveResultsInput {
	query: string;
	sourcePath: string;
	folders: readonly MoveFolder[];
	spacePath: string | null;
	t: Translate;
}

/**
 * Destinations by folder name, then "New folder…", then the note's own folder, disabled: it is
 * listed so the note's location is clear, but moving there would do nothing.
 */
export function buildMoveResults({
	query,
	sourcePath,
	folders,
	spacePath,
	t,
}: BuildMoveResultsInput): PaletteResult[] {
	const currentFolder = parentDir(sourcePath);
	const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const spaceName = spacePath ? basename(spacePath) : "";
	const moveTo = t("commandPalette.moveTo");
	const rows = folders.flatMap(({ path, noteCount }): PaletteResult[] => {
		const label = path ? basename(path) : t("commandPalette.spaceRoot");
		const searchable = `${label} ${path}`.toLowerCase();
		if (!tokens.every((token) => searchable.includes(token))) return [];
		const isCurrent = path === currentFolder;
		const parent = path ? displayFolderFromPath(path) : spaceName;
		const notes = t("commandPalette.noteCount", { count: noteCount });
		return [
			{
				id: `destination:folder:${path}`,
				kind: "destination",
				label,
				description: isCurrent ? parent : [parent, notes].filter(Boolean).join(" · "),
				descriptionTooltip: path || spaceName || undefined,
				category: moveTo,
				keywords: [],
				target: path,
				enabled: !isCurrent,
				group: isCurrent ? t("commandPalette.currentLocation") : moveTo,
				trailing: isCurrent ? t("commandPalette.current") : undefined,
			},
		];
	});
	const newFolder: PaletteResult = {
		id: "destination:action:create-folder",
		kind: "destination",
		label: t("commandPalette.newFolder"),
		category: moveTo,
		keywords: [],
		group: moveTo,
		actionId: "create-folder",
	};
	return [
		...rows.filter((row) => row.enabled !== false).slice(0, MOVE_RESULT_LIMIT),
		newFolder,
		...rows.filter((row) => row.enabled === false),
	];
}
