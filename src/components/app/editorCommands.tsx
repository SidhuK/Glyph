import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	Alert02Icon,
	Bold,
	BulbIcon,
	CancelCircleIcon,
	CheckmarkCircle02Icon,
	CodeIcon,
	EraserIcon,
	EyeIcon,
	FlowchartIcon,
	Heading1,
	Heading2,
	Heading3,
	HighlighterIcon,
	InformationCircleIcon,
	Italic,
	LeftToRightBlockQuoteIcon,
	LeftToRightListBulletIcon,
	LeftToRightListNumberIcon,
	Link01Icon,
	ListChecks,
	ListChevronsDownUpIcon,
	NoteAddIcon,
	PencilEdit02Icon,
	SeparatorHorizontalIcon,
	SourceCodeIcon,
	SparklesIcon,
	Strikethrough,
	TableIcon,
	TextClearIcon,
	TextColorIcon,
	TextUnderlineIcon,
	UnfoldLessIcon,
	UnfoldMoreIcon,
	Unlink01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { dispatchEditorMenuAction } from "../../lib/appEvents";
import type { EditorViewMode } from "../../lib/editorMode";
import { EDITOR_ACTIONS, type EditorActionId } from "../editor/editorActions";
import type { Command } from "./commandPaletteHelpers";

interface BuildEditorCommandsOptions {
	activeMarkdownTabPath: string | null;
	aiEnabled: boolean;
	setCurrentEditorMode: (mode: EditorViewMode) => boolean;
	showCollapsibleHeadings: boolean;
	showCollapsibleLists: boolean;
}

/** Same glyphs as the format bar and slash menu, so a command looks the same everywhere. */
const EDITOR_ACTION_ICONS: Partial<Record<EditorActionId, IconSvgElement>> = {
	ai_selection_to_context: SparklesIcon,
	bold: Bold,
	italic: Italic,
	underline: TextUnderlineIcon,
	strikethrough: Strikethrough,
	heading_1: Heading1,
	heading_2: Heading2,
	heading_3: Heading3,
	collapse_all_headings: UnfoldLessIcon,
	expand_all_headings: UnfoldMoreIcon,
	toggle_heading_or_list_collapse: ListChevronsDownUpIcon,
	bullet_list: LeftToRightListBulletIcon,
	numbered_list: LeftToRightListNumberIcon,
	todo_list: ListChecks,
	quote: LeftToRightBlockQuoteIcon,
	code_block: SourceCodeIcon,
	mermaid_chart: FlowchartIcon,
	table: TableIcon,
	divider: SeparatorHorizontalIcon,
	details_block: ListChevronsDownUpIcon,
	callout_info: InformationCircleIcon,
	callout_warning: Alert02Icon,
	callout_error: CancelCircleIcon,
	callout_success: CheckmarkCircle02Icon,
	callout_tip: BulbIcon,
	link_set: Link01Icon,
	link_clear: Unlink01Icon,
	extract_selection_to_note: NoteAddIcon,
	color_clear: TextClearIcon,
	highlight_clear: EraserIcon,
};

function editorActionIcon(action: EditorActionId): IconSvgElement {
	const icon = EDITOR_ACTION_ICONS[action];
	if (icon) return icon;
	return action.startsWith("highlight_") ? HighlighterIcon : TextColorIcon;
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
	showCollapsibleLists,
}: BuildEditorCommandsOptions): Command[] {
	const enabled = Boolean(activeMarkdownTabPath);
	const editorActionCommands = EDITOR_ACTIONS.filter(
		(action) => aiEnabled || action !== "ai_selection_to_context",
	).map((action) => ({
		id: action,
		icon: <HugeiconsIcon icon={editorActionIcon(action)} size="var(--icon-lg)" />,
		enabled:
			enabled &&
			(action === "collapse_all_headings" || action === "expand_all_headings"
				? showCollapsibleHeadings
				: action !== "toggle_heading_or_list_collapse" ||
					showCollapsibleHeadings ||
					showCollapsibleLists),
		allowInEditable: true,
		action: () => dispatchEditorMenuAction({ action }),
	}));

	const viewModeCommands: Command[] = VIEW_MODE_COMMANDS.map((command) => ({
		id: command.id,
		icon: <HugeiconsIcon icon={command.icon} size="var(--icon-lg)" />,
		enabled,
		allowInEditable: true,
		action: () => {
			setCurrentEditorMode(command.mode);
		},
	}));

	return [...editorActionCommands, ...viewModeCommands];
}
