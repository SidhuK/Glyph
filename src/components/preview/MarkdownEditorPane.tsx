import { useCallback, useEffect, useMemo, useState } from "react";
import {
	CanvasNoteInlineEditor,
	type CanvasInlineEditorMode,
} from "../CanvasNoteInlineEditor";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke } from "../../lib/tauri";
import { Button } from "../ui/shadcn/button";

interface MarkdownEditorPaneProps {
	relPath: string;
	onDirtyChange?: (dirty: boolean) => void;
}

function filenameFromPath(relPath: string): string {
	const parts = relPath.split("/").filter(Boolean);
	return parts[parts.length - 1] ?? relPath;
}

export function MarkdownEditorPane({
	relPath,
	onDirtyChange,
}: MarkdownEditorPaneProps) {
	const [text, setText] = useState("");
	const [savedText, setSavedText] = useState("");
	const [mode, setMode] = useState<CanvasInlineEditorMode>("plain");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");

	const displayName = useMemo(() => filenameFromPath(relPath), [relPath]);

	const loadDoc = useCallback(async () => {
		setLoading(true);
		setError("");
		try {
			const doc = await invoke("vault_read_text", { path: relPath });
			setText(doc.text);
			setSavedText(doc.text);
		} catch (e) {
			setError(extractErrorMessage(e));
		} finally {
			setLoading(false);
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
			<header className="filePreviewHeader">
				<div className="filePreviewHeaderMeta">
					<div className="filePreviewName mono" title={relPath}>
						{displayName}
					</div>
				</div>
				<div className="filePreviewActions">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => void loadDoc()}
						disabled={loading || saving}
					>
						Reload
					</Button>
					<Button
						type="button"
						variant="default"
						size="sm"
						onClick={() => void onSave()}
						disabled={loading || saving}
					>
						{saving ? "Saving..." : "Save"}
					</Button>
				</div>
			</header>

			{loading ? <div className="canvasEmpty">Loading document...</div> : null}
			{!loading && error ? (
				<div className="filePreviewMeta">
					<div className="filePreviewHint">{error}</div>
				</div>
			) : null}

			{!loading && !error ? (
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
