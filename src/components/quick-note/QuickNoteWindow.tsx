import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { emitTo } from "@tauri-apps/api/event";
import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dispatchEditorMenuAction } from "../../lib/appEvents";
import { extractErrorMessage } from "../../lib/errorUtils";
import { loadSettings } from "../../lib/settings";
import { KEY_GLYPHS } from "../../lib/shortcuts/platform";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { countWords } from "../../lib/textStats";
import { displayNameFromPath, parentDir } from "../../utils/path";
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
	QuickNoteDestination,
	QuickNoteModeControl,
} from "./QuickNoteTargetSummary";
import {
	type QuickNoteMode,
	appendQuickNoteToPath,
	createQuickNoteInFolder,
	quickNotePath,
} from "./quickNoteSave";
import { useQuickNoteWindowFrame } from "./useQuickNoteWindowFrame";

const SAVE_CONFIRMATION_MS = 1600;
const REFOCUS_DELAY_MS = 20;

function quickNoteTarget(folder: string, label: string): QuickNoteTarget {
	const path = quickNotePath(folder);
	return {
		value: QUICK_NOTE_TARGET_VALUE,
		path,
		label,
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
	const { t } = useTranslation("shell");
	const [folder, setFolder] = useState("Quick Notes");
	const [draft, setDraft] = useState("");
	const [hasText, setHasText] = useState(false);
	const [error, setError] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [saving, setSaving] = useState(false);
	const [targetValue, setTargetValue] = useState(QUICK_NOTE_TARGET_VALUE);
	const [mode, setMode] = useState<QuickNoteMode>("append");
	const [editorAreaElement, setEditorAreaElement] = useState<HTMLDivElement | null>(null);
	const [contentElement, setContentElement] = useState<HTMLElement | null>(null);
	const editorRef = useRef<Editor | null>(null);
	const unsubscribeRef = useRef<(() => void) | null>(null);
	const hideWindow = useMutation({ mutationFn: () => invoke("hide_quick_note_window") });
	const shortcutsRef = useRef({
		onEscape: () => hideWindow.mutate(),
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
			return quickNoteTarget(folder, t("quickNoteTarget.today"));
		}
		return {
			value: targetValue,
			path: targetValue,
			label: displayNameFromPath(targetValue),
		};
	}, [folder, targetValue, t]);
	const shortcutLabel = `⌘${KEY_GLYPHS.Enter}`;
	const wordCount = countWords(draft);
	const charCount = draft.trim().length;

	const readDraft = useCallback(() => editorRef.current?.getMarkdown().trim() ?? "", []);

	const chooseTarget = useCallback((target: QuickNoteTarget) => {
		setTargetValue(target.value);
		setConfirmation("");
		if (focusTimerRef.current !== null) {
			window.clearTimeout(focusTimerRef.current);
		}
		focusTimerRef.current = window.setTimeout(
			() => focusEditor(editorRef.current),
			REFOCUS_DELAY_MS,
		);
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
			const path =
				mode === "new"
					? await createQuickNoteInFolder(parentDir(selectedTarget.path), text)
					: await appendQuickNoteToPath(
							selectedTarget.value === QUICK_NOTE_TARGET_VALUE
								? quickNotePath(folder)
								: selectedTarget.path,
							text,
						);
			clearDraft(editorRef.current);
			setDraft("");
			setHasText(false);
			setConfirmation(displayNameFromPath(path));
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
	}, [folder, mode, queryClient, readDraft, saving, selectedTarget.path, selectedTarget.value]);

	shortcutsRef.current = {
		onEscape: () => hideWindow.mutate(),
		onSave: () => {
			void save();
		},
	};

	const shortcutExtension = useMemo(
		() => createEditorShortcutsExtension(() => shortcutsRef.current),
		[],
	);
	const editorAdditionalExtensions = useMemo(() => [shortcutExtension], [shortcutExtension]);

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
				setHasText((current) => (current === nextHasText ? current : nextHasText));
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
		// Only clear on real input — empty updates after save must not wipe
		// the "Saved to …" confirmation.
		if (nextMarkdown.trim()) {
			setConfirmation("");
		}
	}, []);

	return (
		<div className="quickNoteRoot" data-window-focused={windowFocused ? "true" : "false"}>
			<header className="quickNoteHeader" data-tauri-drag-region>
				<div className="quickNoteTargetGroup">
					{/* Only offered once another note is the target; today's note needs no way back. */}
					{targetValue === QUICK_NOTE_TARGET_VALUE ? null : (
						<button
							type="button"
							className="quickNoteTargetResetButton"
							aria-label={t("quickNoteTarget.resetToToday")}
							title={t("quickNoteTarget.resetToToday")}
							onClick={() => chooseTarget(quickNoteTarget(folder, t("quickNoteTarget.today")))}
						>
							<FileText size="var(--icon-md)" aria-hidden="true" />
						</button>
					)}
					<QuickNoteTargetBreadcrumbs
						selectedTarget={selectedTarget}
						quickNotesFolder={folder}
						todayQuickNotePath={todayQuickNotePath}
						onSelectTarget={chooseTarget}
					/>
				</div>
				<QuickNoteModeControl
					mode={mode}
					onChange={(nextMode) => {
						setMode(nextMode);
						setConfirmation("");
						focusEditor(editorRef.current);
					}}
				/>
			</header>
			<div className="quickNoteEditorArea" ref={setEditorAreaElement}>
				<NoteInlineEditor
					markdown={draft}
					relPath={selectedTarget.path}
					mode="rich"
					chrome="minimal"
					deferHeavyFeatures
					additionalExtensions={editorAdditionalExtensions}
					placeholder={t("quickNoteWindow.placeholder")}
					pasteMarkdownBehavior="smart-markdown"
					onChange={handleDraftChange}
					onEditorReady={handleEditorReady}
				/>
			</div>
			<footer className="quickNoteFooter">
				<div className="quickNoteFooterStatus" aria-live="polite">
					{error || hideWindow.error ? (
						<span className="quickNoteFooterError">
							{error || extractErrorMessage(hideWindow.error)}
						</span>
					) : hasText ? (
						<span>
							{t("quickNoteWindow.words", { count: wordCount })}
							{" · "}
							{t("quickNoteWindow.characters", { count: charCount })}
						</span>
					) : (
						<span className="quickNoteFooterHint">
							<QuickNoteDestination path={selectedTarget.path} mode={mode} />
						</span>
					)}
				</div>
				<button type="button" className="quickNoteCancelButton" onClick={() => hideWindow.mutate()}>
					{t("quickNoteWindow.cancel")}
				</button>
				<button
					type="button"
					className="quickNoteSaveButton"
					data-state={confirmation ? "saved" : undefined}
					aria-label={saving ? t("quickNoteWindow.saving") : t("quickNoteWindow.save")}
					title={
						saving ? t("quickNoteWindow.saving") : `${t("quickNoteWindow.save")} (${shortcutLabel})`
					}
					disabled={saving || (!hasText && !confirmation)}
					onClick={() => void save()}
				>
					{confirmation ? (
						<>
							<HugeiconsIcon
								icon={CheckmarkCircle02Icon}
								size="var(--icon-lg)"
								aria-hidden="true"
							/>
							<span className="quickNoteSaveLabel">
								{t("quickNoteWindow.savedTo", { name: confirmation })}
							</span>
						</>
					) : (
						<>
							<Save size="var(--icon-lg)" />
							<span className="quickNoteSaveLabel">{t("quickNoteWindow.save")}</span>
							<kbd className="quickNoteSaveShortcut" aria-hidden="true">
								{shortcutLabel}
							</kbd>
						</>
					)}
				</button>
			</footer>
		</div>
	);
}
