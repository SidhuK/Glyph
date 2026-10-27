import type { Editor } from "@tiptap/core";
import type { ReactNode } from "react";
import { i18n } from "../../i18n";
import { Bold, Heading1, Heading2, Heading3, Italic, Strikethrough, Underline } from "../Icons";
import { type EditorActionId, executeEditorAction } from "./editorActions";
import {
	EDITOR_TEXT_COLORS,
	type EditorTextColor,
	getEditorTextColorLabel,
	isEditorTextColor,
} from "./textColors";
import {
	EDITOR_TEXT_HIGHLIGHTS,
	type EditorTextHighlight,
	getEditorTextHighlightLabel,
	isEditorTextHighlight,
} from "./textHighlights";

export interface RibbonButtonConfig {
	title: string;
	isActive?: () => boolean;
	onClick: () => void;
	icon: ReactNode;
}

export interface RibbonSwatchGroup {
	title: string;
	activeId: string | null;
	options: {
		id: string;
		label: string;
		cssVar: string;
		fallbackHex: string;
		onSelect: () => void;
	}[];
	onClear: () => void;
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

export function getActiveTextColor(editor: Editor): EditorTextColor | null {
	const color: unknown = editor.getAttributes("coloredText").color;
	return typeof color === "string" && isEditorTextColor(color) ? color : null;
}

export function getActiveTextHighlight(editor: Editor): EditorTextHighlight | null {
	const color: unknown = editor.getAttributes("highlightedText").color;
	return typeof color === "string" && isEditorTextHighlight(color) ? color : null;
}

export function getTextColorButton(
	editor: Editor,
	runCommand: RunCommand,
	focusChain: FocusChain,
): RibbonSwatchGroup {
	return {
		title: i18n.t("editor:ribbon.textColor"),
		activeId: getActiveTextColor(editor),
		options: EDITOR_TEXT_COLORS.map((option) => ({
			id: option.id,
			label: getEditorTextColorLabel(option.id),
			cssVar: option.cssVar,
			fallbackHex: option.fallbackHex,
			onSelect: runEditorAction(`color_${option.id}`, editor, runCommand, focusChain),
		})),
		onClear: runEditorAction("color_clear", editor, runCommand, focusChain),
	};
}

export function getTextHighlightButton(
	editor: Editor,
	runCommand: RunCommand,
	focusChain: FocusChain,
): RibbonSwatchGroup {
	return {
		title: i18n.t("editor:ribbon.textHighlight"),
		activeId: getActiveTextHighlight(editor),
		options: EDITOR_TEXT_HIGHLIGHTS.map((option) => ({
			id: option.id,
			label: getEditorTextHighlightLabel(option.id),
			// The swatch previews the tint the highlight actually applies.
			cssVar: option.backgroundCssVar,
			fallbackHex: option.backgroundFallback,
			onSelect: runEditorAction(`highlight_${option.id}`, editor, runCommand, focusChain),
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
