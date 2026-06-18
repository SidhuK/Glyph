import {
	MessagePreview02Icon,
	PencilEdit02Icon,
	Raw02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { dispatchEditorMenuAction } from "../../lib/appEvents";
import type { EditorViewMode } from "../../lib/editorMode";
import { ChevronDown, ChevronUp } from "../Icons";
import { EDITOR_ACTIONS } from "../editor/editorActions";
import type { Command } from "./commandPaletteHelpers";

interface BuildEditorCommandsOptions {
	activeMarkdownTabPath: string | null;
	setCurrentEditorMode: (mode: EditorViewMode) => boolean;
	showCollapsibleHeadings: boolean;
}

const VIEW_MODE_COMMANDS = [
	{
		id: "switch-to-edit",
		label: "Rich Mode",
		mode: "rich",
		icon: PencilEdit02Icon,
	},
	{
		id: "switch-to-preview",
		label: "Preview Mode",
		mode: "preview",
		icon: MessagePreview02Icon,
	},
	{
		id: "switch-to-raw",
		label: "Raw Mode",
		mode: "plain",
		icon: Raw02Icon,
	},
] as const;

export function buildEditorCommands({
	activeMarkdownTabPath,
	setCurrentEditorMode,
	showCollapsibleHeadings,
}: BuildEditorCommandsOptions): Command[] {
	const enabled = Boolean(activeMarkdownTabPath);
	const formattingCommands = EDITOR_ACTIONS.filter(
		(action) =>
			action.id !== "collapse_all_headings" &&
			action.id !== "expand_all_headings",
	).map((action) => ({
		id: action.id,
		label: action.label,
		category: "Editor",
		enabled,
		allowInEditable: true,
		action: () => dispatchEditorMenuAction({ action: action.id }),
	}));

	const headingCommands: Command[] = [
		{
			id: "collapse_all_headings",
			label: "Collapse all headings",
			icon: <ChevronUp size="var(--icon-lg)" />,
			category: "Editor",
			enabled: enabled && showCollapsibleHeadings,
			allowInEditable: true,
			action: () =>
				dispatchEditorMenuAction({ action: "collapse_all_headings" }),
		},
		{
			id: "expand_all_headings",
			label: "Expand all headings",
			icon: <ChevronDown size="var(--icon-lg)" />,
			category: "Editor",
			enabled: enabled && showCollapsibleHeadings,
			allowInEditable: true,
			action: () => dispatchEditorMenuAction({ action: "expand_all_headings" }),
		},
	];

	const viewModeCommands: Command[] = VIEW_MODE_COMMANDS.map((command) => ({
		id: command.id,
		label: command.label,
		icon: (
			<HugeiconsIcon
				icon={command.icon}
				size="var(--icon-lg)"
				strokeWidth={0.9}
			/>
		),
		category: "Editor",
		enabled,
		allowInEditable: true,
		action: () => {
			setCurrentEditorMode(command.mode);
		},
	}));

	return [...formattingCommands, ...headingCommands, ...viewModeCommands];
}
