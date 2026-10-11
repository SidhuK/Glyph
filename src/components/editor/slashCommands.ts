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
import {
	createTipTapSuggestionMenu,
	exitTipTapSuggestion,
} from "./suggestions/tiptapSuggestionMenu";

export const SlashCommand = Extension.create({
	name: "slash-command",
	addOptions() {
		return {
			onMathEditRequest: null as ((request: MathEditRequest) => void) | null,
			onTemplateInsertRequest: null as ((request: TemplateInsertRequest) => void) | null,
			suggestion: {
				char: "/",
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
			},
		};
	},
	addProseMirrorPlugins() {
		const { suggestion, onMathEditRequest, onTemplateInsertRequest } = this.options;
		return [
			Suggestion({
				editor: this.editor,
				...suggestion,
				items: ({ query }: { query: string }) =>
					slashMenuItems(
						SLASH_MENU.filter(
							(entry) =>
								!("id" in entry) ||
								entry.id !== "insertTemplate" ||
								Boolean(onTemplateInsertRequest),
						).map(localizeSlashMenuEntry),
						query,
					),
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
					});
				},
			}),
		];
	},
});
