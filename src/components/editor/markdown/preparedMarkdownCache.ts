import type { JSONContent } from "@tiptap/core";

const MAX_DOCUMENTS = 12;
const MAX_SOURCE_CHARS = 2_000_000;

/** Owned by one editor extension configuration; never shared across schemas. */
export function createPreparedMarkdownCache() {
	const documents = new Map<string, JSONContent>();
	let sourceChars = 0;
	function remember(source: string, document: JSONContent) {
		if (documents.delete(source)) sourceChars -= source.length;
		if (source.length > MAX_SOURCE_CHARS) return;
		documents.set(source, document);
		sourceChars += source.length;
		while (documents.size > MAX_DOCUMENTS || sourceChars > MAX_SOURCE_CHARS) {
			const oldest = documents.keys().next().value;
			if (oldest === undefined) break;
			documents.delete(oldest);
			sourceChars -= oldest.length;
		}
	}
	return {
		peek: (source: string) => documents.get(source),
		remember,
		prepare(source: string, parse: (source: string) => JSONContent) {
			const document = documents.get(source) ?? parse(source);
			remember(source, document);
			return document;
		},
	};
}
