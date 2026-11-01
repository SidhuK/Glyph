import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	Edit as EditIcon,
	LeftToRightListBulletIcon,
	SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { type IconProps, withDefaultIconSize } from "./NavigationIcons";

export const Code = (props: IconProps) => (
	<HugeiconsIcon icon={SourceCodeIcon} {...withDefaultIconSize(props)} />
);
export const List = (props: IconProps) => (
	<HugeiconsIcon icon={LeftToRightListBulletIcon} {...withDefaultIconSize(props)} />
);
export const Edit = (props: IconProps) => (
	<HugeiconsIcon icon={EditIcon} {...withDefaultIconSize(props)} />
);
