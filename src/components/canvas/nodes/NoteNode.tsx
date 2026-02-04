import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { Edit } from "../../Icons";
import { NODE_BASE_DIMENSIONS } from "../constants";
import { useCanvasNoteEdit } from "../contexts";
import type { CanvasNode } from "../types";
import {
	computeNoteSizeClass,
	formatNoteMtime,
	getNodeRotation,
	getRandomVariation,
} from "../utils";

export const NoteNode = memo(function NoteNode({
	data,
	id,
	selected,
}: NodeProps<CanvasNode>) {
	const title = typeof data.title === "string" ? data.title : "Note";
	const noteId = typeof data.noteId === "string" ? data.noteId : id;
	const content = typeof data.content === "string" ? data.content : "";
	const mtimeMs = typeof data.mtimeMs === "number" ? data.mtimeMs : null;
	const { openEditor } = useCanvasNoteEdit();
	const rotation = getNodeRotation(id);
	const updatedLabel = formatNoteMtime(mtimeMs);
	const hasContent = content.length > 0;

	const baseSizeClass = computeNoteSizeClass(content);
	const randomWidth = getRandomVariation(id, -15, 15);
	const randomHeight = getRandomVariation(id, -10, 20);

	const dimensions =
		NODE_BASE_DIMENSIONS[baseSizeClass as keyof typeof NODE_BASE_DIMENSIONS] ||
		NODE_BASE_DIMENSIONS["rfNodeNote--small"];

	const dynamicStyle = {
		width:
			randomWidth !== 0
				? `calc(var(--base-width, 200px) + ${randomWidth}px)`
				: undefined,
		minHeight:
			randomHeight !== 0
				? `calc(var(--base-height, 140px) + ${randomHeight}px)`
				: undefined,
		"--base-width": dimensions.width,
		"--base-height": dimensions.minHeight,
		transform: `rotate(${rotation}deg)`,
	} as React.CSSProperties;

	return (
		<div
			className={[
				"rfNode",
				"rfNodeNote",
				baseSizeClass,
				selected ? "rfNodeNoteSelected" : "",
			]
				.filter(Boolean)
				.join(" ")}
			title={noteId}
			style={dynamicStyle}
		>
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			<div className="rfNodeNoteHeader">
				<div className="rfNodeNoteTitle">{title}</div>
				<div className="rfNodeNoteMeta">
					{updatedLabel ? (
						<div className="rfNodeNoteTimestamp">{updatedLabel}</div>
					) : null}
					<button
						type="button"
						className="iconBtn sm rfNodeNoteOpenBtn nodrag nopan"
						title="Edit"
						onClick={(e) => {
							e.stopPropagation();
							openEditor(id);
						}}
					>
						<Edit size={14} />
					</button>
				</div>
			</div>
			{hasContent && <div className="rfNodeNoteContent">{content}</div>}
		</div>
	);
});
