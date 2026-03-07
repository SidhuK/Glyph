import * as Icons from "@hugeicons/core-free-icons";
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
	return typeof size === "number" ? size : fallback;
}

export const Search = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.Search} {...props} />
);
export const Command = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.CommandIcon} {...props} />
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
			aria-hidden="true"
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
	<HugeiconsIcon icon={Icons.PanelRightOpenIcon} {...props} />
);
export const PanelRightClose = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.PanelRightCloseIcon} {...props} />
);
export const PanelLeftOpen = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.PanelLeftOpenIcon} {...props} />
);
export const PanelLeftClose = (props: IconProps) => (
	<HugeiconsIcon icon={Icons.PanelLeftCloseIcon} {...props} />
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
