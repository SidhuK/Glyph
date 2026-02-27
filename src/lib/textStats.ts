export const WORDS_PER_MINUTE = 200;

export function countWords(text: string): number {
	const cleaned = text.trim();
	if (!cleaned) return 0;
	return cleaned.split(/\s+/u).length;
}

export function countLines(text: string): number {
	if (!text.length) return 0;
	return text.split(/\r\n|\r|\n/).length;
}

export function formatReadingTime(words: number): string {
	if (words <= 0) return "0s";
	const totalSeconds = Math.ceil((words / WORDS_PER_MINUTE) * 60);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	if (minutes <= 0) return `${seconds}s`;
	if (seconds === 0) return `${minutes}m`;
	return `${minutes}m ${seconds}s`;
}
