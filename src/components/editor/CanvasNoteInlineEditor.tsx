import { EditorContent } from "@tiptap/react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { joinYamlFrontmatter } from "../../lib/notePreview";
import { type BacklinkItem, invoke } from "../../lib/tauri";
import { ChevronDown, ChevronRight } from "../Icons";
import { EditorRibbon } from "./EditorRibbon";
import { useNoteEditor } from "./hooks/useNoteEditor";
import { dispatchWikiLinkClick } from "./markdown/editorEvents";
import type { CanvasNoteInlineEditorProps } from "./types";

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
}

export const CanvasNoteInlineEditor = memo(function CanvasNoteInlineEditor({
	markdown,
	relPath,
	mode,
	onRegisterCalloutInserter,
	onChange,
}: CanvasNoteInlineEditorProps) {
	const {
		editor,
		frontmatter,
		frontmatterRef,
		lastAppliedBodyRef,
		lastEmittedMarkdownRef,
	} = useNoteEditor({ markdown, mode, onChange });

	const [frontmatterDraft, setFrontmatterDraft] = useState(frontmatter ?? "");
	const frontmatterTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
	const lastFrontmatterRef = useRef(frontmatter);
	const [frontmatterExpanded, setFrontmatterExpanded] = useState(false);
	const [backlinks, setBacklinks] = useState<BacklinkItem[]>([]);

	useEffect(() => {
		if (frontmatter === lastFrontmatterRef.current) return;
		lastFrontmatterRef.current = frontmatter;
		setFrontmatterDraft(frontmatter ?? "");
	}, [frontmatter]);

	useEffect(() => {
		if (!relPath) {
			setBacklinks([]);
			return;
		}
		let cancelled = false;
		void (async () => {
			try {
				const items = await invoke("backlinks", { note_id: relPath });
				if (!cancelled) setBacklinks(items);
			} catch {
				if (!cancelled) setBacklinks([]);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [relPath]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: resize on draft change
	useLayoutEffect(() => {
		if (mode !== "rich") return;
		const el = frontmatterTextAreaRef.current;
		if (!el) return;
		el.style.height = "0px";
		el.style.height = `${el.scrollHeight}px`;
	}, [frontmatterDraft, mode]);

	const canEdit = mode === "rich" && Boolean(editor?.isEditable);

	useEffect(() => {
		if (!onRegisterCalloutInserter) return;
		if (!editor || mode !== "rich") {
			onRegisterCalloutInserter(null);
			return;
		}
		onRegisterCalloutInserter((type: string) => {
			const normalizedType =
				type.toLowerCase() === "warn" ? "warning" : type.toLowerCase();
			const host = editor.view.dom.closest(
				".rfNodeNoteEditorBody",
			) as HTMLElement | null;
			const scrollTop = host?.scrollTop ?? 0;
			editor
				.chain()
				.focus(undefined, { scrollIntoView: false })
				.insertContent({
					type: "blockquote",
					content: [
						{
							type: "paragraph",
							content: [{ type: "text", text: `[!${normalizedType}]` }],
						},
						{ type: "paragraph" },
					],
				})
				.run();
			if (host) {
				requestAnimationFrame(() => {
					host.scrollTop = scrollTop;
				});
			}
		});
		return () => onRegisterCalloutInserter(null);
	}, [editor, mode, onRegisterCalloutInserter]);

	const handleFrontmatterChange = (
		event: React.ChangeEvent<HTMLTextAreaElement>,
	) => {
		const next = event.target.value;
		setFrontmatterDraft(next);
		const normalizedFrontmatter = next.trim().length ? next : null;
		frontmatterRef.current = normalizedFrontmatter;
		const currentBody = normalizeBody(
			editor?.getMarkdown() ?? lastAppliedBodyRef.current ?? "",
		);
		const nextMarkdown = joinYamlFrontmatter(
			normalizedFrontmatter,
			currentBody,
		);
		if (nextMarkdown === lastEmittedMarkdownRef.current) return;
		lastEmittedMarkdownRef.current = nextMarkdown;
		onChange(nextMarkdown);
	};

	return (
		<div
			className={[
				"rfNodeNoteEditor",
				"nodrag",
				"nopan",
				editor && mode === "rich" ? "hasRibbon" : "",
			]
				.filter(Boolean)
				.join(" ")}
		>
			<div className="rfNodeNoteEditorBody nodrag nopan nowheel">
				{mode === "plain" ? (
					<textarea
						className="rfNodeNoteEditorRaw mono"
						value={markdown}
						onChange={(event) => onChange(event.target.value)}
						spellCheck={false}
					/>
				) : null}
				{mode === "rich" ? (
					<div className="frontmatterPreview mono">
						<button
							type="button"
							className="frontmatterToggle"
							onClick={() => setFrontmatterExpanded((prev) => !prev)}
							aria-expanded={frontmatterExpanded}
						>
							{frontmatterExpanded ? (
								<ChevronDown size={12} />
							) : (
								<ChevronRight size={12} />
							)}
							<div className="frontmatterLabel">Frontmatter</div>
						</button>
						{frontmatterExpanded ? (
							<textarea
								ref={frontmatterTextAreaRef}
								className="frontmatterEditor"
								value={frontmatterDraft}
								onChange={handleFrontmatterChange}
								placeholder="---\ntitle: Untitled\n---"
								spellCheck={false}
							/>
						) : null}
					</div>
				) : frontmatter ? (
					<div className="frontmatterPreview mono">
						<div className="frontmatterLabel">Frontmatter</div>
						<pre>{frontmatter.trimEnd()}</pre>
					</div>
				) : null}
				{mode !== "plain" && backlinks.length > 0 ? (
					<div className="editorBacklinks" aria-label="Backlinks">
						<div className="editorBacklinksLabel">
							Linked mentions ({backlinks.length})
						</div>
						<div className="editorBacklinksList">
							{backlinks.map((item) => (
								<button
									key={item.id}
									type="button"
									className="editorBacklink"
									onClick={() =>
										dispatchWikiLinkClick({
											raw: `[[${item.id}]]`,
											target: item.id,
											alias: null,
											anchorKind: "none",
											anchor: null,
											unresolved: false,
										})
									}
								>
									{item.title || item.id}
								</button>
							))}
						</div>
					</div>
				) : null}
				{mode !== "plain" ? (
					<div
						className={[
							"tiptapHostInline",
							mode === "preview" ? "is-preview" : "",
							"nodrag",
							"nopan",
							"nowheel",
						]
							.filter(Boolean)
							.join(" ")}
					>
						<EditorContent editor={editor} />
					</div>
				) : null}
			</div>
			{editor && mode === "rich" ? (
				<EditorRibbon editor={editor} canEdit={canEdit} />
			) : null}
		</div>
	);
});
