import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	Archive04Icon,
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Calendar03Icon,
	CommandIcon,
	LayoutAlignLeftIcon,
	Search as SearchIcon,
	Settings01Icon,
} from "@hugeicons/core-free-icons";
import type { ComponentProps } from "react";

export type IconProps = Omit<ComponentProps<typeof HugeiconsIcon>, "icon">;

export function withDefaultIconSize({
	size = "var(--icon-md)",
	...props
}: IconProps): IconProps {
	return { size, ...props };
}

export const Search = (props: IconProps) => (
	<HugeiconsIcon icon={SearchIcon} {...withDefaultIconSize(props)} />
);
export const Command = (props: IconProps) => (
	<HugeiconsIcon icon={CommandIcon} {...withDefaultIconSize(props)} />
);
export const ChevronRight = (props: IconProps) => (
	<HugeiconsIcon icon={ArrowRight} {...withDefaultIconSize(props)} />
);
export const ChevronUp = (props: IconProps) => (
	<HugeiconsIcon icon={ArrowUp} {...withDefaultIconSize(props)} />
);
export const ChevronDown = (props: IconProps) => (
	<HugeiconsIcon icon={ArrowDown} {...withDefaultIconSize(props)} />
);
export const FolderOpen = (props: IconProps) => (
	<HugeiconsIcon icon={Archive04Icon} {...withDefaultIconSize(props)} />
);
export const LayoutAlignLeft = (props: IconProps) => (
	<HugeiconsIcon icon={LayoutAlignLeftIcon} {...withDefaultIconSize(props)} />
);
export const Settings = (props: IconProps) => (
	<HugeiconsIcon icon={Settings01Icon} {...withDefaultIconSize(props)} />
);
export const Calendar = (props: IconProps) => (
	<HugeiconsIcon icon={Calendar03Icon} {...withDefaultIconSize(props)} />
);
