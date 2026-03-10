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
type CssLengthUnit =
	| "px"
	| "em"
	| "rem"
	| "%"
	| "vh"
	| "vw"
	| "vmin"
	| "vmax"
	| "ch"
	| "ex"
	| "cm"
	| "mm"
	| "in"
	| "pt"
	| "pc";
type CssLengthString = `${number}` | `${number}${CssLengthUnit}`;

interface ControlKeyProps {
	size?: number | CssLengthString;
	className?: string;
	style?: CSSProperties;
	title?: string;
}

const CSS_LENGTH_PATTERN =
	/^\s*-?(?:\d+|\d*\.\d+)(?:px|em|rem|%|vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc)?\s*$/;
const DISALLOWED_CSS_SIZE_KEYWORDS = new Set([
	"inherit",
	"auto",
	"initial",
	"unset",
	"revert",
]);

function toCssSize(
	size: number | string | undefined,
	fallback: number,
): number | string {
	if (typeof size === "number") {
		return Number.isFinite(size) ? size : fallback;
	}
	if (typeof size === "string") {
		const trimmed = size.trim();
		if (!trimmed) return fallback;
		if (DISALLOWED_CSS_SIZE_KEYWORDS.has(trimmed.toLowerCase())) {
			return fallback;
		}
		if (/^-?(?:\d+|\d*\.\d+)$/.test(trimmed)) {
			const parsed = Number.parseFloat(trimmed);
			return Number.isFinite(parsed) ? parsed : fallback;
		}
		return CSS_LENGTH_PATTERN.test(trimmed) ? trimmed : fallback;
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
	const cssSize = toCssSize(size, 16);

	return (
		<span
			className={className}
			title={title}
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				minWidth:
					typeof cssSize === "number" ? cssSize * 1.8 : `calc(${cssSize} * 1.8)`,
				height: cssSize,
				padding: "0 0.32em",
				border: "1.5px solid currentColor",
				borderRadius:
					typeof cssSize === "number"
						? Math.max(4, cssSize * 0.3)
						: `max(4px, calc(${cssSize} * 0.3))`,
				fontSize:
					typeof cssSize === "number" ? cssSize * 0.52 : `calc(${cssSize} * 0.52)`,
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
