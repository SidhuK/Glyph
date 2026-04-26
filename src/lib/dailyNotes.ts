export function getTodayDateString(now = new Date()): string {
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function parseIsoDate(iso: string): Date | null {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
	const [year, month, day] = iso.split("-").map(Number);
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day)
	) {
		return null;
	}
	const value = new Date(year, month - 1, day);
	if (
		value.getFullYear() !== year ||
		value.getMonth() !== month - 1 ||
		value.getDate() !== day
	) {
		return null;
	}
	value.setHours(0, 0, 0, 0);
	return value;
}

function getDailyNoteFilename(date?: string): string {
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
	const hasTraversal = normalizedFolder
		.split("/")
		.some((segment) => segment === "..");
	if (hasTraversal) {
		throw new Error(
			`Daily note folder cannot include parent traversal segments: ${folder}`,
		);
	}
	if (!normalizedFolder) {
		return filename;
	}
	return `${normalizedFolder}/${filename}`;
}

export function getDailyNoteContent(date: string): string {
	return `# ${date}\n`;
}
