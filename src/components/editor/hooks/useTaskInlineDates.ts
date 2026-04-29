import type { Editor } from "@tiptap/core";
import { format, isValid, parseISO } from "date-fns";
import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { todayIsoDateLocal } from "../../../lib/tasks";
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

function safeParseISO(value?: string): Date | undefined {
	if (!value) return undefined;
	const parsed = parseISO(value);
	return isValid(parsed) ? parsed : undefined;
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
	const [activeDateField, setActiveDateField] = useState<"scheduled" | "due">(
		"scheduled",
	);
	const [pickerMonth, setPickerMonth] = useState<Date>(() => new Date());
	const [scheduledDate, setScheduledDate] = useState("");
	const [dueDate, setDueDate] = useState("");

	useEffect(() => {
		if (!editor || mode !== "rich" || deferHeavyFeatures) {
			setTaskAnchors([]);
			setSelectedTaskOrdinal(null);
			setScheduleAnchor(null);
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
			const selection = window.getSelection();
			if (!selection?.anchorNode) {
				setSelectedTaskOrdinal(null);
				return;
			}
			const anchorElement =
				selection.anchorNode instanceof HTMLElement
					? selection.anchorNode
					: selection.anchorNode.parentElement;
			if (!anchorElement || !contentRoot.contains(anchorElement)) {
				setSelectedTaskOrdinal(null);
				return;
			}
			const taskEl = anchorElement.closest(
				"li[data-type='taskItem'], li[data-checked]",
			) as HTMLElement | null;
			if (!taskEl) {
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
		const observer = new MutationObserver(() => syncAnchors());
		observer.observe(contentRoot, {
			childList: true,
			subtree: true,
			characterData: true,
		});
		document.addEventListener("selectionchange", syncSelectedTask);
		editor.on("selectionUpdate", syncSelectedTask);
		return () => {
			observer.disconnect();
			document.removeEventListener("selectionchange", syncSelectedTask);
			editor.off("selectionUpdate", syncSelectedTask);
		};
	}, [deferHeavyFeatures, editor, hostRef, mode]);

	const selectedTaskAnchor =
		selectedTaskOrdinal == null
			? null
			: (taskAnchors.find((anchor) => anchor.ordinal === selectedTaskOrdinal) ??
				null);

	const openTaskPopover = useCallback(
		async (anchor: TaskAnchor) => {
			setScheduleAnchor(anchor);
			try {
				const existing = await invoke("task_dates_by_ordinal", {
					markdown,
					ordinal: anchor.ordinal,
				});
				setScheduledDate(existing?.scheduled_date ?? "");
				setDueDate(existing?.due_date ?? "");
				const nextField = existing?.due_date ? "due" : "scheduled";
				setActiveDateField(nextField);
				setPickerMonth(
					safeParseISO(existing?.due_date) ??
						safeParseISO(existing?.scheduled_date) ??
						new Date(),
				);
			} catch {
				setScheduledDate("");
				setDueDate("");
				setActiveDateField("scheduled");
				setPickerMonth(new Date());
			}
		},
		[markdown],
	);

	const applyTaskDates = useCallback(async () => {
		if (!scheduleAnchor) return;
		try {
			const next = await invoke("task_update_by_ordinal", {
				markdown,
				ordinal: scheduleAnchor.ordinal,
				scheduled_date: scheduledDate,
				due_date: dueDate,
			});
			if (!next) return;
			onChange(next);
			setScheduleAnchor(null);
		} catch (error) {
			console.error("Failed to update task dates", error);
		}
	}, [dueDate, markdown, onChange, scheduleAnchor, scheduledDate]);

	const activeDateValue =
		activeDateField === "scheduled" ? scheduledDate : dueDate;
	const activeDate = useMemo(
		() => safeParseISO(activeDateValue),
		[activeDateValue],
	);

	const formatPickerValue = (value: string) => {
		if (!value) return "Select date";
		const parsed = safeParseISO(value);
		return parsed ? format(parsed, "MMM d, yyyy") : value;
	};

	const updateActiveDate = (date?: Date) => {
		const next = date ? todayIsoDateLocal(date) : "";
		if (activeDateField === "scheduled") {
			setScheduledDate(next);
			return;
		}
		setDueDate(next);
	};

	const focusTaskDateField = useCallback(
		(field: "scheduled" | "due") => {
			setActiveDateField(field);
			const nextValue = field === "scheduled" ? scheduledDate : dueDate;
			setPickerMonth(safeParseISO(nextValue) ?? new Date());
		},
		[dueDate, scheduledDate],
	);

	return {
		activeDate,
		activeDateField,
		applyTaskDates,
		dueDate,
		focusTaskDateField,
		formatPickerValue,
		openTaskPopover,
		pickerMonth,
		scheduleAnchor,
		scheduledDate,
		selectedTaskAnchor,
		setActiveDateField,
		setDueDate,
		setPickerMonth,
		setScheduleAnchor,
		setScheduledDate,
		updateActiveDate,
	};
}
