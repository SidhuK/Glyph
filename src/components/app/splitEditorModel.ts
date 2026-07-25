export type SplitDirection = "horizontal" | "vertical";
export type SplitDropEdge = "top" | "right" | "bottom" | "left";

export const MIN_SPLIT_RATIO = 0.1;
export const MAX_SPLIT_RATIO = 0.9;
export const DEFAULT_SPLIT_RATIO = 0.5;

export interface SplitEditorPaneNode {
	type: "pane";
	paneId: string;
}

export interface SplitEditorBranchNode {
	type: "split";
	id: string;
	direction: SplitDirection;
	ratio: number;
	first: SplitEditorNode;
	second: SplitEditorNode;
}

export type SplitEditorNode = SplitEditorPaneNode | SplitEditorBranchNode;

export const PRIMARY_EDITOR_PANE_ID = "editor-pane-primary";

export function createInitialSplitEditorLayout(): SplitEditorPaneNode {
	return { type: "pane", paneId: PRIMARY_EDITOR_PANE_ID };
}

export function paneIdsInLayout(node: SplitEditorNode): string[] {
	if (node.type === "pane") return [node.paneId];
	return [...paneIdsInLayout(node.first), ...paneIdsInLayout(node.second)];
}

export function splitEditorPane(
	node: SplitEditorNode,
	paneId: string,
	newPaneId: string,
	splitId: string,
	edge: SplitDropEdge,
): SplitEditorNode {
	if (node.type === "pane") {
		if (node.paneId !== paneId) return node;
		const currentPane: SplitEditorPaneNode = { type: "pane", paneId };
		const newPane: SplitEditorPaneNode = { type: "pane", paneId: newPaneId };
		const newPaneFirst = edge === "left" || edge === "top";
		return {
			type: "split",
			id: splitId,
			direction:
				edge === "left" || edge === "right" ? "horizontal" : "vertical",
			ratio: DEFAULT_SPLIT_RATIO,
			first: newPaneFirst ? newPane : currentPane,
			second: newPaneFirst ? currentPane : newPane,
		};
	}

	const first = splitEditorPane(
		node.first,
		paneId,
		newPaneId,
		splitId,
		edge,
	);
	if (first !== node.first) return { ...node, first };
	const second = splitEditorPane(
		node.second,
		paneId,
		newPaneId,
		splitId,
		edge,
	);
	return second === node.second ? node : { ...node, second };
}

export function removeEditorPane(
	node: SplitEditorNode,
	paneId: string,
): SplitEditorNode | null {
	if (node.type === "pane") return node.paneId === paneId ? null : node;

	const first = removeEditorPane(node.first, paneId);
	const second = removeEditorPane(node.second, paneId);
	if (!first) return second;
	if (!second) return first;
	if (first === node.first && second === node.second) return node;
	return { ...node, first, second };
}

export function updateSplitRatio(
	node: SplitEditorNode,
	splitId: string,
	ratio: number,
): SplitEditorNode {
	if (node.type === "pane") return node;
	if (node.id === splitId) return { ...node, ratio };
	const first = updateSplitRatio(node.first, splitId, ratio);
	const second = updateSplitRatio(node.second, splitId, ratio);
	return first === node.first && second === node.second
		? node
		: { ...node, first, second };
}
