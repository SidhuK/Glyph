import { Slider as SliderPrimitive } from "radix-ui";
import type * as React from "react";

import { cn } from "@/lib/utils";

function Slider({
	className,
	defaultValue,
	value,
	min = 0,
	max = 100,
	...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
	const values = value ??
		defaultValue ?? [min, max > min ? Math.min(min + 1, max) : min];

	return (
		<SliderPrimitive.Root
			data-slot="slider"
			defaultValue={defaultValue}
			value={value}
			min={min}
			max={max}
			className={cn(
				"relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50",
				className,
			)}
			{...props}
		>
			<SliderPrimitive.Track
				data-slot="slider-track"
				className="bg-muted relative h-2 w-full grow overflow-hidden rounded-full"
			>
				<SliderPrimitive.Range
					data-slot="slider-range"
					className="bg-primary absolute h-full"
				/>
			</SliderPrimitive.Track>
			{values.map((entry: number, index: number) => (
				<SliderPrimitive.Thumb
					key={`${index}-${entry}`}
					data-slot="slider-thumb"
					className="border-primary bg-background ring-ring/50 block size-4 shrink-0 rounded-full border shadow-sm transition-[color,box-shadow] hover:ring-[3px] focus-visible:ring-[3px] focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
				/>
			))}
		</SliderPrimitive.Root>
	);
}

export { Slider };
