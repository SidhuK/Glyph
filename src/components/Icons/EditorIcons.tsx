import {
	Bold as BoldIcon,
	Edit as EditIcon,
	Eye as EyeIcon,
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
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconProps } from "./NavigationIcons";

export const Bold = (props: IconProps) => (
	<HugeiconsIcon icon={BoldIcon} strokeWidth={0.9} {...props} />
);
export const Italic = (props: IconProps) => (
	<HugeiconsIcon icon={ItalicIcon} strokeWidth={0.9} {...props} />
);
export const Underline = (props: IconProps) => (
	<HugeiconsIcon icon={TextUnderlineIcon} strokeWidth={0.9} {...props} />
);
export const Strikethrough = (props: IconProps) => (
	<HugeiconsIcon icon={StrikethroughIcon} strokeWidth={0.9} {...props} />
);
export const Code = (props: IconProps) => (
	<HugeiconsIcon icon={SourceCodeIcon} strokeWidth={0.9} {...props} />
);
export const Quote = (props: IconProps) => (
	<HugeiconsIcon icon={QuoteIcon} strokeWidth={0.9} {...props} />
);
export const List = (props: IconProps) => (
	<HugeiconsIcon
		icon={LeftToRightListBulletIcon}
		strokeWidth={0.9}
		{...props}
	/>
);
export const ListOrdered = (props: IconProps) => (
	<HugeiconsIcon icon={ListOrderedIcon} strokeWidth={0.9} {...props} />
);
export const ListChecks = (props: IconProps) => (
	<HugeiconsIcon icon={ListChecksIcon} strokeWidth={0.9} {...props} />
);
export const Heading1 = (props: IconProps) => (
	<HugeiconsIcon icon={Heading1Icon} strokeWidth={0.9} {...props} />
);
export const Heading2 = (props: IconProps) => (
	<HugeiconsIcon icon={Heading2Icon} strokeWidth={0.9} {...props} />
);
export const Heading3 = (props: IconProps) => (
	<HugeiconsIcon icon={Heading3Icon} strokeWidth={0.9} {...props} />
);
export const Link2 = (props: IconProps) => (
	<HugeiconsIcon icon={Link2Icon} strokeWidth={0.9} {...props} />
);
export const Eye = (props: IconProps) => (
	<HugeiconsIcon icon={EyeIcon} strokeWidth={0.9} {...props} />
);
export const Edit = (props: IconProps) => (
	<HugeiconsIcon icon={EditIcon} strokeWidth={0.9} {...props} />
);
