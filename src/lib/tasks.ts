export const TASKS_TAB_ID = "__glyph_tasks__";

export function todayIsoDateLocal(now = new Date()): string {
	const year = now.getFullYear();
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

export function folderBreadcrumbFromNotePath(notePath: string): string {
	const normalized = notePath
		.replace(/\\/g, "/")
		.replace(/^\/+/, "")
		.replace(/\/+$/, "");
	if (!normalized) return "/";
	const lastSlash = normalized.lastIndexOf("/");
	if (lastSlash === -1) return "/";
	return normalized.slice(0, lastSlash + 1);
}
