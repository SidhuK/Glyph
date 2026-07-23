import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { i18n } from "../../../i18n";
import {
	createFoldingPlugin,
	type FoldingState,
	type FoldingStateUpdate,
	type FoldingUpdate,
} from "./folding";

interface ListBranch {
	key: string;
	nestedListEnd: number;
	nestedListPos: number;
	pos: number;
	toggleAnchorPos: number;
	toggleAnchorSize: number;
}

interface ListCollapseOptions {
	onCollapseToggle: (branches: string[]) => void;
}

type ListCollapseMeta =
	| { type: "set-enabled"; enabled: boolean }
	| { type: "set-collapsed-keys"; keys: string[] }
	| { type: "toggle"; pos: number };

const listCollapsePluginKey = new PluginKey<FoldingState>("list-collapse");
const LIST_NODE_NAMES = new Set(["bulletList", "orderedList", "taskList"]);
const LIST_ITEM_NODE_NAMES = new Set(["listItem", "taskItem"]);

function branchKey(doc: ProseMirrorNode, pos: number, nodeName: string): string {
	const resolved = doc.resolve(pos);
	const path = Array.from(
		{ length: resolved.depth + 1 },
		(_, depth) => resolved.index(depth),
	);
	return `${nodeName}:${path.join(".")}`;
}

function extractListBranches(doc: ProseMirrorNode): ListBranch[] {
	const branches: ListBranch[] = [];
	doc.descendants((node, pos) => {
		if (!LIST_ITEM_NODE_NAMES.has(node.type.name)) return;
		const firstChild = node.firstChild;
		if (!firstChild) return;

		let offset = 0;
		for (let index = 0; index < node.childCount; index += 1) {
			const child = node.child(index);
			if (LIST_NODE_NAMES.has(child.type.name)) {
				const nestedListPos = pos + 1 + offset;
				branches.push({
					key: branchKey(doc, pos, node.type.name),
					nestedListEnd: nestedListPos + child.nodeSize,
					nestedListPos,
					pos,
					toggleAnchorPos: pos + 1,
					toggleAnchorSize: firstChild.nodeSize,
				});
				break;
			}
			offset += child.nodeSize;
		}
	});
	return branches;
}

function createToggleButton(
	pos: number,
	collapsed: boolean,
	onCollapseToggle: (branches: string[]) => void,
): (view: EditorView) => HTMLElement {
	return (view) => {
		const button = document.createElement("button");
		const label = i18n.t(
			collapsed
				? "editor:listCollapse.expandBranch"
				: "editor:listCollapse.collapseBranch",
		);
		button.type = "button";
		button.className = "listCollapseToggle";
		button.setAttribute("data-list-collapse-toggle", "true");
		button.setAttribute("data-collapsed", String(collapsed));
		button.setAttribute("aria-label", label);
		button.setAttribute("title", label);
		button.contentEditable = "false";

		const chevron = document.createElement("span");
		chevron.className = "listCollapseChevron";
		button.appendChild(chevron);

		button.addEventListener("mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			view.dispatch(
				view.state.tr.setMeta(listCollapsePluginKey, {
					type: "toggle",
					pos,
				} satisfies ListCollapseMeta),
			);
			const state = listCollapsePluginKey.getState(view.state);
			if (!state) return;
			onCollapseToggle(
				collapsedBranchKeys(
					extractListBranches(view.state.doc),
					state.collapsedPositions,
				),
			);
		});

		return button;
	};
}

function buildDecorations(
	doc: ProseMirrorNode,
	enabled: boolean,
	collapsedPositions: Set<number>,
	branches: ListBranch[],
	onCollapseToggle: (branches: string[]) => void,
): DecorationSet {
	if (!enabled) return DecorationSet.empty;
	const decorations: Decoration[] = [];

	for (const branch of branches) {
		const collapsed = collapsedPositions.has(branch.pos);
		decorations.push(
			Decoration.node(
				branch.toggleAnchorPos,
				branch.toggleAnchorPos + branch.toggleAnchorSize,
				{ class: "listCollapseAnchor" },
			),
			Decoration.widget(
				branch.toggleAnchorPos + 1,
				createToggleButton(branch.pos, collapsed, onCollapseToggle),
				{
					key: `list-collapse-toggle-${branch.pos}-${collapsed}`,
					side: -1,
				},
			),
		);
		if (collapsed) {
			decorations.push(
				Decoration.node(branch.nestedListPos, branch.nestedListEnd, {
					class: "listCollapseHidden",
				}),
			);
		}
	}

	return DecorationSet.create(doc, decorations);
}

function collapsedBranchKeys(
	branches: ListBranch[],
	collapsedPositions: Set<number>,
): string[] {
	return branches
		.filter((branch) => collapsedPositions.has(branch.pos))
		.map((branch) => branch.key);
}

function reduceListCollapse({
	collapsedPositions,
	enabled,
	meta,
	ranges,
}: FoldingUpdate<ListBranch, ListCollapseMeta>): FoldingStateUpdate {
	let nextPositions = collapsedPositions;
	if (meta?.type === "set-collapsed-keys") {
		const keys = new Set(meta.keys);
		nextPositions = new Set(
			ranges
				.filter((branch) => keys.has(branch.key))
				.map((branch) => branch.pos),
		);
	}
	if (meta?.type === "toggle") {
		const branch = ranges.find((item) => item.pos === meta.pos);
		if (branch) {
			nextPositions = new Set(nextPositions);
			if (nextPositions.has(branch.pos)) {
				nextPositions.delete(branch.pos);
			} else {
				nextPositions.add(branch.pos);
			}
		}
	}
	return {
		collapsedPositions: nextPositions,
		enabled: meta?.type === "set-enabled" ? meta.enabled : enabled,
	};
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		listCollapse: {
			setListCollapseEnabled: (enabled: boolean) => ReturnType;
			setListCollapseKeys: (keys: string[]) => ReturnType;
		};
	}
}

export const ListCollapse = Extension.create<ListCollapseOptions>({
	name: "listCollapse",
	addOptions() {
		return {
			onCollapseToggle: () => {},
		};
	},
	addCommands() {
		return {
			setListCollapseEnabled:
				(enabled: boolean) =>
				({ state, dispatch }) => {
					dispatch?.(
						state.tr.setMeta(listCollapsePluginKey, {
							type: "set-enabled",
							enabled,
						} satisfies ListCollapseMeta),
					);
					return true;
				},
			setListCollapseKeys:
				(keys: string[]) =>
				({ state, dispatch }) => {
					dispatch?.(
						state.tr.setMeta(listCollapsePluginKey, {
							type: "set-collapsed-keys",
							keys,
						} satisfies ListCollapseMeta),
					);
					return true;
				},
		};
	},
	addProseMirrorPlugins() {
		const onCollapseToggle = this.options.onCollapseToggle;
		return [
			createFoldingPlugin({
				buildDecorations: (doc, enabled, collapsedPositions, branches) =>
					buildDecorations(
						doc,
						enabled,
						collapsedPositions,
						branches,
						onCollapseToggle,
					),
				extractRanges: extractListBranches,
				key: listCollapsePluginKey,
				mappingBias: 1,
				positionOf: (branch) => branch.pos,
				reduce: reduceListCollapse,
			}),
		];
	},
});
