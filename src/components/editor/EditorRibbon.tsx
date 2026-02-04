import type { Editor } from "@tiptap/core";
import type { ReactNode } from "react";
import { memo } from "react";
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

interface EditorRibbonProps {
	editor: Editor;
	canEdit: boolean;
}

interface RibbonButtonConfig {
	title: string;
	isActive?: () => boolean;
	onClick: () => void;
	icon: ReactNode;
}

export const EditorRibbon = memo(function EditorRibbon({
	editor,
	canEdit,
}: EditorRibbonProps) {
	const focusChain = () =>
		editor.chain().focus(undefined, { scrollIntoView: false });

	const preventMouseDown = (e: React.MouseEvent) => e.preventDefault();

	const runCommand = (fn: () => void) => {
		const host = editor.view.dom.closest(
			".rfNodeNoteEditorBody",
		) as HTMLElement | null;
		const scrollTop = host?.scrollTop ?? 0;
		fn();
		if (host) {
			requestAnimationFrame(() => {
				host.scrollTop = scrollTop;
			});
		}
	};

	const insertCallout = (type: string) => {
		const snippet = `\n> [!${type.toLowerCase()}]\n> `;
		focusChain().insertContent(snippet).run();
	};

	const formatButtons: RibbonButtonConfig[] = [
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

	const headingButtons: RibbonButtonConfig[] = [
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

	const listButtons: RibbonButtonConfig[] = [
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

	const blockButtons: RibbonButtonConfig[] = [
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

	const calloutButtons = ["Note", "Info", "Tip", "Warn", "Error"];

	const renderButtons = (buttons: RibbonButtonConfig[]) =>
		buttons.map((btn) => (
			<button
				key={btn.title}
				type="button"
				className={`ribbonBtn ${btn.isActive?.() ? "active" : ""}`}
				title={btn.title}
				disabled={!canEdit}
				onMouseDown={preventMouseDown}
				onClick={() => canEdit && btn.onClick()}
			>
				{btn.icon}
			</button>
		));

	return (
		<div
			className="rfNodeNoteEditorRibbon rfNodeNoteEditorRibbonBottom nodrag nopan nowheel"
			onMouseDown={preventMouseDown}
		>
			<div className="ribbonGroup">{renderButtons(formatButtons)}</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">{renderButtons(headingButtons)}</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">{renderButtons(listButtons)}</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">{renderButtons(blockButtons)}</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">
				{calloutButtons.map((type) => (
					<button
						key={type}
						type="button"
						className="ribbonBtn"
						title={`Callout: ${type === "Warn" ? "Warning" : type}`}
						disabled={!canEdit}
						onMouseDown={preventMouseDown}
						onClick={() => canEdit && insertCallout(type)}
					>
						{type}
					</button>
				))}
			</div>
		</div>
	);
});
