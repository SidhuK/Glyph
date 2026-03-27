import type * as React from "react";

import { cn } from "@/lib/utils";

function UnstyledButton({
	className,
	type = "button",
	...props
}: React.ComponentProps<"button">) {
	return (
		<button
			type={type}
			data-slot="unstyled-button"
			className={cn(
				"appearance-none rounded-[var(--radius-interactive)] border-0 bg-transparent p-0 text-inherit font-inherit leading-inherit outline-none disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-ring/50 focus-visible:ring-[3px]",
				className,
			)}
			{...props}
		/>
	);
}

export { UnstyledButton };
