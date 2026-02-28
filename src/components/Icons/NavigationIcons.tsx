import * as Icons from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";
import glyphIconUrl from "../../assets/glyph.svg?url";

export type IconProps = Omit<ComponentProps<typeof HugeiconsIcon>, "icon">;

export const Search = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Search} {...props} />
);
export const Command = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.CommandIcon} {...props} />
);
export const ChevronRight = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.ArrowRight} {...props} />
);
export const ChevronUp = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.ArrowUp} {...props} />
);
export const ChevronDown = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.ArrowDown} {...props} />
);
export const FolderOpen = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Archive04Icon} {...props} />
);
export const FolderClosed = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.FolderLibraryIcon} {...props} />
);
export const FolderPlus = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.FolderPlus} {...props} />
);
export const PanelRightOpen = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.SidebarRightIcon} {...props} />
);
export const PanelRightClose = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.SidebarRightIcon} {...props} />
);
export const PanelLeftOpen = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.SidebarLeftIcon} {...props} />
);
export const PanelLeftClose = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.PanelLeftOpenIcon} {...props} />
);
export const Layout = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Layout} {...props} />
);
export const Globe = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Globe} {...props} />
);
export const Settings = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Settings05Icon} {...props} />
);
export const Maximize2 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Maximize} {...props} />
);
export const Minimize2 = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Minimize} {...props} />
);
export const InformationCircle = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.InformationCircleIcon} {...props} />
);
export const Calendar = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Calendar03Icon} {...props} />
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
