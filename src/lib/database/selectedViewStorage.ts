const DATABASES_SELECTED_DATABASE_STORAGE_KEY =
	"glyph.databases.selectedDatabaseId";
const DATABASES_SELECTED_VIEWS_STORAGE_KEY = "glyph.databases.selectedViews";

function readStorage(key: string): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

export function readStoredSelectedDatabaseId(): string | null {
	const raw = readStorage(DATABASES_SELECTED_DATABASE_STORAGE_KEY);
	return raw?.trim() ? raw : null;
}

export function writeStoredSelectedDatabaseId(databaseId: string | null) {
	if (typeof window === "undefined") return;
	try {
		if (databaseId) {
			window.localStorage.setItem(
				DATABASES_SELECTED_DATABASE_STORAGE_KEY,
				databaseId,
			);
			return;
		}
		window.localStorage.removeItem(DATABASES_SELECTED_DATABASE_STORAGE_KEY);
	} catch {
		// Best-effort UI persistence.
	}
}

function readStoredSelectedViews(): Record<string, string> {
	const raw = readStorage(DATABASES_SELECTED_VIEWS_STORAGE_KEY);
	if (!raw) return {};
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object") return {};
		const next: Record<string, string> = {};
		for (const [databaseId, viewId] of Object.entries(parsed)) {
			if (typeof viewId === "string") {
				next[databaseId] = viewId;
			}
		}
		return next;
	} catch {
		return {};
	}
}

export function readStoredSelectedViewId(
	databaseId: string | null,
	viewIds?: string[],
): string | null {
	if (!databaseId) return null;
	const viewId = readStoredSelectedViews()[databaseId] ?? null;
	if (!viewId) return null;
	return viewIds && !viewIds.includes(viewId) ? null : viewId;
}

export function writeStoredSelectedViewId(
	databaseId: string | null,
	viewId: string | null,
) {
	if (typeof window === "undefined" || !databaseId) return;
	try {
		const selectedViews = readStoredSelectedViews();
		if (viewId) {
			selectedViews[databaseId] = viewId;
		} else {
			delete selectedViews[databaseId];
		}
		window.localStorage.setItem(
			DATABASES_SELECTED_VIEWS_STORAGE_KEY,
			JSON.stringify(selectedViews),
		);
	} catch {
		// Best-effort UI persistence.
	}
}
