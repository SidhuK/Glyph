import { emit } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { navigationQueryKeys } from "../../lib/navigationPrefetch";
import { queryClient } from "../../lib/queryClient";
import { loadSettings, reloadFromDisk } from "../../lib/settings";
import { addTaskToDailyNote } from "../../lib/taskCapture";
import { todayIsoDateLocal } from "../../lib/tasks";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { Calendar } from "../Icons";
import { TaskCaptureComposer } from "../tasks/TaskCaptureComposer";

interface QuickTaskSettings {
	dailyNotesFolder: string | null;
	dailyNoteTemplatePath: string | null;
	spacePath: string | null;
}

const EMPTY_SETTINGS: QuickTaskSettings = {
	dailyNotesFolder: null,
	dailyNoteTemplatePath: null,
	spacePath: null,
};

export function QuickTaskWindow() {
	const [settings, setSettings] = useState<QuickTaskSettings>(EMPTY_SETTINGS);
	const [draft, setDraft] = useState("");
	const [scheduledDate, setScheduledDate] = useState(() => todayIsoDateLocal());
	const [dueDate, setDueDate] = useState("");
	const [status, setStatus] = useState("");
	const [saving, setSaving] = useState(false);
	const inputRef = useRef<HTMLInputElement | null>(null);

	const focusInput = useCallback(() => {
		window.requestAnimationFrame(() => inputRef.current?.focus());
	}, []);

	const resetScheduledDateToToday = useCallback(() => {
		setScheduledDate(todayIsoDateLocal());
	}, []);

	const refreshSettings = useCallback(async (withReload = false) => {
		if (withReload) await reloadFromDisk();
		const appSettings = await loadSettings();
		setSettings({
			dailyNotesFolder: appSettings.dailyNotes.folder,
			dailyNoteTemplatePath: appSettings.templates.dailyNoteTemplate,
			spacePath: appSettings.currentSpacePath,
		});
	}, []);

	useEffect(() => {
		void refreshSettings().catch(() => {});
		const focusTimer = window.setTimeout(focusInput, 80);
		return () => window.clearTimeout(focusTimer);
	}, [focusInput, refreshSettings]);

	useTauriEvent("settings:updated", () => {
		void refreshSettings(true).catch(() => {});
	});

	useTauriEvent("quick-task:shown", () => {
		resetScheduledDateToToday();
		focusInput();
	});

	const save = useCallback(async () => {
		const text = draft.trim();
		if (!text || saving) return;
		if (!settings.dailyNotesFolder) {
			setStatus("Set a daily notes folder before adding tasks.");
			return;
		}
		if (!scheduledDate) {
			setStatus("Choose a scheduled date before adding tasks.");
			return;
		}
		setSaving(true);
		setStatus("");
		try {
			const result = await addTaskToDailyNote({
				taskText: text,
				scheduledDate,
				dueDate: dueDate || null,
				dailyNotesFolder: settings.dailyNotesFolder,
				dailyNoteTemplatePath: settings.dailyNoteTemplatePath,
				spacePath: settings.spacePath,
			});
			if (!result) return;
			setDraft("");
			setStatus("Task added");
			queryClient.setQueryData(navigationQueryKeys.note(result.path), {
				...result.previousDoc,
				text: result.text,
			});
			await Promise.all([
				queryClient.invalidateQueries({
					queryKey: navigationQueryKeys.tasks(),
				}),
				queryClient.invalidateQueries({
					queryKey: navigationQueryKeys.calendar(),
				}),
				queryClient.invalidateQueries({
					queryKey: navigationQueryKeys.taskSummaries(),
				}),
				queryClient.invalidateQueries({
					queryKey: navigationQueryKeys.allDocs(),
				}),
			]);
			void emit("quick-task:open_note", { path: result.path }).catch(() => {});
			window.setTimeout(() => setStatus(""), 1600);
			focusInput();
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	}, [draft, dueDate, focusInput, saving, scheduledDate, settings]);

	return (
		<div
			className="quickTaskRoot"
			onKeyDownCapture={(event) => {
				if (event.key === "Escape") {
					event.preventDefault();
					void invoke("hide_quick_task_window");
				}
				if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
					event.preventDefault();
					void save();
				}
			}}
		>
			<TaskCaptureComposer
				inputRef={inputRef}
				value={draft}
				placeholder="Add a task..."
				pending={saving}
				onValueChange={setDraft}
				onSubmit={() => void save()}
				dateControls={
					<div className="quickTaskDateFields">
						<label>
							<span>
								<Calendar size="var(--icon-sm)" aria-hidden="true" />
								Scheduled
							</span>
							<input
								type="date"
								value={scheduledDate}
								onChange={(event) =>
									setScheduledDate(event.currentTarget.value)
								}
								aria-label="Scheduled date"
							/>
						</label>
						<label>
							<span>Due</span>
							<input
								type="date"
								value={dueDate}
								onChange={(event) => setDueDate(event.currentTarget.value)}
								aria-label="Due date"
							/>
						</label>
					</div>
				}
			/>
			{status ? (
				<div className="quickTaskStatus" aria-live="polite">
					{status}
				</div>
			) : null}
		</div>
	);
}
