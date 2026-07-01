import { FloatingTOC } from "../editor/FloatingTOC";
import type { TOCHeading } from "../editor/hooks/useTableOfContents";

interface MarkdownFloatingTocProps {
	activeId: string | null;
	getHeadingPreview: (heading: TOCHeading) => string | null;
	headings: TOCHeading[];
	onSelectHeading: (heading: TOCHeading) => void;
	visible: boolean;
}

export function MarkdownFloatingToc({
	activeId,
	getHeadingPreview,
	headings,
	onSelectHeading,
	visible,
}: MarkdownFloatingTocProps) {
	if (!visible) return null;
	return (
		<FloatingTOC
			headings={headings}
			activeId={activeId}
			getHeadingPreview={getHeadingPreview}
			onSelectHeading={onSelectHeading}
		/>
	);
}
