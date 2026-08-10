import type { Editor } from "@tiptap/core";
import type { ReactNode } from "react";
import { i18n } from "../../i18n";
import {
	Bold,
	Code,
	Heading1,
	Heading2,
	Heading3,
	Italic,
	List,
	ListChecks,
	ListOrdered,
	Quote,
	Strikethrough,
	Underline,
} from "../Icons";
import { type EditorActionId, executeEditorAction } from "./editorActions";
import {
	EDITOR_TEXT_COLORS,
	type EditorTextColor,
	getEditorTextColorLabel,
	getEditorTextColorOption,
	isEditorTextColor,
} from "./textColors";
import {
	EDITOR_TEXT_HIGHLIGHTS,
	type EditorTextHighlight,
	getEditorTextHighlightLabel,
	getEditorTextHighlightOption,
	isEditorTextHighlight,
} from "./textHighlights";

export interface RibbonButtonConfig {
	title: string;
	isActive?: () => boolean;
	onClick: () => void;
	icon: ReactNode;
}

type RunCommand = (fn: () => void) => void;
type FocusChain = () => ReturnType<Editor["chain"]>;

function runEditorAction(
	action: EditorActionId,
	editor: Editor,
	runCommand: RunCommand,
	focusChain: FocusChain,
) {
	return () =>
		runCommand(() => {
			executeEditorAction({
				action,
				editor,
				chain: focusChain(),
			});
		});
}

export function getFormatButtons(
	editor: Editor,
	runCommand: RunCommand,
	focusChain: FocusChain,
): RibbonButtonConfig[] {
	return [
		{
			title: i18n.t("editor:ribbon.bold"),
			isActive: () => editor.isActive("bold"),
			onClick: runEditorAction("bold", editor, runCommand, focusChain),
			icon: <Bold size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.italic"),
			isActive: () => editor.isActive("italic"),
			onClick: runEditorAction("italic", editor, runCommand, focusChain),
			icon: <Italic size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.underline"),
			isActive: () => editor.isActive("underline"),
			onClick: runEditorAction("underline", editor, runCommand, focusChain),
			icon: <Underline size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.strikethrough"),
			isActive: () => editor.isActive("strike"),
			onClick: runEditorAction("strikethrough", editor, runCommand, focusChain),
			icon: <Strikethrough size="var(--icon-md)" />,
		},
	];
}

export function getTextColorButton(
	editor: Editor,
	runCommand: RunCommand,
	focusChain: FocusChain,
) {
	const activeColor = editor.getAttributes("coloredText").color as
		| EditorTextColor
		| undefined;
	const activeOption =
		activeColor && isEditorTextColor(activeColor)
			? getEditorTextColorOption(activeColor)
			: null;

	return {
		title: i18n.t("editor:ribbon.textColor"),
		isActive: () => editor.isActive("coloredText"),
		activeColor: activeOption?.id ?? null,
		options: EDITOR_TEXT_COLORS.map((option) => ({
			id: option.id,
			label: getEditorTextColorLabel(option.id),
			cssVar: option.cssVar,
			fallbackHex: option.fallbackHex,
			onSelect: runEditorAction(
				`color_${option.id}`,
				editor,
				runCommand,
				focusChain,
			),
		})),
		onClear: runEditorAction("color_clear", editor, runCommand, focusChain),
	};
}

export function getTextHighlightButton(
	editor: Editor,
	runCommand: RunCommand,
	focusChain: FocusChain,
) {
	const activeHighlight = editor.getAttributes("highlightedText").color as
		| EditorTextHighlight
		| undefined;
	const activeOption =
		activeHighlight && isEditorTextHighlight(activeHighlight)
			? getEditorTextHighlightOption(activeHighlight)
			: null;

	return {
		title: i18n.t("editor:ribbon.textHighlight"),
		isActive: () => editor.isActive("highlightedText"),
		activeHighlight: activeOption?.id ?? null,
		options: EDITOR_TEXT_HIGHLIGHTS.map((option) => ({
			id: option.id,
			label: getEditorTextHighlightLabel(option.id),
			swatchCssVar: option.swatchCssVar,
			swatchFallback: option.swatchFallback,
			onSelect: runEditorAction(
				`highlight_${option.id}`,
				editor,
				runCommand,
				focusChain,
			),
		})),
		onClear: runEditorAction("highlight_clear", editor, runCommand, focusChain),
	};
}

export function getHeadingButtons(
	editor: Editor,
	runCommand: RunCommand,
	focusChain: FocusChain,
): RibbonButtonConfig[] {
	return [
		{
			title: i18n.t("editor:ribbon.heading1"),
			isActive: () => editor.isActive("heading", { level: 1 }),
			onClick: runEditorAction("heading_1", editor, runCommand, focusChain),
			icon: <Heading1 size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.heading2"),
			isActive: () => editor.isActive("heading", { level: 2 }),
			onClick: runEditorAction("heading_2", editor, runCommand, focusChain),
			icon: <Heading2 size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.heading3"),
			isActive: () => editor.isActive("heading", { level: 3 }),
			onClick: runEditorAction("heading_3", editor, runCommand, focusChain),
			icon: <Heading3 size="var(--icon-md)" />,
		},
	];
}

export function getListButtons(
	editor: Editor,
	runCommand: RunCommand,
	focusChain: FocusChain,
): RibbonButtonConfig[] {
	return [
		{
			title: i18n.t("editor:ribbon.bulletList"),
			isActive: () => editor.isActive("bulletList"),
			onClick: runEditorAction("bullet_list", editor, runCommand, focusChain),
			icon: <List size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.numberedList"),
			isActive: () => editor.isActive("orderedList"),
			onClick: runEditorAction("numbered_list", editor, runCommand, focusChain),
			icon: <ListOrdered size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.taskList"),
			isActive: () => editor.isActive("taskList"),
			onClick: runEditorAction("todo_list", editor, runCommand, focusChain),
			icon: <ListChecks size="var(--icon-md)" />,
		},
	];
}

export function getBlockButtons(
	editor: Editor,
	runCommand: RunCommand,
	focusChain: FocusChain,
): RibbonButtonConfig[] {
	return [
		{
			title: i18n.t("editor:ribbon.quote"),
			isActive: () => editor.isActive("blockquote"),
			onClick: runEditorAction("quote", editor, runCommand, focusChain),
			icon: <Quote size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.codeBlock"),
			isActive: () => editor.isActive("codeBlock"),
			onClick: runEditorAction("code_block", editor, runCommand, focusChain),
			icon: <Code size="var(--icon-md)" />,
		},
	];
}
