const LINK = /!?\[([^\]]*)\]\([^)]*\)/g;
const WIKILINK_LABEL = /\[\[[^\]|]+\|([^\]]+)\]\]/g;
const WIKILINK = /\[\[([^\]]+)\]\]/g;
const STRONG = /(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g;
const EM_STAR = /(?<![\w*])\*(?=\S)(.+?)(?<=\S)\*(?!\w)/g;
const EM_UNDERSCORE = /(?<![\w_])_(?=\S)(.+?)(?<=\S)_(?!\w)/g;
const STRIKE = /~~(?=\S)(.+?)(?<=\S)~~/g;

function stripSpans(text: string): string {
	return text
		.replace(LINK, "$1")
		.replace(WIKILINK_LABEL, "$1")
		.replace(WIKILINK, "$1")
		.replace(STRONG, "$2")
		.replace(EM_STAR, "$1")
		.replace(EM_UNDERSCORE, "$1")
		.replace(STRIKE, "$1");
}

export function stripInlineMarkdown(text: string): string {
	return text
		.split(/(`[^`]+`)/)
		.map((part, index) => (index % 2 === 1 ? part.slice(1, -1) : stripSpans(part)))
		.join("");
}
