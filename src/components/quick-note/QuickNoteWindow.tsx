import { useCallback, useEffect, useRef, useState } from "react";
import { isMissingFileError } from "../../lib/fsErrors";
import { loadSettings, reloadFromDisk } from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { basename } from "../../utils/path";
import { Save } from "../Icons";

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

export function QuickNoteWindow() {
	const [folder, setFolder] = useState("Quick Notes");
	const [draft, setDraft] = useState("");
	const [status, setStatus] = useState("");
	const [saving, setSaving] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	const hasText = draft.trim().length > 0;

	const refreshSettings = useCallback(async (withReload = false) => {
		if (withReload) await reloadFromDisk();
		const settings = await loadSettings();
		setFolder(settings.quickNotes.folder);
	}, []);

	useEffect(() => {
		void refreshSettings().catch(() => {});
		const focusTimer = window.setTimeout(
			() => textareaRef.current?.focus(),
			80,
		);
		return () => window.clearTimeout(focusTimer);
	}, [refreshSettings]);

	useTauriEvent("settings:updated", (payload) => {
		if (typeof payload.quickNotes?.folder === "string") {
			setFolder(payload.quickNotes.folder);
		}
	});

	const save = useCallback(async () => {
		const text = draft.trim();
		if (!text || saving) return;
		setSaving(true);
		setStatus("");
		try {
			const path = await appendQuickNote(folder, text);
			setDraft("");
			setStatus(`Saved ${savedLabel(path)}`);
			window.setTimeout(() => setStatus(""), 1600);
			window.setTimeout(() => textareaRef.current?.focus(), 20);
		} catch (cause) {
			setStatus(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	}, [draft, folder, saving]);

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		const primary = event.metaKey || event.ctrlKey;
		if (event.key === "Escape") {
			event.preventDefault();
			void invoke("hide_quick_note_window");
			return;
		}
		if (primary && event.key === "Enter") {
			event.preventDefault();
			void save();
		}
	};

	return (
		<div className="quickNoteRoot">
			<div className="quickNoteDragHandle" data-tauri-drag-region />
			<textarea
				ref={textareaRef}
				className="quickNoteTextarea"
				value={draft}
				placeholder="Write a quick note"
				onChange={(event) => setDraft(event.target.value)}
				onKeyDown={handleKeyDown}
				spellCheck
			/>
			<div className="quickNoteEditorChrome">
				<div className="quickNoteStatus" aria-live="polite">
					{status}
				</div>
				<button
					type="button"
					className="quickNoteSaveButton"
					aria-label={saving ? "Saving quick note" : "Save quick note"}
					title={
						saving ? "Saving quick note" : "Save quick note (Command+Enter)"
					}
					disabled={saving || !hasText}
					onClick={() => void save()}
				>
					<Save size={16} />
					<span className="quickNoteSaveLabel">Save</span>
					<span className="commandPaletteShortcut" aria-hidden="true">
						<kbd>
							<span className="commandPaletteShortcutCombo">
								<span className="commandPaletteShortcutPart">⌘</span>
								<span className="commandPaletteShortcutPart">↵</span>
							</span>
						</kbd>
					</span>
				</button>
			</div>
		</div>
	);
}
