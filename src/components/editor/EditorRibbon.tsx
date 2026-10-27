import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { SquareArrowUpRightIcon } from "@hugeicons/core-free-icons";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { RibbonColorPopover } from "./RibbonColorPopover";
import { RibbonLinkPopover } from "./RibbonLinkPopover";
import {
	type RibbonButtonConfig,
	getFormatButtons,
	getHeadingButtons,
} from "./ribbonButtonConfigs";

interface EditorRibbonProps {
	editor: Editor;
	canEdit: boolean;
	onExtractSelectionToNote?: () => void;
}

interface RibbonButtonListProps {
	buttons: RibbonButtonConfig[];
	canEdit: boolean;
	onPreventMouseDown: (e: React.MouseEvent) => void;
}

/** Marks, links and headings the buttons light up for; re-renders the bar when any of them changes. */
function activeFormatKey(editor: Editor): string {
	if (editor.isDestroyed) return "";
	return [
		editor.isActive("bold"),
		editor.isActive("italic"),
		editor.isActive("underline"),
		editor.isActive("strike"),
		editor.isActive("link"),
		editor.isActive("heading", { level: 1 }),
		editor.isActive("heading", { level: 2 }),
		editor.isActive("heading", { level: 3 }),
	]
		.map((active) => (active ? "1" : "0"))
		.join("");
}

const RibbonButtonList = memo(function RibbonButtonList({
	buttons,
	canEdit,
	onPreventMouseDown,
}: RibbonButtonListProps) {
	return buttons.map((btn) => (
		<button
			key={btn.title}
			type="button"
			className={`ribbonBtn ${btn.isActive?.() ? "active" : ""}`}
			title={btn.title}
			aria-label={btn.title}
			disabled={!canEdit}
			onMouseDown={onPreventMouseDown}
			onClick={() => canEdit && btn.onClick()}
		>
			{btn.icon}
		</button>
	));
});

/**
 * Format bar pinned to the bottom of the editor while the "Show format bar" setting is on:
 * inline marks, link, colour and headings. Lists and blocks stay on the slash menu and markdown shortcuts.
 */
export const EditorRibbon = memo(function EditorRibbon({
	editor,
	canEdit,
	onExtractSelectionToNote,
}: EditorRibbonProps) {
	const { t } = useTranslation("editor");
	useEditorState({ editor, selector: ({ editor: instance }) => activeFormatKey(instance) });
	const focusChain = () => editor.chain().focus(undefined, { scrollIntoView: false });

	const preventMouseDown = (e: React.MouseEvent) => e.preventDefault();

	const runCommand = (fn: () => void) => {
		const host = editor.view.dom.closest(".rfNodeNoteEditorBody");
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
			<div
				className="rfNodeNoteEditorRibbon nodrag nopan nowheel"
				role="toolbar"
				aria-label={t("ribbon.toolbarLabel")}
			>
				<RibbonButtonList
					buttons={getFormatButtons(editor, runCommand, focusChain)}
					canEdit={canEdit}
					onPreventMouseDown={preventMouseDown}
				/>
				<span className="ribbonDivider" />
				<RibbonLinkPopover
					editor={editor}
					canEdit={canEdit}
					runCommand={runCommand}
					focusChain={focusChain}
					preventMouseDown={preventMouseDown}
				/>
				<RibbonColorPopover
					editor={editor}
					canEdit={canEdit}
					runCommand={runCommand}
					focusChain={focusChain}
					preventMouseDown={preventMouseDown}
				/>
				<span className="ribbonDivider" />
				<RibbonButtonList
					buttons={getHeadingButtons(editor, runCommand, focusChain)}
					canEdit={canEdit}
					onPreventMouseDown={preventMouseDown}
				/>
				{onExtractSelectionToNote ? (
					<>
						<span className="ribbonDivider" />
						<button
							type="button"
							className="ribbonBtn"
							title={t("ribbon.extractToNote")}
							aria-label={t("ribbon.extractToNote")}
							disabled={!canEdit}
							onMouseDown={preventMouseDown}
							onClick={() => canEdit && onExtractSelectionToNote()}
						>
							<HugeiconsIcon icon={SquareArrowUpRightIcon} size="var(--icon-md)" />
						</button>
					</>
				) : null}
			</div>
		</div>
	);
});
