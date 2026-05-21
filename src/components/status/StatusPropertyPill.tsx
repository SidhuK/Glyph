import {
	ActivityCircleIcon,
	Archive02Icon,
	CancelCircleIcon,
	CheckmarkSquare02Icon,
	Clock03Icon,
	FileBlockIcon,
	FileSearchIcon,
	Progress03Icon,
	Queue02Icon,
	Task01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import {
	statusLabel,
	statusOptionFromValue,
	statusTextStyle,
} from "../../lib/statusProperties";
import type { EditorTextColor } from "../editor/textColors";

const STATUS_ICONS: Record<
	NonNullable<ReturnType<typeof statusOptionFromValue>>["iconKey"],
	ComponentProps<typeof HugeiconsIcon>["icon"]
> = {
	activity: ActivityCircleIcon,
	archive: Archive02Icon,
	cancel: CancelCircleIcon,
	check_square: CheckmarkSquare02Icon,
	clock: Clock03Icon,
	file_block: FileBlockIcon,
	file_search: FileSearchIcon,
	progress: Progress03Icon,
	queue: Queue02Icon,
	task: Task01Icon,
	waiting: Clock03Icon,
};

export function statusPropertyIconForValue(
	value: string | null | undefined,
): ComponentProps<typeof HugeiconsIcon>["icon"] {
	const option = statusOptionFromValue(value);
	return option ? STATUS_ICONS[option.iconKey] : Task01Icon;
}

interface StatusPropertyPillProps {
	value: string | null | undefined;
	colors?: Record<string, EditorTextColor>;
	className?: string;
}

export function StatusPropertyPill({
	value,
	colors = {},
	className,
}: StatusPropertyPillProps) {
	const label = statusLabel(value);
	if (!label) return null;
	return (
		<span
			className={["propertyValueText", className].filter(Boolean).join(" ")}
			style={statusTextStyle(value, colors)}
			title={label}
		>
			<HugeiconsIcon
				icon={statusPropertyIconForValue(value)}
				className="propertyValueTextIcon"
				size={12}
				strokeWidth={1.3}
			/>
			<span>{label}</span>
		</span>
	);
}
