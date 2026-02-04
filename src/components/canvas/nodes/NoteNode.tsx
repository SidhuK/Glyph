import { Handle, type NodeProps, Position } from "@xyflow/react";
import { memo } from "react";
import { Edit } from "../../Icons";
import { useCanvasNoteEdit } from "../contexts";
import type { CanvasNode } from "../types";
import { formatNoteMtime, getNodeRotation, getRandomVariation } from "../utils";

const baseDimensions = {
	"rfNodeNote--xs": { width: "100px", minHeight: "80px" },
	"rfNodeNote--small": { width: "140px", minHeight: "100px" },
	"rfNodeNote--medium": { width: "200px", minHeight: "140px" },
	"rfNodeNote--large": { width: "280px", minHeight: "200px" },
	"rfNodeNote--xl": { width: "360px", minHeight: "260px" },
	"rfNodeNote--editor": { width: "520px", minHeight: "320px" },
	"rfNodeNote--tall": { width: "160px", minHeight: "240px" },
	"rfNodeNote--wide": { width: "320px", minHeight: "160px" },
	"rfNodeNote--square": { width: "180px", minHeight: "180px" },
};

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
	const lines = content.split("\n").filter((line) => line.trim().length > 0);
	const lineCount = lines.length;
	const avgLineLength = lines.length > 0 ? content.length / lines.length : 0;

	const baseSizeClass = !hasContent
		? "rfNodeNote--small"
		: lineCount === 1 && content.length < 30
			? "rfNodeNote--xs"
			: lineCount === 1 && content.length < 80
				? "rfNodeNote--small"
				: lineCount <= 2 && content.length < 150
					? "rfNodeNote--medium"
					: lineCount <= 4 && avgLineLength < 40
						? "rfNodeNote--tall"
						: lineCount <= 3 && avgLineLength > 60
							? "rfNodeNote--wide"
							: lineCount <= 6 && content.length < 400
								? "rfNodeNote--large"
								: content.length < 600
									? "rfNodeNote--xl"
									: "rfNodeNote--xl";

	const randomWidth = getRandomVariation(id, -15, 15);
	const randomHeight = getRandomVariation(id, -10, 20);

	const dynamicStyle: Record<string, string | undefined> = {
		width:
			randomWidth !== 0
				? `calc(var(--base-width, 200px) + ${randomWidth}px)`
				: undefined,
		minHeight:
			randomHeight !== 0
				? `calc(var(--base-height, 140px) + ${randomHeight}px)`
				: undefined,
		"--base-width": undefined,
		"--base-height": undefined,
	};

	const dimensions =
		baseDimensions[baseSizeClass as keyof typeof baseDimensions] ||
		baseDimensions["rfNodeNote--small"];
	dynamicStyle["--base-width"] = dimensions.width;
	dynamicStyle["--base-height"] = dimensions.minHeight;

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
			style={{
				...dynamicStyle,
				transform: `rotate(${rotation}deg)`,
			}}
		>
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			<>
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
			</>
		</div>
	);
});
