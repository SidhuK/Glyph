const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;
const CALENDAR_DATE_THRESHOLD_MS = 3 * MONTH_MS;
const formatters = new Map<string, Intl.RelativeTimeFormat>();

function formatterFor(locale: string): Intl.RelativeTimeFormat {
	const existing = formatters.get(locale);
	if (existing) return existing;
	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always", style: "narrow" });
	formatters.set(locale, formatter);
	return formatter;
}

/**
 * "4m ago" for recent times, in list rows (Folio, the palette's recents). Past three months a
 * calendar date reads better, so the caller supplies it.
 */
export function formatCompactRelativeTime({
	timestampMs,
	locale,
	nowMs,
	justNowLabel,
	absoluteDate,
}: {
	timestampMs: number;
	locale: string;
	nowMs: number;
	justNowLabel: string;
	absoluteDate: string;
}): string {
	const elapsedMs = Math.max(0, nowMs - timestampMs);
	if (elapsedMs < MINUTE_MS) return justNowLabel;
	const formatter = formatterFor(locale);
	if (elapsedMs < HOUR_MS) return formatter.format(-Math.floor(elapsedMs / MINUTE_MS), "minute");
	if (elapsedMs < DAY_MS) return formatter.format(-Math.floor(elapsedMs / HOUR_MS), "hour");
	if (elapsedMs < WEEK_MS) return formatter.format(-Math.floor(elapsedMs / DAY_MS), "day");
	if (elapsedMs < MONTH_MS) return formatter.format(-Math.floor(elapsedMs / WEEK_MS), "week");
	if (elapsedMs < CALENDAR_DATE_THRESHOLD_MS) {
		return formatter.format(-Math.floor(elapsedMs / MONTH_MS), "month");
	}
	return absoluteDate;
}
