import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import type { NoteInlineEditorMode } from "../editor/types";

const AUTOSAVE_DELAY_MS = 700;

function displayNameFromPath(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

export function ExternalMarkdownWindow() {
	const [path, setPath] = useState("");
	const [title, setTitle] = useState("Markdown File");
	const [text, setText] = useState("");
	const [mode, setMode] = useState<NoteInlineEditorMode>("rich");
	const [error, setError] = useState("");
	const textRef = useRef("");
	const savedTextRef = useRef("");
	const pathRef = useRef("");
	const mtimeRef = useRef<number | null>(null);
	const saveTokenRef = useRef(0);
	const autosaveTimerRef = useRef<number | null>(null);
	const mountedRef = useRef(true);

	const saveNow = useCallback(async (): Promise<boolean> => {
		const currentPath = pathRef.current;
		if (!currentPath) return true;
		if (textRef.current === savedTextRef.current) {
			return true;
		}

		const token = saveTokenRef.current + 1;
		const textToSave = textRef.current;
		saveTokenRef.current = token;
		setError("");

		try {
			const result = await invoke("external_markdown_write", {
				path: currentPath,
				text: textToSave,
				base_mtime_ms: mtimeRef.current,
			});
			if (!mountedRef.current || token !== saveTokenRef.current) return false;
			mtimeRef.current = result.mtime_ms;
			savedTextRef.current = textToSave;
			if (textRef.current !== textToSave) {
				return false;
			}
			return true;
		} catch (cause) {
			if (!mountedRef.current || token !== saveTokenRef.current) return false;
			setError(extractErrorMessage(cause));
			return false;
		}
	}, []);

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

		void (async () => {
			try {
				const windowPath = await invoke("external_markdown_window_path");
				if (cancelled) return;
				pathRef.current = windowPath;
				setPath(windowPath);
				const nextTitle = displayNameFromPath(windowPath);
				setTitle(nextTitle);
				await getCurrentWindow().setTitle(`${nextTitle} - Glyph`);

				const doc = await invoke("external_markdown_read", {
					path: windowPath,
				});
				if (cancelled) return;
				textRef.current = doc.text;
				savedTextRef.current = doc.text;
				mtimeRef.current = doc.mtime_ms;
				setText(doc.text);
				setError("");
			} catch (cause) {
				if (cancelled) return;
				setError(extractErrorMessage(cause));
			}
		})();

		return () => {
			cancelled = true;
			mountedRef.current = false;
			if (autosaveTimerRef.current !== null) {
				window.clearTimeout(autosaveTimerRef.current);
			}
		};
	}, []);

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
			<header className="externalMarkdownHeader" data-tauri-drag-region>
				<div className="externalMarkdownTitleBlock">
					<div className="externalMarkdownTitle">{title}</div>
					<div className="externalMarkdownPath">
						{path || "Opening file..."}
					</div>
				</div>
				<div className="externalMarkdownActions">
					<div className="externalMarkdownModeSwitch" aria-label="Editor mode">
						<button
							type="button"
							className="externalMarkdownModeBtn"
							data-active={mode === "rich" || undefined}
							aria-pressed={mode === "rich"}
							onClick={() => setMode("rich")}
						>
							Edit
						</button>
						<button
							type="button"
							className="externalMarkdownModeBtn"
							data-active={mode === "preview" || undefined}
							aria-pressed={mode === "preview"}
							onClick={() => setMode("preview")}
						>
							Preview
						</button>
						<button
							type="button"
							className="externalMarkdownModeBtn"
							data-active={mode === "plain" || undefined}
							aria-pressed={mode === "plain"}
							onClick={() => setMode("plain")}
						>
							Raw
						</button>
					</div>
				</div>
			</header>

			{error ? <div className="externalMarkdownError">{error}</div> : null}

			<main className="externalMarkdownEditor">
				<NoteInlineEditor
					markdown={text}
					relPath={path}
					mode={mode}
					deferHeavyFeatures
					pasteMarkdownBehavior="smart-markdown"
					onChange={handleChange}
					onFrontmatterCommit={saveNow}
				/>
			</main>
		</div>
	);
}
