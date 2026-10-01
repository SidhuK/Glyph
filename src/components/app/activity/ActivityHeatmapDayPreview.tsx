import { useTranslation } from "react-i18next";
import { titleFromPath } from "../AllDocsCard";
import { type ActivityDay, sortedDayNotes } from "./activityDays";

const PREVIEW_TITLE_LIMIT = 3;

interface ActivityHeatmapDayPreviewProps {
	day: ActivityDay | undefined;
	dateLabel: string;
}

export function ActivityHeatmapDayPreview({ day, dateLabel }: ActivityHeatmapDayPreviewProps) {
	const { t } = useTranslation("shell");
	const notes = day ? sortedDayNotes(day) : [];
	const created = notes.filter((item) => item.created).length;
	const edited = notes.length - created;
	const counts = [
		created > 0 ? t("activity.createdCount", { count: created }) : null,
		edited > 0 ? t("activity.editedCount", { count: edited }) : null,
	].filter(Boolean);

	return (
		<>
			<p className="activityHeatmapPreviewDate">{dateLabel}</p>
			<p className="activityHeatmapPreviewCounts">
				{counts.length > 0 ? counts.join(" · ") : t("activity.noActivityOnDay")}
			</p>
			{notes.length > 0 ? (
				<ul className="activityHeatmapPreviewNotes">
					{notes.slice(0, PREVIEW_TITLE_LIMIT).map(({ note }) => (
						<li key={note.note_path}>{note.title.trim() || titleFromPath(note.note_path)}</li>
					))}
					{notes.length > PREVIEW_TITLE_LIMIT ? (
						<li className="activityHeatmapPreviewMore">
							{t("activity.moreNotes", { count: notes.length - PREVIEW_TITLE_LIMIT })}
						</li>
					) : null}
				</ul>
			) : null}
			{notes.length > 0 ? (
				<p className="activityHeatmapPreviewHint">{t("activity.selectDayHint")}</p>
			) : null}
		</>
	);
}
