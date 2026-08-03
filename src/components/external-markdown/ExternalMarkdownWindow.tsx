import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorSaveIndicator } from "../../hooks/useEditorSaveIndicator";
import { dispatchEditorMenuAction } from "../../lib/appEvents";
import {
	type EditorViewMode,
	getDefaultEditorViewMode,
} from "../../lib/editorMode";
import { extractErrorMessage } from "../../lib/errorUtils";
import { loadSettings } from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { countWords } from "../../lib/textStats";
import {
	displayFolderFromPath,
	displayNameFromPath,
	normalizeRelPath,
	parentDir,
} from "../../utils/path";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import { ExternalMarkdownHeader } from "./ExternalMarkdownHeader";
import { ExternalMarkdownStatusBar } from "./ExternalMarkdownStatusBar";
import { useDimChromeWhileTyping } from "./useDimChromeWhileTyping";

const AUTOSAVE_DELAY_MS = 700;

function fallbackRelPathFromAbs(absPath: string): string {
	const normalized = normalizeRelPath(absPath);
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? normalized;
}

function folderLabelFromAbs(absPath: string): string {
	const normalized = absPath.replace(/\\/g, "/");
	const parent = parentDir(normalized);
	if (!parent) return "";
	const parts = parent.split("/").filter(Boolean);
	if (parts.length <= 2) return parts.join(" / ");
	return parts.slice(-2).join(" / ");
}

async function resolveRelPath(absPath: string): Promise<string> {
	try {
		const storedRelPath = await invoke("external_markdown_window_rel_path");
		if (storedRelPath) return storedRelPath;
	} catch {
		// Fall back to relativizing against the active space when available.
	}
	try {
		return await invoke("space_relativize_path", { abs_path: absPath });
	} catch {
		// External files opened from Finder may sit outside the active space.
		return "";
	}
}

export function ExternalMarkdownWindow() {
	const [relPath, setRelPath] = useState("");
	const [absPath, setAbsPath] = useState("");
	const [title, setTitle] = useState("Markdown File");
	const [text, setText] = useState("");
	const [savedText, setSavedText] = useState("");
	const [mode, setMode] = useState<EditorViewMode>(getDefaultEditorViewMode);
	const [error, setError] = useState("");
	const textRef = useRef("");
	const savedTextRef = useRef("");
	const absPathRef = useRef("");
	const relPathRef = useRef("");
	const mtimeRef = useRef<number | null>(null);
	const saveTokenRef = useRef(0);
	const autosaveTimerRef = useRef<number | null>(null);
	const mountedRef = useRef(true);
	const chromeDimmed = useDimChromeWhileTyping();
	const {
		setSaving,
		setLoading,
		flashPulse,
		clearPulse,
		resolveLabel,
		resolveState,
	} = useEditorSaveIndicator();

	const isInsideSpace = Boolean(relPath);
	const folderLabel = relPath
		? displayFolderFromPath(relPath)
		: absPath
			? folderLabelFromAbs(absPath)
			: "";
	const isDirty = text !== savedText;
	const visibleSaveStatus = resolveLabel({ isDirty, idleLabel: null });
	const saveStatusState = resolveState({ isDirty });
	const wordCount = countWords(text);

	const saveNow = useCallback(async (): Promise<boolean> => {
		const currentPath = absPathRef.current;
		if (!currentPath) return true;
		if (textRef.current === savedTextRef.current) {
			return true;
		}

		const token = saveTokenRef.current + 1;
		const textToSave = textRef.current;
		saveTokenRef.current = token;
		setError("");
		setSaving(true);

		try {
			const result = await invoke("external_markdown_write", {
				path: currentPath,
				text: textToSave,
				base_mtime_ms: mtimeRef.current,
			});
			if (!mountedRef.current || token !== saveTokenRef.current) return false;
			mtimeRef.current = result.mtime_ms;
			savedTextRef.current = textToSave;
			setSavedText(textToSave);
			if (textRef.current !== textToSave) {
				return false;
			}
			flashPulse("saved");
			return true;
		} catch (cause) {
			if (!mountedRef.current || token !== saveTokenRef.current) return false;
			setError(extractErrorMessage(cause));
			return false;
		} finally {
			if (mountedRef.current && token === saveTokenRef.current) {
				setSaving(false);
			}
		}
	}, [flashPulse, setSaving]);

	const closeWindow = useCallback(async () => {
		if (autosaveTimerRef.current !== null) {
			window.clearTimeout(autosaveTimerRef.current);
			autosaveTimerRef.current = null;
		}
		const saved = await saveNow();
		if (!saved && textRef.current !== savedTextRef.current) return;
		await invoke("external_markdown_finish_close").catch(() => {});
	}, [saveNow]);

	const handleReveal = useCallback(() => {
		void invoke("external_markdown_reveal").catch((cause) => {
			setError(extractErrorMessage(cause));
		});
	}, []);

	const handleOpenInGlyph = useCallback(async () => {
		const path = relPathRef.current;
		if (!path) return;
		const saved = await saveNow();
		if (!saved && textRef.current !== savedTextRef.current) return;
		void emitTo("main", "app:open_note", { path }).catch(() => {});
	}, [saveNow]);

	useTauriEvent("menu:app_command", (payload) => {
		if (payload.command_id === "close-active-tab") {
			void closeWindow();
			return;
		}
		if (payload.command_id === "paste_without_formatting") {
			dispatchEditorMenuAction({ action: "paste_without_formatting" });
		}
	});
	useTauriEvent("external-markdown:close_requested", () => {
		void closeWindow();
	});

	const queueAutosave = useCallback(() => {
		if (autosaveTimerRef.current !== null) {
			window.clearTimeout(autosaveTimerRef.current);
		}
		autosaveTimerRef.current = window.setTimeout(() => {
			autosaveTimerRef.current = null;
			void saveNow();
		}, AUTOSAVE_DELAY_MS);
	}, [saveNow]);

	useEffect(() => {
		mountedRef.current = true;
		let cancelled = false;
		setLoading(true);

		void (async () => {
			const settingsPromise = loadSettings().catch(() => null);
			try {
				const nextAbsPath = await invoke("external_markdown_window_path");
				if (cancelled) return;
				absPathRef.current = nextAbsPath;
				setAbsPath(nextAbsPath);

				const nextRelPath = await resolveRelPath(nextAbsPath);
				if (cancelled) return;

				const nextTitle = displayNameFromPath(
					nextRelPath || fallbackRelPathFromAbs(nextAbsPath),
				);
				relPathRef.current = nextRelPath;
				setRelPath(nextRelPath);
				setTitle(nextTitle);
				await getCurrentWindow().setTitle(`${nextTitle} - Glyph`);

				const doc = await invoke("external_markdown_read", {
					path: nextAbsPath,
				});
				if (cancelled) return;

				const settings = await settingsPromise;
				if (cancelled) return;
				if (settings) {
					setMode(settings.editor.defaultEditorMode);
				}

				textRef.current = doc.text;
				savedTextRef.current = doc.text;
				mtimeRef.current = doc.mtime_ms;
				setText(doc.text);
				setSavedText(doc.text);
				setError("");
				clearPulse();
			} catch (cause) {
				if (cancelled) return;
				setError(extractErrorMessage(cause));
				clearPulse();
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
			mountedRef.current = false;
			if (autosaveTimerRef.current !== null) {
				window.clearTimeout(autosaveTimerRef.current);
			}
		};
	}, [clearPulse, setLoading]);

	const handleChange = useCallback(
		(nextText: string) => {
			textRef.current = nextText;
			setText(nextText);
			queueAutosave();
		},
		[queueAutosave],
	);

	return (
		<div
			className="externalMarkdownWindow"
			data-chrome-dimmed={chromeDimmed ? "true" : "false"}
		>
			<ExternalMarkdownHeader
				title={title}
				folderLabel={folderLabel}
				isInsideSpace={isInsideSpace}
				mode={mode}
				onModeChange={setMode}
				onReveal={handleReveal}
				onOpenInGlyph={() => void handleOpenInGlyph()}
			/>

			<main className="externalMarkdownBody">
				<div className="externalMarkdownEditorShell">
					<NoteInlineEditor
						markdown={text}
						// Only real space-relative paths; inventing one from the abs
						// path makes space-scoped features (list collapse, etc.) fire
						// against the wrong note or toast when no session exists.
						relPath={relPath}
						mode={mode}
						chrome="minimal"
						deferHeavyFeatures
						pasteMarkdownBehavior="smart-markdown"
						onChange={handleChange}
						onFrontmatterCommit={saveNow}
					/>
				</div>
			</main>

			<ExternalMarkdownStatusBar
				wordCount={wordCount}
				error={error}
				saveStatus={visibleSaveStatus}
				saveState={saveStatusState}
				onDismissError={() => setError("")}
			/>
		</div>
	);
}
