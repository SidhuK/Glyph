import { useEffect } from "react";
import {
	type CanvasExternalCommand,
	type CanvasNode,
	isNoteNode,
} from "../types";

interface UseExternalCanvasCommandsProps {
	externalCommand?: CanvasExternalCommand | null;
	onExternalCommandHandled?: (id: string) => void;
	nodes: CanvasNode[];
	findDropPosition: () => { x: number; y: number };
	setNodes: React.Dispatch<React.SetStateAction<CanvasNode[]>>;
	ensureTabForNote: (noteId: string, title: string) => void;
	beginInlineEdit: (node: CanvasNode) => Promise<boolean>;
	noteEditSessionNoteId: string | null;
	updateInlineMarkdown: (nextMarkdown: string) => void;
	handleAddLinkNode: (url?: string) => Promise<void>;
}

export function useExternalCanvasCommands({
	externalCommand,
	onExternalCommandHandled,
	nodes,
	findDropPosition,
	setNodes,
	ensureTabForNote,
	beginInlineEdit,
	noteEditSessionNoteId,
	updateInlineMarkdown,
	handleAddLinkNode,
}: UseExternalCanvasCommandsProps) {
	useEffect(() => {
		if (!externalCommand) return;
		const cmd = externalCommand;
		const markHandled = () => onExternalCommandHandled?.(cmd.id);

		switch (cmd.kind) {
			case "add_note_node": {
				const existing = nodes.find(
					(n) =>
						n.type === "note" && isNoteNode(n) && n.data.noteId === cmd.noteId,
				);
				if (!existing) {
					const pos = findDropPosition();
					setNodes((prev) => [
						...prev,
						{
							id: crypto.randomUUID(),
							type: "note",
							position: pos,
							data: {
								noteId: cmd.noteId,
								title: cmd.title,
								content: cmd.content ?? "",
							},
						},
					]);
				}
				markHandled();
				break;
			}
			case "focus_node": {
				markHandled();
				break;
			}
			case "open_note_editor": {
				const existingNode = nodes.find(
					(n) =>
						n.type === "note" && isNoteNode(n) && n.data.noteId === cmd.noteId,
				);
				if (existingNode) {
					ensureTabForNote(cmd.noteId, cmd.title ?? "Untitled");
					void beginInlineEdit(existingNode);
				} else {
					const pos = findDropPosition();
					const createdNode: CanvasNode = {
						id: cmd.noteId,
						type: "note",
						position: pos,
						data: {
							noteId: cmd.noteId,
							title: cmd.title ?? "Untitled",
							content: "",
						},
					};
					setNodes((prev) => [...prev, createdNode]);
					ensureTabForNote(cmd.noteId, cmd.title ?? "Untitled");
					void beginInlineEdit(createdNode);
				}
				markHandled();
				break;
			}
			case "apply_note_markdown": {
				if (noteEditSessionNoteId === cmd.noteId) {
					updateInlineMarkdown(cmd.markdown);
				}
				markHandled();
				break;
			}
			case "add_text_node": {
				const pos = findDropPosition();
				setNodes((prev) => [
					...prev,
					{
						id: crypto.randomUUID(),
						type: "text",
						position: pos,
						data: { text: cmd.text },
					},
				]);
				markHandled();
				break;
			}
			case "add_link_node": {
				void handleAddLinkNode(cmd.url).finally(markHandled);
				break;
			}
			case "add_nodes_batch": {
				const existingNoteIds = new Set(
					nodes
						.filter((n) => n.type === "note" && isNoteNode(n))
						.map((n) => n.data.noteId),
				);
				const existingFilePaths = new Set(
					nodes
						.filter((n) => n.type === "file")
						.map((n) => (typeof n.data.path === "string" ? n.data.path : ""))
						.filter(Boolean),
				);
				const start = findDropPosition();
				const created: CanvasNode[] = [];
				const linkUrls: string[] = [];

				for (const [index, item] of cmd.nodes.entries()) {
					const offset = {
						x: start.x + (index % 5) * 40,
						y: start.y + index * 26,
					};
					if (item.kind === "note") {
						if (!item.noteId || existingNoteIds.has(item.noteId)) continue;
						existingNoteIds.add(item.noteId);
						created.push({
							id: crypto.randomUUID(),
							type: "note",
							position: offset,
							data: {
								noteId: item.noteId,
								title: item.title,
								content: item.content ?? "",
							},
						});
						continue;
					}
					if (item.kind === "file") {
						if (!item.path || existingFilePaths.has(item.path)) continue;
						existingFilePaths.add(item.path);
						created.push({
							id: crypto.randomUUID(),
							type: "file",
							position: offset,
							data: { path: item.path, title: item.title },
						});
						continue;
					}
					if (item.kind === "text") {
						created.push({
							id: crypto.randomUUID(),
							type: "text",
							position: offset,
							data: { text: item.text },
						});
						continue;
					}
					linkUrls.push(item.url);
				}

				if (created.length) {
					setNodes((prev) => [...prev, ...created]);
				}
				void Promise.all(linkUrls.map((url) => handleAddLinkNode(url))).finally(
					markHandled,
				);
				break;
			}
		}
	}, [
		externalCommand,
		onExternalCommandHandled,
		nodes,
		findDropPosition,
		setNodes,
		ensureTabForNote,
		beginInlineEdit,
		noteEditSessionNoteId,
		updateInlineMarkdown,
		handleAddLinkNode,
	]);
}
