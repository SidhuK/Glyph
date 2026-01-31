import { markdown } from "@codemirror/lang-markdown";
import type { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TextFileDoc } from "../lib/tauri";
import { RefreshCw, Save, X } from "./Icons";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

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
	const viewRef = useRef<EditorView | null>(null);
	const [saveState, setSaveState] = useState<SaveState>("idle");
	const [error, setError] = useState<string>("");

	const extensions = useMemo(() => [markdown()], []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: Reset local editor UI state when switching files (by path).
	useEffect(() => {
		setError("");
		setSaveState("idle");
	}, [doc?.rel_path]);

	useEffect(() => {
		setSaveState(isDirty ? "dirty" : "idle");
	}, [isDirty]);

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

	return (
		<section className="editorPane">
			<div className="editorHeader">
				<div className="editorTitle" title={doc.rel_path}>
					{title}
				</div>
				<div className="editorActions">
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
				<CodeMirror
					value={value}
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
