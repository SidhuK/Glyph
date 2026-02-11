import { Handle, type NodeProps, Position } from "@xyflow/react";
import { motion } from "motion/react";
import { memo } from "react";
import { parentDir } from "../../../utils/path";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "../../ui/shadcn/context-menu";
import { useCanvasActions } from "../contexts";
import { NODE_BASE_DIMENSIONS } from "../constants";
import type { CanvasNode } from "../types";
import { getNodeRotation } from "../utils";

export const NoteNode = memo(function NoteNode({
	data,
	id,
	selected,
}: NodeProps<CanvasNode>) {
	const { openNote, newFileInDir, newFolderInDir, reflowGrid, renamePath } =
		useCanvasActions();
	const isFanNode = typeof data.fan_parent_folder_id === "string";
	const fanIndex = typeof data.fan_index === "number" ? data.fan_index : 0;
	const fanRotation =
		typeof data.fan_rotation === "number" ? data.fan_rotation : 0;
	const title = typeof data.title === "string" ? data.title : "Note";
	const noteId = typeof data.noteId === "string" ? data.noteId : id;
	const content = typeof data.content === "string" ? data.content : "";
	const rotation = isFanNode ? fanRotation : getNodeRotation(id);
	const hasContent = content.length > 0;
	const noteDir = parentDir(noteId);
	const handleRename = () => {
		if (!noteId) return;
		const currentName = noteId.split("/").pop() ?? noteId;
		const dotIndex = currentName.lastIndexOf(".");
		const stem =
			dotIndex > 0 && dotIndex < currentName.length - 1
				? currentName.slice(0, dotIndex)
				: currentName;
		const ext =
			dotIndex > 0 && dotIndex < currentName.length - 1
				? currentName.slice(dotIndex)
				: "";
		const nextStem = window.prompt("Rename file", stem);
		if (nextStem == null) return;
		const trimmed = nextStem.trim();
		if (!trimmed) return;
		void renamePath(noteId, `${trimmed}${ext}`, "file");
	};

	const baseSizeClass = "rfNodeNote--medium";

	const dimensions =
		NODE_BASE_DIMENSIONS[baseSizeClass as keyof typeof NODE_BASE_DIMENSIONS] ||
		NODE_BASE_DIMENSIONS["rfNodeNote--small"];

	const dynamicStyle = {
		"--base-width": dimensions.width,
		"--base-height": dimensions.minHeight,
		transform: `rotate(${rotation}deg)`,
	} as React.CSSProperties;

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>
				<motion.div
					className={[
						"rfNode",
						"rfNodeNote",
						baseSizeClass,
						selected ? "rfNodeNoteSelected" : "",
					]
						.filter(Boolean)
						.join(" ")}
					layoutId={`note-node-${id}`}
					title={noteId}
					style={dynamicStyle}
					initial={
						isFanNode
							? { opacity: 0, scale: 0.97, y: -10 }
							: { opacity: 0, scale: 0.95 }
					}
					animate={
						isFanNode
							? {
									opacity: 1,
									scale: 1,
									y: 0,
									boxShadow: selected
										? "0 0 0 2px var(--accent), 0 8px 16px rgba(0,0,0,0.12)"
										: "0 2px 8px rgba(0,0,0,0.1)",
								}
							: {
									opacity: 1,
									scale: 1,
									boxShadow: selected
										? "0 0 0 2px var(--accent), 0 4px 12px rgba(0,0,0,0.15)"
										: "0 2px 8px rgba(0,0,0,0.1)",
								}
					}
					transition={
						isFanNode
							? {
									type: "spring",
									stiffness: 340,
									damping: 30,
									delay: Math.min(0.18, fanIndex * 0.022),
								}
							: { type: "spring", stiffness: 300, damping: 25 }
					}
				>
					<Handle type="target" position={Position.Left} />
					<Handle type="source" position={Position.Right} />
					<div className="rfNodeNoteHeader">
						<div className="rfNodeNoteTitle">{title}</div>
					</div>
					{hasContent && <div className="rfNodeNoteContent">{content}</div>}
				</motion.div>
			</ContextMenuTrigger>
			<ContextMenuContent className="fileTreeCreateMenu">
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={() => {
						if (noteId) openNote(noteId);
					}}
				>
					Open
				</ContextMenuItem>
				<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={handleRename}
				>
					Rename
				</ContextMenuItem>
				<ContextMenuSeparator className="fileTreeCreateMenuSeparator" />
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={() =>
						void (async () => {
							await newFileInDir(noteDir);
							reflowGrid();
						})()
					}
				>
					Add file
				</ContextMenuItem>
				<ContextMenuItem
					className="fileTreeCreateMenuItem"
					onSelect={() =>
						void (async () => {
							const created = await newFolderInDir(noteDir);
							if (created) reflowGrid();
						})()
					}
				>
					Add folder
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
});
