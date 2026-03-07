import {
	Add,
	Bot as BotIcon,
	Close,
	Delete,
	Help,
	MessageSquare as MessageSquareIcon,
	Minus as MinusIcon,
	Paperclip as PaperclipIcon,
	Refresh,
	Save as SaveIcon,
	Send as SendIcon,
	Sparkles as SparklesIcon,
	Warning,
	Zap as ZapIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconProps } from "./NavigationIcons";

export const Plus = (props: IconProps) => (
	<HugeiconsIcon icon={Add} {...props} />
);
export const Minus = (props: IconProps) => (
	<HugeiconsIcon icon={MinusIcon} {...props} />
);
export const Trash2 = (props: IconProps) => (
	<HugeiconsIcon icon={Delete} {...props} />
);
export const RefreshCw = (props: IconProps) => (
	<HugeiconsIcon icon={Refresh} {...props} />
);
export const RotateCcw = (props: IconProps) => (
	<HugeiconsIcon icon={Refresh} {...props} />
);
export const Save = (props: IconProps) => (
	<HugeiconsIcon icon={SaveIcon} {...props} />
);
export const Paperclip = (props: IconProps) => (
	<HugeiconsIcon icon={PaperclipIcon} {...props} />
);
export const X = (props: IconProps) => (
	<HugeiconsIcon icon={Close} {...props} />
);
export const Zap = (props: IconProps) => (
	<HugeiconsIcon icon={ZapIcon} {...props} />
);
export const Sparkles = (props: IconProps) => (
	<HugeiconsIcon icon={SparklesIcon} {...props} />
);
export const Bot = (props: IconProps) => (
	<HugeiconsIcon icon={BotIcon} {...props} />
);
export const Send = (props: IconProps) => (
	<HugeiconsIcon icon={SendIcon} {...props} />
);
export const MessageSquare = (props: IconProps) => (
	<HugeiconsIcon icon={MessageSquareIcon} {...props} />
);
export const TriangleAlert = (props: IconProps) => (
	<HugeiconsIcon icon={Warning} {...props} />
);
export const CircleHelp = (props: IconProps) => (
	<HugeiconsIcon icon={Help} {...props} />
);
