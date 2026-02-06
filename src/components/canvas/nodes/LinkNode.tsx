import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";
import { memo } from "react";
import type { LinkNodeData } from "../../../lib/canvasFlowTypes";
import { getNodeRotation } from "../utils";

interface LinkNodeProps {
	data: LinkNodeData;
	id: string;
	selected?: boolean;
}

export const LinkNode = memo(function LinkNode({
	data,
	id,
	selected,
}: LinkNodeProps) {
	const url = data.url ?? "";
	const preview = data.preview ?? null;
	const title = preview?.title ?? "";
	const description = preview?.description ?? "";
	const hostname = preview?.hostname ?? "";
	const status = data.status ?? "";
	const imageSrc = data.image_src ?? "";
	const rotation = getNodeRotation(id) * 0.6;

	return (
		<motion.div
			className="rfNode rfNodeLink"
			style={{ transform: `rotate(${rotation}deg)` }}
			initial={{ opacity: 0, scale: 0.95 }}
			animate={{
				opacity: 1,
				scale: 1,
				boxShadow: selected
					? "0 0 0 2px var(--accent), 0 4px 12px rgba(0,0,0,0.15)"
					: "0 2px 8px rgba(0,0,0,0.1)",
			}}
			transition={{ duration: 0.15 }}
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
		</motion.div>
	);
});
