import { Handle, Position } from "@xyflow/react";
import { motion } from "motion/react";
import { type CSSProperties, memo } from "react";
import { getNodeRotation, getStickyColor } from "../utils";

interface TextNodeProps {
	data: Record<string, unknown>;
	id: string;
	selected?: boolean;
}

export const TextNode = memo(function TextNode({
	data,
	id,
	selected,
}: TextNodeProps) {
	const text = typeof data.text === "string" ? data.text : "";
	const rotation = getNodeRotation(id) * 1.3;
	const color = getStickyColor(`${id}text`);

	const sizeClass = "rfNodeText--medium";

	return (
		<motion.div
			className={`rfNode rfNodeText ${sizeClass}`}
			style={
				{
					"--sticky-accent": color.border,
					transform: `rotate(${rotation}deg)`,
				} as CSSProperties
			}
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
			<div className="rfNodeTextContent">{text}</div>
		</motion.div>
	);
});
