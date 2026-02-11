import { useCallback, useEffect, useRef, useState } from "react";
import {
	CanvasNoteInlineEditor,
	type CanvasInlineEditorMode,
} from "../CanvasNoteInlineEditor";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke } from "../../lib/tauri";
import { RefreshCw, Save } from "../Icons";
import { Button } from "../ui/shadcn/button";

interface MarkdownEditorPaneProps {
	relPath: string;
	onDirtyChange?: (dirty: boolean) => void;
}

const markdownDocCache = new Map<string, string>();

export function MarkdownEditorPane({
	relPath,
	onDirtyChange,
}: MarkdownEditorPaneProps) {
	const [text, setText] = useState(() => markdownDocCache.get(relPath) ?? "");
	const [savedText, setSavedText] = useState(
		() => markdownDocCache.get(relPath) ?? "",
	);
	const [mode, setMode] = useState<CanvasInlineEditorMode>("rich");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const savedTextRef = useRef(savedText);

	useEffect(() => {
		savedTextRef.current = savedText;
	}, [savedText]);

	useEffect(() => {
		const cached = markdownDocCache.get(relPath) ?? "";
		setText(cached);
		setSavedText(cached);
	}, [relPath]);

	const loadDoc = useCallback(async () => {
		setError("");
		try {
			const doc = await invoke("vault_read_text", { path: relPath });
			markdownDocCache.set(relPath, doc.text);
			setText((prev) => (prev === savedTextRef.current ? doc.text : prev));
			setSavedText(doc.text);
		} catch (e) {
			setError(extractErrorMessage(e));
		}
	}, [relPath]);

	useEffect(() => {
		void loadDoc();
	}, [loadDoc]);

	const onSave = useCallback(async () => {
		setSaving(true);
		setError("");
		try {
			await invoke("vault_write_text", {
				path: relPath,
				text,
				base_mtime_ms: null,
			});
			markdownDocCache.set(relPath, text);
			setSavedText(text);
		} catch (e) {
			setError(extractErrorMessage(e));
		} finally {
			setSaving(false);
		}
	}, [relPath, text]);

	useEffect(() => {
		onDirtyChange?.(text !== savedText);
	}, [onDirtyChange, savedText, text]);

	return (
		<section className="filePreviewPane markdownEditorPane">
			<div className="markdownEditorFloatActions">
				<Button
					type="button"
					variant="outline"
					size="icon-sm"
					onClick={() => void loadDoc()}
					disabled={saving}
					aria-label="Reload file"
					title="Reload file"
				>
					<RefreshCw size={14} />
				</Button>
				<Button
					type="button"
					variant="default"
					size="icon-sm"
					onClick={() => void onSave()}
					disabled={saving}
					aria-label={saving ? "Saving" : "Save file"}
					title={saving ? "Saving" : "Save file"}
				>
					<Save size={14} />
				</Button>
			</div>

			{error ? (
				<div className="filePreviewMeta">
					<div className="filePreviewHint">{error}</div>
				</div>
			) : null}

			{!error ? (
				<div className="filePreviewTextWrap markdownEditorContent">
					<div className="markdownEditorCenter">
						<CanvasNoteInlineEditor
							markdown={text}
							mode={mode}
							onModeChange={setMode}
							onChange={setText}
						/>
					</div>
				</div>
			) : null}
		</section>
	);
}
