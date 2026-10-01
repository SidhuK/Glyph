const RECENT_ICONS_STORAGE_KEY = "glyph.appearancePicker.recentIcons";
const RECENT_ICONS_LIMIT = 16;

export function readRecentIconIds(): string[] {
	try {
		const parsed: unknown = JSON.parse(
			window.localStorage.getItem(RECENT_ICONS_STORAGE_KEY) ?? "[]",
		);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((id): id is string => typeof id === "string");
	} catch {
		return [];
	}
}

export function rememberRecentIconId(iconId: string) {
	const next = [iconId, ...readRecentIconIds().filter((id) => id !== iconId)].slice(
		0,
		RECENT_ICONS_LIMIT,
	);
	try {
		window.localStorage.setItem(RECENT_ICONS_STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Best-effort UI persistence.
	}
}
