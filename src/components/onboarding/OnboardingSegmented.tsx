import type { KeyboardEvent } from "react";

interface SegmentOption<Value extends string> {
	value: Value;
	label: string;
}

interface OnboardingSegmentedProps<Value extends string> {
	labelledBy: string;
	value: Value;
	options: readonly SegmentOption<Value>[];
	onChange: (value: Value) => void;
}

const STEP_BY_KEY: Partial<Record<string, number>> = {
	ArrowLeft: -1,
	ArrowUp: -1,
	ArrowRight: 1,
	ArrowDown: 1,
};

/** A macOS-style segmented control with radiogroup semantics and roving focus. */
export function OnboardingSegmented<Value extends string>({
	labelledBy,
	value,
	options,
	onChange,
}: OnboardingSegmentedProps<Value>) {
	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		const step = STEP_BY_KEY[event.key];
		if (step === undefined) return;
		event.preventDefault();
		const current = options.findIndex((option) => option.value === value);
		const next = options[(current + step + options.length) % options.length];
		if (!next) return;
		onChange(next.value);
		const target = event.currentTarget.querySelector<HTMLButtonElement>(
			`[data-value="${next.value}"]`,
		);
		target?.focus();
	};

	return (
		<div
			className="obSegmented"
			role="radiogroup"
			aria-labelledby={labelledBy}
			onKeyDown={handleKeyDown}
		>
			{options.map((option) => {
				const selected = option.value === value;
				return (
					<button
						key={option.value}
						type="button"
						role="radio"
						className="obSegment"
						data-value={option.value}
						aria-checked={selected}
						tabIndex={selected ? 0 : -1}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</button>
				);
			})}
		</div>
	);
}
