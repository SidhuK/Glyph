import type { Editor } from "@tiptap/core";
import { AnimatePresence } from "motion/react";
import { useCallback, useState } from "react";
import { EditorRibbon } from "./EditorRibbon";
import { SelectionHighlight } from "./SelectionHighlight";
import type { SelectionRibbonPosition } from "./noteEditorOverlayTypes";

interface NoteSelectionOverlayProps {
	editor: Editor | null;
	canEdit: boolean;
	highlightEnabled: boolean;
	selectionRibbon: SelectionRibbonPosition | null;
	onExtractSelectionToNote?: () => void;
	hostRef: (node: HTMLDivElement | null) => void;
	children: React.ReactNode;
	className: string;
	colorfulHeadings: boolean;
}

function getRibbonTransform(selectionRibbon: SelectionRibbonPosition) {
	const y =
		selectionRibbon.placement === "above"
			? "translateY(-100%)"
			: "translateY(0)";
	return `translateX(0) ${y}`;
}

export function NoteSelectionOverlay({
	editor,
	canEdit,
	highlightEnabled,
	selectionRibbon,
	onExtractSelectionToNote,
	hostRef,
	children,
	className,
	colorfulHeadings,
}: NoteSelectionOverlayProps) {
	const [hostNode, setHostNode] = useState<HTMLDivElement | null>(null);
	const handleHostRef = useCallback(
		(node: HTMLDivElement | null) => {
			setHostNode(node);
			hostRef(node);
		},
		[hostRef],
	);

	return (
		<div
			ref={handleHostRef}
			className={className}
			data-colorful-headings={colorfulHeadings ? "true" : undefined}
		>
			{children}
			<SelectionHighlight
				host={hostNode}
				enabled={highlightEnabled && Boolean(editor)}
			/>
			<AnimatePresence initial={false}>
				{canEdit && selectionRibbon && editor ? (
					<EditorRibbon
						editor={editor}
						canEdit={canEdit}
						onExtractSelectionToNote={onExtractSelectionToNote}
						style={{
							top: `${selectionRibbon.top}px`,
							left: `${selectionRibbon.left}px`,
							transform: getRibbonTransform(selectionRibbon),
						}}
					/>
				) : null}
			</AnimatePresence>
		</div>
	);
}
