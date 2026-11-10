import { useLayoutEffect, useRef, useState } from "react";
import type { tagColorFromName } from "../editor/noteProperties/utils";
import { DatabaseColumnIcon } from "./DatabaseColumnIcon";

const DATABASE_CELL_PILL_GAP = 4;

export interface DatabaseDisplayPill {
	key: string;
	label: string;
	title?: string;
	/** Tag icon when "beautiful tags" is on. */
	iconName?: string;
	/** A tag's palette slot, so it keeps the colour it has in the note list and on the board. */
	chipTone?: ReturnType<typeof tagColorFromName>;
}

function DatabaseCellPill({ item }: { item: DatabaseDisplayPill }) {
	return (
		<span className="databaseCellPill" data-chip-tone={item.chipTone} title={item.title}>
			{item.iconName ? (
				<DatabaseColumnIcon
					iconName={item.iconName}
					className="databaseTagPillIcon"
					size="var(--icon-xs)"
				/>
			) : null}
			<span className="databaseCellPillLabel">{item.label}</span>
		</span>
	);
}

function CountPill({ count }: { count: number }) {
	return <span className="databaseCellPill is-count">+{count}</span>;
}

/** How many leading pills fit beside a "+N" for the rest; always at least one, which shrinks. */
function fittingPillCount(itemWidths: number[], countWidths: number[], available: number): number {
	for (let candidate = itemWidths.length; candidate > 0; candidate -= 1) {
		const hiddenCount = itemWidths.length - candidate;
		let total = (candidate - 1) * DATABASE_CELL_PILL_GAP;
		for (let index = 0; index < candidate; index += 1) total += itemWidths[index] ?? 0;
		if (hiddenCount > 0) total += DATABASE_CELL_PILL_GAP + (countWidths[hiddenCount - 1] ?? 0);
		if (total <= available + 0.5) return candidate;
	}
	return Math.min(itemWidths.length, 1);
}

/** One row of chips that never clips: pills that don't fit fold into "+N", and a lone pill that
    is still too wide ellipsizes its label. */
export function ResponsivePillList({ items }: { items: DatabaseDisplayPill[] }) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const itemMeasureRefs = useRef<Array<HTMLSpanElement | null>>([]);
	const countMeasureRefs = useRef<Array<HTMLSpanElement | null>>([]);
	const [visibleCount, setVisibleCount] = useState(() => items.length);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		itemMeasureRefs.current = itemMeasureRefs.current.slice(0, items.length);
		countMeasureRefs.current = countMeasureRefs.current.slice(0, items.length);
		const widthOf = (element: HTMLSpanElement | null) =>
			element ? element.getBoundingClientRect().width : 0;

		const measure = () => {
			const containerWidth = container.clientWidth;
			const next =
				Number.isFinite(containerWidth) && containerWidth > 0
					? fittingPillCount(
							itemMeasureRefs.current.map(widthOf),
							countMeasureRefs.current.map(widthOf),
							containerWidth,
						)
					: items.length;
			setVisibleCount((current) => (current === next ? current : next));
		};

		const observer = new ResizeObserver(measure);
		observer.observe(container);
		measure();
		return () => observer.disconnect();
	}, [items]);

	const shownCount = Math.min(visibleCount, items.length);
	const hiddenCount = items.length - shownCount;

	return (
		<>
			<div ref={containerRef} className="databaseCellPills">
				{items.slice(0, shownCount).map((item) => (
					<DatabaseCellPill key={item.key} item={item} />
				))}
				{hiddenCount > 0 ? <CountPill count={hiddenCount} /> : null}
			</div>
			<div className="databaseCellPillsMeasure" aria-hidden="true">
				{items.map((item, index) => (
					<span
						key={`measure:${item.key}`}
						ref={(element) => {
							itemMeasureRefs.current[index] = element;
						}}
						className="databaseCellPillMeasure"
					>
						<DatabaseCellPill item={item} />
					</span>
				))}
				{items.map((item, index) => (
					<span
						key={`measure-count:${item.key}`}
						ref={(element) => {
							countMeasureRefs.current[index] = element;
						}}
						className="databaseCellPillMeasure"
					>
						<CountPill count={index + 1} />
					</span>
				))}
			</div>
		</>
	);
}
