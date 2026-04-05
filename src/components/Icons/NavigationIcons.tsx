import {
	Archive04Icon,
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Calendar03Icon,
	CommandIcon,
	ComputerIcon,
	FolderLibraryIcon,
	FolderPlus as FolderPlusIcon,
	Globe as GlobeIcon,
	InformationCircleIcon,
	LayoutAlignLeftIcon,
	Layout as LayoutIcon,
	Maximize,
	Minimize,
	Moon02Icon,
	PanelLeftOpenIcon,
	Search as SearchIcon,
	Settings01Icon,
	SidebarLeftIcon,
	SidebarRightIcon,
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
export const FolderClosed = (props: IconProps) => (
	<HugeiconsIcon icon={FolderLibraryIcon} strokeWidth={0.9} {...props} />
);
export const FolderPlus = (props: IconProps) => (
	<HugeiconsIcon icon={FolderPlusIcon} strokeWidth={0.9} {...props} />
);
export const PanelRightOpen = (props: IconProps) => (
	<HugeiconsIcon icon={SidebarRightIcon} strokeWidth={0.9} {...props} />
);
export const PanelRightClose = (props: IconProps) => (
	<HugeiconsIcon icon={SidebarRightIcon} strokeWidth={0.9} {...props} />
);
export const PanelLeftOpen = (props: IconProps) => (
	<HugeiconsIcon icon={SidebarLeftIcon} strokeWidth={0.9} {...props} />
);
export const PanelLeftClose = (props: IconProps) => (
	<HugeiconsIcon icon={PanelLeftOpenIcon} strokeWidth={0.9} {...props} />
);
export const Layout = (props: IconProps) => (
	<HugeiconsIcon icon={LayoutIcon} strokeWidth={0.9} {...props} />
);
export const LayoutAlignLeft = (props: IconProps) => (
	<HugeiconsIcon icon={LayoutAlignLeftIcon} strokeWidth={0.9} {...props} />
);
export const Globe = (props: IconProps) => (
	<HugeiconsIcon icon={GlobeIcon} strokeWidth={0.9} {...props} />
);
export const Settings = (props: IconProps) => (
	<HugeiconsIcon icon={Settings01Icon} strokeWidth={0.9} {...props} />
);
export const Maximize2 = (props: IconProps) => (
	<HugeiconsIcon icon={Maximize} strokeWidth={0.9} {...props} />
);
export const Minimize2 = (props: IconProps) => (
	<HugeiconsIcon icon={Minimize} strokeWidth={0.9} {...props} />
);
export const InformationCircle = (props: IconProps) => (
	<HugeiconsIcon icon={InformationCircleIcon} strokeWidth={0.9} {...props} />
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
export const Computer = (props: IconProps) => (
	<HugeiconsIcon icon={ComputerIcon} strokeWidth={0.9} {...props} />
);
