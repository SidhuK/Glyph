import { invoke } from "../../tauri";
import type { ViewDoc, ViewOptions } from "../types";
import { viewId } from "../utils";
import { buildListViewDoc } from "./buildListViewDoc";
import { buildPrimaryNoteNode } from "./common";

export async function buildTagViewDoc(
	tag: string,
	options: ViewOptions,
	existing: ViewDoc | null,
): Promise<{ doc: ViewDoc; changed: boolean }> {
	const norm = tag.startsWith("#") ? tag : `#${tag}`;
	const v = viewId({ kind: "tag", tag: norm });
	const limit = options.limit ?? 500;
	const results = await invoke("tag_view_data", { tag: v.selector, limit });
	const ids = results.map((r) => r.id);
	const noteContents = new Map(
		results.map((r) => [r.id, { title: r.title, content: r.content }] as const),
	);

	return buildListViewDoc({
		kind: "tag",
		viewId: v.id,
		selector: v.selector,
		title: v.title,
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
