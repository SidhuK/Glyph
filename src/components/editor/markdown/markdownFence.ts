export function isMarkdownCodeFenceToggle(line: string): boolean {
	return /^(`{3,}|~{3,})/.test(line.trim());
}
