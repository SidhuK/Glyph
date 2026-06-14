import { lazy, Suspense, useCallback, useEffect, useState } from "react";

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
	onOpenDailyNoteAtDate: (date: string) => void;
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
	onOpenDailyNoteAtDate,
}: CalendarPaletteControllerProps) {
	const [mounted, setMounted] = useState(open);

	useEffect(() => {
		if (open) setMounted(true);
	}, [open]);

	const handleOpenNote = useCallback(
		(path: string) => onOpenNote(path),
		[onOpenNote],
	);

	const handleOpenDailyNoteAtDate = useCallback(
		(date: string) => onOpenDailyNoteAtDate(date),
		[onOpenDailyNoteAtDate],
	);

	if (!mounted) return null;

	return (
		<Suspense fallback={null}>
			<LazyCalendarPalette
				open={open}
				onClose={onClose}
				spacePath={spacePath}
				dailyNoteFolder={dailyNoteFolder}
				onOpenNote={handleOpenNote}
				onOpenDailyNoteAtDate={handleOpenDailyNoteAtDate}
			/>
		</Suspense>
	);
}
