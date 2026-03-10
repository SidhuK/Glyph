import { useEffect, useMemo, useRef, useState } from "react";
import { parseNotePreview, titleForFile } from "../../lib/notePreview";
import { type TextFileDoc, invoke } from "../../lib/tauri";
import { CanvasNoteInlineEditor } from "../editor/CanvasNoteInlineEditor";

interface CommandPaletteMarkdownPreviewProps {
	relPath: string | null;
	fallbackTitle?: string | null;
}

interface CachedPreviewDoc {
	title: string;
	markdown: string;
}

const previewDocCache = new Map<string, CachedPreviewDoc>();

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

	useEffect(() => {
		if (!relPath && !markdown) return;
		const resetScroll = () => {
			if (bodyRef.current) bodyRef.current.scrollTop = 0;
			const editorBody = bodyRef.current?.querySelector(
				".rfNodeNoteEditorBody",
			) as HTMLElement | null;
			if (editorBody) editorBody.scrollTop = 0;
		};
		resetScroll();
		const frame = window.requestAnimationFrame(resetScroll);
		return () => window.cancelAnimationFrame(frame);
	}, [relPath, markdown]);

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
					title: parsed.title || fallbackTitle || titleForFile(relPath),
					markdown: doc.text,
				};
				previewDocCache.set(relPath, cachedDoc);
				setMarkdown(cachedDoc.markdown);
				setResolvedTitle(cachedDoc.title);
			})
			.catch((nextError) => {
				if (requestId !== requestIdRef.current) return;
				setError(
					nextError instanceof Error ? nextError.message : String(nextError),
				);
			})
			.finally(() => {
				if (requestId !== requestIdRef.current) return;
				setLoading(false);
			});
	}, [fallbackTitle, relPath]);

	const displayTitle = useMemo(() => {
		if (!relPath) return "";
		return resolvedTitle || fallbackTitle || titleForFile(relPath);
	}, [fallbackTitle, relPath, resolvedTitle]);

	return (
		<section className="commandPalettePreviewPane" aria-live="polite">
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
				<div className="filePreviewMeta">
					<div className="filePreviewHint">{error}</div>
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
