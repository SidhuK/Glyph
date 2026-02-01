import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TextFileDoc } from "../lib/tauri";
import { RefreshCw, Save, X } from "./Icons";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";
type EditorMode = "preview" | "rich" | "raw";

function normalizeForCompare(markdown: string): string {
	return markdown
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+$/gm, "")
		.replace(/\n+$/, "\n");
}

interface MarkdownFileEditorProps {
	doc: TextFileDoc | null;
	value: string;
	isDirty: boolean;
	onChange: (next: string) => void;
	onSave: () => Promise<void>;
	onReloadFromDisk: () => Promise<void>;
	onClose?: () => void;
}

export const MarkdownFileEditor = memo(function MarkdownFileEditor({
	doc,
	value,
	isDirty,
	onChange,
	onSave,
	onReloadFromDisk,
	onClose,
}: MarkdownFileEditorProps) {
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [error, setError] = useState<string>("");
	const [mode, setMode] = useState<EditorMode>("preview");
	const [roundTripSafe, setRoundTripSafe] = useState<boolean | null>(null);
	const applyingContentRef = useRef(false);
	const lastAppliedMarkdownRef = useRef<string>("");
	const modeRef = useRef<EditorMode>("preview");
	const prevModeRef = useRef<EditorMode>("preview");
	const onChangeRef = useRef(onChange);

	useEffect(() => {
		prevModeRef.current = modeRef.current;
		modeRef.current = mode;
	}, [mode]);

	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

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

	const editor = useEditor({
		extensions,
		content: "",
		editorProps: {
			attributes: {
				class: "tiptap",
				spellcheck: "false",
			},
		},
		onUpdate: ({ editor }) => {
			if (applyingContentRef.current) return;
			if (modeRef.current !== "rich") return;
			onChangeRef.current(editor.getMarkdown());
		},
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset local editor UI state when switching files (by path).
	useEffect(() => {
		setError("");
		setSaveState("idle");
		setMode("preview");
		setRoundTripSafe(null);
	}, [doc?.rel_path]);

	useEffect(() => {
		setSaveState(isDirty ? "dirty" : "idle");
	}, [isDirty]);

	useEffect(() => {
		if (!editor) return;
		const canEdit = mode === "rich" && roundTripSafe !== false;
		editor.setEditable(canEdit);
	}, [editor, mode, roundTripSafe]);

	useEffect(() => {
		if (!editor) return;
		if (!doc) return;
		const next = doc.text ?? "";
		applyingContentRef.current = true;
		try {
			editor.commands.setContent(next, { contentType: "markdown" });
			lastAppliedMarkdownRef.current = next;
		} finally {
			applyingContentRef.current = false;
		}

		// Determine whether rich-editing is currently safe (round-trip preserves content).
		// If not, default to preview and require "Raw" mode for editing.
		queueMicrotask(() => {
			try {
				const rt = editor.getMarkdown();
				const safe = normalizeForCompare(rt) === normalizeForCompare(next);
				setRoundTripSafe(safe);
				if (!safe && modeRef.current === "rich") setMode("raw");
			} catch {
				setRoundTripSafe(false);
				if (modeRef.current === "rich") setMode("raw");
			}
		});
	}, [doc, editor]);

	useEffect(() => {
		if (!editor) return;
		if (!doc) return;
		if (mode === "raw") return;
		if (prevModeRef.current !== "raw") return;
		const current = value ?? "";
		if (current === lastAppliedMarkdownRef.current) return;

		applyingContentRef.current = true;
		try {
			editor.commands.setContent(current, { contentType: "markdown" });
			lastAppliedMarkdownRef.current = current;
		} finally {
			applyingContentRef.current = false;
		}
	}, [doc, editor, mode, value]);

	const doSave = useCallback(async () => {
		if (!doc) return;
		setSaveState("saving");
		setError("");
		try {
			await onSave();
			setSaveState("saved");
		} catch (e) {
			setSaveState("error");
			setError(e instanceof Error ? e.message : String(e));
		}
	}, [doc, onSave]);

	const reloadFromDisk = useCallback(async () => {
		if (!doc) return;
		if (isDirty) {
			const ok = window.confirm(
				"Reload from disk? This will discard your unsaved changes.",
			);
			if (!ok) return;
		}
		setError("");
		setSaveState("idle");
		await onReloadFromDisk();
	}, [doc, isDirty, onReloadFromDisk]);

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
				<div className="editorEmpty">Select a Markdown file to open.</div>
			</section>
		);
	}

	const title = doc.rel_path.split("/").pop() || doc.rel_path;
	const richDisabled = roundTripSafe === false;
	const richTitle = richDisabled
		? "Rich editor disabled: this file contains Markdown syntax that doesn't round-trip safely yet. Use Raw mode."
		: "Rich editor";

	return (
		<section className="editorPane">
			<div className="editorHeader">
				<div className="editorTitle" title={doc.rel_path}>
					{title}
				</div>
				<div className="editorActions">
					<div className="editorMode">
						<button
							type="button"
							className={mode === "preview" ? "segBtn active" : "segBtn"}
							onClick={() => setMode("preview")}
							title="Preview"
						>
							Preview
						</button>
						<button
							type="button"
							className={mode === "rich" ? "segBtn active" : "segBtn"}
							onClick={() => setMode("rich")}
							disabled={richDisabled}
							title={richTitle}
						>
							Edit
						</button>
						<button
							type="button"
							className={mode === "raw" ? "segBtn active" : "segBtn"}
							onClick={() => setMode("raw")}
							title="Raw Markdown"
						>
							Raw
						</button>
					</div>
					<div className="editorStatus">{statusLabel}</div>
					<button
						type="button"
						className="iconBtn"
						onClick={reloadFromDisk}
						title="Reload from disk"
					>
						<RefreshCw size={16} />
					</button>
					<button
						type="button"
						className="iconBtn"
						onClick={doSave}
						disabled={!isDirty}
						title={isDirty ? "Save" : "No changes to save"}
					>
						<Save size={16} />
					</button>
					{onClose && (
						<button
							type="button"
							className="iconBtn"
							onClick={onClose}
							title="Close"
						>
							<X size={16} />
						</button>
					)}
				</div>
			</div>

			<div className="editorBody">
				{mode === "raw" ? (
					<textarea
						className="mdRawEditor"
						value={value}
						onChange={(e) => onChange(e.target.value)}
						spellCheck={false}
					/>
				) : (
					<EditorContent editor={editor} />
				)}
			</div>
			{roundTripSafe === false ? (
				<div className="editorError">
					Rich editing is disabled for this file because Tether can’t round-trip
					it safely yet. Use Raw mode to edit without losing Obsidian-specific
					Markdown.
				</div>
			) : null}
			{error ? <div className="editorError">{error}</div> : null}
		</section>
	);
});
