import { MenuCircleIcon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorRegistration, useVault } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke } from "../../lib/tauri";
import { parentDir } from "../../utils/path";
import {
	type CanvasInlineEditorMode,
	CanvasNoteInlineEditor,
} from "../editor/CanvasNoteInlineEditor";
import { FolderBreadcrumb } from "../FolderBreadcrumb";
import { Edit, Eye, RefreshCw, Save } from "../Icons";
import { Button } from "../ui/shadcn/button";

interface MarkdownEditorPaneProps {
	relPath: string;
	onOpenFolder: (dirPath: string) => void;
	onDirtyChange?: (dirty: boolean) => void;
}

const markdownDocCache = new Map<string, string>();

export function MarkdownEditorPane({
	relPath,
	onOpenFolder,
	onDirtyChange,
}: MarkdownEditorPaneProps) {
	const [text, setText] = useState(() => markdownDocCache.get(relPath) ?? "");
	const [savedText, setSavedText] = useState(
		() => markdownDocCache.get(relPath) ?? "",
	);
	const [mode, setMode] = useState<CanvasInlineEditorMode>("rich");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [actionsOpen, setActionsOpen] = useState(false);
	const savedTextRef = useRef(savedText);
	const { vaultPath } = useVault();

	const isDirty = text !== savedText;

	useEffect(() => {
		savedTextRef.current = savedText;
	}, [savedText]);

	useEffect(() => {
		const cached = markdownDocCache.get(relPath) ?? "";
		setText(cached);
		setSavedText(cached);
		setActionsOpen(false);
	}, [relPath]);

	useEffect(() => {
		markdownDocCache.clear();
	}, [vaultPath]);

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

	// Register editor state for keyboard shortcuts
	const editorState = useMemo(
		() => ({
			isDirty,
			save: onSave,
		}),
		[isDirty, onSave],
	);
	useEditorRegistration(editorState);

	useEffect(() => {
		onDirtyChange?.(isDirty);
	}, [onDirtyChange, isDirty]);

	const currentDir = useMemo(() => parentDir(relPath), [relPath]);

	return (
		<section className="filePreviewPane markdownEditorPane">
			<div className="markdownEditorFloatActions">
				<div className="markdownEditorActionsMenu">
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						className="markdownEditorMenuTrigger"
						onClick={() => setActionsOpen((prev) => !prev)}
						aria-label={
							actionsOpen ? "Close editor actions" : "Open editor actions"
						}
						title={actionsOpen ? "Close editor actions" : "Open editor actions"}
						aria-expanded={actionsOpen}
					>
						<HugeiconsIcon icon={MenuCircleIcon} size={14} />
					</Button>
					{actionsOpen ? (
						<div className="markdownEditorActionsPanel">
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="markdownEditorActionItem"
								data-active={mode === "rich"}
								onClick={() => {
									setMode("rich");
									setActionsOpen(false);
								}}
							>
								<Edit size={12} />
								Edit
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="markdownEditorActionItem"
								data-active={mode === "preview"}
								onClick={() => {
									setMode("preview");
									setActionsOpen(false);
								}}
							>
								<Eye size={12} />
								Preview
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="markdownEditorActionItem"
								data-active={mode === "plain"}
								onClick={() => {
									setMode("plain");
									setActionsOpen(false);
								}}
							>
								<HugeiconsIcon icon={SourceCodeIcon} size={12} />
								Raw
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="markdownEditorActionItem"
								onClick={() => {
									void loadDoc();
									setActionsOpen(false);
								}}
								disabled={saving}
							>
								<RefreshCw size={12} />
								Reload
							</Button>
							<Button
								type="button"
								variant="ghost"
								size="xs"
								className="markdownEditorActionItem"
								onClick={() => {
									void onSave();
									setActionsOpen(false);
								}}
								disabled={saving}
							>
								<Save size={12} />
								{saving ? "Saving" : "Save"}
							</Button>
						</div>
					) : null}
				</div>
			</div>

			{error ? (
				<div className="filePreviewMeta">
					<div className="filePreviewHint">{error}</div>
				</div>
			) : null}

			{!error ? (
				<div className="filePreviewTextWrap markdownEditorContent">
					<div className="markdownEditorPathRow">
						<FolderBreadcrumb dir={currentDir} onOpenFolder={onOpenFolder} />
					</div>
					<div className="markdownEditorCenter">
						<CanvasNoteInlineEditor
							key={relPath}
							markdown={text}
							relPath={relPath}
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
