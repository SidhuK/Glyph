import { cn } from "@/lib/utils";
import type { FocusEventHandler, ReactNode } from "react";
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
	onFocus?: FocusEventHandler<HTMLInputElement>;
}

function getAriaText(value: ReactNode): string | undefined {
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed || undefined;
	}
	if (typeof value === "number") {
		return String(value);
	}
	return undefined;
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
	onFocus,
}: ToggleProps) {
	const hasCopy = Boolean(label || hint);
	const computedAriaLabel =
		ariaLabel ?? getAriaText(label) ?? getAriaText(hint) ?? name ?? id;

	if (import.meta.env.DEV && !computedAriaLabel) {
		console.warn(
			"Toggle rendered without an accessible label. Pass ariaLabel, label, hint, name, or id.",
		);
	}

	return (
		<label
			className={cn(
				"uiToggle",
				size === "md" && "uiToggle--md",
				hasCopy && "uiToggle--withCopy",
				slim && hasCopy && "uiToggle--slim",
				className,
			)}
			aria-disabled={disabled || undefined}
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
				onFocus={onFocus}
				aria-checked={checked ?? defaultChecked ?? false}
				aria-label={computedAriaLabel}
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
