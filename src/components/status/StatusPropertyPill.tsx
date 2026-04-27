import {
	Archive01Icon,
	BlockedIcon,
	CancelCircleIcon,
	CheckmarkCircle02Icon,
	CircleIcon,
	ClockAlertIcon,
	HourglassIcon,
	Loading03Icon,
	NoteEditIcon,
	PauseCircleIcon,
	PlayCircleIcon,
	Search01Icon,
	SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import {
	statusLabel,
	statusOptionFromValue,
	statusToneStyle,
} from "../../lib/statusProperties";
import type { EditorTextColor } from "../editor/textColors";

const STATUS_ICONS: Record<
	NonNullable<ReturnType<typeof statusOptionFromValue>>["iconKey"],
	ComponentProps<typeof HugeiconsIcon>["icon"]
> = {
	circle: CircleIcon,
	play: PlayCircleIcon,
	blocked: BlockedIcon,
	pause: PauseCircleIcon,
	draft: NoteEditIcon,
	archive: Archive01Icon,
	check: CheckmarkCircle02Icon,
	hourglass: HourglassIcon,
	loading: Loading03Icon,
	sent: SentIcon,
	review: Search01Icon,
	failed: CancelCircleIcon,
	expired: ClockAlertIcon,
};

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
	const option = statusOptionFromValue(value);
	const label = statusLabel(value);
	if (!label) return null;
	return (
		<span
			className={["statusPropertyPill", className].filter(Boolean).join(" ")}
			style={statusToneStyle(value, colors)}
			title={label}
		>
			<HugeiconsIcon
				icon={option ? STATUS_ICONS[option.iconKey] : CircleIcon}
				className="statusPropertyPillIcon"
				size={12}
				strokeWidth={1.3}
			/>
			<span>{label}</span>
		</span>
	);
}
