import { getCurrentWindow } from "@tauri-apps/api/window";
import { useCallback, useEffect, useRef, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { Save } from "../Icons";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import type { NoteInlineEditorMode } from "../editor/types";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

const AUTOSAVE_DELAY_MS = 700;

function displayNameFromPath(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const parts = normalized.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? path;
}

function statusLabel(state: SaveState): string {
	switch (state) {
		case "dirty":
			return "Unsaved";
		case "saving":
			return "Saving";
		case "saved":
			return "Saved";
		case "error":
			return "Not saved";
		default:
			return "";
	}
}

export function ExternalMarkdownWindow() {
	const [path, setPath] = useState("");
	const [title, setTitle] = useState("Markdown File");
	const [text, setText] = useState("");
	const [savedText, setSavedText] = useState("");
	const [mode, setMode] = useState<NoteInlineEditorMode>("rich");
	const [saveState, setSaveState] = useState<SaveState>("idle");
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
			setSaveState("idle");
			return true;
		}

		const token = saveTokenRef.current + 1;
		const textToSave = textRef.current;
		saveTokenRef.current = token;
		setSaveState("saving");
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
			setSavedText(textToSave);
			if (textRef.current !== textToSave) {
				setSaveState("dirty");
				return false;
			}
			setSaveState("saved");
			window.setTimeout(() => {
				if (mountedRef.current && saveTokenRef.current === token) {
					setSaveState("idle");
				}
			}, 1200);
			return true;
		} catch (cause) {
			if (!mountedRef.current || token !== saveTokenRef.current) return false;
			setSaveState("error");
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
		await getCurrentWindow()
			.close()
			.catch(() => {});
	}, [saveNow]);

	useTauriEvent("menu:app_command", (payload) => {
		if (payload.command_id !== "close-active-tab") return;
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
				setSavedText(doc.text);
				setSaveState("idle");
				setError("");
			} catch (cause) {
				if (cancelled) return;
				setSaveState("error");
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
			setSaveState(nextText === savedTextRef.current ? "idle" : "dirty");
			queueAutosave();
		},
		[queueAutosave],
	);

	const isDirty = text !== savedText;
	const visibleStatus =
		statusLabel(saveState) || (isDirty ? "Unsaved" : "Saved");

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
					<span className="externalMarkdownStatus">{visibleStatus}</span>
					<div className="externalMarkdownModeSwitch" aria-label="Editor mode">
						<button
							type="button"
							className="externalMarkdownModeBtn"
							data-active={mode === "rich" || undefined}
							onClick={() => setMode("rich")}
						>
							Edit
						</button>
						<button
							type="button"
							className="externalMarkdownModeBtn"
							data-active={mode === "preview" || undefined}
							onClick={() => setMode("preview")}
						>
							Preview
						</button>
						<button
							type="button"
							className="externalMarkdownModeBtn"
							data-active={mode === "plain" || undefined}
							onClick={() => setMode("plain")}
						>
							Raw
						</button>
					</div>
					<button
						type="button"
						className="externalMarkdownIconBtn"
						onClick={() => void saveNow()}
						disabled={!isDirty || saveState === "saving"}
						aria-label="Save"
						title="Save"
					>
						<Save size={15} />
					</button>
				</div>
			</header>

			{error ? <div className="externalMarkdownError">{error}</div> : null}

			<main className="externalMarkdownEditor">
				<NoteInlineEditor
					markdown={text}
					relPath={path}
					mode={mode}
					showBacklinks={false}
					deferHeavyFeatures
					pasteMarkdownBehavior="smart-markdown"
					onChange={handleChange}
					onFrontmatterCommit={saveNow}
				/>
			</main>
		</div>
	);
}
