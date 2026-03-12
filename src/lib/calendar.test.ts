import { describe, expect, it } from "vitest";
import {
	buildMonthGridDates,
	endOfMonthGrid,
	groupCalendarItemsByDate,
	pickDefaultNoteDateProperty,
	startOfMonthGrid,
} from "./calendar";
import type { CalendarItem, CalendarNoteDateProperty } from "./tauri";

describe("calendar helpers", () => {
	it("builds a full month grid including leading and trailing days", () => {
		const month = new Date(2026, 2, 8);
		const dates = buildMonthGridDates(month);
		expect(dates).toHaveLength(35);
		expect(dates[0]?.getTime()).toBe(startOfMonthGrid(month).getTime());
		expect(dates[dates.length - 1]?.getTime()).toBe(
			endOfMonthGrid(month).getTime(),
		);
		expect(startOfMonthGrid(month).getDay()).toBe(0);
		expect(endOfMonthGrid(month).getDay()).toBe(6);
	});

	it("builds a six-row grid for long months", () => {
		const month = new Date(2026, 7, 4);
		const dates = buildMonthGridDates(month);
		expect(dates).toHaveLength(42);
		expect(dates[0]?.getTime()).toBe(startOfMonthGrid(month).getTime());
		expect(dates[dates.length - 1]?.getTime()).toBe(
			endOfMonthGrid(month).getTime(),
		);
	});

	it("groups calendar items by date", () => {
		const items: CalendarItem[] = [
			{
				id: "b",
				kind: "note",
				date: "2026-03-12",
				title: "Bravo",
				rel_path: "bravo.md",
				preview: "Preview bravo",
				badges: [],
			},
			{
				id: "a",
				kind: "note",
				date: "2026-03-12",
				title: "Alpha",
				rel_path: "alpha.md",
				preview: "Preview alpha",
				badges: [],
			},
			{
				id: "c",
				kind: "task",
				date: "2026-03-13",
				title: "Charlie",
				rel_path: "charlie.md",
				preview: "Preview charlie",
				badges: ["Due"],
			},
		];
		const grouped = groupCalendarItemsByDate(items);
		expect(grouped.get("2026-03-12")?.map((item) => item.title)).toEqual([
			"Alpha",
			"Bravo",
		]);
		expect(grouped.get("2026-03-13")).toHaveLength(1);
	});

	it("picks the existing selected note property when possible", () => {
		const properties: CalendarNoteDateProperty[] = [
			{ key: "publish_date", kind: "date", count: 4 },
			{ key: "starts_at", kind: "datetime", count: 2 },
		];
		expect(
			pickDefaultNoteDateProperty(properties, "starts_at", "datetime"),
		).toEqual(properties[1]);
		expect(pickDefaultNoteDateProperty(properties, "missing", "date")).toEqual(
			properties[0],
		);
	});
});
