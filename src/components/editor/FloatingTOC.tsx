import type { Editor } from "@tiptap/react";
import { memo, useState } from "react";
import { useTableOfContents } from "./hooks/useTableOfContents";

const MIN_HEADINGS = 2;

const DASH_WIDTHS: Record<number, number> = {
	1: 14,
	2: 11,
	3: 8,
	4: 6,
	5: 5,
	6: 4,
};

const INDENT: Record<number, number> = {
	1: 0,
	2: 10,
	3: 20,
	4: 28,
	5: 34,
	6: 38,
};

interface FloatingTOCProps {
	editor: Editor | null;
}

export const FloatingTOC = memo(function FloatingTOC({
	editor,
}: FloatingTOCProps) {
	const { headings, activeId, scrollToHeading } =
		useTableOfContents(editor);
	const [expanded, setExpanded] = useState(false);

	if (headings.length < MIN_HEADINGS) return null;

	return (
		<div
			className="floatingToc"
			data-expanded={expanded ? "true" : undefined}
			onMouseEnter={() => setExpanded(true)}
			onMouseLeave={() => setExpanded(false)}
		>
			<div className="floatingTocCollapsed">
				{headings.map((h) => (
					<div
						key={h.id}
						className="floatingTocDash"
						data-active={h.id === activeId ? "true" : undefined}
						style={{ width: DASH_WIDTHS[h.level] ?? 6 }}
					/>
				))}
			</div>

			<div className="floatingTocExpanded">
				<div className="floatingTocItems">
					{headings.map((h) => (
						<button
							key={h.id}
							type="button"
							className="floatingTocItem"
							data-active={h.id === activeId ? "true" : undefined}
							data-level={h.level}
							style={{ paddingLeft: INDENT[h.level] ?? 0 }}
							onClick={() => scrollToHeading(h)}
							title={h.text}
						>
							{h.text}
						</button>
					))}
				</div>
			</div>
		</div>
	);
});
