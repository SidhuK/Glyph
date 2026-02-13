export function getTodayDateString(): string {
	const now = new Date();
	return formatDate(now);
}

export function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function getDailyNoteFilename(date?: string): string {
	const d = date ?? getTodayDateString();
	return `${d}.md`;
}

function isAbsolutePath(p: string): boolean {
	return /^\/|^[A-Za-z]:[/\\]/.test(p);
}

export function getDailyNotePath(folder: string, date?: string): string {
	if (isAbsolutePath(folder)) {
		throw new Error(
			`Daily note folder must be a relative path, got: ${folder}`,
		);
	}
	const d = date ?? getTodayDateString();
	const filename = getDailyNoteFilename(d);
	const normalizedFolder = folder.replace(/\\/g, "/").replace(/\/+$/g, "");
	if (!normalizedFolder) {
		return filename;
	}
	return `${normalizedFolder}/${filename}`;
}

export function getDailyNoteContent(date: string): string {
	return `# ${date}\n`;
}
