import { Handle, Position } from "@xyflow/react";
import { memo, type CSSProperties } from "react";
import { getNodeRotation, getStickyColor } from "../utils";

interface TextNodeProps {
	data: Record<string, unknown>;
	id: string;
}

export const TextNode = memo(function TextNode({ data, id }: TextNodeProps) {
	const text = typeof data.text === "string" ? data.text : "";
	const rotation = getNodeRotation(id) * 1.3;
	const color = getStickyColor(`${id}text`);

	const sizeClass = "rfNodeText--medium";

	return (
		<div
			className={`rfNode rfNodeText ${sizeClass}`}
			style={
				{
					"--sticky-accent": color.border,
					transform: `rotate(${rotation}deg)`,
				} as CSSProperties
			}
		>
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			<div className="rfNodeTextContent">{text}</div>
		</div>
	);
});
