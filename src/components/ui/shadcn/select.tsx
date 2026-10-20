import { ChevronDown } from "@/components/Icons";
import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { cn } from "@/lib/utils";
import { Select as SelectPrimitive } from "@animate-ui/react/primitives/base-ui/select";
import { Tick02Icon } from "@hugeicons/core-free-icons";
import type { ComponentProps, ReactNode } from "react";

const ROW_ICON_SIZE = "var(--icon-sm)";

/** A Hugeicons definition sized for a select row or trigger. */
export function SelectIcon({ icon }: { icon: ComponentProps<typeof HugeiconsIcon>["icon"] }) {
	return <HugeiconsIcon icon={icon} size={ROW_ICON_SIZE} />;
}

export interface SelectOption<Value> {
	value: Value;
	label: string;
	disabled?: boolean;
	icon?: ReactNode;
}

export interface SelectProps<Value> {
	value: Value;
	options: readonly SelectOption<Value>[];
	onValueChange: (value: Value) => void;
	disabled?: boolean;
	id?: string;
	title?: string;
	"aria-label"?: string;
	/** Classes for the trigger button. */
	className?: string;
}

/**
 * Animated single-value select. The popup reuses the shared `glyphMenu*` surface, and the
 * selected row shows a trailing tick. Values keep their type end to end, so call sites
 * don't need to parse or narrow strings.
 */
export function Select<Value>({
	value,
	options,
	onValueChange,
	disabled,
	id,
	title,
	"aria-label": ariaLabel,
	className,
}: SelectProps<Value>) {
	const selectedIcon = options.find((option) => Object.is(option.value, value))?.icon;
	return (
		<SelectPrimitive.Root
			value={value}
			items={options}
			disabled={disabled}
			onValueChange={(next) => {
				if (next !== null) onValueChange(next);
			}}
		>
			<SelectPrimitive.Trigger
				id={id}
				title={title}
				aria-label={ariaLabel}
				className={cn("glyphSelectTrigger", className)}
			>
				{selectedIcon ? (
					<span className="glyphSelectIcon" aria-hidden="true">
						{selectedIcon}
					</span>
				) : null}
				<SelectPrimitive.Value className="glyphSelectValue" />
				<SelectPrimitive.Icon className="glyphSelectChevron">
					<ChevronDown size={ROW_ICON_SIZE} aria-hidden="true" />
				</SelectPrimitive.Icon>
			</SelectPrimitive.Trigger>
			<SelectPrimitive.Portal>
				<SelectPrimitive.Positioner
					className="glyphMenuPositioner"
					align="start"
					sideOffset={6}
					alignItemWithTrigger={false}
				>
					<SelectPrimitive.Popup className="glyphMenuPopup glyphSelectPopup">
						{options.map((option) => (
							<SelectPrimitive.Item
								key={String(option.value)}
								value={option.value}
								label={option.label}
								disabled={option.disabled}
								className="glyphMenuItem"
							>
								{option.icon ? (
									<span className="glyphMenuItemIcon" aria-hidden="true">
										{option.icon}
									</span>
								) : null}
								<SelectPrimitive.ItemText className="glyphMenuItemLabel">
									{option.label}
								</SelectPrimitive.ItemText>
								<SelectPrimitive.ItemIndicator className="glyphMenuItemCheck">
									<HugeiconsIcon icon={Tick02Icon} size={ROW_ICON_SIZE} strokeWidth={2.25} />
								</SelectPrimitive.ItemIndicator>
							</SelectPrimitive.Item>
						))}
					</SelectPrimitive.Popup>
				</SelectPrimitive.Positioner>
			</SelectPrimitive.Portal>
		</SelectPrimitive.Root>
	);
}
