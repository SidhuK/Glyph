import { titleForFile } from "../../notePreview";
import type { FsEntry } from "../../tauri";
import { invoke } from "../../tauri";
import type { ViewDoc, ViewOptions } from "../types";
import { basename, viewId } from "../utils";
import { buildListViewDoc } from "./buildListViewDoc";
import {
	fetchNotePreviewsAllAtOnce,
	normalizeLegacyFrameChildren,
} from "./common";

export async function buildFolderViewDoc(
	dir: string,
	options: ViewOptions,
	existing: ViewDoc | null,
): Promise<{ doc: ViewDoc; changed: boolean }> {
	const v = viewId({ kind: "folder", dir });
	const recursive = options.recursive ?? false;
	const limit = options.limit ?? 500;

	const entries = recursive
		? await invoke("vault_list_files", {
				dir: v.selector || null,
				recursive: true,
				limit,
			})
		: await invoke("vault_list_dir", {
				dir: v.selector || null,
			});
	const dirEntries = await invoke("vault_list_dir", {
		dir: v.selector || null,
	});

	const recent = await invoke("vault_dir_recent_entries", {
		dir: v.selector || null,
		limit: 5,
	});
	const recentIds = new Set(recent.map((r) => r.rel_path));

	const fileByRel = new Map(
		(entries as FsEntry[])
			.filter((e) => e.kind === "file")
			.map((e) => [e.rel_path, e] as const),
	);

	const alpha: FsEntry[] = [...fileByRel.values()]
		.sort((a, b) =>
			a.rel_path.toLowerCase().localeCompare(b.rel_path.toLowerCase()),
		)
		.slice(0, limit);
	const included = new Set(alpha.map((e) => e.rel_path));

	for (const rel of recentIds) {
		const e = fileByRel.get(rel);
		if (!e) continue;
		if (included.has(rel)) continue;
		alpha.push(e);
		included.add(rel);
	}

	const rootFiles = alpha.sort((a, b) =>
		a.rel_path.toLowerCase().localeCompare(b.rel_path.toLowerCase()),
	);
	const subfolders = (dirEntries as FsEntry[])
		.filter((e) => e.kind === "dir")
		.map((e) => ({ dir_rel_path: e.rel_path, name: e.name }))
		.sort((a, b) =>
			a.dir_rel_path.toLowerCase().localeCompare(b.dir_rel_path.toLowerCase()),
		);
	const folderNodeIdForDir = (dirRelPath: string) => `folder:${dirRelPath}`;
	const folderByNodeId = new Map(
		subfolders.map((folder) => [
			folderNodeIdForDir(folder.dir_rel_path),
			folder,
		]),
	);

	const mdRoot = rootFiles.filter((f) => f.is_markdown).map((f) => f.rel_path);
	const noteContents = await fetchNotePreviewsAllAtOnce(mdRoot);
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
		normalizePrevNodes: normalizeLegacyFrameChildren,
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
