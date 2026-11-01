import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { RibbonButton } from "./RibbonButton";
import { RibbonLinkPopover } from "./RibbonLinkPopover";
import { RibbonMenu } from "./RibbonMenu";
import { RibbonOverflowMenu } from "./RibbonOverflowMenu";
import { activeFormatKey } from "./ribbonActiveFormat";
import {
	type RibbonCommandContext,
	getChecklistButton,
	getFormatButtons,
	getHeadingMenu,
	getInsertButtons,
	getListMenu,
} from "./ribbonButtonConfigs";

interface EditorRibbonProps {
	editor: Editor;
	canEdit: boolean;
	onExtractSelectionToNote?: () => void;
}

/**
 * Format bar pinned to the bottom of the editor while the "Show format bar" setting is on.
 * Groups: block type, inline marks, inserts, then a ⋮ menu for everything else.
 */
export const EditorRibbon = memo(function EditorRibbon({
	editor,
	canEdit,
	onExtractSelectionToNote,
}: EditorRibbonProps) {
	const { t } = useTranslation("editor");
	useEditorState({ editor, selector: ({ editor: instance }) => activeFormatKey(instance) });
	const focusChain = () => editor.chain().focus(undefined, { scrollIntoView: false });

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

	const ctx: RibbonCommandContext = { editor, runCommand, focusChain };

	return (
		<div className="rfNodeNoteEditorRibbonAnchor">
			<div
				className="rfNodeNoteEditorRibbon nodrag nopan nowheel"
				role="toolbar"
				aria-label={t("ribbon.toolbarLabel")}
			>
				<div className="ribbonGroup">
					<RibbonMenu menu={getHeadingMenu(ctx)} ctx={ctx} canEdit={canEdit} />
					<RibbonButton button={getChecklistButton(ctx)} canEdit={canEdit} />
					<RibbonMenu menu={getListMenu(ctx)} ctx={ctx} canEdit={canEdit} />
				</div>
				<div className="ribbonGroup">
					{getFormatButtons(ctx).map((button) => (
						<RibbonButton key={button.title} button={button} canEdit={canEdit} />
					))}
				</div>
				<div className="ribbonGroup">
					<RibbonLinkPopover ctx={ctx} canEdit={canEdit} />
					{getInsertButtons(ctx).map((button) => (
						<RibbonButton key={button.title} button={button} canEdit={canEdit} />
					))}
				</div>
				<RibbonOverflowMenu
					ctx={ctx}
					canEdit={canEdit}
					onExtractSelectionToNote={onExtractSelectionToNote}
				/>
			</div>
		</div>
	);
});
