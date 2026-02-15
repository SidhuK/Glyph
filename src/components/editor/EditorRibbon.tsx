import type { Editor } from "@tiptap/core";
import { motion } from "motion/react";
import { memo } from "react";
import { springPresets } from "../ui/animations";
import { RibbonLinkPopover } from "./RibbonLinkPopover";
import {
	CALLOUT_TYPES,
	type RibbonButtonConfig,
	getBlockButtons,
	getFormatButtons,
	getHeadingButtons,
	getListButtons,
} from "./ribbonButtonConfigs";

interface EditorRibbonProps {
	editor: Editor;
	canEdit: boolean;
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
						{ type: "paragraph" },
					],
				})
				.run(),
		);
	};

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
			<div className="ribbonGroup">
				{renderButtons(getFormatButtons(editor, runCommand, focusChain))}
			</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">
				<RibbonLinkPopover
					editor={editor}
					canEdit={canEdit}
					runCommand={runCommand}
					focusChain={focusChain}
					preventMouseDown={preventMouseDown}
				/>
			</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">
				{renderButtons(getHeadingButtons(editor, runCommand, focusChain))}
			</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">
				{renderButtons(getListButtons(editor, runCommand, focusChain))}
			</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">
				{renderButtons(getBlockButtons(editor, runCommand, focusChain))}
			</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">
				{CALLOUT_TYPES.map((type) => (
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
