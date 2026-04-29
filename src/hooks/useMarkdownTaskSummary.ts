import { useEffect, useMemo, useRef, useState } from "react";
import { type NoteTaskSummary, invoke } from "../lib/tauri";

export const EMPTY_TASK_SUMMARY: NoteTaskSummary = {
	total_count: 0,
	completed_count: 0,
	open_count: 0,
};

export function summarizeTasksFromMarkdown(markdown: string): NoteTaskSummary {
	let total_count = 0;
	let completed_count = 0;

	for (const line of markdown.split(/\r?\n/)) {
		const match = line.match(/^\s*[-*+] \[([ xX])\] /);
		if (!match) continue;
		total_count += 1;
		if (match[1].toLowerCase() === "x") {
			completed_count += 1;
		}
	}

	return {
		total_count,
		completed_count,
		open_count: total_count - completed_count,
	};
}

export function useMarkdownTaskSummary(markdown: string, enabled: boolean) {
	const [taskSummary, setTaskSummary] =
		useState<NoteTaskSummary>(EMPTY_TASK_SUMMARY);
	const timerRef = useRef<number | null>(null);
	const requestTokenRef = useRef(0);
	const mountedRef = useRef(true);

	const fallbackTaskSummary = useMemo(
		() => (enabled ? summarizeTasksFromMarkdown(markdown) : EMPTY_TASK_SUMMARY),
		[enabled, markdown],
	);
	const visibleTaskSummary = enabled
		? taskSummary.total_count > 0 || fallbackTaskSummary.total_count === 0
			? taskSummary
			: fallbackTaskSummary
		: taskSummary;

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
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		requestTokenRef.current += 1;
		setTaskSummary(EMPTY_TASK_SUMMARY);
		if (!enabled) return;

		const requestToken = requestTokenRef.current;

		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			void invoke("task_summary", { markdown })
				.then((summary) => {
					if (!mountedRef.current || requestTokenRef.current !== requestToken) {
						return;
					}
					const fallback = summarizeTasksFromMarkdown(markdown);
					setTaskSummary(
						summary.total_count > 0 || fallback.total_count === 0
							? summary
							: fallback,
					);
				})
				.catch(() => {
					if (!mountedRef.current || requestTokenRef.current !== requestToken) {
						return;
					}
					setTaskSummary(summarizeTasksFromMarkdown(markdown));
				});
		}, 90);

		return () => {
			if (timerRef.current !== null) {
				window.clearTimeout(timerRef.current);
				timerRef.current = null;
			}
		};
	}, [enabled, markdown]);

	return visibleTaskSummary;
}
