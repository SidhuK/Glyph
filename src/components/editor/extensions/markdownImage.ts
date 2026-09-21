import type { MarkdownToken } from "@tiptap/core";
import Image from "@tiptap/extension-image";

function imageDimension(value: unknown): number | null {
	let parsed: number;
	if (typeof value === "number") {
		parsed = value;
	} else if (typeof value === "string") {
		parsed = Number(value);
	} else {
		return null;
	}
	return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.round(parsed)) : null;
}

function trimmedString(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

function escapeHtmlAttribute(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/"/g, "&quot;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

export function hasMarkdownImageDisplaySize(attributes: Record<string, unknown>): boolean {
	return imageDimension(attributes.width) !== null || imageDimension(attributes.height) !== null;
}

function getTokenField(
	token: MarkdownToken,
	field: "href" | "text" | "title" | "src" | "alt",
): string | null {
	const direct: unknown = token[field];
	if (typeof direct === "string") return direct;
	const attrs: unknown = token.attributes;
	const attributeValue: unknown =
		attrs && typeof attrs === "object" && field in attrs ? Reflect.get(attrs, field) : undefined;
	return typeof attributeValue === "string" ? attributeValue : null;
}

export function encodeMarkdownImageSrc(src: string): string {
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
			width: {
				default: null,
				parseHTML: (element) => imageDimension(element.getAttribute("width")),
				renderHTML: (attributes) => {
					const width = imageDimension(attributes.width);
					return width === null ? {} : { width };
				},
			},
			height: {
				default: null,
				parseHTML: (element) => imageDimension(element.getAttribute("height")),
				renderHTML: (attributes) => {
					const height = imageDimension(attributes.height);
					return height === null ? {} : { height };
				},
			},
			originSrc: {
				default: null,
				parseHTML: (element) =>
					element.getAttribute("data-glyph-origin-src") ?? element.getAttribute("src"),
				renderHTML: (attributes) => {
					const originSrc =
						typeof attributes.originSrc === "string" ? attributes.originSrc.trim() : "";
					return originSrc ? { "data-glyph-origin-src": originSrc } : {};
				},
			},
			uploadId: {
				default: null,
				parseHTML: (element) => element.getAttribute("data-glyph-upload-id"),
				renderHTML: (attributes) => {
					const uploadId =
						typeof attributes.uploadId === "string" ? attributes.uploadId.trim() : "";
					return uploadId ? { "data-glyph-upload-id": uploadId } : {};
				},
			},
		};
	},

	parseMarkdown(token: MarkdownToken, helpers) {
		const src = getTokenField(token, "href") ?? getTokenField(token, "src") ?? "";
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
		const uploadId = trimmedString(node.attrs?.uploadId);
		const originSrc = trimmedString(node.attrs?.originSrc);
		const src =
			typeof node.attrs?.originSrc === "string" ? originSrc : trimmedString(node.attrs?.src);
		if (uploadId && !originSrc) return "";
		if (!src) return "";
		const alt = trimmedString(node.attrs?.alt);
		const title = trimmedString(node.attrs?.title);
		const encodedSrc = encodeMarkdownImageSrc(src);
		const width = imageDimension(node.attrs?.width);
		const height = imageDimension(node.attrs?.height);
		if (width !== null || height !== null) {
			const attributes = [
				`src="${escapeHtmlAttribute(encodedSrc)}"`,
				`alt="${escapeHtmlAttribute(alt)}"`,
			];
			if (title) attributes.push(`title="${escapeHtmlAttribute(title)}"`);
			if (width !== null) attributes.push(`width="${width}"`);
			if (height !== null) attributes.push(`height="${height}"`);
			return `<img ${attributes.join(" ")} />`;
		}
		return title ? `![${alt}](${encodedSrc} "${title}")` : `![${alt}](${encodedSrc})`;
	},
});
