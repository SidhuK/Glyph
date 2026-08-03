import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQueryClient } from "@tanstack/react-query";
import { emitTo } from "@tauri-apps/api/event";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dispatchEditorMenuAction } from "../../lib/appEvents";
import { isMissingFileError } from "../../lib/fsErrors";
import { loadSettings } from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { countWords } from "../../lib/textStats";
import { basename } from "../../utils/path";
import { FileText, Save } from "../Icons";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import { createEditorShortcutsExtension } from "../editor/extensions/editorShortcuts";
import {
	QUICK_NOTE_TARGET_VALUE,
	type QuickNoteTarget,
	QuickNoteTargetBreadcrumbs,
} from "./QuickNoteTargetBreadcrumbs";
import {
	QUICK_NOTE_TARGET_SUMMARY_KEY,
	QuickNoteTargetSummary,
} from "./QuickNoteTargetSummary";
import { useQuickNoteWindowFrame } from "./useQuickNoteWindowFrame";

const QUICK_NOTE_PLACEHOLDER = "Write a quick note or press / for commands";
const SAVE_CONFIRMATION_MS = 1600;
const REFOCUS_DELAY_MS = 20;

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
	};
}

function focusEditor(editor: Editor | null) {
	if (!editor || editor.isDestroyed) return;
	editor.commands.focus(undefined, { scrollIntoView: false });
}

function editorHasText(editor: Editor | null): boolean {
	return Boolean(editor && !editor.isDestroyed && editor.getMarkdown().trim());
}

function clearDraft(editor: Editor | null) {
	if (!editor || editor.isDestroyed) return;
	editor.commands.setContent("", { contentType: "markdown" });
}

export function QuickNoteWindow() {
	const [folder, setFolder] = useState("Quick Notes");
	const [draft, setDraft] = useState("");
	const [hasText, setHasText] = useState(false);
	const [error, setError] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [saving, setSaving] = useState(false);
	const [targetValue, setTargetValue] = useState(QUICK_NOTE_TARGET_VALUE);
	const [editorAreaElement, setEditorAreaElement] =
		useState<HTMLDivElement | null>(null);
	const [contentElement, setContentElement] = useState<HTMLElement | null>(
		null,
	);
	const editorRef = useRef<Editor | null>(null);
	const unsubscribeRef = useRef<(() => void) | null>(null);
	const shortcutsRef = useRef({
		onEscape: () => {
			void invoke("hide_quick_note_window");
		},
		onSave: () => {},
	});
	const confirmationTimerRef = useRef<number | null>(null);
	const focusTimerRef = useRef<number | null>(null);
	const queryClient = useQueryClient();
	const { windowFocused } = useQuickNoteWindowFrame({
		editorAreaElement,
		contentElement,
	});

	const todayQuickNotePath = useMemo(() => quickNotePath(folder), [folder]);
	const selectedTarget = useMemo((): QuickNoteTarget => {
		if (targetValue === QUICK_NOTE_TARGET_VALUE) {
			return quickNoteTarget(folder);
		}
		return {
			value: targetValue,
			path: targetValue,
			label: savedLabel(targetValue),
		};
	}, [folder, targetValue]);
	const isMac =
		navigator.platform.toLowerCase().includes("mac") ||
		navigator.userAgent.includes("Mac");
	const shortcutLabel = isMac ? "⌘+Enter" : "Ctrl+Enter";
	const shortcutModifierLabel = isMac ? "⌘" : "Ctrl";
	const wordCount = countWords(draft);
	const charCount = draft.trim().length;

	const readDraft = useCallback(
		() => editorRef.current?.getMarkdown().trim() ?? "",
		[],
	);

	const chooseTarget = useCallback((target: QuickNoteTarget) => {
		setTargetValue(target.value);
		window.setTimeout(() => focusEditor(editorRef.current), REFOCUS_DELAY_MS);
	}, []);

	useEffect(() => {
		void loadSettings()
			.then((settings) => {
				setFolder(settings.quickNotes.folder);
			})
			.catch((cause) => {
				console.error("Failed to load quick note settings", cause);
			});
	}, []);

	useEffect(() => {
		return () => {
			unsubscribeRef.current?.();
			if (confirmationTimerRef.current !== null) {
				window.clearTimeout(confirmationTimerRef.current);
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
	useTauriEvent("menu:app_command", (payload) => {
		if (payload.command_id === "paste_without_formatting") {
			dispatchEditorMenuAction({ action: "paste_without_formatting" });
		}
	});

	const save = useCallback(async () => {
		const text = readDraft();
		if (!text || saving) return;
		setSaving(true);
		setError("");
		try {
			const path = await appendQuickNoteToPath(
				selectedTarget.value === QUICK_NOTE_TARGET_VALUE
					? quickNotePath(folder)
					: selectedTarget.path,
				text,
			);
			clearDraft(editorRef.current);
			setDraft("");
			setHasText(false);
			setConfirmation(savedLabel(path));
			void emitTo("main", "app:open_note", { path }).catch(() => {});
			void queryClient.invalidateQueries({
				queryKey: [QUICK_NOTE_TARGET_SUMMARY_KEY],
			});
			if (confirmationTimerRef.current !== null) {
				window.clearTimeout(confirmationTimerRef.current);
			}
			if (focusTimerRef.current !== null) {
				window.clearTimeout(focusTimerRef.current);
			}
			confirmationTimerRef.current = window.setTimeout(
				() => setConfirmation(""),
				SAVE_CONFIRMATION_MS,
			);
			focusTimerRef.current = window.setTimeout(
				() => focusEditor(editorRef.current),
				REFOCUS_DELAY_MS,
			);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	}, [
		folder,
		queryClient,
		readDraft,
		saving,
		selectedTarget.path,
		selectedTarget.value,
	]);

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

	const handleEditorReady = useCallback(
		(editor: Editor | null, contentRoot: HTMLElement | null) => {
			unsubscribeRef.current?.();
			unsubscribeRef.current = null;
			editorRef.current = editor;
			setContentElement(contentRoot);
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
		},
		[],
	);

	const handleDraftChange = useCallback((nextMarkdown: string) => {
		setDraft(nextMarkdown);
	}, []);

	return (
		<div
			className="quickNoteRoot"
			data-window-focused={windowFocused ? "true" : "false"}
		>
			<header className="quickNoteHeader" data-tauri-drag-region>
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
				<QuickNoteTargetSummary path={selectedTarget.path} />
			</header>
			<div className="quickNoteEditorArea" ref={setEditorAreaElement}>
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
			<footer className="quickNoteFooter">
				<div className="quickNoteFooterStatus" aria-live="polite">
					{error ? (
						<span className="quickNoteFooterError">{error}</span>
					) : hasText ? (
						<span>
							{wordCount === 1 ? "1 word" : `${wordCount} words`}
							{" · "}
							{charCount === 1 ? "1 character" : `${charCount} characters`}
						</span>
					) : (
						<span className="quickNoteFooterHint">
							{shortcutLabel} to save · Esc to dismiss
						</span>
					)}
				</div>
				<button
					type="button"
					className="quickNoteSaveButton"
					data-state={confirmation ? "saved" : undefined}
					aria-label={saving ? "Saving quick note" : "Save quick note"}
					title={
						saving ? "Saving quick note" : `Save quick note (${shortcutLabel})`
					}
					disabled={saving || (!hasText && !confirmation)}
					onClick={() => void save()}
				>
					{confirmation ? (
						<>
							<HugeiconsIcon
								icon={CheckmarkCircle02Icon}
								size="var(--icon-lg)"
								strokeWidth={1.6}
								aria-hidden="true"
							/>
							<span className="quickNoteSaveLabel">
								Saved to {confirmation}
							</span>
						</>
					) : (
						<>
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
						</>
					)}
				</button>
			</footer>
		</div>
	);
}
