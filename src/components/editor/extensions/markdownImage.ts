import type { MarkdownToken } from "@tiptap/core";
import { nodeInputRule } from "@tiptap/core";
import Image from "@tiptap/extension-image";

interface MarkdownImageAttrs {
	src: string;
	alt?: string | null;
	title?: string | null;
}

const IMAGE_START_RE = /!\[/;
const IMAGE_INPUT_RE = /(!\[[^\]\n]*\]\([^\n]*\))$/;

function findUnescaped(text: string, char: string, start = 0): number {
	for (let i = start; i < text.length; i += 1) {
		if (text[i] !== char) continue;
		let slashCount = 0;
		for (let j = i - 1; j >= 0 && text[j] === "\\"; j -= 1) slashCount += 1;
		if (slashCount % 2 === 0) return i;
	}
	return -1;
}

function splitImageInside(
	inside: string,
): { imageSrc: string; title: string } | null {
	const trimmed = inside.trim();
	if (!trimmed) return null;
	const titleMatch = trimmed.match(/^(.*)\s+("([^"]*)"|'([^']*)')\s*$/);
	const rawSrc = (titleMatch ? titleMatch[1] : trimmed)?.trim() ?? "";
	const title = (titleMatch?.[3] ?? titleMatch?.[4] ?? "").trim();
	const imageSrc =
		rawSrc.startsWith("<") && rawSrc.endsWith(">")
			? rawSrc.slice(1, -1).trim()
			: rawSrc;
	if (!imageSrc) return null;
	return { imageSrc, title };
}

function parseImageToken(src: string): {
	raw: string;
	alt: string;
	imageSrc: string;
	title: string;
} | null {
	if (!src.startsWith("![")) return null;
	const altEnd = findUnescaped(src, "]", 2);
	if (altEnd < 0 || src[altEnd + 1] !== "(") return null;
	const alt = src.slice(2, altEnd).trim();
	let i = altEnd + 2;
	let depth = 1;
	let quote: '"' | "'" | null = null;
	let escaped = false;
	for (; i < src.length; i += 1) {
		const ch = src[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (ch === "\\") {
			escaped = true;
			continue;
		}
		if (quote) {
			if (ch === quote) quote = null;
			continue;
		}
		if (ch === '"' || ch === "'") {
			quote = ch;
			continue;
		}
		if (ch === "(") {
			depth += 1;
			continue;
		}
		if (ch === ")") {
			depth -= 1;
			if (depth === 0) break;
			continue;
		}
		if (ch === "\n") return null;
	}
	if (depth !== 0) return null;
	const raw = src.slice(0, i + 1);
	const inside = src.slice(altEnd + 2, i);
	const parsed = splitImageInside(inside);
	if (!parsed) return null;
	return {
		raw,
		alt,
		imageSrc: parsed.imageSrc,
		title: parsed.title,
	};
}

function toMarkdown(attrs: Partial<MarkdownImageAttrs>): string {
	const src = (attrs.src ?? "").trim();
	if (!src) return "";
	const alt = (attrs.alt ?? "").trim();
	const title = (attrs.title ?? "").trim();
	return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
}

export const MarkdownImage = Image.extend({
	markdownTokenName: "image",
	parseMarkdown(token: MarkdownToken, helpers) {
		const attrs = (token.attributes ?? {}) as Partial<MarkdownImageAttrs>;
		const src = (attrs.src ?? "").trim();
		if (!src) return helpers.createTextNode(token.raw ?? token.text ?? "");
		return helpers.createNode("image", {
			src,
			alt: attrs.alt ?? null,
			title: attrs.title ?? null,
		});
	},
	renderMarkdown(node) {
		return toMarkdown(node.attrs ?? {});
	},
	markdownTokenizer: {
		name: "image",
		level: "inline",
		start(src: string) {
			const match = src.match(IMAGE_START_RE);
			return match?.index ?? -1;
		},
		tokenize(src: string) {
			const parsed = parseImageToken(src);
			if (!parsed) return undefined;
			const { raw, alt, imageSrc, title } = parsed;
			if (!imageSrc) return undefined;
			return {
				type: "image",
				raw,
				text: raw,
				attributes: {
					src: imageSrc,
					alt: alt || null,
					title: title || null,
				},
			};
		},
	},
	addInputRules() {
		return [
			nodeInputRule({
				find: IMAGE_INPUT_RE,
				type: this.type,
				getAttributes: (match) => {
					const raw = match[1] ?? "";
					const parsed = parseImageToken(raw);
					if (!parsed) return false;
					return {
						src: parsed.imageSrc,
						alt: parsed.alt || null,
						title: parsed.title || null,
					};
				},
			}),
		];
	},
});
