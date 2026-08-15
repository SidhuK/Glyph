import { Suspense, lazy, useState } from "react";
import type { PeriodKind } from "../../lib/periodNotes";

const loadCalendarPalette = () =>
	import("./CalendarPalette").then((module) => ({
		default: module.CalendarPalette,
	}));

const LazyCalendarPalette = lazy(loadCalendarPalette);

interface CalendarPaletteControllerProps {
	open: boolean;
	onClose: () => void;
	spacePath: string | null;
	dailyNoteFolder: string | null;
	onOpenNote: (path: string) => void;
	onOpenPeriodNoteAtDate: (kind: PeriodKind, date: string) => void;
}

export function preloadCalendarPalette(): void {
	void loadCalendarPalette();
}

export function CalendarPaletteController({
	open,
	onClose,
	spacePath,
	dailyNoteFolder,
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
				spacePath={spacePath}
				dailyNoteFolder={dailyNoteFolder}
				onOpenNote={onOpenNote}
				onOpenPeriodNoteAtDate={onOpenPeriodNoteAtDate}
			/>
		</Suspense>
	);
}
