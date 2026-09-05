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

function isAbsolutePath(p: string): boolean {
	return /^\/|^[A-Za-z]:[/\\]/.test(p);
}

export function joinDatedNotePath(folder: string, filename: string): string {
	const normalizedFolder = folder.replace(/\\/g, "/").replace(/\/+$/g, "");
	if (isAbsolutePath(folder) || isAbsolutePath(normalizedFolder)) {
		throw new Error(
			`Dated note folder must be a relative path, got: ${folder}`,
		);
	}
	const hasTraversal = normalizedFolder
		.split("/")
		.some((segment) => segment === "..");
	if (hasTraversal) {
		throw new Error(
			`Dated note folder cannot include parent traversal segments: ${folder}`,
		);
	}
	if (!normalizedFolder) {
		return filename;
	}
	return `${normalizedFolder}/${filename}`;
}

export function getDailyNotePath(folder: string, date?: string): string {
	const d = date ?? getTodayDateString();
	return joinDatedNotePath(folder, `${d}.md`);
}

export function getDailyNoteContent(date: string): string {
	return `# ${date}\n`;
}

export function getDailyNoteDateFromPath(
	path: string,
	folder: string,
): string | null {
	const normalizedPath = path.replace(/\\/g, "/");
	const normalizedFolder = folder.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
	const prefix = normalizedFolder ? `${normalizedFolder}/` : "";
	if (!normalizedPath.startsWith(prefix)) return null;
	const filename = normalizedPath.slice(prefix.length);
	if (filename.includes("/")) return null;
	const date = filename.endsWith(".md") ? filename.slice(0, -3) : "";
	return parseIsoDate(date) ? date : null;
}

export function getNextDateString(date: string): string | null {
	const parsed = parseIsoDate(date);
	if (!parsed) return null;
	parsed.setDate(parsed.getDate() + 1);
	return getTodayDateString(parsed);
}
