import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BacklinkItem, NoteDoc } from "../lib/tauri";
import { Code2, Edit, Eye, Paperclip, RotateCcw, Save, X } from "./Icons";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type EditorMode = "preview" | "edit" | "raw";

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
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [error, setError] = useState<string>("");
	const [mode, setMode] = useState<EditorMode>("edit");
	const [rawValue, setRawValue] = useState("");
	const saveTimerRef = useRef<number | null>(null);
	const applyingContentRef = useRef(false);
	const modeRef = useRef<EditorMode>("edit");
	const prevModeRef = useRef<EditorMode>("edit");
	const onChangeMarkdownRef = useRef(onChangeMarkdown);

	useEffect(() => {
		prevModeRef.current = modeRef.current;
		modeRef.current = mode;
	}, [mode]);

	useEffect(() => {
		onChangeMarkdownRef.current = onChangeMarkdown;
	}, [onChangeMarkdown]);

	const extensions = useMemo(
		() => [
			StarterKit,
			Link.configure({ openOnClick: false }),
			TaskList,
			TaskItem.configure({ nested: true }),
			Markdown,
		],
		[],
	);

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

	const editor = useEditor(
		{
			extensions,
			content: "",
			editorProps: {
				attributes: {
					class: "tiptapContent",
					spellcheck: "false",
				},
			},
			onUpdate: ({ editor }) => {
				if (applyingContentRef.current) return;
				if (modeRef.current !== "edit") return;
				const md = editor.getMarkdown();
				onChangeMarkdownRef.current(md);
				scheduleSave(md);
			},
		},
		[modeRef, applyingContentRef, onChangeMarkdownRef, scheduleSave],
	);

	// Error handling for editor initialization
	useEffect(() => {
		if (!editor && mode !== "preview") {
			setError("Editor initialization failed");
		}
	}, [editor, mode]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset editor state when switching notes (by id).
	useEffect(() => {
		setError("");
		setSaveState("idle");
		setMode("edit");
		if (saveTimerRef.current) {
			window.clearTimeout(saveTimerRef.current);
			saveTimerRef.current = null;
		}
		return () => {
			if (saveTimerRef.current) {
				window.clearTimeout(saveTimerRef.current);
				saveTimerRef.current = null;
			}
		};
	}, [doc?.meta.id]);

	useEffect(() => {
		if (!editor) return;
		if (!doc) return;
		applyingContentRef.current = true;
		try {
			editor.commands.setContent(doc.markdown, { contentType: "markdown" });
			setRawValue(doc.markdown);
		} finally {
			applyingContentRef.current = false;
		}
	}, [doc, editor]);

	useEffect(() => {
		if (!editor) return;
		editor.setEditable(mode === "edit");
	}, [editor, mode]);

	useEffect(() => {
		if (!editor) return;
		if (!doc) return;
		if (mode === "raw") return;
		if (prevModeRef.current !== "raw") return;
		if (applyingContentRef.current) return;
		applyingContentRef.current = true;
		try {
			editor.commands.setContent(rawValue, { contentType: "markdown" });
		} finally {
			applyingContentRef.current = false;
		}
	}, [doc, editor, mode, rawValue]);

	// Sync raw value changes to editor when in edit mode
	useEffect(() => {
		if (!editor || mode !== "edit") return;
		if (applyingContentRef.current) return;
		const currentMarkdown = editor.getMarkdown();
		if (currentMarkdown !== rawValue) {
			applyingContentRef.current = true;
			try {
				editor.commands.setContent(rawValue, { contentType: "markdown" });
			} finally {
				applyingContentRef.current = false;
			}
		}
	}, [rawValue, editor, mode]);

	const handleRawChange = useCallback(
		(next: string) => {
			setRawValue(next);
			onChangeMarkdownRef.current(next);
			scheduleSave(next);
		},
		[scheduleSave],
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

	const attach = useCallback(async () => {
		try {
			const snippet = await onAttachFile();
			if (!snippet) return;
			if (!editor) return;

			const insertion = `\n${snippet}\n`;
			editor.chain().focus().insertContent(insertion).run();
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [onAttachFile, editor]);

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
					<div
						className="editorMode"
						role="tablist"
						aria-label="Editor mode"
						id="editor-mode"
					>
						<button
							type="button"
							role="tab"
							aria-selected={mode === "preview"}
							aria-controls="editor-content"
							className={mode === "preview" ? "segBtn active" : "segBtn"}
							onClick={() => setMode("preview")}
							title="Preview"
						>
							<Eye size={16} />
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={mode === "edit"}
							aria-controls="editor-content"
							className={mode === "edit" ? "segBtn active" : "segBtn"}
							onClick={() => setMode("edit")}
							title="Rich editor"
						>
							<Edit size={16} />
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={mode === "raw"}
							aria-controls="editor-content"
							className={mode === "raw" ? "segBtn active" : "segBtn"}
							onClick={() => setMode("raw")}
							title="Raw Markdown"
						>
							<Code2 size={16} />
						</button>
					</div>
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

			<div
				className="editorBody"
				id="editor-content"
				role="tabpanel"
				aria-labelledby="editor-mode"
			>
				{mode === "raw" ? (
					<textarea
						className="mdRawEditor"
						value={rawValue}
						onChange={(e) => handleRawChange(e.target.value)}
						spellCheck={false}
						aria-label="Raw markdown editor"
					/>
				) : (
					<EditorContent editor={editor} className="tiptapHost" />
				)}
			</div>
			{error ? <div className="editorError">{error}</div> : null}
		</section>
	);
});
