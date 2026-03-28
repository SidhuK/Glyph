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
	<HugeiconsIcon icon={SearchIcon} {...props} />
);
export const Command = (props: IconProps) => (
	<HugeiconsIcon icon={CommandIcon} {...props} />
);
export const ChevronRight = (props: IconProps) => (
	<HugeiconsIcon icon={ArrowRight} {...props} />
);
export const ChevronUp = (props: IconProps) => (
	<HugeiconsIcon icon={ArrowUp} {...props} />
);
export const ChevronDown = (props: IconProps) => (
	<HugeiconsIcon icon={ArrowDown} {...props} />
);
export const FolderOpen = (props: IconProps) => (
	<HugeiconsIcon icon={Archive04Icon} {...props} />
);
export const FolderClosed = (props: IconProps) => (
	<HugeiconsIcon icon={FolderLibraryIcon} {...props} />
);
export const FolderPlus = (props: IconProps) => (
	<HugeiconsIcon icon={FolderPlusIcon} {...props} />
);
export const PanelRightOpen = (props: IconProps) => (
	<HugeiconsIcon icon={SidebarRightIcon} {...props} />
);
export const PanelRightClose = (props: IconProps) => (
	<HugeiconsIcon icon={SidebarRightIcon} {...props} />
);
export const PanelLeftOpen = (props: IconProps) => (
	<HugeiconsIcon icon={SidebarLeftIcon} {...props} />
);
export const PanelLeftClose = (props: IconProps) => (
	<HugeiconsIcon icon={PanelLeftOpenIcon} {...props} />
);
export const Layout = (props: IconProps) => (
	<HugeiconsIcon icon={LayoutIcon} {...props} />
);
export const LayoutAlignLeft = (props: IconProps) => (
	<HugeiconsIcon icon={LayoutAlignLeftIcon} {...props} />
);
export const Globe = (props: IconProps) => (
	<HugeiconsIcon icon={GlobeIcon} {...props} />
);
export const Settings = (props: IconProps) => (
	<HugeiconsIcon icon={Settings01Icon} {...props} />
);
export const Maximize2 = (props: IconProps) => (
	<HugeiconsIcon icon={Maximize} {...props} />
);
export const Minimize2 = (props: IconProps) => (
	<HugeiconsIcon icon={Minimize} {...props} />
);
export const InformationCircle = (props: IconProps) => (
	<HugeiconsIcon icon={InformationCircleIcon} {...props} />
);
export const Calendar = (props: IconProps) => (
	<HugeiconsIcon icon={Calendar03Icon} {...props} />
);
export const Sun = (props: IconProps) => (
	<HugeiconsIcon icon={Sun01Icon} {...props} />
);
export const Moon = (props: IconProps) => (
	<HugeiconsIcon icon={Moon02Icon} {...props} />
);
export const Computer = (props: IconProps) => (
	<HugeiconsIcon icon={ComputerIcon} {...props} />
);
