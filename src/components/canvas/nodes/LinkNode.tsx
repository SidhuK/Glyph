import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import { getNodeRotation } from "../utils";

interface LinkNodeProps {
	data: Record<string, unknown>;
	id: string;
}

export const LinkNode = memo(function LinkNode({ data, id }: LinkNodeProps) {
	const url = typeof data.url === "string" ? data.url : "";
	const preview =
		(data.preview as Record<string, unknown> | null | undefined) ?? null;
	const title =
		preview && typeof preview.title === "string" ? preview.title : "";
	const description =
		preview && typeof preview.description === "string"
			? preview.description
			: "";
	const hostname =
		preview && typeof preview.hostname === "string" ? preview.hostname : "";
	const status = typeof data.status === "string" ? data.status : "";
	const imageSrc = typeof data.image_src === "string" ? data.image_src : "";
	const rotation = getNodeRotation(id) * 0.6;

	return (
		<div
			className="rfNode rfNodeLink"
			style={{ transform: `rotate(${rotation}deg)` }}
		>
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			{imageSrc ? (
				<img className="rfNodeLinkImage" alt="" src={imageSrc} />
			) : null}
			<div className="rfNodeTitle">{title || hostname || "Link"}</div>
			{description ? (
				<div className="rfNodeBody">{description}</div>
			) : (
				<div className="rfNodeBody mono">{url}</div>
			)}
			{status ? <div className="rfNodeSub">{status}</div> : null}
		</div>
	);
});
