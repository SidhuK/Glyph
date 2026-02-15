import type { Editor } from "@tiptap/core";
import type { ReactNode } from "react";
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
} from "../Icons";

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
			title: "Bold",
			isActive: () => editor.isActive("bold"),
			onClick: () => runCommand(() => focusChain().toggleBold().run()),
			icon: <Bold size={14} />,
		},
		{
			title: "Italic",
			isActive: () => editor.isActive("italic"),
			onClick: () => runCommand(() => focusChain().toggleItalic().run()),
			icon: <Italic size={14} />,
		},
		{
			title: "Underline",
			isActive: () => editor.isActive("underline"),
			onClick: () => runCommand(() => focusChain().toggleUnderline().run()),
			icon: <span className="ribbonText">U</span>,
		},
		{
			title: "Strikethrough",
			isActive: () => editor.isActive("strike"),
			onClick: () => runCommand(() => focusChain().toggleStrike().run()),
			icon: <Strikethrough size={14} />,
		},
	];
}

export function getHeadingButtons(
	editor: Editor,
	runCommand: RunCommand,
	focusChain: FocusChain,
): RibbonButtonConfig[] {
	return [
		{
			title: "Heading 1",
			isActive: () => editor.isActive("heading", { level: 1 }),
			onClick: () =>
				runCommand(() => focusChain().toggleHeading({ level: 1 }).run()),
			icon: <Heading1 size={14} />,
		},
		{
			title: "Heading 2",
			isActive: () => editor.isActive("heading", { level: 2 }),
			onClick: () =>
				runCommand(() => focusChain().toggleHeading({ level: 2 }).run()),
			icon: <Heading2 size={14} />,
		},
		{
			title: "Heading 3",
			isActive: () => editor.isActive("heading", { level: 3 }),
			onClick: () =>
				runCommand(() => focusChain().toggleHeading({ level: 3 }).run()),
			icon: <Heading3 size={14} />,
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
			title: "Bullet list",
			isActive: () => editor.isActive("bulletList"),
			onClick: () => runCommand(() => focusChain().toggleBulletList().run()),
			icon: <List size={14} />,
		},
		{
			title: "Numbered list",
			isActive: () => editor.isActive("orderedList"),
			onClick: () => runCommand(() => focusChain().toggleOrderedList().run()),
			icon: <ListOrdered size={14} />,
		},
		{
			title: "Task list",
			isActive: () => editor.isActive("taskList"),
			onClick: () => runCommand(() => focusChain().toggleTaskList().run()),
			icon: <ListChecks size={14} />,
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
			title: "Quote",
			isActive: () => editor.isActive("blockquote"),
			onClick: () => runCommand(() => focusChain().toggleBlockquote().run()),
			icon: <Quote size={14} />,
		},
		{
			title: "Code block",
			isActive: () => editor.isActive("codeBlock"),
			onClick: () => runCommand(() => focusChain().toggleCodeBlock().run()),
			icon: <Code size={14} />,
		},
	];
}

export const CALLOUT_TYPES = ["Note", "Info", "Tip", "Warn", "Error"];
