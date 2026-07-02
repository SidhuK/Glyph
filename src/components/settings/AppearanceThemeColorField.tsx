import { cn } from "@/lib/utils";
import { ReloadIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import {
	normalizeThemeColorForInput,
	normalizeThemeColorHex,
} from "../../lib/themeColors";

interface AppearanceThemeColorFieldProps {
	color: string;
	editable?: boolean;
	onChange?: (color: string) => void;
	"aria-label"?: string;
}

function AppearanceThemeColorField({
	color,
	editable = false,
	onChange,
	"aria-label": ariaLabel,
}: AppearanceThemeColorFieldProps) {
	const displayColor = normalizeThemeColorHex(color);
	const Tag = editable ? "label" : "div";

	return (
		<Tag
			className={cn(
				"appearanceThemeColorField",
				editable && "appearanceThemeColorFieldEditable",
			)}
			aria-label={editable ? undefined : ariaLabel}
			style={{ "--theme-color-swatch": displayColor } as CSSProperties}
		>
			{editable ? (
				<input
					type="color"
					className="appearanceThemeColorInput"
					value={normalizeThemeColorForInput(displayColor)}
					onChange={(event) => onChange?.(event.target.value)}
					aria-label={ariaLabel}
				/>
			) : null}
			<span className="appearanceThemeColorSwatch" aria-hidden="true" />
			<span className="appearanceThemeColorHex">{displayColor}</span>
		</Tag>
	);
}

export function AppearanceThemeColorResetButton({
	disabled,
	onClick,
	ariaLabel,
}: {
	disabled?: boolean;
	onClick: () => void;
	ariaLabel: string;
}) {
	return (
		<button
			type="button"
			className="appearanceThemeColorReset"
			onClick={onClick}
			disabled={disabled}
			aria-label={ariaLabel}
			title={ariaLabel}
		>
			<HugeiconsIcon
				icon={ReloadIcon}
				size="var(--icon-md)"
				strokeWidth={0.9}
			/>
		</button>
	);
}

interface AppearanceThemeColorControlProps {
	color: string;
	editable?: boolean;
	canReset?: boolean;
	onChange?: (color: string) => void;
	onReset?: () => void;
	resetAriaLabel?: string;
	"aria-label"?: string;
}

export function AppearanceThemeColorControl({
	color,
	editable = false,
	canReset = false,
	onChange,
	onReset,
	resetAriaLabel = "Reset color",
	"aria-label": ariaLabel,
}: AppearanceThemeColorControlProps) {
	return (
		<div className="appearanceThemeColorControl">
			<AppearanceThemeColorField
				color={color}
				editable={editable}
				onChange={onChange}
				aria-label={ariaLabel}
			/>
			{editable && onReset ? (
				<AppearanceThemeColorResetButton
					disabled={!canReset}
					onClick={onReset}
					ariaLabel={resetAriaLabel}
				/>
			) : null}
		</div>
	);
}
