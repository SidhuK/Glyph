import { NoteAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Editor } from "@tiptap/core";
import { m } from "motion/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { springPresets } from "../ui/animations";
import { RibbonColorPopover } from "./RibbonColorPopover";
import { RibbonHighlightPopover } from "./RibbonHighlightPopover";
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
	className?: string;
	onExtractSelectionToNote?: () => void;
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
			aria-label={btn.title}
			disabled={!canEdit}
			onMouseDown={onPreventMouseDown}
			onClick={() => canEdit && btn.onClick()}
			whileTap={canEdit ? { scale: 0.97 } : undefined}
			transition={springPresets.snappy}
		>
			{btn.icon}
		</m.button>
	));
});

export const EditorRibbon = memo(function EditorRibbon({
	editor,
	canEdit,
	className,
	onExtractSelectionToNote,
}: EditorRibbonProps) {
	const { t } = useTranslation("editor");
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
		<div className="rfNodeNoteEditorRibbonAnchor">
			<m.div
				className={["rfNodeNoteEditorRibbon nodrag nopan nowheel", className]
					.filter(Boolean)
					.join(" ")}
				initial={{ opacity: 0, scale: 0.96, y: 4, filter: "blur(2px)" }}
				animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
				exit={{ opacity: 0, scale: 0.98, y: 3, filter: "blur(1px)" }}
				transition={springPresets.gentle}
			>
				<div className="ribbonGroup ribbonGroupUnified">
					<RibbonButtonList
						buttons={getFormatButtons(editor, runCommand, focusChain)}
						canEdit={canEdit}
						onPreventMouseDown={preventMouseDown}
					/>
					<span className="ribbonDivider" />
					<RibbonColorPopover
						editor={editor}
						canEdit={canEdit}
						runCommand={runCommand}
						focusChain={focusChain}
						preventMouseDown={preventMouseDown}
					/>
					<RibbonHighlightPopover
						editor={editor}
						canEdit={canEdit}
						runCommand={runCommand}
						focusChain={focusChain}
						preventMouseDown={preventMouseDown}
					/>
					<RibbonLinkPopover
						editor={editor}
						canEdit={canEdit}
						runCommand={runCommand}
						focusChain={focusChain}
						preventMouseDown={preventMouseDown}
					/>
					{onExtractSelectionToNote ? (
						<m.button
							type="button"
							className="ribbonBtn"
							title={t("ribbon.extractToNote")}
							aria-label={t("ribbon.extractToNote")}
							disabled={!canEdit}
							onMouseDown={preventMouseDown}
							onClick={() => canEdit && onExtractSelectionToNote()}
							whileTap={canEdit ? { scale: 0.97 } : undefined}
							transition={springPresets.snappy}
						>
							<HugeiconsIcon
								icon={NoteAddIcon}
								size="var(--icon-lg)"
								strokeWidth={0.9}
							/>
						</m.button>
					) : null}
					<span className="ribbonDivider" />
					<RibbonButtonList
						buttons={getHeadingButtons(editor, runCommand, focusChain)}
						canEdit={canEdit}
						onPreventMouseDown={preventMouseDown}
					/>
					<span className="ribbonDivider" />
					<RibbonButtonList
						buttons={getListButtons(editor, runCommand, focusChain)}
						canEdit={canEdit}
						onPreventMouseDown={preventMouseDown}
					/>
					<RibbonButtonList
						buttons={getBlockButtons(editor, runCommand, focusChain)}
						canEdit={canEdit}
						onPreventMouseDown={preventMouseDown}
					/>
				</div>
			</m.div>
		</div>
	);
});
