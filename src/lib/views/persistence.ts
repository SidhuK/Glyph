import { invoke } from "../tauri";
import { sanitizeEdges, sanitizeNodes } from "./sanitize";
import type { ViewDoc, ViewRef } from "./types";
import { viewDocPath } from "./utils";

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isViewKind(value: unknown): value is ViewDoc["kind"] {
	return (
		value === "global" ||
		value === "folder" ||
		value === "tag" ||
		value === "search"
	);
}

function isViewDoc(value: unknown): value is ViewDoc {
	if (!isRecord(value)) return false;
	if (value.schema_version !== 1) return false;
	if (typeof value.view_id !== "string") return false;
	if (!isViewKind(value.kind)) return false;
	if (typeof value.selector !== "string") return false;
	if (typeof value.title !== "string") return false;
	if (!isRecord(value.options)) return false;
	if (!Array.isArray(value.nodes)) return false;
	if (!Array.isArray(value.edges)) return false;
	return true;
}

function tryParseViewDoc(raw: string): ViewDoc | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		return isViewDoc(parsed) ? parsed : null;
	} catch {
		return null;
	}
}

export async function loadViewDoc(
	view: ViewRef,
): Promise<{ doc: ViewDoc | null; path: string }> {
	const path = await viewDocPath(view);
	try {
		const raw = await invoke("glyph_read_text", { path });
		return { doc: tryParseViewDoc(raw), path };
	} catch {
		return { doc: null, path };
	}
}

export async function saveViewDoc(path: string, doc: ViewDoc): Promise<void> {
	const stable: ViewDoc = {
		...doc,
		nodes: sanitizeNodes(doc.nodes),
		edges: sanitizeEdges(doc.edges),
	};
	await invoke("glyph_write_text", {
		path,
		text: JSON.stringify(stable, null, 2),
	});
}
