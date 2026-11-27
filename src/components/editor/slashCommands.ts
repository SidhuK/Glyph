import { type Editor, Extension } from "@tiptap/core";
import type { EditorState } from "@tiptap/pm/state";
import Suggestion from "@tiptap/suggestion";
import type { MathEditRequest } from "./extensions/math/mathOptions";
import { renderSlashMenuItem } from "./slash/renderSlashMenuItem";
import { SLASH_MENU } from "./slash/slashMenuDefs";
import {
	type SlashMenuItem,
	type TemplateInsertRequest,
	localizeSlashMenuEntry,
	slashMenuItems,
} from "./slash/slashMenuItems";
import { taskSlashArgumentItem, taskSlashMenuItems } from "./slash/taskSlashCommands";
import type { TaskFieldRequest } from "./taskFields/taskFieldRequest";
import { isInTaskItem } from "./taskFields/taskItemLine";
import {
	createTipTapSuggestionMenu,
	exitTipTapSuggestion,
} from "./suggestions/tiptapSuggestionMenu";

const slashSuggestion = {
	char: "/",
	shouldShow: ({ editor }: { editor: Editor }) => editor.view.hasFocus(),
	startOfLine: false,
	allowSpaces: true,
	allow: ({ state }: { state: EditorState }) => {
		const { $from } = state.selection;
		return $from.parent.type.name === "paragraph";
	},
	render: () =>
		createTipTapSuggestionMenu<SlashMenuItem>({
			menuClassName: "slashCommandMenu",
			onEscape: exitTipTapSuggestion,
			getSubmenuItems: (item) => ("children" in item ? item.children : undefined),
			renderItem: renderSlashMenuItem,
		}),
};

interface SlashCommandOptions {
	onMathEditRequest: ((request: MathEditRequest) => void) | null;
	onTemplateInsertRequest: ((request: TemplateInsertRequest) => void) | null;
	onTaskFieldRequest: ((request: TaskFieldRequest) => void) | null;
	suggestion: typeof slashSuggestion;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
	name: "slash-command",
	addOptions() {
		return {
			onMathEditRequest: null,
			onTemplateInsertRequest: null,
			onTaskFieldRequest: null,
			suggestion: slashSuggestion,
		};
	},
	addProseMirrorPlugins() {
		const { suggestion, onMathEditRequest, onTemplateInsertRequest, onTaskFieldRequest } =
			this.options;
		const baseEntries = () =>
			SLASH_MENU.filter(
				(entry) =>
					!("id" in entry) || entry.id !== "insertTemplate" || Boolean(onTemplateInsertRequest),
			).map(localizeSlashMenuEntry);
		return [
			Suggestion({
				editor: this.editor,
				...suggestion,
				items: ({ query, editor }: { query: string; editor: Editor }) => {
					if (!onTaskFieldRequest || !isInTaskItem(editor)) {
						return slashMenuItems(baseEntries(), query);
					}
					const argumentItem = taskSlashArgumentItem(query);
					if (argumentItem) return [argumentItem];
					const [firstEntry, ...restEntries] = baseEntries();
					const sectioned = firstEntry ? [{ ...firstEntry, startsSection: true }] : [];
					return slashMenuItems([...taskSlashMenuItems(), ...sectioned, ...restEntries], query);
				},
				command: ({
					editor,
					range,
					props,
				}: {
					editor: Editor;
					range: { from: number; to: number };
					props: SlashMenuItem;
				}) => {
					if ("children" in props) return;
					props.command({
						editor,
						range,
						onMathEditRequest: onMathEditRequest ?? undefined,
						onTemplateInsertRequest: onTemplateInsertRequest ?? undefined,
						onTaskFieldRequest: onTaskFieldRequest ?? undefined,
					});
				},
			}),
		];
	},
});
