import { markdown } from "@codemirror/lang-markdown";
import type { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BacklinkItem, NoteDoc } from "../lib/tauri";
import { Paperclip, RotateCcw, Save, X } from "./Icons";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface NoteEditorProps {
	doc: NoteDoc | null;
	backlinks: BacklinkItem[];
	backlinksError: string;
	onOpenBacklink: (id: string) => void;
	onChangeMarkdown: (markdown: string) => void;
	onSave: (markdown: string) => Promise<void>;
	onForceSave: (markdown: string) => Promise<void>;
	onReloadFromDisk: () => Promise<void>;
	onAttachFile: () => Promise<string | null>;
	onClose?: () => void;
}

export const NoteEditor = memo(function NoteEditor({
	doc,
	backlinks,
	backlinksError,
	onOpenBacklink,
	onChangeMarkdown,
	onSave,
	onForceSave,
	onReloadFromDisk,
	onAttachFile,
	onClose,
}: NoteEditorProps) {
	const viewRef = useRef<EditorView | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [error, setError] = useState<string>("");
	const saveTimerRef = useRef<number | null>(null);

	const extensions = useMemo(() => [markdown()], []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset editor state when switching notes (by id).
	useEffect(() => {
		setError("");
		setSaveState("idle");
		if (saveTimerRef.current) {
			window.clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}
	}, [doc?.meta.id]);

	const scheduleSave = useCallback(
		(next: string) => {
			if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
			setSaveState("dirty");
			saveTimerRef.current = window.setTimeout(async () => {
				setSaveState("saving");
				setError("");
				try {
					await onSave(next);
					setSaveState("saved");
				} catch (e) {
					setSaveState("error");
					setError(e instanceof Error ? e.message : String(e));
				}
			}, 500);
		},
		[onSave],
	);

	const isConflict = useMemo(
		() => error.toLowerCase().includes("conflict:"),
		[error],
	);

	const reloadFromDisk = useCallback(async () => {
		if (!doc) return;
		const ok = window.confirm(
			"Reload from disk? This will replace the editor contents.",
		);
		if (!ok) return;
		setError("");
		setSaveState("idle");
		await onReloadFromDisk();
	}, [doc, onReloadFromDisk]);

	const overwriteDisk = useCallback(async () => {
		if (!doc) return;
		const ok = window.confirm(
			"Overwrite the on-disk note with your current editor contents?",
		);
		if (!ok) return;
		setError("");
		setSaveState("saving");
		try {
			await onForceSave(doc.markdown);
			setSaveState("saved");
		} catch (e) {
			setSaveState("error");
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [doc, onForceSave]);

	const onChange = useCallback(
		(next: string) => {
			onChangeMarkdown(next);
			scheduleSave(next);
		},
		[onChangeMarkdown, scheduleSave],
	);

	const attach = useCallback(async () => {
		try {
			const snippet = await onAttachFile();
			if (!snippet) return;
			const view = viewRef.current;
			if (!view) return;

			const insertion = `\n${snippet}\n`;
			const from = view.state.selection.main.from;
			view.dispatch({
				changes: { from, to: from, insert: insertion },
				selection: { anchor: from + insertion.length },
				scrollIntoView: true,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [onAttachFile]);

	const statusLabel = useMemo(() => {
		if (!doc) return "";
		switch (saveState) {
			case "idle":
				return "";
			case "dirty":
				return "Unsaved changes…";
			case "saving":
				return "Saving…";
			case "saved":
				return "Saved";
			case "error":
				return "Save failed";
		}
	}, [doc, saveState]);

	if (!doc) {
		return (
			<section className="editorPane">
				<div className="editorEmpty">Select a note to start editing.</div>
			</section>
		);
	}

	return (
		<section className="editorPane">
			<div className="editorHeader">
				<div className="editorTitle">{doc.meta.title || "Untitled"}</div>
				<div className="editorActions">
					<div className="editorStatus">{statusLabel}</div>
					<button
						type="button"
						className="iconBtn"
						onClick={attach}
						title="Attach a file to this note"
					>
						<Paperclip size={16} />
					</button>
					{isConflict ? (
						<>
							<button
								type="button"
								className="iconBtn"
								onClick={reloadFromDisk}
								title="Reload note from disk"
							>
								<RotateCcw size={16} />
							</button>
							<button
								type="button"
								className="iconBtn"
								onClick={overwriteDisk}
								title="Overwrite disk with current content"
							>
								<Save size={16} />
							</button>
						</>
					) : null}
					{onClose && (
						<button
							type="button"
							className="iconBtn"
							onClick={onClose}
							title="Close editor"
						>
							<X size={16} />
						</button>
					)}
				</div>
			</div>

			{(backlinksError || backlinks.length) && (
				<div className="backlinksPane">
					<div className="backlinksHeader">
						<div className="backlinksTitle">Backlinks</div>
						<div className="backlinksMeta">
							{backlinks.length ? `${backlinks.length}` : ""}
						</div>
					</div>
					{backlinksError ? (
						<div className="backlinksError">{backlinksError}</div>
					) : null}
					{backlinks.length ? (
						<ul className="backlinksList">
							{backlinks.map((b) => (
								<li key={b.id} className="backlinksItem">
									<button
										type="button"
										className="backlinksButton"
										onClick={() => onOpenBacklink(b.id)}
									>
										<div className="backlinksItemTitle">
											{b.title || "Untitled"}
										</div>
										<div className="backlinksItemMeta">{b.updated}</div>
									</button>
								</li>
							))}
						</ul>
					) : (
						<div className="backlinksEmpty">No backlinks</div>
					)}
				</div>
			)}

			<div className="editorBody">
				<CodeMirror
					value={doc.markdown}
					height="100%"
					basicSetup={{
						lineNumbers: true,
						foldGutter: true,
					}}
					extensions={extensions}
					onChange={onChange}
					onCreateEditor={(view) => {
						viewRef.current = view;
					}}
				/>
			</div>
			{error ? <div className="editorError">{error}</div> : null}
		</section>
	);
});
