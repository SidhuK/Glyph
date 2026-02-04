import { Handle, Position } from "@xyflow/react";
import { memo } from "react";
import { getNodeRotation, getStickyColor } from "../utils";

interface TextNodeProps {
	data: Record<string, unknown>;
	id: string;
}

export const TextNode = memo(function TextNode({ data, id }: TextNodeProps) {
	const text = typeof data.text === "string" ? data.text : "";
	const rotation = getNodeRotation(id) * 1.3;
	const color = getStickyColor(`${id}text`);

	const sizeClass =
		text.length < 50
			? "rfNodeText--small"
			: text.length < 150
				? "rfNodeText--medium"
				: "rfNodeText--large";

	return (
		<div
			className={`rfNode rfNodeText ${sizeClass}`}
			style={{
				background: color.bg,
				borderColor: color.border,
				transform: `rotate(${rotation}deg)`,
			}}
		>
			<Handle type="target" position={Position.Left} />
			<Handle type="source" position={Position.Right} />
			<div className="rfNodeTextContent">{text}</div>
		</div>
	);
});
