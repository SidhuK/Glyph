import type { Editor } from "@tiptap/core";
import {
	type RefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { invoke } from "../../../lib/tauri";
import type { NoteInlineEditorMode } from "../types";
import {
	getMountedEditorContentRoot,
	getOffsetWithinAncestor,
} from "./editorDomUtils";

interface TaskAnchor {
	left: number;
	ordinal: number;
	top: number;
}

interface UseTaskInlineDatesArgs {
	deferHeavyFeatures: boolean;
	editor: Editor | null;
	hostRef: RefObject<HTMLDivElement | null>;
	markdown: string;
	mode: NoteInlineEditorMode;
	onChange: (nextMarkdown: string) => void;
}

export function useTaskInlineDates({
	deferHeavyFeatures,
	editor,
	hostRef,
	markdown,
	mode,
	onChange,
}: UseTaskInlineDatesArgs) {
	const [taskAnchors, setTaskAnchors] = useState<TaskAnchor[]>([]);
	const [selectedTaskOrdinal, setSelectedTaskOrdinal] = useState<number | null>(
		null,
	);
	const [scheduleAnchor, setScheduleAnchor] = useState<TaskAnchor | null>(null);
	const [scheduledDate, setScheduledDate] = useState("");
	const [dueDate, setDueDate] = useState("");
	const markdownRef = useRef(markdown);
	const scheduleAnchorRef = useRef<TaskAnchor | null>(null);

	useEffect(() => {
		markdownRef.current = markdown;
	}, [markdown]);

	useEffect(() => {
		scheduleAnchorRef.current = scheduleAnchor;
	}, [scheduleAnchor]);

	const setScheduleAnchorAndSelection = useCallback(
		(anchor: TaskAnchor | null) => {
			setScheduleAnchor(anchor);
			if (!anchor) {
				setSelectedTaskOrdinal(null);
				setScheduledDate("");
				setDueDate("");
				return;
			}
			setSelectedTaskOrdinal(anchor.ordinal);
		},
		[],
	);

	useEffect(() => {
		if (!editor || mode !== "rich" || deferHeavyFeatures) {
			setTaskAnchors([]);
			setSelectedTaskOrdinal(null);
			setScheduleAnchorAndSelection(null);
			return;
		}
		const host = hostRef.current;
		const contentRoot = getMountedEditorContentRoot(host);
		if (!host || !contentRoot) return;

		const syncAnchors = () => {
			const items = Array.from(
				contentRoot.querySelectorAll(
					"li[data-type='taskItem'], li[data-checked]",
				),
			) as HTMLElement[];
			const nextAnchors = items.map((item, ordinal) => {
				const { left, top } = getOffsetWithinAncestor(item, host);
				const nextTop =
					top + Math.max(0, Math.round((item.offsetHeight - 18) / 2));
				return {
					left: Math.max(12, left - 24),
					ordinal,
					top: nextTop,
				};
			});
			setTaskAnchors((current) => {
				if (
					current.length === nextAnchors.length &&
					current.every(
						(anchor, index) =>
							anchor.left === nextAnchors[index]?.left &&
							anchor.ordinal === nextAnchors[index]?.ordinal &&
							anchor.top === nextAnchors[index]?.top,
					)
				) {
					return current;
				}
				return nextAnchors;
			});
		};

		const syncSelectedTask = () => {
			const keepScheduledTaskSelected = () => {
				const anchor = scheduleAnchorRef.current;
				if (!anchor) return false;
				setSelectedTaskOrdinal((current) =>
					current === anchor.ordinal ? current : anchor.ordinal,
				);
				return true;
			};
			const selection = window.getSelection();
			if (!selection?.anchorNode) {
				if (keepScheduledTaskSelected()) return;
				setSelectedTaskOrdinal(null);
				return;
			}
			const anchorElement =
				selection.anchorNode instanceof HTMLElement
					? selection.anchorNode
					: selection.anchorNode.parentElement;
			if (!anchorElement || !contentRoot.contains(anchorElement)) {
				if (keepScheduledTaskSelected()) return;
				setSelectedTaskOrdinal(null);
				return;
			}
			const taskEl = anchorElement.closest(
				"li[data-type='taskItem'], li[data-checked]",
			) as HTMLElement | null;
			if (!taskEl) {
				if (keepScheduledTaskSelected()) return;
				setSelectedTaskOrdinal(null);
				return;
			}
			const items = Array.from(
				contentRoot.querySelectorAll(
					"li[data-type='taskItem'], li[data-checked]",
				),
			) as HTMLElement[];
			const ordinal = items.indexOf(taskEl);
			setSelectedTaskOrdinal((current) => {
				const nextOrdinal = ordinal >= 0 ? ordinal : null;
				return current === nextOrdinal ? current : nextOrdinal;
			});
		};

		syncAnchors();
		syncSelectedTask();
		let anchorFrame = 0;
		const scheduleSyncAnchors = () => {
			if (anchorFrame) return;
			anchorFrame = window.requestAnimationFrame(() => {
				anchorFrame = 0;
				syncAnchors();
			});
		};
		const observer = new MutationObserver(scheduleSyncAnchors);
		observer.observe(contentRoot, {
			childList: true,
			subtree: true,
			characterData: true,
		});
		document.addEventListener("selectionchange", syncSelectedTask);
		editor.on("selectionUpdate", syncSelectedTask);
		return () => {
			if (anchorFrame) window.cancelAnimationFrame(anchorFrame);
			observer.disconnect();
			document.removeEventListener("selectionchange", syncSelectedTask);
			editor.off("selectionUpdate", syncSelectedTask);
		};
	}, [
		deferHeavyFeatures,
		editor,
		hostRef,
		mode,
		setScheduleAnchorAndSelection,
	]);

	const selectedTaskAnchor =
		selectedTaskOrdinal == null
			? null
			: (taskAnchors.find((anchor) => anchor.ordinal === selectedTaskOrdinal) ??
				null);

	const openTaskPopover = useCallback(
		async (anchor: TaskAnchor) => {
			const expectedOrdinal = anchor.ordinal;
			setScheduleAnchorAndSelection(anchor);
			try {
				const existing = await invoke("task_dates_by_ordinal", {
					markdown: markdownRef.current,
					ordinal: expectedOrdinal,
				});
				if (scheduleAnchorRef.current?.ordinal !== expectedOrdinal) return;
				setScheduledDate(existing?.scheduled_date ?? "");
				setDueDate(existing?.due_date ?? "");
			} catch {
				if (scheduleAnchorRef.current?.ordinal !== expectedOrdinal) return;
				setScheduledDate("");
				setDueDate("");
			}
		},
		[setScheduleAnchorAndSelection],
	);

	const resetDraftDates = useCallback(async () => {
		if (!scheduleAnchor) {
			setScheduledDate("");
			setDueDate("");
			return;
		}
		const expectedOrdinal = scheduleAnchor.ordinal;
		try {
			const existing = await invoke("task_dates_by_ordinal", {
				markdown: markdownRef.current,
				ordinal: expectedOrdinal,
			});
			if (scheduleAnchorRef.current?.ordinal !== expectedOrdinal) return;
			setScheduledDate(existing?.scheduled_date ?? "");
			setDueDate(existing?.due_date ?? "");
		} catch {
			if (scheduleAnchorRef.current?.ordinal !== expectedOrdinal) return;
			setScheduledDate("");
			setDueDate("");
		}
	}, [scheduleAnchor]);

	const updateTaskDates = useCallback(
		async (scheduled: string, due: string) => {
			if (!scheduleAnchor) return false;
			setScheduledDate(scheduled);
			setDueDate(due);
			try {
				const next = await invoke("task_update_by_ordinal", {
					markdown: markdownRef.current,
					ordinal: scheduleAnchor.ordinal,
					scheduled_date: scheduled,
					due_date: due,
				});
				if (!next) {
					await resetDraftDates();
					return false;
				}
				markdownRef.current = next;
				onChange(next);
				return true;
			} catch (error) {
				console.error("Failed to update task dates", error);
				await resetDraftDates();
				return false;
			}
		},
		[onChange, resetDraftDates, scheduleAnchor],
	);

	return {
		dueDate,
		openTaskPopover,
		resetDraftDates,
		scheduleAnchor,
		scheduledDate,
		selectedTaskAnchor,
		setDueDate,
		setScheduleAnchor: setScheduleAnchorAndSelection,
		setScheduledDate,
		updateTaskDates,
	};
}
