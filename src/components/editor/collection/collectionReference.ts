export interface CollectionReference {
	readonly version: 1;
	readonly databaseId: string;
	readonly viewId: string;
}

export function readCollectionReference(value: unknown): CollectionReference | null {
	if (typeof value !== "object" || value === null) return null;
	if (!("version" in value) || value.version !== 1) return null;
	if (!("databaseId" in value) || typeof value.databaseId !== "string") return null;
	if (!("viewId" in value) || typeof value.viewId !== "string") return null;
	if (value.databaseId !== value.databaseId.trim() || value.viewId !== value.viewId.trim()) {
		return null;
	}
	if (value.viewId && !value.databaseId) return null;
	return { version: value.version, databaseId: value.databaseId, viewId: value.viewId };
}

export function parseCollectionReference(text: string): CollectionReference | null {
	try {
		const value: unknown = JSON.parse(text);
		return readCollectionReference(value);
	} catch {
		return null;
	}
}
