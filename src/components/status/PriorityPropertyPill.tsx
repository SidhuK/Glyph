import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { FullSignalIcon, LowSignalIcon, MediumSignalIcon } from "@hugeicons/core-free-icons";
import type { ComponentProps } from "react";
import {
	priorityLabel,
	priorityOptionFromValue,
	priorityTextStyle,
} from "../../lib/priorityProperties";

/** Three dashes inside a faint bar box: bare dashes read as the "⋯" menu glyph beside them. */
const NO_PRIORITY_ICON = [
	[
		"rect",
		{
			x: "3",
			y: "5",
			width: "18",
			height: "14",
			rx: "3.5",
			stroke: "currentColor",
			opacity: "0.45",
			key: "0",
		},
	],
	[
		"path",
		{
			d: "M7 12H8.5M11.25 12H12.75M15.5 12H17",
			stroke: "currentColor",
			strokeLinecap: "round",
			key: "1",
		},
	],
] as const;

const PRIORITY_ICONS: Record<
	NonNullable<ReturnType<typeof priorityOptionFromValue>>["iconKey"],
	ComponentProps<typeof HugeiconsIcon>["icon"]
> = {
	no: NO_PRIORITY_ICON,
	low: LowSignalIcon,
	medium: MediumSignalIcon,
	high: FullSignalIcon,
};

export function priorityPropertyIconForValue(
	value: string | null | undefined,
): ComponentProps<typeof HugeiconsIcon>["icon"] {
	const option = priorityOptionFromValue(value);
	return option ? PRIORITY_ICONS[option.iconKey] : NO_PRIORITY_ICON;
}

interface PriorityPropertyPillProps {
	value: string | null | undefined;
	className?: string;
}

export function PriorityPropertyPill({ value, className }: PriorityPropertyPillProps) {
	const label = priorityLabel(value);
	if (!label) return null;
	return (
		<span
			className={["propertyValueText", className].filter(Boolean).join(" ")}
			style={priorityTextStyle(value)}
			title={label}
		>
			<HugeiconsIcon
				icon={priorityPropertyIconForValue(value)}
				className="propertyValueTextIcon"
				size="var(--icon-sm)"
			/>
			<span>{label}</span>
		</span>
	);
}
