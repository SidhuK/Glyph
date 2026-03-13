import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import "./toggle.css";

interface ToggleProps {
	checked?: boolean;
	defaultChecked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	label?: ReactNode;
	hint?: ReactNode;
	ariaLabel?: string;
	disabled?: boolean;
	slim?: boolean;
	size?: "sm" | "md";
	className?: string;
	name?: string;
	id?: string;
}

export function Toggle({
	checked,
	defaultChecked,
	onCheckedChange,
	label,
	hint,
	ariaLabel,
	disabled = false,
	slim = false,
	size = "md",
	className,
	name,
	id,
}: ToggleProps) {
	const hasCopy = Boolean(label || hint);

	return (
		<label
			className={cn("uiToggle", className)}
			data-size={size}
			data-slim={slim}
			data-has-copy={hasCopy}
			data-disabled={disabled}
		>
			<input
				id={id}
				name={name}
				className="uiToggleInput"
				type="checkbox"
				role="switch"
				checked={checked}
				defaultChecked={defaultChecked}
				onChange={(event) => onCheckedChange?.(event.target.checked)}
				aria-label={ariaLabel}
				disabled={disabled}
			/>
			{hasCopy ? (
				<span className="uiToggleCopy">
					{label ? <span className="uiToggleLabel">{label}</span> : null}
					{hint ? <span className="uiToggleHint">{hint}</span> : null}
				</span>
			) : null}
			<span className="uiToggleControl" aria-hidden="true">
				<span className="uiToggleThumb" />
			</span>
		</label>
	);
}
