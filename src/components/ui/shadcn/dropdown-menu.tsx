import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowRight01Icon, Circle } from "@hugeicons/core-free-icons";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import type * as React from "react";

import { cn } from "@/lib/utils";

const menuPopupClassName =
	"bg-popover text-popover-foreground data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) overflow-x-hidden overflow-y-auto rounded-md border p-1 shadow-md outline-hidden";

type MenuPositioningProps = Pick<
	MenuPrimitive.Positioner.Props,
	| "side"
	| "align"
	| "sideOffset"
	| "alignOffset"
	| "collisionPadding"
	| "collisionAvoidance"
	| "sticky"
	| "anchor"
>;

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
	return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />;
}

function DropdownMenuTrigger({ ...props }: MenuPrimitive.Trigger.Props) {
	return <MenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuContent({
	className,
	side,
	align,
	sideOffset = 4,
	alignOffset,
	collisionPadding,
	collisionAvoidance,
	sticky,
	anchor,
	...props
}: MenuPrimitive.Popup.Props & MenuPositioningProps) {
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				className="z-50 outline-hidden"
				side={side}
				align={align}
				sideOffset={sideOffset}
				alignOffset={alignOffset}
				collisionPadding={collisionPadding}
				collisionAvoidance={collisionAvoidance}
				sticky={sticky}
				anchor={anchor}
			>
				<MenuPrimitive.Popup
					data-slot="dropdown-menu-content"
					className={cn(menuPopupClassName, className)}
					{...props}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	);
}

function DropdownMenuItem({
	className,
	inset,
	variant = "default",
	...props
}: MenuPrimitive.Item.Props & {
	inset?: boolean;
	variant?: "default" | "destructive";
}) {
	return (
		<MenuPrimitive.Item
			data-slot="dropdown-menu-item"
			data-inset={inset}
			data-variant={variant}
			className={cn(
				"data-highlighted:bg-accent data-highlighted:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:bg-destructive/10 dark:data-[variant=destructive]:data-highlighted:bg-destructive/20 data-[variant=destructive]:data-highlighted:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[var(--icon-lg)]",
				className,
			)}
			{...props}
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
			className={cn(
				"data-highlighted:bg-accent data-highlighted:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[var(--icon-lg)]",
				className,
			)}
			{...props}
		>
			<span className="pointer-events-none absolute left-2 flex size-[var(--icon-sm)] items-center justify-center">
				<MenuPrimitive.RadioItemIndicator>
					<HugeiconsIcon icon={Circle} size="var(--icon-xs)" className="fill-current" />
				</MenuPrimitive.RadioItemIndicator>
			</span>
			{children}
		</MenuPrimitive.RadioItem>
	);
}

// A plain element rather than Menu.GroupLabel, which throws when rendered outside a Menu.Group.
function DropdownMenuLabel({
	className,
	inset,
	...props
}: React.ComponentProps<"div"> & {
	inset?: boolean;
}) {
	return (
		<div
			data-slot="dropdown-menu-label"
			data-inset={inset}
			className={cn("px-2 py-1.5 text-sm font-medium data-inset:pl-8", className)}
			{...props}
		/>
	);
}

function DropdownMenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
	return (
		<MenuPrimitive.Separator
			data-slot="dropdown-menu-separator"
			className={cn("bg-border -mx-1 my-1 h-px", className)}
			{...props}
		/>
	);
}

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
	return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />;
}

function DropdownMenuSubTrigger({
	className,
	inset,
	children,
	...props
}: MenuPrimitive.SubmenuTrigger.Props & {
	inset?: boolean;
}) {
	return (
		<MenuPrimitive.SubmenuTrigger
			data-slot="dropdown-menu-sub-trigger"
			data-inset={inset}
			className={cn(
				"data-highlighted:bg-accent data-highlighted:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 pr-8 text-sm outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-inset:pl-8",
				className,
			)}
			{...props}
		>
			{children}
			<span className="pointer-events-none absolute right-2 flex size-[var(--icon-sm)] items-center justify-center">
				<HugeiconsIcon
					icon={ArrowRight01Icon}
					size="var(--icon-xs)"
					className="text-muted-foreground"
					aria-hidden="true"
				/>
			</span>
		</MenuPrimitive.SubmenuTrigger>
	);
}

function DropdownMenuSubContent({
	className,
	side = "right",
	align = "start",
	sideOffset = 4,
	alignOffset,
	collisionPadding,
	collisionAvoidance,
	sticky,
	anchor,
	...props
}: MenuPrimitive.Popup.Props & MenuPositioningProps) {
	return (
		<MenuPrimitive.Portal>
			<MenuPrimitive.Positioner
				className="z-50 outline-hidden"
				side={side}
				align={align}
				sideOffset={sideOffset}
				alignOffset={alignOffset}
				collisionPadding={collisionPadding}
				collisionAvoidance={collisionAvoidance}
				sticky={sticky}
				anchor={anchor}
			>
				<MenuPrimitive.Popup
					data-slot="dropdown-menu-sub-content"
					className={cn(menuPopupClassName, className)}
					{...props}
				/>
			</MenuPrimitive.Positioner>
		</MenuPrimitive.Portal>
	);
}

export {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuSub,
	DropdownMenuSubTrigger,
	DropdownMenuSubContent,
};
