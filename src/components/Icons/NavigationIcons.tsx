import {
	Archive04Icon,
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Calendar03Icon,
	CommandIcon,
	FolderPlus as FolderPlusIcon,
	LayoutAlignLeftIcon,
	Moon02Icon,
	Search as SearchIcon,
	Settings01Icon,
	Sun01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

export type IconProps = Omit<ComponentProps<typeof HugeiconsIcon>, "icon">;

export const Search = (props: IconProps) => (
	<HugeiconsIcon icon={SearchIcon} strokeWidth={0.9} {...props} />
);
export const Command = (props: IconProps) => (
	<HugeiconsIcon icon={CommandIcon} strokeWidth={0.9} {...props} />
);
export const ChevronRight = (props: IconProps) => (
	<HugeiconsIcon icon={ArrowRight} strokeWidth={0.9} {...props} />
);
export const ChevronUp = (props: IconProps) => (
	<HugeiconsIcon icon={ArrowUp} strokeWidth={0.9} {...props} />
);
export const ChevronDown = (props: IconProps) => (
	<HugeiconsIcon icon={ArrowDown} strokeWidth={0.9} {...props} />
);
export const FolderOpen = (props: IconProps) => (
	<HugeiconsIcon icon={Archive04Icon} strokeWidth={0.9} {...props} />
);
export const FolderPlus = (props: IconProps) => (
	<HugeiconsIcon icon={FolderPlusIcon} strokeWidth={0.9} {...props} />
);
export const LayoutAlignLeft = (props: IconProps) => (
	<HugeiconsIcon icon={LayoutAlignLeftIcon} strokeWidth={0.9} {...props} />
);
export const Settings = (props: IconProps) => (
	<HugeiconsIcon icon={Settings01Icon} strokeWidth={0.9} {...props} />
);
export const Calendar = (props: IconProps) => (
	<HugeiconsIcon icon={Calendar03Icon} strokeWidth={0.9} {...props} />
);
export const Sun = (props: IconProps) => (
	<HugeiconsIcon icon={Sun01Icon} strokeWidth={0.9} {...props} />
);
export const Moon = (props: IconProps) => (
	<HugeiconsIcon icon={Moon02Icon} strokeWidth={0.9} {...props} />
);
