import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	CodeIcon,
	EyeIcon,
	PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { dispatchEditorMenuAction } from "../../lib/appEvents";
import type { EditorViewMode } from "../../lib/editorMode";
import { ChevronDown, ChevronUp } from "../Icons";
import { EDITOR_ACTIONS } from "../editor/editorActions";
import type { Command } from "./commandPaletteHelpers";

interface BuildEditorCommandsOptions {
	activeMarkdownTabPath: string | null;
	aiEnabled: boolean;
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
	aiEnabled,
	setCurrentEditorMode,
	showCollapsibleHeadings,
}: BuildEditorCommandsOptions): Command[] {
	const enabled = Boolean(activeMarkdownTabPath);
	const formattingCommands = EDITOR_ACTIONS.filter(
		(action) =>
			action !== "collapse_all_headings" &&
			action !== "expand_all_headings" &&
			(aiEnabled || action !== "ai_selection_to_context"),
	).map((action) => ({
		id: action,
		enabled,
		allowInEditable: true,
		action: () => dispatchEditorMenuAction({ action }),
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
		icon: <HugeiconsIcon icon={command.icon} size="var(--icon-lg)" />,
		enabled,
		allowInEditable: true,
		action: () => {
			setCurrentEditorMode(command.mode);
		},
	}));

	return [...formattingCommands, ...headingCommands, ...viewModeCommands];
}
