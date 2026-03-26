import { format } from "date-fns";

import { Calendar } from "../Icons";
import { Button } from "./shadcn/button";
import { Calendar as DateCalendar } from "./shadcn/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "./shadcn/popover";

interface DatePickerFieldProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	value?: Date;
	label: string;
	onSelect: (date?: Date) => void;
	className?: string;
}

function DatePickerField({
	open,
	onOpenChange,
	value,
	label,
	onSelect,
	className,
}: DatePickerFieldProps) {
	return (
		<Popover open={open} onOpenChange={onOpenChange}>
			<PopoverTrigger asChild>
				<Button type="button" variant="outline" size="sm" className={className}>
					<Calendar size={12} />
					{value ? format(value, "MMM d, yyyy") : label}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-auto p-3">
				<DateCalendar mode="single" selected={value} onSelect={onSelect} />
			</PopoverContent>
		</Popover>
	);
}

export { DatePickerField };
