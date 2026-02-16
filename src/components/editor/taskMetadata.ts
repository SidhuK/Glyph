const TASK_LINE_RE = /^(\s*[-*+]\s+\[[ xX]\]\s+)(.*)$/;

function stripTokens(text: string): string {
	const tokens = text.trim().split(/\s+/).filter(Boolean);
	const kept: string[] = [];
	for (let i = 0; i < tokens.length; i += 1) {
		const token = tokens[i];
		const next = tokens[i + 1] ?? "";
		if (
			(token === "📅" || token === "⏳") &&
			/^\d{4}-\d{2}-\d{2}$/.test(next)
		) {
			i += 1;
			continue;
		}
		kept.push(token);
	}
	return kept.join(" ");
}

function withDates(
	body: string,
	scheduledDate: string,
	dueDate: string,
): string {
	let next = stripTokens(body);
	if (scheduledDate) {
		next = next ? `${next} ⏳ ${scheduledDate}` : `⏳ ${scheduledDate}`;
	}
	if (dueDate) {
		next = next ? `${next} 📅 ${dueDate}` : `📅 ${dueDate}`;
	}
	return next.trim();
}

export function updateTaskLineByOrdinal(
	markdown: string,
	ordinal: number,
	scheduledDate: string,
	dueDate: string,
): string | null {
	const newline = markdown.includes("\r\n") ? "\r\n" : "\n";
	const lines = markdown.split(/\r?\n/);
	let index = -1;
	for (let i = 0; i < lines.length; i += 1) {
		const line = lines[i] ?? "";
		const match = line.match(TASK_LINE_RE);
		if (!match) continue;
		index += 1;
		if (index !== ordinal) continue;
		const prefix = match[1] ?? "";
		const body = match[2] ?? "";
		lines[i] = `${prefix}${withDates(body, scheduledDate, dueDate)}`.trimEnd();
		const next = lines.join(newline);
		return markdown.endsWith(newline) ? `${next}${newline}` : next;
	}
	return null;
}

export function getTaskDatesByOrdinal(
	markdown: string,
	ordinal: number,
): { scheduledDate: string; dueDate: string } | null {
	const lines = markdown.split(/\r?\n/);
	let index = -1;
	for (const line of lines) {
		const match = line.match(TASK_LINE_RE);
		if (!match) continue;
		index += 1;
		if (index !== ordinal) continue;
		const body = match[2] ?? "";
		const tokens = body.split(/\s+/);
		let scheduledDate = "";
		let dueDate = "";
		for (let i = 0; i < tokens.length; i += 1) {
			const token = tokens[i];
			const next = tokens[i + 1] ?? "";
			if (token === "⏳" && /^\d{4}-\d{2}-\d{2}$/.test(next)) {
				scheduledDate = next;
			}
			if (token === "📅" && /^\d{4}-\d{2}-\d{2}$/.test(next)) {
				dueDate = next;
			}
		}
		return { scheduledDate, dueDate };
	}
	return null;
}
