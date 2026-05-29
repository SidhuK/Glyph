import { SlidersHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
	type MouseEvent as ReactMouseEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { showNativePopupMenu } from "../../lib/nativeContextMenu";
import { invoke } from "../../lib/tauri";
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

	const saveNow = useCallback(async () => {
		const currentPath = pathRef.current;
		if (!currentPath) return;
		if (textRef.current === savedTextRef.current) {
			setSaveState("idle");
			return;
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
			if (!mountedRef.current || token !== saveTokenRef.current) return;
			mtimeRef.current = result.mtime_ms;
			savedTextRef.current = textToSave;
			setSavedText(textToSave);
			if (textRef.current !== textToSave) {
				setSaveState("dirty");
				return;
			}
			setSaveState("saved");
			window.setTimeout(() => {
				if (mountedRef.current && saveTokenRef.current === token) {
					setSaveState("idle");
				}
			}, 1200);
		} catch (cause) {
			if (!mountedRef.current || token !== saveTokenRef.current) return;
			setSaveState("error");
			setError(extractErrorMessage(cause));
		}
	}, []);

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

	const handleActionsMenu = useCallback(
		(event: ReactMouseEvent<HTMLButtonElement>) => {
			void showNativePopupMenu(event, [
				{
					label: "Edit",
					checked: mode === "rich",
					action: () => setMode("rich"),
				},
				{
					label: "Preview",
					checked: mode === "preview",
					action: () => setMode("preview"),
				},
				{
					label: "Raw",
					checked: mode === "plain",
					action: () => setMode("plain"),
				},
			]).catch((cause: unknown) => {
				console.error("Failed to show external markdown actions", cause);
			});
		},
		[mode],
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
					<button
						type="button"
						className="externalMarkdownIconBtn"
						onClick={handleActionsMenu}
						aria-label="Open editor actions"
						title="Open editor actions"
						aria-haspopup="menu"
					>
						<HugeiconsIcon
							icon={SlidersHorizontalIcon}
							size={15}
							strokeWidth={0.9}
						/>
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
