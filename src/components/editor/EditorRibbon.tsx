import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { SquareArrowUpRightIcon } from "@hugeicons/core-free-icons";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorState } from "@tiptap/pm/state";
import { useEditorState } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { memo, useMemo } from "react";
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

/** Wait this long after the selection settles before moving the bar onto it. */
const FORMAT_BAR_UPDATE_DELAY_MS = 120;

const FORMAT_BAR_GAP_PX = 8;

/** The editor's content box: the text column, without the gutters that hold the heading rail. */
function textColumnRect(dom: HTMLElement) {
	const rect = dom.getBoundingClientRect();
	const style = getComputedStyle(dom);
	const left = rect.left + Number.parseFloat(style.paddingLeft);
	const right = rect.right - Number.parseFloat(style.paddingRight);
	return { x: left, y: rect.top, width: Math.max(0, right - left), height: rect.height };
}

/**
 * Above the selection, like every macOS format bar: it may cover the line above (even the title),
 * never the selected text or the text below it. TipTap runs flip before offset, so the top padding
 * includes the gap; it only flips below when the editor viewport has no room above. Sideways it
 * stays inside the text column whenever it fits.
 */
function formatBarPosition(editor: Editor) {
	return {
		placement: "top",
		offset: FORMAT_BAR_GAP_PX,
		flip: { padding: { top: FORMAT_BAR_GAP_PX + 4 } },
		shift: () => ({ boundary: textColumnRect(editor.view.dom) }),
	} as const;
}

function hasFormattableSelection(state: EditorState): boolean {
	const { selection } = state;
	return !selection.empty && !(selection instanceof NodeSelection);
}

/** Positioning only: whether the bar is actually visible is decided by focus in CSS below. */
function shouldPlaceFormatBar({ editor, state }: { editor: Editor; state: EditorState }): boolean {
	return editor.isEditable && hasFormattableSelection(state);
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
 * Selection format bar: inline marks, colour, link and headings, anchored above the selection.
 * Lists and blocks stay on the slash menu and markdown shortcuts.
 */
export const EditorRibbon = memo(function EditorRibbon({
	editor,
	canEdit,
	onExtractSelectionToNote,
}: EditorRibbonProps) {
	const { t } = useTranslation("editor");
	// Hover, focus and open popovers keep the bar up in CSS once the editor loses focus.
	const hasTextSelection = useEditorState({
		editor,
		selector: ({ editor: instance }) =>
			!instance.isDestroyed && instance.isFocused && hasFormattableSelection(instance.state),
	});
	const focusChain = () => editor.chain().focus(undefined, { scrollIntoView: false });
	// A stable object: BubbleMenu re-dispatches its options whenever their identity changes.
	const position = useMemo(() => formatBarPosition(editor), [editor]);

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
		<BubbleMenu
			editor={editor}
			className="rfNodeNoteEditorRibbonAnchor"
			data-visible={hasTextSelection ? "true" : undefined}
			updateDelay={FORMAT_BAR_UPDATE_DELAY_MS}
			shouldShow={shouldPlaceFormatBar}
			options={position}
		>
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
		</BubbleMenu>
	);
});
