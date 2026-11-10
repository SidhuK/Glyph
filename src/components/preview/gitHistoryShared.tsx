import { useTranslation } from "react-i18next";
import { useDateDisplayFormat } from "../../contexts";
import {
	formatDisplayDate,
	formatLocalClockTime,
	parseDisplayDateInput,
} from "../../lib/dateDisplayFormat";
import type { GitHistoryCommit } from "../../lib/tauri";

const DAY_MS = 86_400_000;
const RELATIVE_UNITS = [
	{ unit: "day", ms: DAY_MS },
	{ unit: "hour", ms: 3_600_000 },
	{ unit: "minute", ms: 60_000 },
] as const;

function startOfDay(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Labels for when a version was saved, in the app language and the user's date format. */
export function useGitHistoryDates() {
	const { t, i18n } = useTranslation("editor");
	const dateDisplayFormat = useDateDisplayFormat();

	const day = (timestampMs: number): string => {
		const date = parseDisplayDateInput(timestampMs);
		if (!date) return "";
		const now = new Date();
		const daysAgo = Math.round((startOfDay(now) - startOfDay(date)) / DAY_MS);
		if (daysAgo === 0) return t("infoSidebar.history.today");
		if (daysAgo === 1) return t("infoSidebar.history.yesterday");
		return date.toLocaleDateString(i18n.language, {
			weekday: "short",
			month: "short",
			day: "numeric",
			year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
		});
	};
	const time = (timestampMs: number): string => {
		const date = parseDisplayDateInput(timestampMs);
		return date ? formatLocalClockTime(date) : "";
	};
	const dayAndTime = (timestampMs: number): string =>
		[day(timestampMs), time(timestampMs)].filter(Boolean).join(", ");
	const full = (timestampMs: number): string => {
		const date = parseDisplayDateInput(timestampMs);
		return date
			? formatDisplayDate(date, dateDisplayFormat, { time: formatLocalClockTime(date) })
			: "";
	};
	const relative = (timestampMs: number): string => {
		const elapsedMs = timestampMs - Date.now();
		const formatter = new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" });
		const match = RELATIVE_UNITS.find(({ ms }) => Math.abs(elapsedMs) >= ms);
		return match
			? formatter.format(Math.round(elapsedMs / match.ms), match.unit)
			: formatter.format(0, "minute");
	};

	return { day, time, dayAndTime, full, relative };
}

/** Lines added and removed by a version, always visible beside its time. */
export function GitChangeStats({ commit }: { commit: GitHistoryCommit }) {
	const added = commit.added_count + commit.modified_count;
	const deleted = commit.deleted_count + commit.modified_count;
	if (added === 0 && deleted === 0) return null;
	return (
		<span className="gitHistoryStats">
			{added > 0 ? <span className="gitHistoryStatAdd">+{added.toLocaleString()}</span> : null}
			{deleted > 0 ? (
				<span className="gitHistoryStatDelete">−{deleted.toLocaleString()}</span>
			) : null}
		</span>
	);
}
