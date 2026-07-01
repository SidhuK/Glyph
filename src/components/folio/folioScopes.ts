export type FolioScope =
	| { kind: "all" }
	| { kind: "folder"; folderPrefix: string }
	| { kind: "tag"; tag: string }
	| { kind: "person"; handle: string };

export type FolioNotesSortMode = "alphabetical" | "edited" | "created";

export const DEFAULT_FOLIO_SCOPE: FolioScope = { kind: "all" };

export function normalizeFolioPath(value: string | null | undefined): string {
	return (value ?? "")
		.trim()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "");
}
