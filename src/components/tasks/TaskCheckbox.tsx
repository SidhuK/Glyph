import { m } from "motion/react";
import { springPresets } from "../ui/animations";

interface TaskCheckboxProps {
	checked: boolean;
	onChange: (checked: boolean) => void;
}

export function TaskCheckbox({ checked, onChange }: TaskCheckboxProps) {
	return (
		<button
			type="button"
			className="tasksCheckbox"
			aria-label={checked ? "Uncheck task" : "Check task"}
			onClick={() => onChange(!checked)}
		>
			<svg
				width="18"
				height="18"
				viewBox="0 0 18 18"
				fill="none"
				aria-hidden="true"
			>
				<m.circle
					cx="9"
					cy="9"
					r="8.25"
					strokeWidth="1"
					className="tasksCheckboxPulse"
					initial={false}
					animate={{
						opacity: checked ? 0.7 : 0,
						scale: checked ? 1 : 0.72,
					}}
					transition={springPresets.snappy}
				/>
				<m.circle
					cx="9"
					cy="9"
					r="7.5"
					strokeWidth="1.5"
					className="tasksCheckboxCircle"
					initial={false}
					animate={{
						fill: checked ? "var(--text-primary)" : "transparent",
						stroke: checked ? "var(--text-primary)" : "var(--border-strong)",
					}}
					transition={springPresets.snappy}
				/>
				<m.path
					d="M6 9.5L8 11.5L12 7"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					fill="none"
					className="tasksCheckboxCheck"
					initial={false}
					animate={{
						pathLength: checked ? 1 : 0,
						opacity: checked ? 1 : 0,
					}}
					transition={springPresets.snappy}
				/>
			</svg>
		</button>
	);
}
