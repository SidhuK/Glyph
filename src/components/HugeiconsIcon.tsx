import { HugeiconsIcon as BaseHugeiconsIcon } from "@hugeicons/react";
import type { ComponentProps } from "react";

type HugeiconsIconProps = ComponentProps<typeof BaseHugeiconsIcon>;

export function HugeiconsIcon({
	strokeWidth = 1.5,
	...props
}: HugeiconsIconProps) {
	return <BaseHugeiconsIcon strokeWidth={strokeWidth} {...props} />;
}
