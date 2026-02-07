import { titleForFile } from "../../notePreview";
import { invoke } from "../../tauri";
import type { ViewDoc, ViewOptions } from "../types";
import { viewId } from "../utils";
import { buildListViewDoc } from "./buildListViewDoc";
import { fetchNotePreviewsAllAtOnce } from "./common";

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
			if (prevNode) {
				if (prevNode.type === "note") {
					return {
						node: {
							...prevNode,
							data: {
								...prevNode.data,
								title:
									noteData?.title ||
									(typeof prevNode.data.title === "string"
										? prevNode.data.title
										: undefined) ||
									titleForFile(id),
								content: noteData?.content || "",
							},
						},
						isNew: false,
					};
				}
				return { node: { ...prevNode }, isNew: false };
			}
			return {
				node: {
					id,
					type: "note",
					position: { x: 0, y: 0 },
					data: {
						noteId: id,
						title: noteData?.title || titleById.get(id) || titleForFile(id),
						content: noteData?.content || "",
					},
				},
				isNew: true,
			};
		},
		shouldPreservePrevNode(n) {
			return n.type !== "note";
		},
	});
}
