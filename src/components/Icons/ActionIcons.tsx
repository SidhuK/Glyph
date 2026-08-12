import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	Add,
	ArrowReloadHorizontalIcon,
	Close,
	Copy01Icon,
	Delete,
	Download04Icon,
	Save as SaveIcon,
	Upload04Icon,
} from "@hugeicons/core-free-icons";
import { type IconProps, withDefaultIconSize } from "./NavigationIcons";

export const Plus = (props: IconProps) => (
	<HugeiconsIcon icon={Add} {...withDefaultIconSize(props)} />
);
export const Trash2 = (props: IconProps) => (
	<HugeiconsIcon icon={Delete} {...withDefaultIconSize(props)} />
);
export const RefreshCw = (props: IconProps) => (
	<HugeiconsIcon
		icon={ArrowReloadHorizontalIcon}
		{...withDefaultIconSize(props)}
	/>
);
export const Save = (props: IconProps) => (
	<HugeiconsIcon icon={SaveIcon} {...withDefaultIconSize(props)} />
);
export const Copy = (props: IconProps) => (
	<HugeiconsIcon icon={Copy01Icon} {...withDefaultIconSize(props)} />
);
export const Download = (props: IconProps) => (
	<HugeiconsIcon icon={Download04Icon} {...withDefaultIconSize(props)} />
);
export const Upload = (props: IconProps) => (
	<HugeiconsIcon icon={Upload04Icon} {...withDefaultIconSize(props)} />
);
export const X = (props: IconProps) => (
	<HugeiconsIcon icon={Close} {...withDefaultIconSize(props)} />
);
