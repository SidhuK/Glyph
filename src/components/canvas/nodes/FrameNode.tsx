import { NodeResizer } from "@xyflow/react";
import { motion } from "motion/react";
import { memo } from "react";
import { getNodeRotation } from "../utils";

interface FrameNodeProps {
	data: Record<string, unknown>;
	id: string;
	selected?: boolean;
}

export const FrameNode = memo(function FrameNode({
	data,
	id,
	selected,
}: FrameNodeProps) {
	const title = typeof data.title === "string" ? data.title : "Frame";
	const rotation = getNodeRotation(id) * 0.3;

	return (
		<motion.div
			className="rfNode rfNodeFrame"
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
			<NodeResizer minWidth={240} minHeight={180} />
			<div className="rfNodeTitle">{title}</div>
		</motion.div>
	);
});
