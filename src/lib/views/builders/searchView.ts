import { invoke } from "../../tauri";
import type { ViewDoc, ViewOptions } from "../types";
import { viewId } from "../utils";
import { buildListViewDoc } from "./buildListViewDoc";
import { buildPrimaryNoteNode } from "./common";

export async function buildSearchViewDoc(
	query: string,
	options: ViewOptions,
	existing: ViewDoc | null,
): Promise<{ doc: ViewDoc; changed: boolean }> {
	const v = viewId({ kind: "search", query });
	const limit = options.limit ?? 200;
	const results = await invoke("search_view_data", {
		query: v.selector,
		limit,
	});
	const ids = results.map((r) => r.id);
	const noteContents = new Map(
		results.map((r) => [r.id, { title: r.title, content: r.content }] as const),
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
			return buildPrimaryNoteNode(id, prevNode, noteData, noteData?.title);
		},
		shouldPreservePrevNode(n) {
			return n.type !== "note";
		},
	});
}
