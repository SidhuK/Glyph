import { RotateClockwiseIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Handle,
	type NodeProps,
	NodeResizer,
	Position,
	useReactFlow,
} from "@xyflow/react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import type { FlowEdge, FlowNode } from "../../lib/flow";
import { parseNotePreview } from "../../lib/notePreview";
import { invoke } from "../../lib/tauri";
import { basename, isMarkdownPath } from "../../utils/path";

interface TextFilePreviewDoc {
	rel_path: string;
	text: string;
	mtime_ms: number;
	truncated: boolean;
	bytes_read: number;
	total_bytes: number;
}

function FlowHandles() {
	return (
		<>
			<Handle id="top" type="source" position={Position.Top} />
			<Handle id="right" type="source" position={Position.Right} />
			<Handle id="bottom" type="source" position={Position.Bottom} />
			<Handle id="left" type="source" position={Position.Left} />
			<Handle id="top" type="target" position={Position.Top} />
			<Handle id="right" type="target" position={Position.Right} />
			<Handle id="bottom" type="target" position={Position.Bottom} />
			<Handle id="left" type="target" position={Position.Left} />
		</>
	);
}

function nodeStyle(color?: string, rotation?: number) {
	const style = {
		"--flow-node-rotation": `${rotation ?? 0}deg`,
	} as CSSProperties;
	if (color) {
		return { ...style, "--flow-node-accent": color } as CSSProperties;
	}
	return style;
}

function FlowNodeResizer({
	selected,
	minWidth,
	minHeight,
}: {
	selected: boolean;
	minWidth: number;
	minHeight: number;
}) {
	return (
		<NodeResizer
			isVisible={selected}
			minWidth={minWidth}
			minHeight={minHeight}
			color="var(--interactive-accent)"
			handleClassName="flowNodeResizeHandle"
			lineClassName="flowNodeResizeLine"
		/>
	);
}

function FlowRotateHandle({
	id,
	selected,
	rotation,
}: {
	id: string;
	selected: boolean;
	rotation?: number;
}) {
	const { setNodes } = useReactFlow<FlowNode, FlowEdge>();

	const updateRotation = useCallback(
		(nextRotation: number) => {
			setNodes((nodes) =>
				nodes.map((node) =>
					node.id === id
						? {
								...node,
								data: {
									...node.data,
									rotation: normalizeRotation(nextRotation),
								},
							}
						: node,
				),
			);
		},
		[id, setNodes],
	);

	const onPointerDown = useCallback(
		(event: ReactPointerEvent<HTMLButtonElement>) => {
			const nodeElement = event.currentTarget.closest(".flowRotatableNode");
			if (!(nodeElement instanceof HTMLElement)) return;
			event.preventDefault();
			event.stopPropagation();

			const updateFromPointer = (clientX: number, clientY: number) => {
				const rect = nodeElement.getBoundingClientRect();
				const centerX = rect.left + rect.width / 2;
				const centerY = rect.top + rect.height / 2;
				const angle =
					(Math.atan2(clientY - centerY, clientX - centerX) * 180) / Math.PI +
					90;
				updateRotation(angle);
			};

			updateFromPointer(event.clientX, event.clientY);

			const onPointerMove = (moveEvent: PointerEvent) => {
				updateFromPointer(moveEvent.clientX, moveEvent.clientY);
			};
			const onPointerUp = () => {
				window.removeEventListener("pointermove", onPointerMove);
				window.removeEventListener("pointerup", onPointerUp);
			};

			window.addEventListener("pointermove", onPointerMove);
			window.addEventListener("pointerup", onPointerUp);
		},
		[updateRotation],
	);

	if (!selected) return null;

	return (
		<button
			type="button"
			className="flowRotateHandle nodrag nopan"
			title="Rotate"
			aria-label="Rotate node"
			onPointerDown={onPointerDown}
		>
			<HugeiconsIcon icon={RotateClockwiseIcon} size={13} strokeWidth={1.7} />
			<span className="sr-only">{Math.round(rotation ?? 0)} degrees</span>
		</button>
	);
}

export const FlowTextNode = memo(function FlowTextNode({
	id,
	data,
	selected,
}: NodeProps<FlowNode>) {
	const { setNodes } = useReactFlow<FlowNode, FlowEdge>();
	const text = data.flowType === "text" ? data.text : "";
	const glyphKind = data.flowType === "text" ? data.glyphKind : "text";

	return (
		<section
			className="flowNode flowTextNode flowRotatableNode"
			data-kind={glyphKind}
			style={nodeStyle(data.color, data.rotation)}
		>
			<FlowNodeResizer selected={selected} minWidth={180} minHeight={120} />
			<FlowRotateHandle id={id} selected={selected} rotation={data.rotation} />
			<FlowHandles />
			<div className="flowTextDragHandle" aria-hidden="true" />
			<textarea
				className="flowTextInput nodrag nopan nowheel"
				value={text}
				placeholder="Write a thought..."
				onChange={(event) => {
					const nextText = event.target.value;
					setNodes((nodes) =>
						nodes.map((node) =>
							node.id === id && node.data.flowType === "text"
								? {
										...node,
										data: { ...node.data, text: nextText },
									}
								: node,
						),
					);
				}}
			/>
		</section>
	);
});

export const FlowFileNode = memo(function FlowFileNode({
	id,
	data,
	selected,
}: NodeProps<FlowNode>) {
	const file = data.flowType === "file" ? data.file : "";
	const [preview, setPreview] = useState<TextFilePreviewDoc | null>(null);
	const [error, setError] = useState<string | null>(null);
	const fileName = useMemo(() => basename(file), [file]);
	const title = useMemo(() => fileName.replace(/\.md$/i, ""), [fileName]);

	useEffect(() => {
		if (!file || !isMarkdownPath(file)) {
			setPreview(null);
			setError(null);
			return;
		}
		let cancelled = false;
		void invoke("space_read_text_preview", { path: file, max_bytes: 6000 })
			.then((doc) => {
				if (!cancelled) {
					setPreview(doc);
					setError(null);
				}
			})
			.catch((cause) => {
				if (!cancelled) {
					setPreview(null);
					setError(cause instanceof Error ? cause.message : String(cause));
				}
			});
		return () => {
			cancelled = true;
		};
	}, [file]);

	const parsed = preview ? parseNotePreview(file, preview.text) : null;

	return (
		<section
			className="flowNode flowFileNode flowRotatableNode"
			style={nodeStyle(data.color, data.rotation)}
		>
			<FlowNodeResizer selected={selected} minWidth={220} minHeight={130} />
			<FlowRotateHandle id={id} selected={selected} rotation={data.rotation} />
			<FlowHandles />
			<header className="flowNodeHeader">
				<strong>{parsed?.title || title || "Untitled"}</strong>
			</header>
			<div className="flowNodeBody nowheel">
				{error ? (
					<p className="flowNodeMuted">{error}</p>
				) : parsed?.content ? (
					<pre className="flowMarkdownPreview">{parsed.content}</pre>
				) : (
					<p className="flowNodeMuted">{file}</p>
				)}
			</div>
			<div className="flowFileName" title={file}>
				{fileName || file}
			</div>
		</section>
	);
});

export const FlowLinkNode = memo(function FlowLinkNode({
	id,
	data,
	selected,
}: NodeProps<FlowNode>) {
	const url = data.flowType === "link" ? data.url : "";
	return (
		<section
			className="flowNode flowLinkNode flowRotatableNode"
			style={nodeStyle(data.color, data.rotation)}
		>
			<FlowNodeResizer selected={selected} minWidth={220} minHeight={110} />
			<FlowRotateHandle id={id} selected={selected} rotation={data.rotation} />
			<FlowHandles />
			<header className="flowNodeHeader">
				<strong>{url.replace(/^https?:\/\//, "") || "Untitled link"}</strong>
			</header>
			<p className="flowNodeMuted">{url}</p>
		</section>
	);
});

export const FlowGroupNode = memo(function FlowGroupNode({
	id,
	data,
	selected,
}: NodeProps<FlowNode>) {
	const label = data.flowType === "group" ? data.label : "";
	return (
		<section
			className="flowGroupNode flowRotatableNode"
			style={nodeStyle(data.color, data.rotation)}
			aria-label={label || "Flow group"}
		>
			<FlowNodeResizer selected={selected} minWidth={260} minHeight={180} />
			<FlowRotateHandle id={id} selected={selected} rotation={data.rotation} />
			<div className="flowGroupLabel">{label || "Group"}</div>
		</section>
	);
});

function normalizeRotation(rotation: number): number {
	return Math.round(((rotation % 360) + 360) % 360);
}
