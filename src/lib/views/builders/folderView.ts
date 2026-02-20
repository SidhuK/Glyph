import { titleForFile } from "../../notePreview";
import { invoke } from "../../tauri";
import type { ViewDoc, ViewOptions } from "../types";
import { basename, viewId } from "../utils";
import { buildListViewDoc } from "./buildListViewDoc";

export async function buildFolderViewDoc(
	dir: string,
	options: ViewOptions,
	existing: ViewDoc | null,
): Promise<{ doc: ViewDoc; changed: boolean }> {
	const v = viewId({ kind: "folder", dir });
	const recursive = options.recursive ?? true;
	const limit = options.limit ?? 500;
	const folder = await invoke("vault_folder_view_data", {
		dir: v.selector || null,
		limit,
		recent_limit: 5,
	});
	const rootFiles = folder.files;
	const subfolders = folder.subfolders;
	const folderNodeIdForDir = (dirRelPath: string) => `folder:${dirRelPath}`;
	const folderByNodeId = new Map(
		subfolders.map((folder) => [
			folderNodeIdForDir(folder.dir_rel_path),
			folder,
		]),
	);

	const noteContents = new Map(
		folder.note_previews.map((note) => [
			note.id,
			{ title: note.title, content: note.content },
		]),
	);
	const fileSet = new Map(rootFiles.map((f) => [f.rel_path, f] as const));
	const primaryIds = [
		...subfolders.map((folder) => folderNodeIdForDir(folder.dir_rel_path)),
		...rootFiles.map((file) => file.rel_path),
	];

	return buildListViewDoc({
		kind: "folder",
		viewId: v.id,
		selector: v.selector,
		title: v.title,
		options: { recursive, limit },
		existing,
		primaryIds,
		buildPrimaryNode({ id, prevNode }) {
			const folderSummary = folderByNodeId.get(id);
			if (folderSummary) {
				return {
					node: {
						id,
						type: "folder",
						position: prevNode?.position ?? { x: 0, y: 0 },
						data: {
							dir: folderSummary.dir_rel_path,
							name: folderSummary.name,
							total_files: 0,
							total_markdown: 0,
							recent_markdown: [],
							preview_truncated: false,
						},
					},
					isNew: !prevNode,
				};
			}

			const f = fileSet.get(id);
			const isMarkdown = Boolean(f?.is_markdown);
			const noteData = isMarkdown ? noteContents.get(id) : null;

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
					type: isMarkdown ? "note" : "file",
					position: { x: 0, y: 0 },
					data: isMarkdown
						? {
								noteId: id,
								title: noteData?.title || titleForFile(id),
								content: noteData?.content || "",
							}
						: { path: id, title: basename(id) },
				},
				isNew: true,
			};
		},
		shouldPreservePrevNode(n) {
			if (n.type === "note" || n.type === "file" || n.type === "folder")
				return false;
			if (
				n.type === "frame" &&
				typeof n.id === "string" &&
				n.id.startsWith("folder:")
			)
				return false;
			return true;
		},
	});
}
