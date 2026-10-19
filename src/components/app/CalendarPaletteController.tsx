import { Suspense, lazy, useState } from "react";
import type { OpenPeriodNoteAtDate } from "./calendar/useCalendarView";

const loadCalendarPalette = () =>
	import("./CalendarPalette").then((module) => ({
		default: module.CalendarPalette,
	}));

const LazyCalendarPalette = lazy(loadCalendarPalette);

interface CalendarPaletteControllerProps {
	open: boolean;
	onClose: () => void;
	onOpenNote: (path: string) => void;
	onOpenPeriodNoteAtDate: OpenPeriodNoteAtDate;
}

export function preloadCalendarPalette(): void {
	void loadCalendarPalette();
}

export function CalendarPaletteController({
	open,
	onClose,
	onOpenNote,
	onOpenPeriodNoteAtDate,
}: CalendarPaletteControllerProps) {
	// Keep the palette mounted after its first open so reopening is instant.
	const [mounted, setMounted] = useState(open);
	if (open && !mounted) setMounted(true);

	if (!mounted) return null;

	return (
		<Suspense fallback={null}>
			<LazyCalendarPalette
				open={open}
				onClose={onClose}
				onOpenNote={onOpenNote}
				onOpenPeriodNoteAtDate={onOpenPeriodNoteAtDate}
			/>
		</Suspense>
	);
}
