import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	Bold as BoldIcon,
	Edit as EditIcon,
	Heading1 as Heading1Icon,
	Heading2 as Heading2Icon,
	Heading3 as Heading3Icon,
	Italic as ItalicIcon,
	LeftToRightListBulletIcon,
	Link2 as Link2Icon,
	ListChecks as ListChecksIcon,
	ListOrdered as ListOrderedIcon,
	Quote as QuoteIcon,
	SourceCodeIcon,
	Strikethrough as StrikethroughIcon,
	TextUnderlineIcon,
} from "@hugeicons/core-free-icons";
import { type IconProps, withDefaultIconSize } from "./NavigationIcons";

export const Bold = (props: IconProps) => (
	<HugeiconsIcon icon={BoldIcon} {...withDefaultIconSize(props)} />
);
export const Italic = (props: IconProps) => (
	<HugeiconsIcon icon={ItalicIcon} {...withDefaultIconSize(props)} />
);
export const Underline = (props: IconProps) => (
	<HugeiconsIcon icon={TextUnderlineIcon} {...withDefaultIconSize(props)} />
);
export const Strikethrough = (props: IconProps) => (
	<HugeiconsIcon icon={StrikethroughIcon} {...withDefaultIconSize(props)} />
);
export const Code = (props: IconProps) => (
	<HugeiconsIcon icon={SourceCodeIcon} {...withDefaultIconSize(props)} />
);
export const Quote = (props: IconProps) => (
	<HugeiconsIcon icon={QuoteIcon} {...withDefaultIconSize(props)} />
);
export const List = (props: IconProps) => (
	<HugeiconsIcon
		icon={LeftToRightListBulletIcon}
		{...withDefaultIconSize(props)}
	/>
);
export const ListOrdered = (props: IconProps) => (
	<HugeiconsIcon icon={ListOrderedIcon} {...withDefaultIconSize(props)} />
);
export const ListChecks = (props: IconProps) => (
	<HugeiconsIcon icon={ListChecksIcon} {...withDefaultIconSize(props)} />
);
export const Heading1 = (props: IconProps) => (
	<HugeiconsIcon icon={Heading1Icon} {...withDefaultIconSize(props)} />
);
export const Heading2 = (props: IconProps) => (
	<HugeiconsIcon icon={Heading2Icon} {...withDefaultIconSize(props)} />
);
export const Heading3 = (props: IconProps) => (
	<HugeiconsIcon icon={Heading3Icon} {...withDefaultIconSize(props)} />
);
export const Link2 = (props: IconProps) => (
	<HugeiconsIcon icon={Link2Icon} {...withDefaultIconSize(props)} />
);
export const Edit = (props: IconProps) => (
	<HugeiconsIcon icon={EditIcon} {...withDefaultIconSize(props)} />
);
