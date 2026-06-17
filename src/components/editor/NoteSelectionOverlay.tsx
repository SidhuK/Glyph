import type { Editor } from "@tiptap/core";
import { useCallback, useState } from "react";
import { SelectionHighlight } from "./SelectionHighlight";

interface NoteSelectionOverlayProps {
	editor: Editor | null;
	highlightEnabled: boolean;
	hostRef: (node: HTMLDivElement | null) => void;
	children: React.ReactNode;
	className: string;
	colorfulHeadings: boolean;
}

export function NoteSelectionOverlay({
	editor,
	highlightEnabled,
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
		</div>
	);
}
