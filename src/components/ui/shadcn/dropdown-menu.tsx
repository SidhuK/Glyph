import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowRight01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { Menu as MenuPrimitive } from "@animate-ui/react/primitives/base-ui/menu";
import type { IconSvgElement } from "@hugeicons/react";
import type * as React from "react";

import { cn } from "@/lib/utils";

const MENU_ICON_SIZE = "var(--icon-sm)";

type MenuPositioningProps = Pick<MenuPrimitive.Positioner.Props, "side" | "align" | "sideOffset">;

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
	return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
	return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function MenuSurface({
	className,
	slot,
	side,
	align,
	sideOffset,
	...props
}: MenuPrimitive.Popup.Props & MenuPositioningProps & { slot: string }) {
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				className="glyphMenuPositioner"
				side={side}
				align={align}
				sideOffset={sideOffset}
			>
				<MenuPrimitive.Popup
					data-slot={slot}
					className={cn("glyphMenuPopup", className)}
					{...props}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	);
}

function DropdownMenuContent({
	sideOffset = 4,
	...props
}: MenuPrimitive.Popup.Props & MenuPositioningProps) {
	return <MenuSurface slot="dropdown-menu-content" sideOffset={sideOffset} {...props} />;
}

function DropdownMenuItem({
	className,
	variant = "default",
	...props
}: MenuPrimitive.Item.Props & {
	variant?: "default" | "destructive";
}) {
	return (
		<MenuPrimitive.Item
			data-slot="dropdown-menu-item"
			data-variant={variant}
			className={cn("glyphMenuItem", className)}
			{...props}
		/>
	);
}

/** Leading icon for a menu row. */
function DropdownMenuItemIcon({ icon }: { icon: IconSvgElement }) {
	return (
		<HugeiconsIcon
			icon={icon}
			size={MENU_ICON_SIZE}
			className="glyphMenuItemIcon"
			aria-hidden="true"
		/>
	);
}

/** Trailing tick marking the current row in a non-radio menu. */
function DropdownMenuItemCheck() {
	return (
		<HugeiconsIcon
			icon={Tick02Icon}
			size={MENU_ICON_SIZE}
			strokeWidth={2.25}
			className="glyphMenuItemCheck"
			aria-hidden="true"
		/>
	);
}

function DropdownMenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
	return <MenuPrimitive.RadioGroup data-slot="dropdown-menu-radio-group" {...props} />;
}

function DropdownMenuRadioItem({ className, children, ...props }: MenuPrimitive.RadioItem.Props) {
	return (
		<MenuPrimitive.RadioItem
			data-slot="dropdown-menu-radio-item"
			className={cn("glyphMenuItem", className)}
			{...props}
		>
			{children}
			<MenuPrimitive.RadioItemIndicator className="glyphMenuItemCheck">
				<HugeiconsIcon icon={Tick02Icon} size={MENU_ICON_SIZE} strokeWidth={2.25} />
			</MenuPrimitive.RadioItemIndicator>
		</MenuPrimitive.RadioItem>
	);
}

// A plain element rather than Menu.GroupLabel, which throws when rendered outside a Menu.Group.
function DropdownMenuLabel({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div data-slot="dropdown-menu-label" className={cn("glyphMenuLabel", className)} {...props} />
	);
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
	return (
		<MenuPrimitive.Separator
			data-slot="dropdown-menu-separator"
			className={cn("glyphMenuSeparator", className)}
			{...props}
		/>
	);
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
	return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
	className,
	children,
	...props
}: MenuPrimitive.SubmenuTrigger.Props) {
	return (
		<MenuPrimitive.SubmenuTrigger
			data-slot="dropdown-menu-sub-trigger"
			className={cn("glyphMenuItem", className)}
			{...props}
		>
			{children}
			<HugeiconsIcon
				icon={ArrowRight01Icon}
				size={MENU_ICON_SIZE}
				className="glyphMenuItemTrailing"
				aria-hidden="true"
			/>
		</MenuPrimitive.SubmenuTrigger>
	);
}

function DropdownMenuSubContent({
	side = "right",
	align = "start",
	sideOffset = 4,
	...props
}: MenuPrimitive.Popup.Props & MenuPositioningProps) {
	return (
		<MenuSurface
			slot="dropdown-menu-sub-content"
			side={side}
			align={align}
			sideOffset={sideOffset}
			{...props}
		/>
	);
}

export {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuItemCheck,
	DropdownMenuItemIcon,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
};
