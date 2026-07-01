import { memo, useId, useState } from "react";
import type { TOCHeading } from "./hooks/useTableOfContents";

const MIN_HEADINGS = 2;

const DASH_WIDTHS: Record<number, number> = {
	1: 14,
	2: 11,
	3: 8,
	4: 6,
	5: 5,
	6: 4,
};

const OUTLINE_INDENT: Record<number, number> = {
	1: 0,
	2: 10,
	3: 20,
	4: 28,
	5: 34,
	6: 38,
};

function getWaveState(index: number, previewHeadingIndex: number) {
	if (previewHeadingIndex === -1) return undefined;
	if (index === previewHeadingIndex) return "peak";
	return Math.abs(index - previewHeadingIndex) === 1 ? "near" : undefined;
}

interface FloatingTOCProps {
	activeId: string | null;
	getHeadingPreview: (heading: TOCHeading) => string | null;
	headings: TOCHeading[];
	onSelectHeading: (heading: TOCHeading) => void;
}

export const FloatingTOC = memo(function FloatingTOC({
	activeId,
	getHeadingPreview,
	headings,
	onSelectHeading,
}: FloatingTOCProps) {
	const [previewHeadingId, setPreviewHeadingId] = useState<string | null>(null);
	const [outlineOpen, setOutlineOpen] = useState(false);
	const panelId = useId();
	const previewHeading =
		headings.find((heading) => heading.id === previewHeadingId) ?? null;
	const previewHeadingIndex = headings.findIndex(
		(heading) => heading.id === previewHeadingId,
	);
	const previewText = previewHeading ? getHeadingPreview(previewHeading) : null;

	if (headings.length < MIN_HEADINGS) return null;

	return (
		<div
			className="floatingToc"
			onMouseLeave={() => setPreviewHeadingId(null)}
			onBlur={(event) => {
				const nextFocus = event.relatedTarget;
				if (
					nextFocus instanceof Node &&
					event.currentTarget.contains(nextFocus)
				) {
					return;
				}
				setPreviewHeadingId(null);
			}}
		>
			<nav className="floatingTocRail" aria-label="Table of contents">
				{headings.map((heading, index) => (
					<button
						key={heading.id}
						type="button"
						className="floatingTocMark"
						data-active={heading.id === activeId ? "true" : undefined}
						data-wave={getWaveState(index, previewHeadingIndex)}
						onMouseEnter={() => setPreviewHeadingId(heading.id)}
						onFocus={() => setPreviewHeadingId(heading.id)}
						onClick={() => {
							if (heading.id === activeId) {
								setOutlineOpen((prev) => !prev);
								return;
							}
							onSelectHeading(heading);
						}}
						onKeyDown={(event) => {
							if (event.key === "Escape" && (previewHeading || outlineOpen)) {
								event.preventDefault();
								setPreviewHeadingId(null);
								setOutlineOpen(false);
							}
						}}
						aria-describedby={
							heading.id === previewHeadingId ? panelId : undefined
						}
						aria-label={heading.text}
					>
						<span
							className="floatingTocDash"
							style={{ width: DASH_WIDTHS[heading.level] ?? 6 }}
						/>
					</button>
				))}
			</nav>

			{outlineOpen ? (
				<nav
					className="floatingTocOutline"
					aria-label="Document outline"
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							setOutlineOpen(false);
						}
					}}
				>
					{headings.map((heading) => (
						<button
							key={heading.id}
							type="button"
							className="floatingTocOutlineItem"
							data-active={heading.id === activeId ? "true" : undefined}
							style={{ paddingLeft: OUTLINE_INDENT[heading.level] ?? 0 }}
							onClick={() => {
								onSelectHeading(heading);
								setOutlineOpen(false);
							}}
							title={heading.text}
						>
							<span className="floatingTocOutlineText">{heading.text}</span>
							<span className="floatingTocOutlineLevel">H{heading.level}</span>
						</button>
					))}
				</nav>
			) : null}

			{previewHeading && !outlineOpen ? (
				<button
					type="button"
					className="floatingTocPreview"
					id={panelId}
					onMouseEnter={() => setPreviewHeadingId(previewHeading.id)}
					onClick={() => onSelectHeading(previewHeading)}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							setPreviewHeadingId(null);
						}
					}}
					title={previewHeading.text}
				>
					<span className="floatingTocPreviewHeading">
						<span className="floatingTocPreviewTitle">
							{previewHeading.text}
						</span>
						<span className="floatingTocPreviewLevel">
							H{previewHeading.level}
						</span>
					</span>
					{previewText ? (
						<span className="floatingTocPreviewText">{previewText}</span>
					) : null}
				</button>
			) : null}
		</div>
	);
});
