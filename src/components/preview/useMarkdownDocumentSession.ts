import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorSaveIndicator } from "../../hooks/useEditorSaveIndicator";
import { extractErrorMessage } from "../../lib/errorUtils";
import { setPrefetchedNote } from "../../lib/navigationPrefetch";
import { type TextFileDoc, invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { normalizeRelPath } from "../../utils/path";
import type { RawMarkdownEditorHandle } from "../editor/raw/types";
import type { NoteInlineEditorMode } from "../editor/types";
import {
	clearMarkdownDocCache,
	getCachedMarkdownDoc,
	peekCachedMarkdownDoc,
} from "./markdownCache";

/** Debounce typing before persisting so rapid keystrokes coalesce. */
const AUTOSAVE_DEBOUNCE_MS = 900;
/** Brief delay so bursty external FS events settle before reload. */
const EXTERNAL_RELOAD_DEBOUNCE_MS = 180;

interface UseMarkdownDocumentSessionOptions {
	initialDoc: TextFileDoc | null;
	initialError: string;
	onTextReplaced: (text: string) => void;
	relPath: string;
	resolveEditorModeForNote: (markdown: string) => NoteInlineEditorMode;
	setEditorMode: (mode: NoteInlineEditorMode) => void;
	spacePath: string | null;
}

export function useMarkdownDocumentSession({
	initialDoc,
	initialError,
	onTextReplaced,
	relPath,
	resolveEditorModeForNote,
	setEditorMode,
	spacePath,
}: UseMarkdownDocumentSessionOptions) {
	const initialText = initialDoc?.text ?? peekCachedMarkdownDoc(relPath) ?? "";
	const [text, setText] = useState(() => initialText);
	const [savedText, setSavedText] = useState(() => initialText);
	const [saving, setSaving] = useState(false);
	const [autosaveBusy, setAutosaveBusy] = useState(false);
	const [error, setError] = useState(() => initialError || "");
	const [lastSavedMtimeMs, setLastSavedMtimeMs] = useState<number | null>(
		initialDoc?.mtime_ms ?? null,
	);
	const { flashPulse, clearPulse, resolveLabel } = useEditorSaveIndicator();

	const savedTextRef = useRef(savedText);
	const textRef = useRef(text);
	const rawEditorRef = useRef<RawMarkdownEditorHandle | null>(null);
	const savingRef = useRef(saving);
	const mtimeRef = useRef<number | null>(lastSavedMtimeMs);
	const documentSessionRef = useRef(0);
	const mountedRef = useRef(true);
	const saveRequestTokenRef = useRef(0);
	const autosaveInFlightRef = useRef(false);
	const autosaveQueuedRef = useRef(false);
	const hasUserEditsRef = useRef(false);
	const externalSyncTimerRef = useRef<number | null>(null);
	const pendingExternalReloadRef = useRef(false);
	const activeRelPathRef = useRef(relPath);
	const previousSpacePathRef = useRef<string | null>(spacePath);

	savingRef.current = saving;

	const flushRawMarkdown = useCallback(() => {
		rawEditorRef.current?.flushPendingChange();
	}, []);

	const handleRawEditorReady = useCallback(
		(editor: RawMarkdownEditorHandle | null) => {
			rawEditorRef.current = editor;
		},
		[],
	);

	const replaceText = useCallback(
		(nextText: string) => {
			textRef.current = nextText;
			setText(nextText);
			onTextReplaced(nextText);
		},
		[onTextReplaced],
	);

	const markUserEdit = useCallback((nextText: string) => {
		hasUserEditsRef.current = true;
		textRef.current = nextText;
		setText(nextText);
	}, []);

	const isCurrentSession = useCallback((sessionId: number) => {
		return mountedRef.current && documentSessionRef.current === sessionId;
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		return () => {
			mountedRef.current = false;
			documentSessionRef.current += 1;
		};
	}, []);

	useEffect(() => {
		// `initialDoc` is a seed for the pane. Autosave also refreshes that cache,
		// so do not treat the resulting object identity change as a new document.
		flushRawMarkdown();
		if (
			activeRelPathRef.current === relPath &&
			initialDoc?.text === textRef.current
		) {
			return;
		}
		const sessionId = documentSessionRef.current + 1;
		documentSessionRef.current = sessionId;
		saveRequestTokenRef.current += 1;
		const cached = initialDoc?.text ?? getCachedMarkdownDoc(relPath) ?? "";
		textRef.current = cached;
		savedTextRef.current = cached;
		mtimeRef.current = initialDoc?.mtime_ms ?? null;
		autosaveInFlightRef.current = false;
		autosaveQueuedRef.current = false;
		if (externalSyncTimerRef.current !== null) {
			window.clearTimeout(externalSyncTimerRef.current);
			externalSyncTimerRef.current = null;
		}
		pendingExternalReloadRef.current = false;
		setText(cached);
		setSavedText(cached);
		setLastSavedMtimeMs(initialDoc?.mtime_ms ?? null);
		setSaving(false);
		setAutosaveBusy(false);
		clearPulse();
		hasUserEditsRef.current = false;
		setError(initialError);
		if (activeRelPathRef.current !== relPath) {
			setEditorMode(resolveEditorModeForNote(cached));
		}
		activeRelPathRef.current = relPath;
		if (initialDoc) {
			setPrefetchedNote(relPath, initialDoc);
		}
	}, [
		clearPulse,
		flushRawMarkdown,
		initialDoc,
		initialError,
		relPath,
		resolveEditorModeForNote,
		setEditorMode,
	]);

	useEffect(() => {
		if (previousSpacePathRef.current === spacePath) return;
		previousSpacePathRef.current = spacePath;
		documentSessionRef.current += 1;
		saveRequestTokenRef.current += 1;
		if (externalSyncTimerRef.current !== null) {
			window.clearTimeout(externalSyncTimerRef.current);
			externalSyncTimerRef.current = null;
		}
		pendingExternalReloadRef.current = false;
		textRef.current = "";
		savedTextRef.current = "";
		mtimeRef.current = null;
		autosaveInFlightRef.current = false;
		autosaveQueuedRef.current = false;
		hasUserEditsRef.current = false;
		setText("");
		setSavedText("");
		setLastSavedMtimeMs(null);
		setSaving(false);
		setAutosaveBusy(false);
		clearPulse();
		clearMarkdownDocCache();
	}, [clearPulse, spacePath]);

	const loadDoc = useCallback(
		async (showRefreshFeedback = false) => {
			const sessionId = documentSessionRef.current;
			setError("");
			try {
				const doc = await invoke("space_read_text", { path: relPath });
				if (!isCurrentSession(sessionId)) return;
				const shouldReplaceText = textRef.current === savedTextRef.current;
				const shouldChooseInitialMode =
					textRef.current.length === 0 && savedTextRef.current.length === 0;
				setPrefetchedNote(relPath, doc);
				if (shouldReplaceText) {
					if (shouldChooseInitialMode) {
						setEditorMode(resolveEditorModeForNote(doc.text));
					}
					replaceText(doc.text);
					hasUserEditsRef.current = false;
				} else {
					// User edited before this read resolved; keep the dirty edit
					// flagged so it still autosaves instead of going stale.
					hasUserEditsRef.current = true;
				}
				savedTextRef.current = doc.text;
				mtimeRef.current = doc.mtime_ms;
				setSavedText(doc.text);
				setLastSavedMtimeMs(doc.mtime_ms);
				setPrefetchedNote(relPath, doc);
				if (showRefreshFeedback) {
					flashPulse("reloaded");
				}
			} catch (e) {
				if (!isCurrentSession(sessionId)) return;
				setError(extractErrorMessage(e));
			}
		},
		[
			flashPulse,
			isCurrentSession,
			relPath,
			replaceText,
			resolveEditorModeForNote,
			setEditorMode,
		],
	);

	const loadDocFromExternalChange = useCallback(async () => {
		const sessionId = documentSessionRef.current;
		flushRawMarkdown();
		if (
			textRef.current !== savedTextRef.current ||
			autosaveInFlightRef.current ||
			savingRef.current
		) {
			pendingExternalReloadRef.current = true;
			return;
		}
		setError("");
		try {
			const doc = await invoke("space_read_text", { path: relPath });
			if (!isCurrentSession(sessionId)) return;
			flushRawMarkdown();
			if (
				textRef.current !== savedTextRef.current ||
				autosaveInFlightRef.current ||
				savingRef.current
			) {
				pendingExternalReloadRef.current = true;
				return;
			}
			if (
				doc.mtime_ms === mtimeRef.current &&
				doc.text === savedTextRef.current
			) {
				return;
			}
			setPrefetchedNote(relPath, doc);
			replaceText(doc.text);
			savedTextRef.current = doc.text;
			mtimeRef.current = doc.mtime_ms;
			setSavedText(doc.text);
			setLastSavedMtimeMs(doc.mtime_ms);
			hasUserEditsRef.current = false;
		} catch (e) {
			if (!isCurrentSession(sessionId)) return;
			setError(extractErrorMessage(e));
		}
	}, [flushRawMarkdown, isCurrentSession, relPath, replaceText]);

	const loadedSpacePathRef = useRef(spacePath);

	useEffect(() => {
		const spaceChanged = loadedSpacePathRef.current !== spacePath;
		loadedSpacePathRef.current = spacePath;
		// A stale `initialDoc` from the previous space must not block a reload:
		// the space-change effect already cleared local state, so this note
		// still needs to be fetched from the newly active space.
		if (initialDoc && !spaceChanged) return;
		void loadDoc();
	}, [initialDoc, loadDoc, spacePath]);

	const persistDoc = useCallback(
		async (
			path: string,
			nextText: string,
			sessionId = documentSessionRef.current,
		): Promise<boolean> => {
			const applySaveState = (saved: string, mtimeMs: number) => {
				if (path !== relPath || !isCurrentSession(sessionId)) return;
				setPrefetchedNote(path, {
					rel_path: path,
					text: saved,
					etag: "",
					mtime_ms: mtimeMs,
				});
				savedTextRef.current = saved;
				mtimeRef.current = mtimeMs;
				setSavedText(saved);
				setLastSavedMtimeMs(mtimeMs);
				if (textRef.current === saved) {
					hasUserEditsRef.current = false;
				} else {
					hasUserEditsRef.current = true;
					autosaveQueuedRef.current = true;
				}
				flashPulse("saved");
			};

			setError("");
			try {
				const result = await invoke("space_write_text", {
					path,
					text: nextText,
					base_mtime_ms: mtimeRef.current,
				});
				applySaveState(nextText, result.mtime_ms);
				return true;
			} catch (e) {
				if (!isCurrentSession(sessionId)) return false;
				const message = extractErrorMessage(e);
				const isConflict = message.includes(
					"conflict: on-disk file changed since it was opened",
				);
				if (!isConflict) {
					setError(message);
					return false;
				}

				try {
					const latest = await invoke("space_read_text", { path });
					if (!isCurrentSession(sessionId)) return false;
					if (latest.text === nextText) {
						applySaveState(nextText, latest.mtime_ms);
						return true;
					}
					const { message: showDialog } = await import(
						"@tauri-apps/plugin-dialog"
					);
					const reloadLabel = "Reload";
					const overwriteLabel = "Overwrite";
					const choice = await showDialog(
						"Glyph found a newer version of this note on disk. Reload that version, overwrite it with your edits, or cancel and keep editing.",
						{
							title: "Note changed on disk",
							kind: "warning",
							buttons: {
								yes: reloadLabel,
								no: overwriteLabel,
								cancel: "Cancel",
							},
						},
					);
					if (!isCurrentSession(sessionId)) return false;
					if (choice === reloadLabel || choice === "Yes") {
						setPrefetchedNote(path, latest);
						replaceText(latest.text);
						savedTextRef.current = latest.text;
						mtimeRef.current = latest.mtime_ms;
						setSavedText(latest.text);
						setLastSavedMtimeMs(latest.mtime_ms);
						hasUserEditsRef.current = false;
						flashPulse("reloaded");
						return true;
					}
					if (choice === overwriteLabel || choice === "No") {
						const retry = await invoke("space_write_text", {
							path,
							text: nextText,
							base_mtime_ms: latest.mtime_ms,
						});
						applySaveState(nextText, retry.mtime_ms);
						return true;
					}
					hasUserEditsRef.current = true;
					setError(
						"This note changed on disk. Reload it or save again after reviewing your local edits.",
					);
					return false;
				} catch (retryError) {
					if (!isCurrentSession(sessionId)) return false;
					setError(extractErrorMessage(retryError));
					return false;
				}
			}
		},
		[flashPulse, isCurrentSession, relPath, replaceText],
	);

	const onSave = useCallback(async () => {
		const sessionId = documentSessionRef.current;
		const saveToken = saveRequestTokenRef.current + 1;
		saveRequestTokenRef.current = saveToken;
		flushRawMarkdown();
		setSaving(true);
		try {
			await persistDoc(relPath, textRef.current, sessionId);
		} finally {
			if (
				saveRequestTokenRef.current === saveToken &&
				isCurrentSession(sessionId)
			) {
				setSaving(false);
			}
		}
	}, [flushRawMarkdown, isCurrentSession, persistDoc, relPath]);

	const runAutosave = useCallback(async () => {
		const sessionId = documentSessionRef.current;
		flushRawMarkdown();
		if (autosaveInFlightRef.current) {
			autosaveQueuedRef.current = true;
			return false;
		}

		const path = relPath;
		const snapshot = textRef.current;
		if (snapshot === savedTextRef.current) return false;

		autosaveInFlightRef.current = true;
		setAutosaveBusy(true);
		const ok = await persistDoc(path, snapshot, sessionId);
		if (!isCurrentSession(sessionId)) {
			autosaveInFlightRef.current = false;
			return ok;
		}
		autosaveInFlightRef.current = false;
		setAutosaveBusy(false);
		if (autosaveQueuedRef.current) {
			autosaveQueuedRef.current = false;
			return runAutosave();
		}
		if (ok && textRef.current !== savedTextRef.current) {
			return runAutosave();
		}
		return ok;
	}, [flushRawMarkdown, isCurrentSession, persistDoc, relPath]);

	const isDirty = text !== savedText;

	useEffect(() => {
		if (!isDirty || !hasUserEditsRef.current) return;
		const timer = window.setTimeout(() => {
			runAutosave();
		}, AUTOSAVE_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [isDirty, runAutosave]);

	useEffect(() => {
		return () => {
			if (textRef.current === savedTextRef.current) return;
			runAutosave();
		};
	}, [runAutosave]);

	const handleExternalNoteChanged = useCallback(
		(payload: { rel_path: string }) => {
			const changed = normalizeRelPath(payload.rel_path);
			const current = normalizeRelPath(relPath);
			if (!changed || changed !== current) return;
			if (externalSyncTimerRef.current !== null) {
				window.clearTimeout(externalSyncTimerRef.current);
			}
			externalSyncTimerRef.current = window.setTimeout(() => {
				externalSyncTimerRef.current = null;
				flushRawMarkdown();
				if (
					textRef.current !== savedTextRef.current ||
					autosaveInFlightRef.current ||
					savingRef.current
				) {
					pendingExternalReloadRef.current = true;
					return;
				}
				void loadDocFromExternalChange();
			}, EXTERNAL_RELOAD_DEBOUNCE_MS);
		},
		[flushRawMarkdown, loadDocFromExternalChange, relPath],
	);

	useTauriEvent("notes:external_changed", handleExternalNoteChanged);

	useEffect(() => {
		if (!pendingExternalReloadRef.current) return;
		if (isDirty || saving || autosaveInFlightRef.current) return;
		pendingExternalReloadRef.current = false;
		void loadDocFromExternalChange();
	}, [isDirty, loadDocFromExternalChange, saving]);

	useEffect(
		() => () => {
			if (externalSyncTimerRef.current !== null) {
				window.clearTimeout(externalSyncTimerRef.current);
			}
		},
		[],
	);

	const saveLabel = useMemo(
		() =>
			resolveLabel({
				isDirty,
				saving,
				autosaveBusy,
				hasSavedBefore: lastSavedMtimeMs !== null,
			}) ?? "Ready",
		[autosaveBusy, isDirty, lastSavedMtimeMs, resolveLabel, saving],
	);

	return {
		error,
		flushRawMarkdown,
		handleRawEditorReady,
		isDirty,
		lastSavedMtimeMs,
		markUserEdit,
		onSave,
		rawEditorRef,
		runAutosave,
		saveLabel,
		text,
		textRef,
	};
}
