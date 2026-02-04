import { NodeResizer } from "@xyflow/react";
import { memo } from "react";
import { getNodeRotation } from "../utils";

interface FrameNodeProps {
	data: Record<string, unknown>;
	id: string;
}

export const FrameNode = memo(function FrameNode({ data, id }: FrameNodeProps) {
	const title = typeof data.title === "string" ? data.title : "Frame";
	const rotation = getNodeRotation(id) * 0.3;

	return (
		<div
			className="rfNode rfNodeFrame"
			style={{ transform: `rotate(${rotation}deg)` }}
		>
			<NodeResizer minWidth={240} minHeight={180} />
			<div className="rfNodeTitle">{title}</div>
		</div>
	);
});
