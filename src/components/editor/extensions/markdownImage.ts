import type { MarkdownToken } from "@tiptap/core";
import Image from "@tiptap/extension-image";

function getTokenField(
	token: MarkdownToken,
	field: "href" | "text" | "title" | "src" | "alt",
): string | null {
	const direct = (token as Record<string, unknown>)[field];
	if (typeof direct === "string") return direct;
	const attrs = token.attributes as Record<string, unknown> | undefined;
	const attributeValue = attrs?.[field];
	return typeof attributeValue === "string" ? attributeValue : null;
}

function encodeMarkdownImageSrc(src: string): string {
	const trimmed = src.trim();
	if (!trimmed) return "";
	try {
		return encodeURI(decodeURI(trimmed));
	} catch {
		return encodeURI(trimmed);
	}
}

export const MarkdownImage = Image.extend({
	addAttributes() {
		return {
			...this.parent?.(),
			originSrc: {
				default: null,
				parseHTML: (element) =>
					element.getAttribute("data-glyph-origin-src") ??
					element.getAttribute("src"),
				renderHTML: (attributes) => {
					const originSrc =
						typeof attributes.originSrc === "string"
							? attributes.originSrc.trim()
							: "";
					return originSrc ? { "data-glyph-origin-src": originSrc } : {};
				},
			},
		};
	},

	parseMarkdown(token: MarkdownToken, helpers) {
		const src =
			getTokenField(token, "href") ?? getTokenField(token, "src") ?? "";
		const alt = getTokenField(token, "text") ?? getTokenField(token, "alt");
		const title = getTokenField(token, "title");
		if (!src.trim()) {
			return helpers.createTextNode(token.raw ?? token.text ?? "");
		}
		return helpers.createNode("image", {
			src: src.trim(),
			alt: (alt ?? "").trim(),
			title: (title ?? "").trim(),
			originSrc: src.trim(),
		});
	},

	renderMarkdown(node) {
		const src = (
			(node.attrs?.originSrc as string) ??
			(node.attrs?.src as string) ??
			""
		).trim();
		if (!src) return "";
		const alt = ((node.attrs?.alt as string) ?? "").trim();
		const title = ((node.attrs?.title as string) ?? "").trim();
		const encodedSrc = encodeMarkdownImageSrc(src);
		return title
			? `![${alt}](${encodedSrc} "${title}")`
			: `![${alt}](${encodedSrc})`;
	},
});
