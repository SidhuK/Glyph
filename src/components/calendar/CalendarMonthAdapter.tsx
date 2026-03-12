import { cn } from "@/lib/utils";
import type { KeyboardEvent } from "react";
import type { CalendarItem } from "../../lib/tauri";

interface CalendarMonthAdapterProps {
	dates: Date[];
	month: Date;
	selectedDate: string;
	itemsByDate: Map<string, CalendarItem[]>;
	weekdayLabels: string[];
	onSelectDate: (date: string) => void;
	onOpenItem: (item: CalendarItem) => void;
}

function isoDateFromDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

const TODAY_ISO = isoDateFromDate(new Date());

function itemTone(item: CalendarItem) {
	if (item.kind === "daily_note") return "daily-note";
	if (item.kind === "task") {
		if (item.badges?.includes("Due") && item.badges?.includes("Scheduled"))
			return "task-combined";
		if (item.badges?.includes("Due")) return "task-due";
		if (item.badges?.includes("Scheduled")) return "task-scheduled";
	}
	return "note";
}

function handleCellKeyDown(
	event: KeyboardEvent<HTMLDivElement>,
	onSelectDate: (date: string) => void,
	date: string,
) {
	if (event.key !== "Enter" && event.key !== " ") {
		return;
	}
	event.preventDefault();
	onSelectDate(date);
}

export function CalendarMonthAdapter({
	dates,
	month,
	selectedDate,
	itemsByDate,
	weekdayLabels,
	onSelectDate,
	onOpenItem,
}: CalendarMonthAdapterProps) {
	const weekCount = Math.max(1, Math.ceil(dates.length / 7));

	return (
		<div className="calMonthShell">
			<div className="calWeekdayRow">
				{weekdayLabels.map((label) => (
					<div key={label} className="calWeekday">
						{label}
					</div>
				))}
			</div>
			<div
				className="calGrid"
				aria-label="Calendar month"
				style={{
					gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))`,
				}}
			>
				{dates.map((date) => {
					const iso = isoDateFromDate(date);
					const items = itemsByDate.get(iso) ?? [];
					const isCurrentMonth =
						date.getMonth() === month.getMonth() &&
						date.getFullYear() === month.getFullYear();
					const isSelected = selectedDate === iso;
					const isToday = iso === TODAY_ISO;
					const visibleItems = items.slice(0, 3);
					const overflowCount = Math.max(items.length - visibleItems.length, 0);
					const stackedItems =
						overflowCount > 0 ? visibleItems.slice(0, -1) : visibleItems;
					const inlineItem =
						overflowCount > 0 ? visibleItems[visibleItems.length - 1] : null;

					return (
						<div
							key={iso}
							className={cn(
								"calCell",
								!isCurrentMonth && "is-outside",
								isSelected && "is-selected",
							)}
							role="button"
							tabIndex={0}
							aria-pressed={isSelected}
							onClick={() => onSelectDate(iso)}
							onKeyDown={(event) =>
								handleCellKeyDown(event, onSelectDate, iso)
							}
						>
							<div className="calCellHeader">
								<span
									className={cn(
										"calCellDay",
										isToday && "is-today",
										isSelected && "is-active",
									)}
								>
									{date.getDate()}
								</span>
							</div>
							<div
								className={cn(
									"calCellEvents",
									visibleItems.length === 0 && "is-empty",
								)}
							>
								{visibleItems.length > 0 ? (
									<>
										{stackedItems.map((item) => (
											<button
												key={item.id}
												type="button"
												className={cn("calEventChip", `is-${itemTone(item)}`)}
												onClick={(e) => {
													e.stopPropagation();
													onOpenItem(item);
												}}
												title={item.title}
											>
												{item.title}
											</button>
										))}
										{inlineItem ? (
											<div className="calCellOverflowRow">
												<button
													type="button"
													className={cn(
														"calEventChip is-inline-overflow",
														`is-${itemTone(inlineItem)}`,
													)}
													onClick={(e) => {
														e.stopPropagation();
														onOpenItem(inlineItem);
													}}
													title={inlineItem.title}
												>
													{inlineItem.title}
												</button>
												<span className="calCellMore">
													+{overflowCount} more
												</span>
											</div>
										) : null}
									</>
								) : null}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
