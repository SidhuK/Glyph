import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorSaveIndicator } from "../../hooks/useEditorSaveIndicator";
import type { EditorViewMode } from "../../lib/editorMode";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import {
	displayFolderFromPath,
	displayNameFromPath,
	normalizeRelPath,
} from "../../utils/path";
import { EditorViewModeSwitch } from "../editor/EditorViewModeSwitch";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";

const AUTOSAVE_DELAY_MS = 700;

function fallbackRelPathFromAbs(absPath: string): string {
	const normalized = normalizeRelPath(absPath);
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? normalized;
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
	const [title, setTitle] = useState("Markdown File");
	const [text, setText] = useState("");
	const [savedText, setSavedText] = useState("");
	const [mode, setMode] = useState<EditorViewMode>("rich");
	const [error, setError] = useState("");
	const textRef = useRef("");
	const savedTextRef = useRef("");
	const absPathRef = useRef("");
	const mtimeRef = useRef<number | null>(null);
	const saveTokenRef = useRef(0);
	const autosaveTimerRef = useRef<number | null>(null);
	const mountedRef = useRef(true);
	const {
		setSaving,
		setLoading,
		flashPulse,
		clearPulse,
		resolveLabel,
		resolveState,
	} = useEditorSaveIndicator();

	const folderLabel = useMemo(
		() => (relPath ? displayFolderFromPath(relPath) : ""),
		[relPath],
	);
	const isDirty = text !== savedText;
	const visibleSaveStatus = resolveLabel({ isDirty, idleLabel: null });
	const saveStatusState = resolveState({ isDirty });

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

	useTauriEvent("menu:app_command", (payload) => {
		if (payload.command_id !== "close-active-tab") return;
		void closeWindow();
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
			try {
				const absPath = await invoke("external_markdown_window_path");
				if (cancelled) return;
				absPathRef.current = absPath;

				const nextRelPath = await resolveRelPath(absPath);
				if (cancelled) return;

				const nextTitle = displayNameFromPath(
					nextRelPath || fallbackRelPathFromAbs(absPath),
				);
				setRelPath(nextRelPath);
				setTitle(nextTitle);
				await getCurrentWindow().setTitle(`${nextTitle} - Glyph`);

				const doc = await invoke("external_markdown_read", {
					path: absPath,
				});
				if (cancelled) return;
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
		<div className="externalMarkdownWindow">
			<div className="externalMarkdownOverlayChrome">
				<div
					className="externalMarkdownDragRegion"
					data-tauri-drag-region
					aria-hidden="true"
				/>
				<div className="externalMarkdownTitleBlock">
					<h1 className="externalMarkdownTitle">{title}</h1>
					{folderLabel ? (
						<p className="externalMarkdownMeta">{folderLabel}</p>
					) : null}
				</div>
			</div>

			{error ? <div className="externalMarkdownError">{error}</div> : null}

			<main className="externalMarkdownBody">
				<div className="externalMarkdownEditorPane">
					<div className="externalMarkdownFloatActions">
						{visibleSaveStatus ? (
							<span
								className="externalMarkdownSaveStatus"
								data-state={saveStatusState}
								aria-live="polite"
							>
								{visibleSaveStatus}
							</span>
						) : null}
						<div className="markdownEditorToolbar">
							<EditorViewModeSwitch mode={mode} onModeChange={setMode} />
						</div>
					</div>
					<div className="externalMarkdownEditorShell">
						<NoteInlineEditor
							markdown={text}
							relPath={relPath}
							mode={mode}
							chrome="minimal"
							deferHeavyFeatures
							pasteMarkdownBehavior="smart-markdown"
							onChange={handleChange}
							onFrontmatterCommit={saveNow}
						/>
					</div>
				</div>
			</main>
		</div>
	);
}
