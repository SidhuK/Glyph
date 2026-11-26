import { displayNameFromPath, isMarkdownPath } from "../../utils/path";
import type { PaletteResult } from "./paletteResults";
import type { WorkspaceTab } from "./useTabManager";

const NOTE_ACTION_IDS = [
	"move-active-file",
	"toggle-pin-active-file",
	"copy-note-markdown",
	"duplicate-current-note",
	"export-note-docx",
] as const;
const CREATE_COMMAND_IDS = ["new-note", "open-daily-note", "create-from-template"] as const;
const NOTE_ACTION_LIMIT = 4;
const RECENT_NOTE_LIMIT = 6;
const RECENT_NOTE_LIMIT_BESIDE_NOTE_ACTIONS = 4;

interface RestingPaletteInput {
	candidates: readonly PaletteResult[];
	activePath: string | null | undefined;
	tabs: readonly WorkspaceTab[];
	t: (key: string) => string;
}

export function restingPaletteResults({ candidates, activePath, tabs, t }: RestingPaletteInput) {
	const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
	const commands = (ids: readonly string[], group: string): PaletteResult[] =>
		ids.flatMap((id) => {
			const candidate = byId.get(`command:${id}`);
			return candidate ? [{ ...candidate, group }] : [];
		});
	const noteActions =
		activePath && isMarkdownPath(activePath)
			? commands(NOTE_ACTION_IDS, displayNameFromPath(activePath)).slice(0, NOTE_ACTION_LIMIT)
			: [];
	const tabIds = new Map(
		tabs.flatMap((tab) => (tab.kind === "file" && tab.target ? [[tab.target, tab.id]] : [])),
	);
	const recentNotes = candidates
		.filter((candidate) => candidate.kind === "note")
		.slice(0, noteActions.length ? RECENT_NOTE_LIMIT_BESIDE_NOTE_ACTIONS : RECENT_NOTE_LIMIT)
		.map((note) => ({ ...note, openTabId: tabIds.get(note.target ?? "") }));
	return [
		...noteActions,
		...recentNotes,
		...commands(CREATE_COMMAND_IDS, t("commandPalette.groups.create")),
	];
}
