import type * as React from "react";

import { cn } from "@/lib/utils";

function NativeSelect({
	className,
	children,
	...props
}: React.ComponentProps<"select">) {
	return (
		<select
			data-slot="native-select"
			className={cn(
				"w-full min-w-0 appearance-none bg-transparent text-inherit outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:ring-ring/50 focus-visible:ring-[3px]",
				className,
			)}
			{...props}
		>
			{children}
		</select>
	);
}

export { NativeSelect };
