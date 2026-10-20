"use client";

import { Popover as PopoverPrimitive } from "@animate-ui/react/primitives/base-ui/popover";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
	className,
	side,
	align = "center",
	sideOffset = 4,
	collisionPadding,
	collisionAvoidance,
	anchor,
	...props
}: PopoverPrimitive.Popup.Props &
	Pick<
		PopoverPrimitive.Positioner.Props,
		"side" | "align" | "sideOffset" | "collisionPadding" | "collisionAvoidance" | "anchor"
	>) {
	return (
		<PopoverPrimitive.Portal>
			<PopoverPrimitive.Positioner
				className="z-50"
				side={side}
				align={align}
				sideOffset={sideOffset}
				collisionPadding={collisionPadding}
				collisionAvoidance={collisionAvoidance}
				anchor={anchor}
			>
				<PopoverPrimitive.Popup
					data-slot="popover-content"
					className={cn(
						"bg-popover text-popover-foreground z-50 w-72 rounded-md border p-4 shadow-md outline-hidden",
						className,
					)}
					{...props}
				/>
			</PopoverPrimitive.Positioner>
		</PopoverPrimitive.Portal>
	);
}
function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="popover-header"
			className={cn("flex flex-col gap-1 text-sm", className)}
			{...props}
		/>
	);
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
	return <div data-slot="popover-title" className={cn("font-medium", className)} {...props} />;
}

function PopoverDescription({ className, ...props }: React.ComponentProps<"p">) {
	return (
		<p
			data-slot="popover-description"
			className={cn("text-muted-foreground", className)}
			{...props}
		/>
	);
}

export { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription };
