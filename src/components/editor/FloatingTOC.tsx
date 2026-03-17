import type { Editor } from "@tiptap/react";
import { memo, useId, useState } from "react";
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
	const { headings, activeId, scrollToHeading } = useTableOfContents(editor);
	const [expanded, setExpanded] = useState(false);
	const panelId = useId();

	if (headings.length < MIN_HEADINGS) return null;

	return (
		<div
			className="floatingToc"
			data-expanded={expanded ? "true" : undefined}
			onMouseEnter={() => setExpanded(true)}
			onMouseLeave={() => setExpanded(false)}
		>
			<button
				type="button"
				className="floatingTocTrigger"
				onClick={() => setExpanded((prev) => !prev)}
				onKeyDown={(e) => {
					if (e.key === "Escape" && expanded) {
						e.preventDefault();
						setExpanded(false);
					}
				}}
				aria-expanded={expanded}
				aria-controls={panelId}
				aria-label="Table of contents"
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
			</button>

			{expanded ? (
				<nav
					className="floatingTocExpanded"
					id={panelId}
					aria-label="Table of contents"
				>
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
				</nav>
			) : null}
		</div>
	);
});
