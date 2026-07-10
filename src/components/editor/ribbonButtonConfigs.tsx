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

export function getFormatButtons(
	editor: Editor,
	runCommand: RunCommand,
	focusChain: FocusChain,
): RibbonButtonConfig[] {
	return [
		{
			title: i18n.t("editor:ribbon.bold"),
			isActive: () => editor.isActive("bold"),
			onClick: () => runCommand(() => focusChain().toggleBold().run()),
			icon: <Bold size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.italic"),
			isActive: () => editor.isActive("italic"),
			onClick: () => runCommand(() => focusChain().toggleItalic().run()),
			icon: <Italic size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.underline"),
			isActive: () => editor.isActive("underline"),
			onClick: () => runCommand(() => focusChain().toggleUnderline().run()),
			icon: <Underline size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.strikethrough"),
			isActive: () => editor.isActive("strike"),
			onClick: () => runCommand(() => focusChain().toggleStrike().run()),
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
			onSelect: () =>
				runCommand(() => focusChain().setTextColor(option.id).run()),
		})),
		onClear: () => runCommand(() => focusChain().unsetTextColor().run()),
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
			onSelect: () =>
				runCommand(() => focusChain().setTextHighlight(option.id).run()),
		})),
		onClear: () => runCommand(() => focusChain().unsetTextHighlight().run()),
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
			onClick: () =>
				runCommand(() => focusChain().toggleHeading({ level: 1 }).run()),
			icon: <Heading1 size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.heading2"),
			isActive: () => editor.isActive("heading", { level: 2 }),
			onClick: () =>
				runCommand(() => focusChain().toggleHeading({ level: 2 }).run()),
			icon: <Heading2 size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.heading3"),
			isActive: () => editor.isActive("heading", { level: 3 }),
			onClick: () =>
				runCommand(() => focusChain().toggleHeading({ level: 3 }).run()),
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
			onClick: () => runCommand(() => focusChain().toggleBulletList().run()),
			icon: <List size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.numberedList"),
			isActive: () => editor.isActive("orderedList"),
			onClick: () => runCommand(() => focusChain().toggleOrderedList().run()),
			icon: <ListOrdered size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.taskList"),
			isActive: () => editor.isActive("taskList"),
			onClick: () => runCommand(() => focusChain().toggleTaskList().run()),
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
			onClick: () => runCommand(() => focusChain().toggleBlockquote().run()),
			icon: <Quote size="var(--icon-md)" />,
		},
		{
			title: i18n.t("editor:ribbon.codeBlock"),
			isActive: () => editor.isActive("codeBlock"),
			onClick: () => runCommand(() => focusChain().toggleCodeBlock().run()),
			icon: <Code size="var(--icon-md)" />,
		},
	];
}
