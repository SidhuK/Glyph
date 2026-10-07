import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";

import { cn } from "@/lib/utils";

function ScrollArea({ className, children, ...props }: ScrollAreaPrimitive.Root.Props) {
	return (
		<ScrollAreaPrimitive.Root
			data-slot="scroll-area"
			className={cn("relative", className)}
			{...props}
		>
			<ScrollAreaPrimitive.Viewport
				data-slot="scroll-area-viewport"
				className="focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1"
			>
				{children}
			</ScrollAreaPrimitive.Viewport>
			<ScrollAreaPrimitive.Scrollbar
				data-slot="scroll-area-scrollbar"
				orientation="vertical"
				className="flex h-full w-2.5 touch-none border-l border-l-transparent p-px opacity-0 transition-opacity select-none data-hovering:opacity-100 data-scrolling:opacity-100"
			>
				<ScrollAreaPrimitive.Thumb
					data-slot="scroll-area-thumb"
					className="bg-border relative w-full rounded-full"
				/>
			</ScrollAreaPrimitive.Scrollbar>
			<ScrollAreaPrimitive.Corner />
		</ScrollAreaPrimitive.Root>
	);
}

export { ScrollArea };
