import type { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import { isSameDay, startOfDay, subDays } from "date-fns";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import type { FileTreeAppearance, NoteTaskSummary } from "../../../lib/tauri";
import { TaskProgressIndicator } from "../../checklists/TaskProgressIndicator";
import { springPresets } from "../../ui/animations";
import { AllDocsCard, prepareAllDocsCardProps } from "../AllDocsCard";
import type { ActivityDay } from "./activityDays";
import type { ActivityVirtualRow } from "./useActivityFeedRows";
import { useActivityDateLabel } from "./useActivityDateLabel";

interface ActivityFeedProps {
	virtualRows: ActivityVirtualRow[];
	virtualItems: VirtualItem[];
	rowVirtualizer: Virtualizer<HTMLElement, HTMLDivElement>;
	itemAppearance: Record<string, FileTreeAppearance>;
	selectedNotePath: string | null;
	taskSummariesByPath: Record<string, NoteTaskSummary>;
	shouldReduceMotion: boolean;
	onSelectNote: (notePath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
}

export function ActivityFeed({
	virtualRows,
	virtualItems,
	rowVirtualizer,
	itemAppearance,
	selectedNotePath,
	taskSummariesByPath,
	shouldReduceMotion,
	onSelectNote,
	onOpenFile,
}: ActivityFeedProps) {
	const { t } = useTranslation("shell");
	if (virtualRows.length === 0) {
		return (
			<div className="activityFeed">
				<div className="databaseLoadingState">{t("activity.empty")}</div>
			</div>
		);
	}

	return (
		<div
			className="activityFeed is-virtualized"
			style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
		>
			{virtualItems.map((virtualRow) => {
				const row = virtualRows[virtualRow.index];
				if (!row) return null;
				return (
					<div
						key={row.id}
						data-index={virtualRow.index}
						ref={(node) => rowVirtualizer.measureElement(node)}
						className="activityVirtualRow"
						style={{ transform: `translateY(${virtualRow.start}px)` }}
					>
						{row.kind === "header" ? (
							<ActivityDayHeaderRow day={row.day} />
						) : (
							<ActivityCardsRow
								row={row}
								itemAppearance={itemAppearance}
								selectedNotePath={selectedNotePath}
								taskSummariesByPath={taskSummariesByPath}
								shouldReduceMotion={shouldReduceMotion}
								onSelectNote={onSelectNote}
								onOpenFile={onOpenFile}
							/>
						)}
					</div>
				);
			})}
		</div>
	);
}

const ActivityDayHeaderRow = memo(function ActivityDayHeaderRow({ day }: { day: ActivityDay }) {
	const { t, i18n } = useTranslation("shell");
	const formatDate = useActivityDateLabel("long");
	const today = startOfDay(new Date());
	const isToday = isSameDay(day.date, today);
	const label = isToday
		? t("activity.today")
		: isSameDay(day.date, subDays(today, 1))
			? t("activity.yesterday")
			: new Intl.DateTimeFormat(i18n.language, { weekday: "long" }).format(day.date);
	return (
		<section className="activityDayGroup activityDayHeaderRow" data-today={isToday || undefined}>
			<div className="activityDayRail" aria-hidden="true" />
			<header className="activityDayHeader">
				<div className="activityDayHeading">
					<div className="activityDateBadge" aria-hidden="true">
						<span>
							{new Intl.DateTimeFormat(i18n.language, { month: "short" }).format(day.date)}
						</span>
						<strong>
							{new Intl.DateTimeFormat(i18n.language, { day: "numeric" }).format(day.date)}
						</strong>
					</div>
					<div>
						<h2>{label}</h2>
						<time className="activityDayDate" dateTime={day.dateKey}>
							{formatDate(day.date)}
						</time>
					</div>
				</div>
				<span className="activityDayCounts">
					{t("activity.noteCount", { count: day.notes.size })}
				</span>
			</header>
		</section>
	);
});

interface ActivityCardsRowProps {
	row: Extract<ActivityVirtualRow, { kind: "cards" }>;
	itemAppearance: Record<string, FileTreeAppearance>;
	selectedNotePath: string | null;
	taskSummariesByPath: Record<string, NoteTaskSummary>;
	shouldReduceMotion: boolean;
	onSelectNote: (notePath: string) => void;
	onOpenFile: (relPath: string) => Promise<void>;
}

function ActivityCardsRow({
	row,
	itemAppearance,
	selectedNotePath,
	taskSummariesByPath,
	shouldReduceMotion,
	onSelectNote,
	onOpenFile,
}: ActivityCardsRowProps) {
	return (
		<section
			className={row.timeline ? "activityDayGroup activityDayCardsRow" : "activityCardsOnlyRow"}
		>
			{row.timeline ? <div className="activityDayRail" aria-hidden="true" /> : null}
			<div className="activityNoteGrid allDocsGrid">
				{row.notes.map((note, noteIndex) => {
					const absoluteNoteIndex = row.startIndex + noteIndex;
					const cardProps = prepareAllDocsCardProps({
						note,
						index: absoluteNoteIndex,
						sectionIndex: row.dayIndex,
						selectedNotePath,
						taskSummariesByPath,
						selectNote: onSelectNote,
						onOpenFile,
					});
					return (
						<AllDocsCard
							key={note.note_path}
							{...cardProps}
							noteAppearance={itemAppearance[note.note_path] ?? null}
							shouldReduceMotion={shouldReduceMotion}
							springPreset={springPresets.snappy}
							TaskProgressComponent={TaskProgressIndicator}
						/>
					);
				})}
			</div>
		</section>
	);
}
