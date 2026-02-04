import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import { getNodeRotation } from "../utils";

interface FileNodeProps {
	data: Record<string, unknown>;
	id: string;
}

export const FileNode = memo(function FileNode({ data, id }: FileNodeProps) {
	const title =
		typeof data.title === "string"
			? data.title
			: typeof data.path === "string"
				? (data.path.split("/").pop() ?? data.path)
				: "File";
	const path = typeof data.path === "string" ? data.path : "";
	const imageSrc = typeof data.image_src === "string" ? data.image_src : "";
	const rotation = getNodeRotation(id) * 0.8;

	return (
		<div
			className="rfNode rfNodeFile"
			title={path}
			style={{ transform: `rotate(${rotation}deg)` }}
		>
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			{imageSrc ? (
				<img className="rfNodeFileThumb" alt="" src={imageSrc} />
			) : null}
			<div className="rfNodeTitle">{title}</div>
			<div className="rfNodeSub mono">
				{path ? `${path.slice(0, 14)}…` : ""}
			</div>
		</div>
	);
});
