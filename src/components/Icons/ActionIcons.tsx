import {
	Add,
	ArrowReloadHorizontalIcon,
	Close,
	Delete,
	Save as SaveIcon,
	SquareArrowUpRightIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconProps } from "./NavigationIcons";

export const Plus = (props: IconProps) => (
	<HugeiconsIcon icon={Add} strokeWidth={0.9} {...props} />
);
export const Trash2 = (props: IconProps) => (
	<HugeiconsIcon icon={Delete} strokeWidth={0.9} {...props} />
);
export const RefreshCw = (props: IconProps) => (
	<HugeiconsIcon
		icon={ArrowReloadHorizontalIcon}
		strokeWidth={0.9}
		{...props}
	/>
);
export const Save = (props: IconProps) => (
	<HugeiconsIcon icon={SaveIcon} strokeWidth={0.9} {...props} />
);
export const ExternalLink = (props: IconProps) => (
	<HugeiconsIcon icon={SquareArrowUpRightIcon} strokeWidth={0.9} {...props} />
);
export const X = (props: IconProps) => (
	<HugeiconsIcon icon={Close} strokeWidth={0.9} {...props} />
);
