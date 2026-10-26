import { statusOptionFromValue } from "../../lib/statusProperties";

const RING_RADIUS = 5.25;
const PIE_RADIUS = 2.75;
const CENTER = 7;

/** Share of the inner pie filled for each in-flight status, Linear-style. */
const STATUS_PIE_FRACTION: Record<string, number> = {
	waiting: 0.25,
	in_progress: 0.5,
	in_review: 0.75,
};

function piePath(fraction: number): string {
	const angle = fraction * Math.PI * 2;
	const x = CENTER + PIE_RADIUS * Math.sin(angle);
	const y = CENTER - PIE_RADIUS * Math.cos(angle);
	const largeArc = fraction > 0.5 ? 1 : 0;
	return `M${CENTER} ${CENTER} L${CENTER} ${CENTER - PIE_RADIUS} A${PIE_RADIUS} ${PIE_RADIUS} 0 ${largeArc} 1 ${x.toFixed(3)} ${y.toFixed(3)} Z`;
}

interface StatusRingIconProps {
	value: string | null | undefined;
	className?: string;
}

/** Linear-style ring status glyph; colour comes from `currentColor`. */
export function StatusRingIcon({ value, className }: StatusRingIconProps) {
	const statusId = statusOptionFromValue(value)?.id ?? "todo";
	const pieFraction = STATUS_PIE_FRACTION[statusId];
	const filled = statusId === "done" || statusId === "canceled" || statusId === "archived";

	return (
		<svg
			width="var(--icon-sm)"
			height="var(--icon-sm)"
			viewBox="0 0 14 14"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			{filled ? (
				<>
					<circle cx={CENTER} cy={CENTER} r={6.25} fill="currentColor" />
					<path
						d={
							statusId === "done"
								? "M4.4 7.2 6.2 9 9.6 5.4"
								: statusId === "canceled"
									? "M5 5l4 4M9 5 5 9"
									: "M4.75 7h4.5"
						}
						stroke="var(--bg-primary)"
						strokeWidth={1.5}
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</>
			) : (
				<>
					<circle
						cx={CENTER}
						cy={CENTER}
						r={RING_RADIUS}
						stroke="currentColor"
						strokeWidth={1.5}
						strokeDasharray={statusId === "backlog" ? "1.6 1.7" : undefined}
					/>
					{statusId === "blocked" ? (
						<path d="M4.75 7h4.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" />
					) : pieFraction ? (
						<path d={piePath(pieFraction)} fill="currentColor" />
					) : null}
				</>
			)}
		</svg>
	);
}
