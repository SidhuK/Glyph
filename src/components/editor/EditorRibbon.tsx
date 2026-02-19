import type { Editor } from "@tiptap/core";
import { m } from "motion/react";
import { memo } from "react";
import { springPresets } from "../ui/animations";
import { RibbonLinkPopover } from "./RibbonLinkPopover";
import {
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

interface RibbonButtonListProps {
	buttons: RibbonButtonConfig[];
	canEdit: boolean;
	onPreventMouseDown: (e: React.MouseEvent) => void;
}

const RibbonButtonList = memo(function RibbonButtonList({
	buttons,
	canEdit,
	onPreventMouseDown,
}: RibbonButtonListProps) {
	return buttons.map((btn) => (
		<m.button
			key={btn.title}
			type="button"
			className={`ribbonBtn ${btn.isActive?.() ? "active" : ""}`}
			title={btn.title}
			disabled={!canEdit}
			onMouseDown={onPreventMouseDown}
			onClick={() => canEdit && btn.onClick()}
			whileTap={{ scale: 0.92 }}
			transition={springPresets.snappy}
		>
			{btn.icon}
		</m.button>
	));
});

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

	return (
		<div className="rfNodeNoteEditorRibbon rfNodeNoteEditorRibbonBottom nodrag nopan nowheel">
			<div className="ribbonGroup">
				<RibbonButtonList
					buttons={getFormatButtons(editor, runCommand, focusChain)}
					canEdit={canEdit}
					onPreventMouseDown={preventMouseDown}
				/>
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
				<RibbonButtonList
					buttons={getHeadingButtons(editor, runCommand, focusChain)}
					canEdit={canEdit}
					onPreventMouseDown={preventMouseDown}
				/>
			</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">
				<RibbonButtonList
					buttons={getListButtons(editor, runCommand, focusChain)}
					canEdit={canEdit}
					onPreventMouseDown={preventMouseDown}
				/>
			</div>
			<span className="ribbonDivider" />
			<div className="ribbonGroup">
				<RibbonButtonList
					buttons={getBlockButtons(editor, runCommand, focusChain)}
					canEdit={canEdit}
					onPreventMouseDown={preventMouseDown}
				/>
			</div>
		</div>
	);
});
