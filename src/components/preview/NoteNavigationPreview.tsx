import DOMPurify from "dompurify";
import { Marked } from "marked";
import { memo, useMemo } from "react";
import { splitYamlFrontmatter } from "../../lib/notePreview";
import { wikiLinksToStandardMarkdown } from "../editor/markdown/wikiLinkCodec";
import { initialEditorMode } from "./editorModeSelection";

// Only the first screen is needed during handoff. Bound both parsing and DOM
// work, including for very large notes that will open in the raw editor.
const PREVIEW_SOURCE_LIMIT = 12_000;
const PREVIEW_CACHE_SIZE = 12;
const renderer = new Marked();
const previews = new Map<string, string>();

function renderPreview(source: string) {
	const cached = previews.get(source);
	if (cached !== undefined) return cached;
	const html = renderer.parse(wikiLinksToStandardMarkdown(source), { async: false, gfm: true });
	const sanitized = DOMPurify.sanitize(html, {
		// Temporary previews never fetch images, mount embeds, or expose controls.
		ALLOWED_TAGS: [
			"p",
			"br",
			"h1",
			"h2",
			"h3",
			"h4",
			"h5",
			"h6",
			"strong",
			"em",
			"s",
			"a",
			"code",
			"pre",
			"blockquote",
			"ul",
			"ol",
			"li",
			"hr",
			"table",
			"thead",
			"tbody",
			"tr",
			"th",
			"td",
			"input",
		],
		ALLOWED_ATTR: ["type", "checked", "disabled", "start", "align"],
	});
	previews.set(source, sanitized);
	if (previews.size > PREVIEW_CACHE_SIZE) {
		const oldest = previews.keys().next().value;
		if (oldest !== undefined) previews.delete(oldest);
	}
	return sanitized;
}

export const NoteNavigationPreview = memo(function NoteNavigationPreview({
	markdown,
}: {
	markdown: string;
}) {
	const plain = initialEditorMode(markdown) === "plain";
	const source = (plain ? markdown : splitYamlFrontmatter(markdown).body).slice(
		0,
		PREVIEW_SOURCE_LIMIT,
	);
	const html = useMemo(() => (plain ? "" : renderPreview(source)), [plain, source]);
	return (
		<section
			className="filePreviewPane markdownEditorPane noteNavigationPreview"
			aria-busy="true"
			inert
		>
			<div className="filePreviewTextWrap markdownEditorContent">
				<div className="markdownEditorCenter">
					<div className="rfNodeNoteEditor rfNodeNoteEditorFlatEdges">
						<div className="rfNodeNoteEditorBody">
							<div className="tiptapHostInline">
								{plain ? (
									<pre className="tiptapContentInline">{source}</pre>
								) : (
									<div className="tiptapContentInline" dangerouslySetInnerHTML={{ __html: html }} />
								)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
});
