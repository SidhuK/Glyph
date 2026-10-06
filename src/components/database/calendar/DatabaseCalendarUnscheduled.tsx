import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { useDatabaseUndatedRows } from "../../../hooks/database/useDatabaseUndatedRows";
import { extractErrorMessage } from "../../../lib/errorUtils";
import type { DatabaseRow } from "../../../lib/database/types";

interface DatabaseCalendarUnscheduledProps {
	undated: ReturnType<typeof useDatabaseUndatedRows>;
	renderCard: (row: DatabaseRow) => ReactNode;
}

export function DatabaseCalendarUnscheduled({
	undated,
	renderCard,
}: DatabaseCalendarUnscheduledProps) {
	const { t } = useTranslation("shell");
	return (
		<aside
			className="databaseCalendarUnscheduled"
			aria-label={t("collections.calendar.unscheduled")}
		>
			<header className="databaseCalendarUnscheduledHeader">
				<span>{t("collections.calendar.unscheduled")}</span>
				<span className="databaseCalendarUnscheduledCount">{undated.totalCount}</span>
			</header>
			<div className="databaseCalendarUnscheduledList">
				{undated.error ? (
					<div className="databaseNotice databaseNoticeError">
						{extractErrorMessage(undated.error)}
					</div>
				) : null}
				{undated.rows.length === 0 && !undated.error ? (
					<div className="databaseCalendarUnscheduledEmpty">
						{t("collections.calendar.unscheduledEmpty")}
					</div>
				) : (
					undated.rows.map(renderCard)
				)}
				{undated.hasMore ? (
					<button
						type="button"
						className="databaseCalendarUnscheduledMore"
						disabled={undated.isLoadingMore}
						onClick={() => void undated.loadMore()}
					>
						{t("collections.loadMore")}
					</button>
				) : null}
			</div>
		</aside>
	);
}
