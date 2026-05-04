export type FolioScope =
	| { kind: "all" }
	| { kind: "folder"; folderPrefix: string }
	| { kind: "tag"; tag: string }
	| { kind: "person"; handle: string }
	| { kind: "daily"; folderPrefix: string | null }
	| { kind: "templates"; folderPrefix: string | null }
	| { kind: "search"; query: string };

export type FolioNotesSortMode = "alphabetical" | "edited" | "created";

export const DEFAULT_FOLIO_SCOPE: FolioScope = { kind: "all" };

export function normalizeFolioPath(value: string | null | undefined): string {
	return (value ?? "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

export function folioScopeTitle(scope: FolioScope): string {
	switch (scope.kind) {
		case "all":
			return "All Notes";
		case "folder":
			return (
				normalizeFolioPath(scope.folderPrefix)
					.split("/")
					.filter(Boolean)
					.pop() ?? "Folder"
			);
		case "tag":
			return scope.tag.startsWith("#") || scope.tag.startsWith("@")
				? scope.tag
				: `#${scope.tag}`;
		case "person":
			return scope.handle.startsWith("@") ? scope.handle : `@${scope.handle}`;
		case "daily":
			return "Daily Notes";
		case "templates":
			return "Templates";
		case "search":
			return scope.query.trim() ? `Search: ${scope.query.trim()}` : "Search";
	}
}
