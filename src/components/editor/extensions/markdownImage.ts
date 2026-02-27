import type { MarkdownToken } from "@tiptap/core";
import Image from "@tiptap/extension-image";

export const MarkdownImage = Image.extend({
	parseMarkdown(token: MarkdownToken, helpers) {
		const src = ((token as Record<string, unknown>).href ??
			(token.attributes as Record<string, unknown> | undefined)?.src ??
			"") as string;
		const alt = ((token as Record<string, unknown>).text ??
			(token.attributes as Record<string, unknown> | undefined)?.alt ??
			null) as string | null;
		const title = ((token as Record<string, unknown>).title ??
			(token.attributes as Record<string, unknown> | undefined)?.title ??
			null) as string | null;
		if (!src.trim()) {
			return helpers.createTextNode(token.raw ?? token.text ?? "");
		}
		return helpers.createNode("image", {
			src: src.trim(),
			alt: (alt ?? "").trim(),
			title: (title ?? "").trim(),
		});
	},

	renderMarkdown(node) {
		const src = ((node.attrs?.src as string) ?? "").trim();
		if (!src) return "";
		const alt = ((node.attrs?.alt as string) ?? "").trim();
		const title = ((node.attrs?.title as string) ?? "").trim();
		return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
	},
});
