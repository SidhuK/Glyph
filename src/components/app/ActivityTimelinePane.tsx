import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	Archive04Icon,
	Calendar03Icon,
	Cancel01Icon,
	InboxIcon,
	NoteIcon,
} from "@hugeicons/core-free-icons";
import { useReducedMotion } from "motion/react";
import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useFileTreeContext, useSpace, useUILayoutContext } from "../../contexts";
import { useVirtualLoadMore } from "../../hooks/useLoadMoreTriggers";
import { Button } from "../ui/shadcn/button";
import { CanvasPaneAwait } from "./CanvasPaneAwait";
import { ActivityFeed } from "./activity/ActivityFeed";
import { ActivityHeatmap } from "./activity/ActivityHeatmap";
import { useActivityDateLabel } from "./activity/useActivityDateLabel";
import { useActivityRows, useActivityVirtualization } from "./activity/useActivityFeedRows";
import { useActivityTimelineData } from "./activity/useActivityTimelineData";

interface ActivityTimelinePaneProps {
	kind?: "all" | "inbox" | "archive";
	onOpenFile: (relPath: string) => Promise<void>;
}

export const ActivityTimelinePane = memo(function ActivityTimelinePane({
	kind = "all",
	onOpenFile,
}: ActivityTimelinePaneProps) {
	const { itemAppearance } = useFileTreeContext();
	const { t } = useTranslation("shell");
	const { spacePath } = useSpace();
	const {
		dailyNotesFolder,
		defaultNewNoteFolder,
		settingsSpacePath,
		openSettings,
		archiveEnabled,
	} = useUILayoutContext();
	const folder = kind === "inbox" && settingsSpacePath === spacePath ? defaultNewNoteFolder : null;
	const needsSetup =
		(kind === "inbox" && !folder) ||
		(kind === "archive" && (!archiveEnabled || settingsSpacePath !== spacePath));
	const shouldReduceMotion = useReducedMotion() ?? false;
	const [paneElement, setPaneElement] = useState<HTMLElement | null>(null);
	const [selectedNotePath, setSelectedNotePath] = useState<string | null>(null);
	const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
	const formatDate = useActivityDateLabel("long");
	const { feedNotes, notesQuery, taskSummariesByPath, heatmapDays, selectedDay, feedDays, today } =
		useActivityTimelineData({
			dailyNotesFolder,
			folder,
			archived: kind === "archive",
			enabled: Boolean(spacePath) && !needsSetup,
			timeline: kind === "all",
			selectedDayKey,
		});
	const hasMore = !needsSetup && !selectedDay && notesQuery.hasNextPage;
	const virtualRows = useActivityRows(feedDays, kind === "all" ? undefined : feedNotes);
	const { rowVirtualizer, virtualItems } = useActivityVirtualization(paneElement, virtualRows);

	useVirtualLoadMore({
		hasMore,
		isLoading: notesQuery.isFetchingNextPage,
		onLoadMore: notesQuery.fetchNextPage,
		virtualItems,
		totalItems: virtualRows.length,
		remainingItems: 6,
	});

	if (needsSetup) {
		return (
			<section className="activityTimelinePane">
				<h1 className="activityTimelineTitle">
					{kind === "inbox" ? <HugeiconsIcon icon={InboxIcon} size="var(--icon-2xl)" /> : null}
					{t(kind === "archive" ? "sidebar.archive" : "sidebar.inbox")}
				</h1>
				<Button className="self-start" variant="ghost" onClick={() => openSettings("space")}>
					{t(
						kind === "archive" ? "noteCollections.enableArchive" : "noteCollections.configureInbox",
					)}
				</Button>
			</section>
		);
	}

	if (notesQuery.isLoading) {
		return <CanvasPaneAwait variant="all-docs" />;
	}

	if (notesQuery.error) {
		return (
			<div className="databaseLoadingState">
				{t("activity.loadError", {
					message:
						notesQuery.error instanceof Error ? notesQuery.error.message : String(notesQuery.error),
				})}
			</div>
		);
	}

	return (
		<section ref={setPaneElement} className="activityTimelinePane">
			<header className="activityTimelineHeader">
				<h1 className="activityTimelineTitle">
					<HugeiconsIcon
						icon={kind === "inbox" ? InboxIcon : kind === "archive" ? Archive04Icon : NoteIcon}
						size="var(--icon-2xl)"
					/>
					<span>{t(kind === "all" ? "sidebar.allNotes" : `sidebar.${kind}`)}</span>
				</h1>
			</header>
			{kind === "all" ? (
				<ActivityHeatmap
					days={heatmapDays}
					today={today}
					selectedDayKey={selectedDay?.dateKey ?? null}
					onSelectDay={setSelectedDayKey}
				/>
			) : null}
			{selectedDay ? (
				<div className="activityDayFilter">
					<span className="activityDayFilterChip">
						<HugeiconsIcon icon={Calendar03Icon} size="var(--icon-sm)" />
						{formatDate(selectedDay.date)}
						<button
							type="button"
							aria-label={t("activity.showAllNotes")}
							title={t("activity.showAllNotes")}
							onClick={() => setSelectedDayKey(null)}
						>
							<HugeiconsIcon icon={Cancel01Icon} size="var(--icon-sm)" />
						</button>
					</span>
				</div>
			) : null}
			{!feedNotes.length && kind !== "all" ? (
				<div className="databaseLoadingState">
					{t(kind === "inbox" ? "noteCollections.inboxEmpty" : "noteCollections.archiveEmpty")}
				</div>
			) : (
				<ActivityFeed
					virtualRows={virtualRows}
					virtualItems={virtualItems}
					rowVirtualizer={rowVirtualizer}
					itemAppearance={itemAppearance}
					selectedNotePath={selectedNotePath}
					taskSummariesByPath={taskSummariesByPath}
					shouldReduceMotion={shouldReduceMotion}
					onSelectNote={setSelectedNotePath}
					onOpenFile={onOpenFile}
				/>
			)}
			{hasMore ? (
				<Button
					type="button"
					className="self-start"
					variant="ghost"
					size="sm"
					disabled={notesQuery.isFetchingNextPage}
					onClick={() => void notesQuery.fetchNextPage()}
				>
					{t(notesQuery.isFetchingNextPage ? "activity.loadingOlder" : "activity.loadOlder")}
				</Button>
			) : null}
		</section>
	);
});
