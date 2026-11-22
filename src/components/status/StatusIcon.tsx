import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	Archive03Icon,
	CancelCircleIcon,
	CheckmarkCircle02Icon,
	CircleIcon,
	DashedLineCircleIcon,
	HourglassIcon,
	PlayCircleIcon,
	UnavailableIcon,
	ViewIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import { statusOptionFromValue } from "../../lib/statusProperties";

const STATUS_ICON_STROKE_WIDTH = 1.8;

const STATUS_ICONS = new Map<string, IconSvgElement>([
	["backlog", DashedLineCircleIcon],
	["todo", CircleIcon],
	["in_progress", PlayCircleIcon],
	["in_review", ViewIcon],
	["blocked", UnavailableIcon],
	["waiting", HourglassIcon],
	["done", CheckmarkCircle02Icon],
	["canceled", CancelCircleIcon],
	["archived", Archive03Icon],
]);

interface StatusIconProps {
	value: string | null | undefined;
	className?: string;
}

export function StatusIcon({ value, className }: StatusIconProps) {
	const statusId = statusOptionFromValue(value)?.id;
	const icon = (statusId ? STATUS_ICONS.get(statusId) : undefined) ?? DashedLineCircleIcon;
	return (
		<HugeiconsIcon
			icon={icon}
			size="var(--icon-sm)"
			strokeWidth={STATUS_ICON_STROKE_WIDTH}
			className={className}
			aria-hidden="true"
		/>
	);
}
