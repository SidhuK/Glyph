import type { ReactNode } from "react";

import { Input } from "./shadcn/input";
import { Popover, PopoverContent, PopoverTrigger } from "./shadcn/popover";
import { ScrollArea } from "./shadcn/scroll-area";

interface SearchablePickerPopoverProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	trigger: ReactNode;
	query: string;
	onQueryChange: (query: string) => void;
	placeholder?: string;
	children: ReactNode;
	className?: string;
}

function SearchablePickerPopover({
	open,
	onOpenChange,
	trigger,
	query,
	onQueryChange,
	placeholder = "Filter…",
	children,
	className,
}: SearchablePickerPopoverProps) {
	return (
		<Popover open={open} onOpenChange={onOpenChange} modal={false}>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent align="start" className={className}>
				<Input
					value={query}
					placeholder={placeholder}
					onChange={(event) => onQueryChange(event.target.value)}
				/>
				<ScrollArea className="mt-3 max-h-72">{children}</ScrollArea>
			</PopoverContent>
		</Popover>
	);
}

export { SearchablePickerPopover };
