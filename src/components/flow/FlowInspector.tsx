import { Panel } from "@xyflow/react";
import type { ReactNode } from "react";
import type { FlowEdge, FlowNode } from "../../lib/flow";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { defaultNodeColor } from "./flowNodeLayout";

interface FlowNodeInspectorProps {
	node: FlowNode;
	onUpdate: (updater: (node: FlowNode) => FlowNode) => void;
	onDetach?: () => void;
}

export function FlowNodeInspector({
	node,
	onUpdate,
	onDetach,
}: FlowNodeInspectorProps) {
	return (
		<Panel position="bottom-right" className="glyphFlowInspector">
			{onDetach ? (
				<div className="glyphFlowInspectorActions">
					<Button
						type="button"
						size="xs"
						variant="secondary"
						onClick={onDetach}
					>
						Ungroup
					</Button>
				</div>
			) : null}
			{node.data.flowType === "link" ? (
				<FlowField label="URL">
					<Input
						value={node.data.url}
						onChange={(event) =>
							onUpdate((current) =>
								current.data.flowType === "link"
									? {
											...current,
											data: { ...current.data, url: event.target.value },
										}
									: current,
							)
						}
					/>
				</FlowField>
			) : null}
			{node.data.flowType === "group" ? (
				<FlowField label="Label">
					<Input
						value={node.data.label ?? ""}
						onChange={(event) =>
							onUpdate((current) =>
								current.data.flowType === "group"
									? {
											...current,
											data: { ...current.data, label: event.target.value },
										}
									: current,
							)
						}
					/>
				</FlowField>
			) : null}
			<FlowColorField
				label="Color"
				value={node.data.color}
				fallback={defaultNodeColor(node)}
				onChange={(color) =>
					onUpdate((current) => ({
						...current,
						data: {
							...current.data,
							color,
						},
					}))
				}
			/>
		</Panel>
	);
}

interface FlowDocumentEdgeInspectorProps {
	edge: FlowEdge;
	onUpdate: (updater: (edge: FlowEdge) => FlowEdge) => void;
}

export function FlowDocumentEdgeInspector({
	edge,
	onUpdate,
}: FlowDocumentEdgeInspectorProps) {
	const label = typeof edge.label === "string" ? edge.label : "";
	const color = typeof edge.style?.stroke === "string" ? edge.style.stroke : "";

	return (
		<Panel position="bottom-right" className="glyphFlowInspector">
			<FlowField label="Label">
				<Input
					value={label}
					onChange={(event) =>
						onUpdate((current) => ({
							...current,
							label: event.target.value || undefined,
						}))
					}
				/>
			</FlowField>
			<FlowColorField
				label="Color"
				value={color}
				fallback="#667085"
				onChange={(nextColor) =>
					onUpdate((current) => ({
						...current,
						style: {
							...current.style,
							stroke: nextColor,
						},
					}))
				}
			/>
		</Panel>
	);
}

function FlowField({
	label,
	children,
}: {
	label: string;
	children: ReactNode;
}) {
	return (
		<div className="glyphFlowField">
			<span>{label}</span>
			{children}
		</div>
	);
}

function FlowColorField({
	label,
	value,
	fallback,
	onChange,
}: {
	label: string;
	value?: string;
	fallback: string;
	onChange: (color: string | undefined) => void;
}) {
	const pickerValue = colorPickerValue(value, fallback);

	return (
		<div className="glyphFlowField">
			<span>{label}</span>
			<div className="glyphFlowColorControl">
				<input
					type="color"
					value={pickerValue}
					aria-label={label}
					onChange={(event) => onChange(event.target.value)}
				/>
				<Button
					type="button"
					size="xs"
					variant="ghost"
					disabled={!value}
					onClick={() => onChange(undefined)}
				>
					Default
				</Button>
			</div>
		</div>
	);
}

function colorPickerValue(value: string | undefined, fallback: string): string {
	const normalized = normalizeHexColor(value);
	return normalized ?? normalizeHexColor(fallback) ?? "#667085";
}

function normalizeHexColor(value: string | undefined): string | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	const short = trimmed.match(/^#([0-9a-f]{3})$/i);
	if (short) {
		return `#${short[1]
			.split("")
			.map((part) => `${part}${part}`)
			.join("")
			.toLowerCase()}`;
	}
	if (/^#[0-9a-f]{6}$/i.test(trimmed)) return trimmed.toLowerCase();
	return null;
}
