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
	PanelLeftCloseIcon,
	PanelLeftOpenIcon,
	PanelRightCloseIcon,
	PanelRightOpenIcon,
	Search as SearchIcon,
	Settings05Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps, CSSProperties } from "react";
import glyphIconUrl from "../../assets/glyph.svg?url";

export type IconProps = Omit<ComponentProps<typeof HugeiconsIcon>, "icon">;
interface ControlKeyProps {
	size?: number | string;
	className?: string;
	style?: CSSProperties;
	title?: string;
}

function toNumericSize(size: number | string | undefined, fallback: number): number {
	if (typeof size === "number") {
		return Number.isFinite(size) ? size : fallback;
	}
	if (typeof size === "string") {
		const parsed = Number.parseFloat(size);
		return Number.isFinite(parsed) ? parsed : fallback;
	}
	return fallback;
}

export const Search = (props: IconProps) => (
	<HugeiconsIcon icon={SearchIcon} {...props} />
);
export const Command = (props: IconProps) => (
	<HugeiconsIcon icon={CommandIcon} {...props} />
);
export const ControlKey = ({
	size = 16,
	className,
	style,
	title,
}: ControlKeyProps) => {
	const numericSize = toNumericSize(size, 16);

	return (
		<span
			className={className}
			title={title}
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				minWidth: numericSize * 1.8,
				height: numericSize,
				padding: "0 0.32em",
				border: "1.5px solid currentColor",
				borderRadius: Math.max(4, numericSize * 0.3),
				fontSize: numericSize * 0.52,
				fontWeight: 700,
				lineHeight: 1,
				letterSpacing: "0.01em",
				boxSizing: "border-box",
				...style,
			}}
		>
			Ctrl
		</span>
	);
};
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
	<HugeiconsIcon icon={PanelRightOpenIcon} {...props} />
);
export const PanelRightClose = (props: IconProps) => (
	<HugeiconsIcon icon={PanelRightCloseIcon} {...props} />
);
export const PanelLeftOpen = (props: IconProps) => (
	<HugeiconsIcon icon={PanelLeftOpenIcon} {...props} />
);
export const PanelLeftClose = (props: IconProps) => (
	<HugeiconsIcon icon={PanelLeftCloseIcon} {...props} />
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
