import { invoke } from "../../tauri";
import type { ViewDoc, ViewOptions } from "../types";
import { viewId } from "../utils";
import { buildListViewDoc } from "./buildListViewDoc";
import { buildPrimaryNoteNode, fetchNotePreviewsAllAtOnce } from "./common";

export async function buildSearchViewDoc(
	query: string,
	options: ViewOptions,
	existing: ViewDoc | null,
): Promise<{ doc: ViewDoc; changed: boolean }> {
	const v = viewId({ kind: "search", query });
	const limit = options.limit ?? 200;
	const results = await invoke("search", { query: v.selector });

	const ids = (results ?? [])
		.map((r) => r.id)
		.filter(Boolean)
		.slice(0, limit);

	const noteContents = await fetchNotePreviewsAllAtOnce(ids);
	const titleById = new Map(
		(results ?? []).map((r) => [r.id, r.title] as const),
	);

	return buildListViewDoc({
		kind: "search",
		viewId: v.id,
		selector: v.selector,
		title: `Search: ${v.selector}`.trim(),
		options: { limit },
		existing,
		primaryIds: ids,
		buildPrimaryNode({ id, prevNode }) {
			const noteData = noteContents.get(id);
			return buildPrimaryNoteNode(id, prevNode, noteData, titleById.get(id));
		},
		shouldPreservePrevNode(n) {
			return n.type !== "note";
		},
	});
}
