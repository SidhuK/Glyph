import { cn } from "@/lib/utils";
import { priorityRank, priorityToneStyle } from "../../lib/priorityProperties";

const BARS = [
	{ x: 1.5, height: 5 },
	{ x: 5.75, height: 8 },
	{ x: 10, height: 11 },
] as const;

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
			style={priorityToneStyle(value)}
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
