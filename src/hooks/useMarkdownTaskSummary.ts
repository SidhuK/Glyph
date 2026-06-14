import { useEffect, useMemo, useRef, useState } from "react";
import {
	EMPTY_CHECKLIST_SUMMARY,
	summarizeChecklistsFromMarkdown,
} from "../lib/checklistSummary";
import { type NoteTaskSummary, invoke } from "../lib/tauri";

export function useMarkdownTaskSummary(markdown: string, enabled: boolean) {
	const [taskSummary, setTaskSummary] = useState<NoteTaskSummary>(
		EMPTY_CHECKLIST_SUMMARY,
	);
	const timerRef = useRef<number | null>(null);
	const requestTokenRef = useRef(0);
	const mountedRef = useRef(true);

	const fallbackTaskSummary = useMemo(
		() =>
			enabled
				? summarizeChecklistsFromMarkdown(markdown)
				: EMPTY_CHECKLIST_SUMMARY,
		[enabled, markdown],
	);
	const visibleTaskSummary = enabled
		? taskSummary.total_count > 0 || fallbackTaskSummary.total_count === 0
			? taskSummary
			: fallbackTaskSummary
		: EMPTY_CHECKLIST_SUMMARY;

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (!enabled) {
			setTaskSummary(EMPTY_CHECKLIST_SUMMARY);
			return;
		}

		setTaskSummary(fallbackTaskSummary);

		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		requestTokenRef.current += 1;

		const requestToken = requestTokenRef.current;

		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			void invoke("task_summary", { markdown })
				.then((summary) => {
					if (!mountedRef.current || requestTokenRef.current !== requestToken) {
						return;
					}
					setTaskSummary(
						summary.total_count > 0 || fallbackTaskSummary.total_count === 0
							? summary
							: fallbackTaskSummary,
					);
				})
				.catch(() => {
					if (!mountedRef.current || requestTokenRef.current !== requestToken) {
						return;
					}
					setTaskSummary(fallbackTaskSummary);
				});
		}, 90);

		return () => {
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [enabled, fallbackTaskSummary, markdown]);

	return visibleTaskSummary;
}
