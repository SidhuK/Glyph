import { cn } from "@/lib/utils";
import { type FocusEventHandler, type ReactNode, useId } from "react";
import { Switch } from "../../ui/shadcn/switch";
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
	onFocus?: FocusEventHandler<HTMLButtonElement>;
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
	size: _size = "md",
	className,
	name,
	id,
	onFocus,
}: ToggleProps) {
	const hasCopy = Boolean(label || hint);
	const generatedId = useId();
	const switchId = id ?? generatedId;
	const labelId = label ? `${switchId}-label` : undefined;
	const hintId = hint ? `${switchId}-hint` : undefined;
	const computedAriaLabel =
		ariaLabel ?? getAriaText(label) ?? getAriaText(hint) ?? name ?? id;

	if (import.meta.env.DEV && !computedAriaLabel) {
		console.warn(
			"Toggle rendered without an accessible label. Pass ariaLabel, label, hint, name, or id.",
		);
	}

	return (
		<div
			className={cn(
				"uiToggle",
				hasCopy && "uiToggle--withCopy",
				slim && hasCopy && "uiToggle--slim",
				className,
			)}
			aria-disabled={disabled || undefined}
		>
			<Switch
				id={switchId}
				className="uiToggleInput"
				name={name}
				checked={checked}
				defaultChecked={defaultChecked}
				onCheckedChange={onCheckedChange}
				onFocus={onFocus}
				aria-label={computedAriaLabel}
				aria-labelledby={computedAriaLabel ? undefined : labelId}
				aria-describedby={hintId}
				disabled={disabled}
			/>
			{hasCopy ? (
				<span className="uiToggleCopy">
					{label ? (
						<span id={labelId} className="uiToggleLabel">
							{label}
						</span>
					) : null}
					{hint ? (
						<span id={hintId} className="uiToggleHint">
							{hint}
						</span>
					) : null}
				</span>
			) : null}
		</div>
	);
}
