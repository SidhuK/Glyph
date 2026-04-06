import {
	Add,
	ArrowReloadHorizontalIcon,
	Bot as BotIcon,
	Close,
	Delete,
	Help,
	MessageSquare as MessageSquareIcon,
	Minus as MinusIcon,
	MoreHorizontal as MoreHorizontalIcon,
	Paperclip as PaperclipIcon,
	Save as SaveIcon,
	Send as SendIcon,
	Sparkles as SparklesIcon,
	Warning,
	Zap as ZapIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconProps } from "./NavigationIcons";

export const Plus = (props: IconProps) => (
	<HugeiconsIcon icon={Add} strokeWidth={0.9} {...props} />
);
export const Minus = (props: IconProps) => (
	<HugeiconsIcon icon={MinusIcon} strokeWidth={0.9} {...props} />
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
export const Paperclip = (props: IconProps) => (
	<HugeiconsIcon icon={PaperclipIcon} strokeWidth={0.9} {...props} />
);
export const X = (props: IconProps) => (
	<HugeiconsIcon icon={Close} strokeWidth={0.9} {...props} />
);
export const Zap = (props: IconProps) => (
	<HugeiconsIcon icon={ZapIcon} strokeWidth={0.9} {...props} />
);
export const Sparkles = (props: IconProps) => (
	<HugeiconsIcon icon={SparklesIcon} strokeWidth={0.9} {...props} />
);
export const Bot = (props: IconProps) => (
	<HugeiconsIcon icon={BotIcon} strokeWidth={0.9} {...props} />
);
export const Send = (props: IconProps) => (
	<HugeiconsIcon icon={SendIcon} strokeWidth={0.9} {...props} />
);
export const MessageSquare = (props: IconProps) => (
	<HugeiconsIcon icon={MessageSquareIcon} strokeWidth={0.9} {...props} />
);
export const TriangleAlert = (props: IconProps) => (
	<HugeiconsIcon icon={Warning} strokeWidth={0.9} {...props} />
);
export const CircleHelp = (props: IconProps) => (
	<HugeiconsIcon icon={Help} strokeWidth={0.9} {...props} />
);
export const MoreHorizontal = (props: IconProps) => (
	<HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={0.9} {...props} />
);
