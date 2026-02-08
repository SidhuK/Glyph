import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";
import { memo } from "react";
import { getNodeRotation } from "../utils";

interface FileNodeProps {
	data: Record<string, unknown>;
	id: string;
	selected?: boolean;
}

export const FileNode = memo(function FileNode({
	data,
	id,
	selected,
}: FileNodeProps) {
	const isFanNode = typeof data.fan_parent_folder_id === "string";
	const fanIndex = typeof data.fan_index === "number" ? data.fan_index : 0;
	const title =
		typeof data.title === "string"
			? data.title
			: typeof data.path === "string"
				? (data.path.split("/").pop() ?? data.path)
				: "File";
	const path = typeof data.path === "string" ? data.path : "";
	const imageSrc = typeof data.image_src === "string" ? data.image_src : "";
	const rotation = isFanNode ? 0 : getNodeRotation(id) * 0.8;
	const motionInitial = isFanNode
		? { opacity: 0, scale: 0.97, y: -12 }
		: { opacity: 0, scale: 0.95 };
	const motionAnimate = isFanNode
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
			};
	const motionTransition = isFanNode
		? ({
				type: "spring",
				stiffness: 340,
				damping: 30,
				delay: Math.min(0.18, fanIndex * 0.022),
			} as const)
		: ({ duration: 0.15 } as const);

	return (
		<motion.div
			className="rfNode rfNodeFile"
			title={path}
			style={{ transform: `rotate(${rotation}deg)` }}
			initial={motionInitial}
			animate={motionAnimate}
			transition={motionTransition}
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
		</motion.div>
	);
});
