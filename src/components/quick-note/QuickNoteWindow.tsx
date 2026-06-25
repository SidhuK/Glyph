import { emit } from "@tauri-apps/api/event";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isMissingFileError } from "../../lib/fsErrors";
import { loadSettings, reloadFromDisk } from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { basename, parentDir } from "../../utils/path";
import { FileText, Save } from "../Icons";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import { createEditorShortcutsExtension } from "../editor/extensions/editorShortcuts";
import {
	QUICK_NOTE_TARGET_VALUE,
	type QuickNoteTarget,
	QuickNoteTargetBreadcrumbs,
} from "./QuickNoteTargetBreadcrumbs";

const QUICK_NOTE_PLACEHOLDER = "Write a quick note or press / for commands";

function pad(value: number): string {
	return value.toString().padStart(2, "0");
}

function dateStamp(date = new Date()): string {
	return [
		date.getFullYear(),
		pad(date.getMonth() + 1),
		pad(date.getDate()),
	].join("-");
}

function quickNotePath(folder: string): string {
	const fileName = `${dateStamp()} - Quick Note.md`;
	return folder ? `${folder}/${fileName}` : fileName;
}

function appendMarkdown(existing: string, entry: string): string {
	const trimmedExisting = existing.trimEnd();
	if (!trimmedExisting) return `${entry}\n`;
	return `${trimmedExisting}\n\n${entry}\n`;
}

async function appendQuickNote(folder: string, text: string): Promise<string> {
	const path = quickNotePath(folder);
	return appendQuickNoteToPath(path, text);
}

async function appendQuickNoteToPath(
	path: string,
	text: string,
): Promise<string> {
	try {
		const doc = await invoke("space_read_text", { path });
		await invoke("space_write_text", {
			path,
			text: appendMarkdown(doc.text, text.trim()),
			base_mtime_ms: doc.mtime_ms,
		});
		return path;
	} catch (cause) {
		if (!isMissingFileError(cause)) throw cause;
		await invoke("space_write_text", {
			path,
			text: `${text.trim()}\n`,
			base_mtime_ms: null,
		});
		return path;
	}
}

function savedLabel(path: string) {
	const name = basename(path);
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

function quickNoteTarget(folder: string): QuickNoteTarget {
	const path = quickNotePath(folder);
	return {
		value: QUICK_NOTE_TARGET_VALUE,
		path,
		label: "Today's quick note",
		detail: parentDir(path) || "Space root",
	};
}

function focusEditor(editor: Editor | null) {
	editor?.commands.focus(undefined, { scrollIntoView: false });
}

function editorHasText(editor: Editor | null): boolean {
	return Boolean(editor?.getMarkdown().trim());
}

function clearDraft(editor: Editor | null) {
	editor?.commands.setContent("", { contentType: "markdown" });
}

export function QuickNoteWindow() {
	const [folder, setFolder] = useState("Quick Notes");
	const [draft, setDraft] = useState("");
	const [hasText, setHasText] = useState(false);
	const [status, setStatus] = useState("");
	const [saving, setSaving] = useState(false);
	const [targetValue, setTargetValue] = useState(QUICK_NOTE_TARGET_VALUE);
	const editorRef = useRef<Editor | null>(null);
	const unsubscribeRef = useRef<(() => void) | null>(null);
	const shortcutsRef = useRef({
		onEscape: () => {
			void invoke("hide_quick_note_window");
		},
		onSave: () => {},
	});
	const statusTimerRef = useRef<number | null>(null);
	const focusTimerRef = useRef<number | null>(null);

	const todayQuickNotePath = useMemo(() => quickNotePath(folder), [folder]);
	const selectedTarget = useMemo((): QuickNoteTarget => {
		if (targetValue === QUICK_NOTE_TARGET_VALUE) {
			return quickNoteTarget(folder);
		}
		return {
			value: targetValue,
			path: targetValue,
			label: savedLabel(targetValue),
			detail: parentDir(targetValue) || "Space root",
		};
	}, [folder, targetValue]);
	const isMac =
		navigator.platform.toLowerCase().includes("mac") ||
		navigator.userAgent.includes("Mac");
	const shortcutLabel = isMac ? "⌘+Enter" : "Ctrl+Enter";
	const shortcutModifierLabel = isMac ? "⌘" : "Ctrl";

	const readDraft = useCallback(
		() => editorRef.current?.getMarkdown().trim() ?? "",
		[],
	);

	const chooseTarget = useCallback((target: QuickNoteTarget) => {
		setTargetValue(target.value);
		window.setTimeout(() => focusEditor(editorRef.current), 20);
	}, []);

	const refreshSettings = useCallback(async (withReload = false) => {
		if (withReload) await reloadFromDisk();
		const settings = await loadSettings();
		const nextFolder = settings.quickNotes.folder;
		setFolder(nextFolder);
		return nextFolder;
	}, []);

	useEffect(() => {
		void refreshSettings().catch((cause) => {
			console.error("Failed to load quick note settings", cause);
		});
	}, [refreshSettings]);

	useEffect(() => {
		return () => {
			unsubscribeRef.current?.();
			if (statusTimerRef.current !== null) {
				window.clearTimeout(statusTimerRef.current);
			}
			if (focusTimerRef.current !== null) {
				window.clearTimeout(focusTimerRef.current);
			}
		};
	}, []);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.quickNotes?.folder === "string") {
			setFolder(payload.quickNotes.folder);
		}
	});

	const save = useCallback(async () => {
		const text = readDraft();
		if (!text || saving) return;
		setSaving(true);
		setStatus("");
		try {
			const path =
				selectedTarget.value === QUICK_NOTE_TARGET_VALUE
					? await appendQuickNote(folder, text)
					: await appendQuickNoteToPath(selectedTarget.path, text);
			clearDraft(editorRef.current);
			setDraft("");
			setHasText(false);
			setStatus(`Saved ${savedLabel(path)}`);
			void emit("quick-note:open_note", { path }).catch(() => {});
			if (statusTimerRef.current !== null) {
				window.clearTimeout(statusTimerRef.current);
			}
			if (focusTimerRef.current !== null) {
				window.clearTimeout(focusTimerRef.current);
			}
			statusTimerRef.current = window.setTimeout(() => setStatus(""), 1600);
			focusTimerRef.current = window.setTimeout(
				() => focusEditor(editorRef.current),
				20,
			);
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	}, [folder, readDraft, saving, selectedTarget.path, selectedTarget.value]);

	shortcutsRef.current = {
		onEscape: () => {
			void invoke("hide_quick_note_window");
		},
		onSave: () => {
			void save();
		},
	};

	const shortcutExtension = useMemo(
		() => createEditorShortcutsExtension(() => shortcutsRef.current),
		[],
	);
	const editorAdditionalExtensions = useMemo(
		() => [shortcutExtension],
		[shortcutExtension],
	);

	const handleEditorReady = useCallback((editor: Editor | null) => {
		unsubscribeRef.current?.();
		unsubscribeRef.current = null;
		editorRef.current = editor;
		if (!editor) {
			setHasText(false);
			return;
		}
		focusEditor(editor);
		const syncHasText = () => {
			const nextHasText = editorHasText(editor);
			setHasText((current) =>
				current === nextHasText ? current : nextHasText,
			);
		};
		syncHasText();
		editor.on("update", syncHasText);
		unsubscribeRef.current = () => {
			editor.off("update", syncHasText);
		};
	}, []);

	const handleDraftChange = useCallback((nextMarkdown: string) => {
		setDraft(nextMarkdown);
	}, []);

	return (
		<div className="quickNoteRoot">
			<div className="quickNoteDragHandle" data-tauri-drag-region />
			<div className="quickNoteEditorArea">
				<NoteInlineEditor
					markdown={draft}
					relPath={selectedTarget.path}
					mode="rich"
					chrome="minimal"
					deferHeavyFeatures
					additionalExtensions={editorAdditionalExtensions}
					placeholder={QUICK_NOTE_PLACEHOLDER}
					pasteMarkdownBehavior="smart-markdown"
					onChange={handleDraftChange}
					onEditorReady={handleEditorReady}
				/>
			</div>
			<div className="quickNoteEditorChrome">
				<div className="quickNoteTargetGroup">
					<button
						type="button"
						className="quickNoteTargetResetButton"
						aria-label="Reset to today's quick note"
						title="Today's quick note"
						onClick={() => chooseTarget(quickNoteTarget(folder))}
					>
						<FileText size="var(--icon-md)" aria-hidden="true" />
					</button>
					<QuickNoteTargetBreadcrumbs
						selectedTarget={selectedTarget}
						quickNotesFolder={folder}
						todayQuickNotePath={todayQuickNotePath}
						onSelectTarget={chooseTarget}
					/>
				</div>
				<div className="quickNoteActionGroup">
					<div className="quickNoteStatus" aria-live="polite">
						{status}
					</div>
					<button
						type="button"
						className="quickNoteSaveButton"
						aria-label={saving ? "Saving quick note" : "Save quick note"}
						title={
							saving
								? "Saving quick note"
								: `Save quick note (${shortcutLabel})`
						}
						disabled={saving || !hasText}
						onClick={() => void save()}
					>
						<Save size="var(--icon-lg)" />
						<span className="quickNoteSaveLabel">Save</span>
						<span className="commandPaletteShortcut" aria-hidden="true">
							<kbd>
								<span className="commandPaletteShortcutCombo">
									<span className="commandPaletteShortcutPart">
										{shortcutModifierLabel}
									</span>
									<span className="commandPaletteShortcutPart">↵</span>
								</span>
							</kbd>
						</span>
					</button>
				</div>
			</div>
		</div>
	);
}
