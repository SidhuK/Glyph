export function normalizeInlineMarkdown(text: string): string {
	const withoutImages = text.replace(
		/!\[([^\]]*)\]\((?:[^()\\]|\\.)*\)/g,
		"$1",
	);
	const withoutLinks = withoutImages.replace(
		/\[([^\]]+)\]\((?:[^()\\]|\\.)*\)/g,
		"$1",
	);
	const withoutWikiLinks = withoutLinks.replace(
		/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,
		(_, target: string, label?: string) => (label ?? target).trim(),
	);
	const withoutInlineCode = withoutWikiLinks.replace(/`([^`]+)`/g, "$1");
	return withoutInlineCode
		.replace(/(\*\*|__)(.*?)\1/g, "$2")
		.replace(/(\*|_)(.*?)\1/g, "$2")
		.replace(/~~(.*?)~~/g, "$1")
		.replace(/\s+/g, " ")
		.trim();
}
