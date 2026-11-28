import { cn } from "@/lib/utils";
import {
	priorityOptionFromValue,
	priorityRank,
	priorityToneStyle,
} from "../../lib/priorityProperties";

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
	const isUrgent = priorityOptionFromValue(value)?.id === "urgent";
	const level = Math.max(priorityRank(value), 0);
	return (
		<svg
			className={cn("databasePriorityBars", className)}
			data-urgent={isUrgent ? "true" : undefined}
			style={priorityToneStyle(value)}
			viewBox="0 0 14 14"
			aria-hidden="true"
			focusable="false"
		>
			{isUrgent ? (
				<>
					<rect x="1" y="1" width="12" height="12" rx="3" />
					<path d="M7 3.9v3.7M7 10.1v.01" />
				</>
			) : (
				BARS.map((bar, index) => (
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
				))
			)}
		</svg>
	);
}
