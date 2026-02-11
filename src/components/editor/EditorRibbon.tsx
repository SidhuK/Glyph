import type { Editor } from "@tiptap/core";
import { motion } from "motion/react";
import type { ReactNode } from "react";
import { memo, useEffect, useState } from "react";
import {
	Bold,
	Code,
	Heading1,
	Heading2,
	Heading3,
	Italic,
	Link2,
	List,
	ListChecks,
	ListOrdered,
	Quote,
	Strikethrough,
	X,
} from "../Icons";
import { springPresets } from "../ui/animations";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";

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
	const [linkOpen, setLinkOpen] = useState(false);
	const [linkHref, setLinkHref] = useState("");
	const [linkTarget, setLinkTarget] = useState<"_self" | "_blank">("_self");

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
		const normalizedType =
			type.toLowerCase() === "warn" ? "warning" : type.toLowerCase();
		runCommand(() =>
			focusChain()
				.insertContent({
					type: "blockquote",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: `[!${normalizedType}]` }],
						},
						{
							type: "paragraph",
						},
					],
				})
				.run(),
		);
	};

	useEffect(() => {
		if (!linkOpen) return;
		const linkAttrs = editor.getAttributes("link") as {
			href?: string;
			target?: string;
		};
		setLinkHref(linkAttrs.href ?? "");
		setLinkTarget(linkAttrs.target === "_blank" ? "_blank" : "_self");
	}, [editor, linkOpen]);

	const normalizeHref = (value: string): string => {
		const trimmed = value.trim();
		if (!trimmed) return "";
		if (
			trimmed.startsWith("http://") ||
			trimmed.startsWith("https://") ||
			trimmed.startsWith("mailto:") ||
			trimmed.startsWith("tel:") ||
			trimmed.startsWith("#") ||
			trimmed.startsWith("/")
		) {
			return trimmed;
		}
		return `https://${trimmed}`;
	};

	const applyLink = () => {
		const href = normalizeHref(linkHref);
		if (!href) {
			runCommand(() => focusChain().unsetLink().run());
			setLinkOpen(false);
			return;
		}
		runCommand(() =>
			focusChain()
				.extendMarkRange("link")
				.setLink({
					href,
					target: linkTarget,
					rel: linkTarget === "_blank" ? "noopener noreferrer" : undefined,
				})
				.run(),
		);
		setLinkOpen(false);
	};

	const removeLink = () => {
		runCommand(() => focusChain().unsetLink().run());
		setLinkOpen(false);
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
			<motion.button
				key={btn.title}
				type="button"
				className={`ribbonBtn ${btn.isActive?.() ? "active" : ""}`}
				title={btn.title}
				disabled={!canEdit}
				onMouseDown={preventMouseDown}
				onClick={() => canEdit && btn.onClick()}
				whileTap={{ scale: 0.92 }}
				transition={springPresets.snappy}
			>
				{btn.icon}
			</motion.button>
		));

	return (
		<div
			className="rfNodeNoteEditorRibbon rfNodeNoteEditorRibbonBottom nodrag nopan nowheel"
			onMouseDown={preventMouseDown}
		>
			<div className="ribbonGroup">{renderButtons(formatButtons)}</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">
				<Popover open={linkOpen} onOpenChange={setLinkOpen}>
					<PopoverTrigger asChild>
						<motion.button
							type="button"
							className={`ribbonBtn ${editor.isActive("link") ? "active" : ""}`}
							title="Link"
							disabled={!canEdit}
							onMouseDown={preventMouseDown}
							onClick={() => canEdit && setLinkOpen(true)}
							whileTap={{ scale: 0.92 }}
							transition={springPresets.snappy}
						>
							<Link2 size={14} />
						</motion.button>
					</PopoverTrigger>
					<PopoverContent
						className="editorLinkPopover"
						align="start"
						side="top"
						onOpenAutoFocus={(event) => event.preventDefault()}
					>
						<div className="editorLinkPopoverRow">
							<Input
								value={linkHref}
								onChange={(event) => setLinkHref(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										applyLink();
									}
								}}
								placeholder="https://example.com"
								aria-label="Link URL"
							/>
						</div>
						<label className="editorLinkPopoverCheckbox">
							<input
								type="checkbox"
								checked={linkTarget === "_blank"}
								onChange={(event) =>
									setLinkTarget(event.target.checked ? "_blank" : "_self")
								}
							/>
							<span>Open in new tab</span>
						</label>
						<div className="editorLinkPopoverActions">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onClick={removeLink}
							>
								<X size={14} />
								Remove
							</Button>
							<Button type="button" size="sm" onClick={applyLink}>
								Apply
							</Button>
						</div>
					</PopoverContent>
				</Popover>
			</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">{renderButtons(headingButtons)}</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">{renderButtons(listButtons)}</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">{renderButtons(blockButtons)}</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">
				{calloutButtons.map((type) => (
					<motion.button
						key={type}
						type="button"
						className="ribbonBtn"
						title={`Callout: ${type === "Warn" ? "Warning" : type}`}
						disabled={!canEdit}
						onMouseDown={preventMouseDown}
						onClick={() => canEdit && insertCallout(type)}
						whileTap={{ scale: 0.92 }}
						transition={springPresets.snappy}
					>
						{type}
					</motion.button>
				))}
			</div>
		</div>
	);
});
