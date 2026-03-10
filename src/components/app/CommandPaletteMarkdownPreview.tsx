import { useEffect, useMemo, useRef, useState } from "react";
import { parseNotePreview, titleForFile } from "../../lib/notePreview";
import { type TextFileDoc, invoke } from "../../lib/tauri";
import { CanvasNoteInlineEditor } from "../editor/CanvasNoteInlineEditor";
import { useResetScrollOnChange } from "../editor/hooks/useResetScrollOnChange";

interface CommandPaletteMarkdownPreviewProps {
	relPath: string | null;
	fallbackTitle?: string | null;
}

interface CachedPreviewDoc {
	title: string;
	markdown: string;
}

const MAX_CACHE_SIZE = 24;
const previewDocCache = new Map<string, CachedPreviewDoc>();

function setCachedPreview(path: string, doc: CachedPreviewDoc) {
	if (previewDocCache.has(path)) {
		previewDocCache.delete(path);
	} else if (previewDocCache.size >= MAX_CACHE_SIZE) {
		const oldestKey = previewDocCache.keys().next().value;
		if (oldestKey) previewDocCache.delete(oldestKey);
	}
	previewDocCache.set(path, doc);
}

export function CommandPaletteMarkdownPreview({
	relPath,
	fallbackTitle,
}: CommandPaletteMarkdownPreviewProps) {
	const bodyRef = useRef<HTMLDivElement | null>(null);
	const requestIdRef = useRef(0);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");
	const [markdown, setMarkdown] = useState("");
	const [resolvedTitle, setResolvedTitle] = useState("");

	useResetScrollOnChange(bodyRef, ".rfNodeNoteEditorBody", [relPath, markdown]);

	useEffect(() => {
		if (!relPath) {
			setLoading(false);
			setError("");
			setMarkdown("");
			setResolvedTitle("");
			return;
		}

		const cached = previewDocCache.get(relPath);
		if (cached) {
			setLoading(false);
			setError("");
			setMarkdown(cached.markdown);
			setResolvedTitle(cached.title);
			return;
		}

		const requestId = ++requestIdRef.current;
		setLoading(true);
		setError("");
		setMarkdown("");
		setResolvedTitle("");

		void invoke("space_read_text", { path: relPath })
			.then((doc: TextFileDoc) => {
				if (requestId !== requestIdRef.current) return;
				const parsed = parseNotePreview(relPath, doc.text);
				const cachedDoc = {
					title: parsed.title || "",
					markdown: doc.text,
				};
				setCachedPreview(relPath, cachedDoc);
				setMarkdown(cachedDoc.markdown);
				setResolvedTitle(cachedDoc.title);
			})
			.catch((nextError) => {
				if (requestId !== requestIdRef.current) return;
				console.error("Preview fetch error", { requestId, relPath, nextError });
				setError(
					nextError instanceof Error ? nextError.message : String(nextError),
				);
			})
			.finally(() => {
				if (requestId !== requestIdRef.current) return;
				setLoading(false);
			});
	}, [relPath]);

	const displayTitle = useMemo(() => {
		if (!relPath) return "";
		return resolvedTitle || fallbackTitle || titleForFile(relPath);
	}, [fallbackTitle, relPath, resolvedTitle]);

	return (
		<section className="commandPalettePreviewPane">
			<div className="commandPalettePreviewHeader">
				{relPath ? (
					<>
						<div className="commandPalettePreviewTitle" title={displayTitle}>
							{displayTitle}
						</div>
						<div className="commandPalettePreviewPath mono" title={relPath}>
							{relPath}
						</div>
					</>
				) : null}
			</div>

			{!relPath ? (
				<div className="commandPalettePreviewEmpty">
					Select a note to preview
				</div>
			) : null}

			{relPath && loading ? (
				<div className="commandPalettePreviewEmpty">Loading note…</div>
			) : null}

			{relPath && !loading && error ? (
				<div className="commandPalettePreviewMeta" aria-live="polite">
					<div className="commandPalettePreviewHint">{error}</div>
				</div>
			) : null}

			{relPath && !loading && !error && markdown ? (
				<div className="commandPalettePreviewBody" ref={bodyRef}>
					<div className="markdownEditorCenter">
						<CanvasNoteInlineEditor
							key={relPath}
							markdown={markdown}
							relPath={relPath}
							mode="preview"
							onModeChange={() => {}}
							onChange={() => {}}
							interactive={false}
							showBacklinks={false}
						/>
					</div>
				</div>
			) : null}
		</section>
	);
}
