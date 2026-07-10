import {
	CodeIcon,
	EyeIcon,
	PencilEdit02Icon,
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
		mode: "rich" as const,
		icon: PencilEdit02Icon,
	},
	{
		id: "switch-to-preview",
		mode: "preview" as const,
		icon: EyeIcon,
	},
	{
		id: "switch-to-raw",
		mode: "plain" as const,
		icon: CodeIcon,
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
		enabled,
		allowInEditable: true,
		action: () => dispatchEditorMenuAction({ action: action.id }),
	}));

	const headingCommands: Command[] = [
		{
			id: "collapse_all_headings",
			icon: <ChevronUp size="var(--icon-lg)" />,
			enabled: enabled && showCollapsibleHeadings,
			allowInEditable: true,
			action: () =>
				dispatchEditorMenuAction({ action: "collapse_all_headings" }),
		},
		{
			id: "expand_all_headings",
			icon: <ChevronDown size="var(--icon-lg)" />,
			enabled: enabled && showCollapsibleHeadings,
			allowInEditable: true,
			action: () => dispatchEditorMenuAction({ action: "expand_all_headings" }),
		},
	];

	const viewModeCommands: Command[] = VIEW_MODE_COMMANDS.map((command) => ({
		id: command.id,
		icon: (
			<HugeiconsIcon
				icon={command.icon}
				size="var(--icon-lg)"
				strokeWidth={0.9}
			/>
		),
		enabled,
		allowInEditable: true,
		action: () => {
			setCurrentEditorMode(command.mode);
		},
	}));

	return [...formattingCommands, ...headingCommands, ...viewModeCommands];
}
