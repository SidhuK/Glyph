import { EditorContent } from "@tiptap/react";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { joinYamlFrontmatter } from "../../lib/notePreview";
import { Edit, Eye } from "../Icons";
import { Tabs, TabsList, TabsTrigger } from "../ui/shadcn/tabs";
import { EditorRibbon } from "./EditorRibbon";
import { useNoteEditor } from "./hooks/useNoteEditor";
import type { CanvasNoteInlineEditorProps } from "./types";

function normalizeBody(markdown: string): string {
	return markdown.replace(/\u00a0/g, " ").replace(/&nbsp;/g, " ");
}

export const CanvasNoteInlineEditor = memo(function CanvasNoteInlineEditor({
	markdown,
	mode,
	onModeChange,
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

	useEffect(() => {
		if (frontmatter === lastFrontmatterRef.current) return;
		lastFrontmatterRef.current = frontmatter;
		setFrontmatterDraft(frontmatter ?? "");
	}, [frontmatter]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: resize on draft change
	useLayoutEffect(() => {
		if (mode !== "rich") return;
		const el = frontmatterTextAreaRef.current;
		if (!el) return;
		el.style.height = "0px";
		el.style.height = `${el.scrollHeight}px`;
	}, [frontmatterDraft, mode]);

	const canEdit = mode === "rich" && Boolean(editor?.isEditable);

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
		<div className="rfNodeNoteEditor nodrag nopan">
			<div className="rfNodeNoteEditorHeaderBar nodrag nopan nowheel">
				<div className="rfNodeNoteEditorHeaderSpacer" />
				<Tabs
					value={mode}
					onValueChange={(value) => onModeChange(value as "preview" | "rich")}
				>
					<TabsList>
						<TabsTrigger value="preview" title="Preview">
							<Eye size={14} />
						</TabsTrigger>
						<TabsTrigger value="rich" title="Rich Text">
							<Edit size={14} />
						</TabsTrigger>
					</TabsList>
				</Tabs>
			</div>
			<div className="rfNodeNoteEditorBody nodrag nopan nowheel">
				{mode === "rich" ? (
					<div className="frontmatterPreview mono">
						<div className="frontmatterLabel">Frontmatter</div>
						<textarea
							ref={frontmatterTextAreaRef}
							className="frontmatterEditor"
							value={frontmatterDraft}
							onChange={handleFrontmatterChange}
							placeholder="---\ntitle: Untitled\n---"
							spellCheck={false}
						/>
					</div>
				) : frontmatter ? (
					<div className="frontmatterPreview mono">
						<div className="frontmatterLabel">Frontmatter</div>
						<pre>{frontmatter.trimEnd()}</pre>
					</div>
				) : null}
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
			</div>
			{editor && mode === "rich" ? (
				<EditorRibbon editor={editor} canEdit={canEdit} />
			) : null}
		</div>
	);
});
