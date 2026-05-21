import {
	FullSignalIcon,
	LowSignalIcon,
	MediumSignalIcon,
	NoSignalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import {
	priorityLabel,
	priorityOptionFromValue,
	priorityTextStyle,
} from "../../lib/priorityProperties";

const PRIORITY_ICONS: Record<
	NonNullable<ReturnType<typeof priorityOptionFromValue>>["iconKey"],
	ComponentProps<typeof HugeiconsIcon>["icon"]
> = {
	no: NoSignalIcon,
	low: LowSignalIcon,
	medium: MediumSignalIcon,
	high: FullSignalIcon,
};

export function priorityPropertyIconForValue(
	value: string | null | undefined,
): ComponentProps<typeof HugeiconsIcon>["icon"] {
	const option = priorityOptionFromValue(value);
	return option ? PRIORITY_ICONS[option.iconKey] : NoSignalIcon;
}

interface PriorityPropertyPillProps {
	value: string | null | undefined;
	className?: string;
}

export function PriorityPropertyPill({
	value,
	className,
}: PriorityPropertyPillProps) {
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
				size={12}
				strokeWidth={1.3}
			/>
			<span>{label}</span>
		</span>
	);
}
