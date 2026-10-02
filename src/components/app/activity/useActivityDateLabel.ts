import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDateDisplayFormat } from "../../../contexts";
import { formatDisplayDate } from "../../../lib/dateDisplayFormat";

/** Formats a day per the user's date display setting, falling back to Intl for "friendly". */
export function useActivityDateLabel(dateStyle: "full" | "long"): (date: Date) => string {
	const { i18n } = useTranslation("shell");
	const dateDisplayFormat = useDateDisplayFormat();
	return useMemo(() => {
		if (dateDisplayFormat !== "friendly") {
			return (date: Date) => formatDisplayDate(date, dateDisplayFormat);
		}
		const formatter = new Intl.DateTimeFormat(i18n.language, { dateStyle });
		return (date: Date) => formatter.format(date);
	}, [dateDisplayFormat, dateStyle, i18n.language]);
}
