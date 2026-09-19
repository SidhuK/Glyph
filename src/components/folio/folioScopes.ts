export type FolioScope =
	| { kind: "all" }
	| { kind: "folder"; folderPrefix: string }
	| { kind: "tag"; tag: string }
	| { kind: "person"; handle: string };

export const DEFAULT_FOLIO_SCOPE: FolioScope = { kind: "all" };
