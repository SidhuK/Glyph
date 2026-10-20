import {
	Highlight as HighlightPrimitive,
	HighlightItem as HighlightItemPrimitive,
} from "@animate-ui/react/primitives/effects/highlight";
import type { ReactElement, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface HighlightProps {
	/** Value of the item that carries the highlight, or null for none. */
	value: string | null;
	/** Paint for the gliding surface (background, border radius). */
	className?: string;
	children: ReactNode;
}

/**
 * A controlled selection surface that glides between `HighlightItem`s when `value`
 * changes. It lives inside the active item, so it stays anchored through scrolling and
 * reflow. Items shouldn't paint their own selected or hover fill, or the glide can't be read.
 */
export function Highlight({ value, className, children }: HighlightProps) {
	return (
		<HighlightPrimitive
			controlledItems
			value={value}
			click={false}
			className={cn("glyphHighlight", className)}
		>
			{children}
		</HighlightPrimitive>
	);
}

interface HighlightItemProps {
	value: string;
	/** Classes for the wrapper that positions the surface around the child. */
	className?: string;
	children: ReactElement;
}

/** Wraps one selectable element so the highlight can rest on it. */
export function HighlightItem({ value, className, children }: HighlightItemProps) {
	return (
		<HighlightItemPrimitive as="div" value={value} className={cn("glyphHighlightItem", className)}>
			{children}
		</HighlightItemPrimitive>
	);
}
