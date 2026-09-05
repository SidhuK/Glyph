export function countWords(text: string): number {
	const cleaned = text.trim();
	if (!cleaned) return 0;
	return cleaned.split(/\s+/u).length;
}
