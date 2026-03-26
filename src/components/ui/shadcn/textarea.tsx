import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"w-full min-w-0 bg-transparent text-inherit outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-ring/50 focus-visible:ring-[3px]",
				className,
			)}
			{...props}
		/>
	);
}

export { Textarea };
