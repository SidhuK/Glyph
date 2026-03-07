import {
	Archive04Icon,
	ArrowDown,
	ArrowRight,
	ArrowUp,
	Calendar03Icon,
	CommandIcon,
	FolderLibraryIcon,
	FolderPlus as FolderPlusIcon,
	Globe as GlobeIcon,
	InformationCircleIcon,
	Layout as LayoutIcon,
	Maximize,
	Minimize,
	PanelLeftOpenIcon,
	Search as SearchIcon,
	Settings05Icon,
	SidebarLeftIcon,
	SidebarRightIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import glyphIconUrl from "../../assets/glyph.svg?url";

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
export const Globe = (props: IconProps) => (
	<HugeiconsIcon icon={GlobeIcon} {...props} />
);
export const Settings = (props: IconProps) => (
	<HugeiconsIcon icon={Settings05Icon} {...props} />
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
export const AiGlyph = ({
	size = 16,
	alt = "",
	style,
	...props
}: Omit<ComponentProps<"img">, "src"> & { size?: number | string }) => (
	<img
		src={glyphIconUrl}
		alt={alt}
		width={size}
		height={size}
		style={{ display: "block", border: 0, ...style }}
		aria-hidden={alt ? undefined : true}
		{...props}
	/>
);
