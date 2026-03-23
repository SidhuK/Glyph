"use client";

import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { formatCalendarDate } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";
import {
	type DayButton,
	DayPicker,
	getDefaultClassNames,
} from "react-day-picker";

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	buttonVariant = "ghost",
	components,
	...props
}: React.ComponentProps<typeof DayPicker> & {
	buttonVariant?: React.ComponentProps<typeof Button>["variant"];
}) {
	const defaultClassNames = getDefaultClassNames();

	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			className={cn("glyphCalendar", className)}
			classNames={{
				root: cn("glyphCalendarRoot", defaultClassNames.root),
				months: cn("glyphCalendarMonths", defaultClassNames.months),
				month: cn("glyphCalendarMonth", defaultClassNames.month),
				nav: cn("glyphCalendarNav", defaultClassNames.nav),
				button_previous: cn(
					buttonVariants({ variant: buttonVariant, size: "icon-xs" }),
					"glyphCalendarNavButton",
					defaultClassNames.button_previous,
				),
				button_next: cn(
					buttonVariants({ variant: buttonVariant, size: "icon-xs" }),
					"glyphCalendarNavButton",
					defaultClassNames.button_next,
				),
				month_caption: cn(
					"glyphCalendarCaption",
					defaultClassNames.month_caption,
				),
				caption_label: cn(
					"glyphCalendarCaptionLabel",
					defaultClassNames.caption_label,
				),
				table: "glyphCalendarTable",
				weekdays: cn("glyphCalendarWeekdays", defaultClassNames.weekdays),
				weekday: cn("glyphCalendarWeekday", defaultClassNames.weekday),
				week: cn("glyphCalendarWeek", defaultClassNames.week),
				day: cn("glyphCalendarDay", defaultClassNames.day),
				today: cn("glyphCalendarToday", defaultClassNames.today),
				outside: cn("glyphCalendarOutside", defaultClassNames.outside),
				selected: cn("glyphCalendarSelected", defaultClassNames.selected),
				disabled: cn("glyphCalendarDisabled", defaultClassNames.disabled),
				hidden: cn("glyphCalendarHidden", defaultClassNames.hidden),
				...classNames,
			}}
			components={{
				Root: ({ className: rootClassName, rootRef, ...rootProps }) => (
					<div
						data-slot="calendar"
						ref={rootRef}
						className={cn(rootClassName)}
						{...rootProps}
					/>
				),
				Chevron: ({ orientation, className: iconClassName, ...iconProps }) => {
					const icon = orientation === "left" ? ArrowLeft : ArrowRight;
					return (
						<HugeiconsIcon
							icon={icon}
							size={14}
							className={cn("glyphCalendarChevron", iconClassName)}
							{...iconProps}
						/>
					);
				},
				DayButton: CalendarDayButton,
				...components,
			}}
			{...props}
		/>
	);
}

function CalendarDayButton({
	className,
	day,
	modifiers,
	...props
}: React.ComponentProps<typeof DayButton>) {
	const ref = React.useRef<HTMLButtonElement>(null);

	React.useEffect(() => {
		if (modifiers.focused) ref.current?.focus();
	}, [modifiers.focused]);

	return (
		<Button
			ref={ref}
			variant="ghost"
			size="icon-xs"
			data-day={formatCalendarDate(day.date)}
			data-selected={modifiers.selected}
			data-today={modifiers.today}
			data-outside={modifiers.outside}
			className={cn("glyphCalendarDayButton", className)}
			{...props}
		/>
	);
}

export { Calendar };
