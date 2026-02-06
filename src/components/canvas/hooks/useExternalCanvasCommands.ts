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
							data: { noteId: cmd.noteId, title: cmd.title, content: "" },
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
