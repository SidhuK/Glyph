import { cn } from "@/lib/utils";
import { priorityRank } from "../../lib/priorityProperties";

/** Three rising bars, bottom-aligned on a 14px grid. */
const BARS = [
	{ x: 1.5, height: 5 },
	{ x: 5.75, height: 8 },
	{ x: 10, height: 11 },
] as const;

/**
 * The board's priority glyph: Low, Medium and High fill one, two or three bars in strong ink
 * and leave the rest faint, so each level differs by a whole bar; "No priority" fills none.
 */
export function DatabasePriorityBars({
	value,
	className,
}: {
	value: string | null | undefined;
	className?: string;
}) {
	const level = Math.max(priorityRank(value), 0);
	return (
		<svg
			className={cn("databasePriorityBars", className)}
			viewBox="0 0 14 14"
			aria-hidden="true"
			focusable="false"
		>
			{BARS.map((bar, index) => (
				<rect
					key={bar.x}
					className="databasePriorityBar"
					data-active={index < level ? "true" : undefined}
					x={bar.x}
					y={12.5 - bar.height}
					width={2.5}
					height={bar.height}
					rx={0.75}
				/>
			))}
		</svg>
	);
}
