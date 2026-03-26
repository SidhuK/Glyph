import { cn } from "@/lib/utils";
import type * as React from "react";

import { UnstyledButton } from "./UnstyledButton";

interface ChipProps extends Omit<React.ComponentProps<"button">, "children"> {
	children: React.ReactNode;
	passive?: boolean;
}

function Chip({ className, children, passive = false, ...props }: ChipProps) {
	const content = (
		<span className={cn("inline-flex items-center", className)}>
			{children}
		</span>
	);

	if (passive) {
		return content;
	}

	return (
		<UnstyledButton {...props} className="contents">
			{content}
		</UnstyledButton>
	);
}

export { Chip };
