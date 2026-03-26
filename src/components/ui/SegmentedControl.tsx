import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

import { UnstyledButton } from "./UnstyledButton";

interface SegmentedControlOption<T extends string> {
	value: T;
	label: ReactNode;
	icon?: ReactNode;
	title?: string;
	disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
	value: T;
	options: SegmentedControlOption<T>[];
	onChange: (value: T) => void;
	ariaLabel: string;
	className?: string;
	buttonClassName?: string;
	activeClassName?: string;
	iconClassName?: string;
	disabled?: boolean;
}

function SegmentedControl<T extends string>({
	value,
	options,
	onChange,
	ariaLabel,
	className,
	buttonClassName,
	activeClassName = "active",
	iconClassName,
	disabled = false,
}: SegmentedControlProps<T>) {
	return (
		<div
			className={className}
			role="tablist"
			aria-label={ariaLabel}
			data-slot="segmented-control"
		>
			{options.map((option) => {
				const active = option.value === value;
				return (
					<UnstyledButton
						key={option.value}
						className={cn(buttonClassName, active && activeClassName)}
						data-active={active}
						aria-pressed={active}
						aria-selected={active}
						role="tab"
						title={option.title}
						disabled={disabled || option.disabled}
						onClick={() => onChange(option.value)}
					>
						{option.icon ? (
							<span className={iconClassName} aria-hidden="true">
								{option.icon}
							</span>
						) : null}
						{option.label}
					</UnstyledButton>
				);
			})}
		</div>
	);
}

export { SegmentedControl };
