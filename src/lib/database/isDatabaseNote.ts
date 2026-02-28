import { splitYamlFrontmatter } from "../notePreview";

export function isDatabaseNote(markdown: string): boolean {
	const { frontmatter } = splitYamlFrontmatter(markdown);
	if (!frontmatter) return false;
	const glyphBlockMatch = frontmatter.match(/^glyph:\s*\n((?:^[ \t].*\n?)*)/m);
	if (!glyphBlockMatch?.[1]) return false;
	return /^\s+kind\s*:\s*database\s*$/m.test(glyphBlockMatch[1]);
}
