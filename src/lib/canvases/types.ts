import type { ViewDoc } from "../views";

export interface CanvasLibraryMeta {
	id: string;
	title: string;
	created_at_ms: number;
	updated_at_ms: number;
	source: "manual" | "ai";
}

export interface CanvasLibraryIndexDoc {
	schema_version: 1;
	items: CanvasLibraryMeta[];
}

export interface CreateCanvasInput {
	title?: string;
	source?: CanvasLibraryMeta["source"];
}

export interface CreateCanvasResult {
	meta: CanvasLibraryMeta;
	doc: ViewDoc;
}
