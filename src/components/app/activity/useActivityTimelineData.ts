import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { addDays, startOfDay } from "date-fns";
import { useMemo } from "react";
import { useTaskSummariesForPaths } from "../../../hooks/useTaskSummariesForPaths";
import {
	ACTIVITY_DOCS_PAGE_SIZE,
	allDocsListQueryOptions,
	allDocsPagesQueryOptions,
} from "../../../lib/navigationPrefetch";
import { buildActivityDays, daysNewestFirst } from "./activityDays";

interface ActivityTimelineDataInput {
	dailyNotesFolder: string | null;
	folder: string | null;
	archived: boolean;
	enabled: boolean;
	/** The "all notes" timeline with its heatmap, as opposed to a flat collection. */
	timeline: boolean;
	selectedDayKey: string | null;
}

export function useActivityTimelineData({
	dailyNotesFolder,
	folder,
	archived,
	enabled,
	timeline,
	selectedDayKey,
}: ActivityTimelineDataInput) {
	const { data: today } = useQuery({
		queryKey: ["activity-current-day"],
		queryFn: () => startOfDay(new Date()).getTime(),
		initialData: () => startOfDay(new Date()).getTime(),
		enabled: enabled && timeline,
		staleTime: 0,
		// Schedule the next local midnight, including days shortened or lengthened by DST.
		refetchInterval: () => {
			const now = new Date();
			return addDays(startOfDay(now), 1).getTime() - now.getTime();
		},
	});
	const notesQuery = useInfiniteQuery({
		...allDocsPagesQueryOptions(folder, ACTIVITY_DOCS_PAGE_SIZE, archived),
		enabled,
	});
	const heatmapNotesQuery = useQuery({
		...allDocsListQueryOptions(),
		enabled: enabled && timeline,
	});
	const feedNotes = useMemo(
		() => notesQuery.data?.pages.flatMap((page) => page.items) ?? [],
		[notesQuery.data],
	);
	const heatmapNotes = heatmapNotesQuery.data ?? feedNotes;
	const heatmapDays = useMemo(
		() => buildActivityDays(timeline ? heatmapNotes : [], dailyNotesFolder),
		[heatmapNotes, dailyNotesFolder, timeline],
	);
	const selectedDay = selectedDayKey ? (heatmapDays.get(selectedDayKey) ?? null) : null;
	const feedDays = useMemo(() => {
		if (!timeline) return [];
		if (selectedDay) return [selectedDay];
		return daysNewestFirst(buildActivityDays(feedNotes, dailyNotesFolder));
	}, [feedNotes, dailyNotesFolder, timeline, selectedDay]);
	const displayedNotePaths = useMemo(
		() => (selectedDay ? [...selectedDay.notes.keys()] : feedNotes.map((note) => note.note_path)),
		[feedNotes, selectedDay],
	);
	const taskSummariesByPath = useTaskSummariesForPaths(displayedNotePaths, true);
	const todayDate = useMemo(() => new Date(today), [today]);

	return {
		feedNotes,
		notesQuery,
		taskSummariesByPath,
		heatmapDays,
		selectedDay,
		feedDays,
		today: todayDate,
	};
}
