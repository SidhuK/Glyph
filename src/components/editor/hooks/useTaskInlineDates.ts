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

const TASK_ITEM_SELECTOR = "li[data-type='taskItem'], li[data-checked]";

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
	const [selectedTaskAnchor, setSelectedTaskAnchor] =
		useState<TaskAnchor | null>(null);
	const [scheduleAnchor, setScheduleAnchor] = useState<TaskAnchor | null>(null);
	const [scheduledDate, setScheduledDate] = useState("");
	const [dueDate, setDueDate] = useState("");
	const markdownRef = useRef(markdown);
	const selectedTaskElementRef = useRef<HTMLElement | null>(null);
	const selectedTaskOrdinalRef = useRef<number | null>(null);
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
				selectedTaskElementRef.current = null;
				selectedTaskOrdinalRef.current = null;
				setSelectedTaskAnchor(null);
				setScheduledDate("");
				setDueDate("");
				return;
			}
			selectedTaskOrdinalRef.current = anchor.ordinal;
			setSelectedTaskAnchor(anchor);
		},
		[],
	);

	useEffect(() => {
		if (!editor || mode !== "rich" || deferHeavyFeatures) {
			selectedTaskElementRef.current = null;
			selectedTaskOrdinalRef.current = null;
			setSelectedTaskAnchor(null);
			setScheduleAnchorAndSelection(null);
			return;
		}
		const host = hostRef.current;
		const contentRoot = getMountedEditorContentRoot(host);
		if (!host || !contentRoot) return;

		const areAnchorsEqual = (
			current: TaskAnchor | null,
			next: TaskAnchor | null,
		) =>
			current?.left === next?.left &&
			current?.ordinal === next?.ordinal &&
			current?.top === next?.top;

		const getTaskAnchor = (item: HTMLElement, ordinal: number): TaskAnchor => {
			const { left, top } = getOffsetWithinAncestor(item, host);
			const nextTop =
				top + Math.max(0, Math.round((item.offsetHeight - 18) / 2));
			return {
				left: Math.max(12, left - 24),
				ordinal,
				top: nextTop,
			};
		};

		const setActiveTaskAnchor = (anchor: TaskAnchor | null) => {
			setSelectedTaskAnchor((current) =>
				areAnchorsEqual(current, anchor) ? current : anchor,
			);
		};

		const clearActiveTaskAnchor = () => {
			selectedTaskElementRef.current = null;
			selectedTaskOrdinalRef.current = null;
			setActiveTaskAnchor(null);
		};

		const getTaskItems = () =>
			Array.from(
				contentRoot.querySelectorAll(TASK_ITEM_SELECTOR),
			) as HTMLElement[];

		const getTaskElementByOrdinal = (ordinal: number) =>
			getTaskItems()[ordinal] ?? null;

		const syncActiveTaskAnchor = () => {
			const scheduledAnchor = scheduleAnchorRef.current;
			if (scheduledAnchor) {
				const scheduledElement = getTaskElementByOrdinal(
					scheduledAnchor.ordinal,
				);
				if (!scheduledElement) {
					clearActiveTaskAnchor();
					return;
				}
				selectedTaskElementRef.current = scheduledElement;
				selectedTaskOrdinalRef.current = scheduledAnchor.ordinal;
				setActiveTaskAnchor(
					getTaskAnchor(scheduledElement, scheduledAnchor.ordinal),
				);
				return;
			}

			const selectedTaskElement = selectedTaskElementRef.current;
			const selectedTaskOrdinal = selectedTaskOrdinalRef.current;
			if (selectedTaskOrdinal == null && !selectedTaskElement) return;
			if (
				selectedTaskOrdinal == null ||
				!selectedTaskElement ||
				!contentRoot.contains(selectedTaskElement)
			) {
				clearActiveTaskAnchor();
				return;
			}
			setActiveTaskAnchor(
				getTaskAnchor(selectedTaskElement, selectedTaskOrdinal),
			);
		};

		const syncSelectedTask = () => {
			const keepScheduledTaskSelected = () => {
				const anchor = scheduleAnchorRef.current;
				if (!anchor) return false;
				const scheduledElement = getTaskElementByOrdinal(anchor.ordinal);
				selectedTaskElementRef.current = scheduledElement;
				selectedTaskOrdinalRef.current = scheduledElement
					? anchor.ordinal
					: null;
				setActiveTaskAnchor(
					scheduledElement
						? getTaskAnchor(scheduledElement, anchor.ordinal)
						: null,
				);
				return true;
			};
			const selection = window.getSelection();
			if (!selection?.anchorNode) {
				if (keepScheduledTaskSelected()) return;
				clearActiveTaskAnchor();
				return;
			}
			const anchorElement =
				selection.anchorNode instanceof HTMLElement
					? selection.anchorNode
					: selection.anchorNode.parentElement;
			if (!anchorElement || !contentRoot.contains(anchorElement)) {
				if (keepScheduledTaskSelected()) return;
				clearActiveTaskAnchor();
				return;
			}
			const taskEl = anchorElement.closest(
				TASK_ITEM_SELECTOR,
			) as HTMLElement | null;
			if (!taskEl) {
				if (keepScheduledTaskSelected()) return;
				clearActiveTaskAnchor();
				return;
			}
			const items = getTaskItems();
			const ordinal = items.indexOf(taskEl);
			if (ordinal < 0) {
				clearActiveTaskAnchor();
				return;
			}
			selectedTaskElementRef.current = taskEl;
			selectedTaskOrdinalRef.current = ordinal;
			setActiveTaskAnchor(getTaskAnchor(taskEl, ordinal));
		};

		syncSelectedTask();
		let anchorFrame = 0;
		const scheduleActiveTaskAnchorSync = () => {
			if (anchorFrame) return;
			anchorFrame = window.requestAnimationFrame(() => {
				anchorFrame = 0;
				syncActiveTaskAnchor();
			});
		};
		const observer = new MutationObserver(scheduleActiveTaskAnchorSync);
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
