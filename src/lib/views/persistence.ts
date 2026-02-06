import { invoke } from "../tauri";
import { sanitizeEdges, sanitizeNodes } from "./sanitize";
import type { ViewDoc, ViewRef } from "./types";
import { viewDocPath } from "./utils";

function tryParseViewDoc(raw: string): ViewDoc | null {
	try {
		const parsed = JSON.parse(raw) as ViewDoc;
		if (!parsed || typeof parsed !== "object") return null;
		if (parsed.schema_version !== 1) return null;
		if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges))
			return null;
		return parsed;
	} catch {
		return null;
	}
}

export async function loadViewDoc(
	view: ViewRef,
): Promise<{ doc: ViewDoc | null; path: string }> {
	const path = await viewDocPath(view);
	try {
		const raw = await invoke("lattice_read_text", { path });
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
	await invoke("lattice_write_text", {
		path,
		text: JSON.stringify(stable, null, 2),
	});
}
