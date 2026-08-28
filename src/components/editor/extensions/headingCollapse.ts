import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { i18n } from "../../../i18n";

interface HeadingRange {
	pos: number;
	end: number;
	level: number;
	nodeSize: number;
}

interface ListBranch {
	key: string;
	nestedLists: Array<{ end: number; pos: number }>;
	pos: number;
}

interface HeadingCollapseState {
	headingsEnabled: boolean;
	collapsedHeadingPositions: Set<number>;
	listsEnabled: boolean;
	collapsedListPositions: Set<number>;
	decorations: DecorationSet;
}

type HeadingCollapseMeta =
	| { type: "heading-toggle"; pos: number }
	| { type: "heading-expand-ancestors"; pos: number }
	| { type: "headings-enabled"; enabled: boolean }
	| { type: "headings-collapsed"; collapsed: boolean }
	| { type: "list-toggle"; pos: number }
	| { type: "lists-enabled"; enabled: boolean }
	| { type: "lists-collapsed"; keys: string[] };

const headingCollapsePluginKey = new PluginKey<HeadingCollapseState>(
	"heading-collapse",
);
const LIST_NODE_NAMES = new Set(["bulletList", "orderedList", "taskList"]);
const LIST_ITEM_NODE_NAMES = new Set(["listItem", "taskItem"]);

function extractHeadingRanges(doc: ProseMirrorNode): HeadingRange[] {
	const headings: HeadingRange[] = [];

	doc.descendants((node, pos) => {
		if (node.type.name !== "heading") return;
		headings.push({
			pos,
			end: doc.content.size,
			level:
				typeof node.attrs.level === "number" ? (node.attrs.level as number) : 1,
			nodeSize: node.nodeSize,
		});
	});

	for (let index = 0; index < headings.length; index += 1) {
		const current = headings[index];
		for (
			let nextIndex = index + 1;
			nextIndex < headings.length;
			nextIndex += 1
		) {
			const next = headings[nextIndex];
			if (next.level <= current.level) {
				current.end = next.pos;
				break;
			}
		}
	}

	return headings;
}

function listBranchKey(doc: ProseMirrorNode, pos: number, nodeName: string) {
	const resolved = doc.resolve(pos);
	return `${nodeName}:${Array.from({ length: resolved.depth + 1 }, (_, depth) =>
		resolved.index(depth),
	).join(".")}`;
}

function extractListBranches(doc: ProseMirrorNode): ListBranch[] {
	const branches: ListBranch[] = [];
	doc.descendants((node, pos) => {
		if (!LIST_ITEM_NODE_NAMES.has(node.type.name)) return;
		let offset = 0;
		const nestedLists: Array<{ end: number; pos: number }> = [];
		for (let index = 0; index < node.childCount; index += 1) {
			const child = node.child(index);
			if (LIST_NODE_NAMES.has(child.type.name)) {
				const nestedListPos = pos + 1 + offset;
				nestedLists.push({
					end: nestedListPos + child.nodeSize,
					pos: nestedListPos,
				});
			}
			offset += child.nodeSize;
		}
		if (nestedLists.length === 0) return;
		branches.push({
			key: listBranchKey(doc, pos, node.type.name),
			nestedLists,
			pos,
		});
	});
	return branches;
}

function collapseDecorationsForRange(
	doc: ProseMirrorNode,
	from: number,
	to: number,
): Decoration[] {
	const decorations: Decoration[] = [];

	if (from >= to) return decorations;

	doc.nodesBetween(from, to, (node, pos, parent) => {
		if (parent?.type.name !== "doc" || !node.isBlock) return;
		const end = pos + node.nodeSize;
		if (pos < from || end > to) return false;
		decorations.push(
			Decoration.node(pos, end, {
				class: "headingCollapseHidden",
			}),
		);
		return false;
	});

	return decorations;
}

function collapsedListBranchKeys(
	doc: ProseMirrorNode,
	state: HeadingCollapseState,
): string[] {
	return extractListBranches(doc)
		.filter((branch) => state.collapsedListPositions.has(branch.pos))
		.map((branch) => branch.key);
}

function createToggleButton(
	pos: number,
	collapsed: boolean,
): (view: EditorView) => HTMLElement {
	return (view) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "headingCollapseToggle";
		button.setAttribute("data-collapsed", collapsed ? "true" : "false");
		button.setAttribute(
			"aria-label",
			collapsed ? "Expand section" : "Collapse section",
		);
		button.setAttribute(
			"title",
			collapsed ? "Expand section" : "Collapse section",
		);
		button.contentEditable = "false";

		const chevron = document.createElement("span");
		chevron.className = "headingCollapseChevron";
		button.appendChild(chevron);

		button.addEventListener("mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		button.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			view.dispatch(
				view.state.tr.setMeta(headingCollapsePluginKey, {
					type: "heading-toggle",
					pos,
				} satisfies HeadingCollapseMeta),
			);
		});

		return button;
	};
}

function createListToggleButton(
	pos: number,
	collapsed: boolean,
	onListCollapseToggle: (branches: string[]) => void,
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
				view.state.tr.setMeta(headingCollapsePluginKey, {
					type: "list-toggle",
					pos,
				} satisfies HeadingCollapseMeta),
			);
			const state = headingCollapsePluginKey.getState(view.state);
			if (!state) return;
			onListCollapseToggle(collapsedListBranchKeys(view.state.doc, state));
		});
		return button;
	};
}

function buildDecorations(
	doc: ProseMirrorNode,
	state: HeadingCollapseState,
	headings: HeadingRange[],
	branches: ListBranch[],
	onListCollapseToggle: (branches: string[]) => void,
): DecorationSet {
	const decorations: Decoration[] = [];

	if (state.headingsEnabled) {
		for (const heading of headings) {
			const collapsed = state.collapsedHeadingPositions.has(heading.pos);
			decorations.push(
				Decoration.node(heading.pos, heading.pos + heading.nodeSize, {
					class: "headingCollapseHeading",
				}),
				Decoration.widget(
					heading.pos + 1,
					createToggleButton(heading.pos, collapsed),
					{
						side: -1,
						key: `heading-collapse-toggle-${heading.pos}-${collapsed}`,
					},
				),
			);
			if (collapsed) {
				decorations.push(
					...collapseDecorationsForRange(
						doc,
						heading.pos + heading.nodeSize,
						heading.end,
					),
				);
			}
		}
	}

	if (state.listsEnabled) {
		for (const branch of branches) {
			const firstChild = doc.nodeAt(branch.pos)?.firstChild;
			if (!firstChild) continue;
			const collapsed = state.collapsedListPositions.has(branch.pos);
			decorations.push(
				Decoration.node(branch.pos + 1, branch.pos + 1 + firstChild.nodeSize, {
					class: "listCollapseAnchor",
				}),
				Decoration.widget(
					branch.pos + 2,
					createListToggleButton(branch.pos, collapsed, onListCollapseToggle),
					{
						side: -1,
						key: `list-collapse-toggle-${branch.pos}-${collapsed}`,
					},
				),
			);
			if (collapsed) {
				for (const nestedList of branch.nestedLists) {
					decorations.push(
						Decoration.node(nestedList.pos, nestedList.end, {
							class: "listCollapseHidden",
						}),
					);
				}
			}
		}
	}

	return DecorationSet.create(doc, decorations);
}

function expandAncestorPositions(
	headings: HeadingRange[],
	collapsedPositions: Set<number>,
	pos: number,
): Set<number> {
	const next = new Set(collapsedPositions);
	const target =
		headings.find((heading) => heading.pos === pos) ??
		[...headings]
			.reverse()
			.find((heading) => heading.pos < pos && pos < heading.end);

	if (!target) return next;

	for (const heading of headings) {
		if (heading.pos >= target.pos) break;
		if (heading.end > target.pos) {
			next.delete(heading.pos);
		}
	}

	return next;
}

function mapPositions(
	positions: Set<number>,
	transaction: Transaction,
	validPositions: Set<number>,
	bias: -1 | 1,
): Set<number> {
	const mapped = new Set<number>();
	for (const position of positions) {
		const result = transaction.mapping.mapResult(position, bias);
		if (!result.deleted && validPositions.has(result.pos))
			mapped.add(result.pos);
	}
	return mapped;
}

function findListBranchAtPosition(
	doc: ProseMirrorNode,
	pos: number,
): ListBranch | null {
	const resolved = doc.resolve(pos);
	const branches = extractListBranches(doc);

	for (let depth = resolved.depth; depth > 0; depth -= 1) {
		const node = resolved.node(depth);
		if (!LIST_ITEM_NODE_NAMES.has(node.type.name)) continue;
		const branchPos = resolved.before(depth);
		const branch = branches.find((candidate) => candidate.pos === branchPos);
		if (branch) return branch;
	}

	return null;
}

function findHeadingAtPosition(
	headings: HeadingRange[],
	pos: number,
): HeadingRange | null {
	const containingHeadings = headings.filter(
		(heading) => pos >= heading.pos && pos < heading.end,
	);
	return containingHeadings[containingHeadings.length - 1] ?? null;
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		headingCollapse: {
			toggleCurrentCollapse: () => ReturnType;
			toggleHeadingCollapse: (pos: number) => ReturnType;
			expandHeadingAncestors: (pos: number) => ReturnType;
			setHeadingCollapseEnabled: (enabled: boolean) => ReturnType;
			collapseAllHeadings: () => ReturnType;
			expandAllHeadings: () => ReturnType;
			setListCollapseEnabled: (enabled: boolean) => ReturnType;
			setListCollapseKeys: (keys: string[]) => ReturnType;
		};
	}
}

export const HeadingCollapse = Extension.create<{
	onListCollapseToggle: (branches: string[]) => void;
}>({
	name: "headingCollapse",
	addOptions() {
		return { onListCollapseToggle: () => {} };
	},
	addCommands() {
		const onListCollapseToggle = this.options.onListCollapseToggle;
		return {
			toggleCurrentCollapse:
				() =>
				({ state, dispatch }) => {
					const collapseState = headingCollapsePluginKey.getState(state);
					if (!collapseState) return false;

					const listBranch = collapseState.listsEnabled
						? findListBranchAtPosition(state.doc, state.selection.from)
						: null;
					const heading = collapseState.headingsEnabled
						? findHeadingAtPosition(
								extractHeadingRanges(state.doc),
								state.selection.from,
							)
						: null;
					const meta: HeadingCollapseMeta | null = listBranch
						? { type: "list-toggle", pos: listBranch.pos }
						: heading
							? { type: "heading-toggle", pos: heading.pos }
							: null;

					if (!meta) return false;
					const transaction = state.tr.setMeta(headingCollapsePluginKey, meta);
					dispatch?.(transaction);
					if (listBranch && dispatch) {
						const nextState = state.apply(transaction);
						const nextCollapseState =
							headingCollapsePluginKey.getState(nextState);
						if (nextCollapseState) {
							onListCollapseToggle(
								collapsedListBranchKeys(nextState.doc, nextCollapseState),
							);
						}
					}
					return true;
				},
			toggleHeadingCollapse:
				(pos: number) =>
				({ state, dispatch }) => {
					dispatch?.(
						state.tr.setMeta(headingCollapsePluginKey, {
							type: "heading-toggle",
							pos,
						} satisfies HeadingCollapseMeta),
					);
					return true;
				},
			expandHeadingAncestors:
				(pos: number) =>
				({ state, dispatch }) => {
					dispatch?.(
						state.tr.setMeta(headingCollapsePluginKey, {
							type: "heading-expand-ancestors",
							pos,
						} satisfies HeadingCollapseMeta),
					);
					return true;
				},
			setHeadingCollapseEnabled:
				(enabled: boolean) =>
				({ state, dispatch }) => {
					dispatch?.(
						state.tr.setMeta(headingCollapsePluginKey, {
							type: "headings-enabled",
							enabled,
						} satisfies HeadingCollapseMeta),
					);
					return true;
				},
			collapseAllHeadings:
				() =>
				({ state, dispatch }) => {
					dispatch?.(
						state.tr.setMeta(headingCollapsePluginKey, {
							type: "headings-collapsed",
							collapsed: true,
						} satisfies HeadingCollapseMeta),
					);
					return true;
				},
			expandAllHeadings:
				() =>
				({ state, dispatch }) => {
					dispatch?.(
						state.tr.setMeta(headingCollapsePluginKey, {
							type: "headings-collapsed",
							collapsed: false,
						} satisfies HeadingCollapseMeta),
					);
					return true;
				},
			setListCollapseEnabled:
				(enabled: boolean) =>
				({ state, dispatch }) => {
					dispatch?.(
						state.tr.setMeta(headingCollapsePluginKey, {
							type: "lists-enabled",
							enabled,
						} satisfies HeadingCollapseMeta),
					);
					return true;
				},
			setListCollapseKeys:
				(keys: string[]) =>
				({ state, dispatch }) => {
					dispatch?.(
						state.tr.setMeta(headingCollapsePluginKey, {
							type: "lists-collapsed",
							keys,
						} satisfies HeadingCollapseMeta),
					);
					return true;
				},
		};
	},
	addProseMirrorPlugins() {
		const onListCollapseToggle = this.options.onListCollapseToggle;
		return [
			new Plugin<HeadingCollapseState>({
				key: headingCollapsePluginKey,
				state: {
					init: () => ({
						headingsEnabled: false,
						collapsedHeadingPositions: new Set<number>(),
						listsEnabled: false,
						collapsedListPositions: new Set<number>(),
						decorations: DecorationSet.empty,
					}),
					apply: (transaction, previous, _oldState, nextState) => {
						const meta = transaction.getMeta(headingCollapsePluginKey) as
							| HeadingCollapseMeta
							| undefined;
						if (
							!previous.headingsEnabled &&
							!previous.listsEnabled &&
							previous.collapsedHeadingPositions.size === 0 &&
							previous.collapsedListPositions.size === 0 &&
							!meta
						) {
							return previous;
						}

						const headings = extractHeadingRanges(nextState.doc);
						const branches = extractListBranches(nextState.doc);
						const headingPositions = new Set(
							headings.map((heading) => heading.pos),
						);
						const listPositions = new Set(branches.map((branch) => branch.pos));
						let headingsEnabled = previous.headingsEnabled;
						let listsEnabled = previous.listsEnabled;
						let collapsedHeadingPositions = mapPositions(
							previous.collapsedHeadingPositions,
							transaction,
							headingPositions,
							-1,
						);
						let collapsedListPositions = mapPositions(
							previous.collapsedListPositions,
							transaction,
							listPositions,
							1,
						);

						switch (meta?.type) {
							case "heading-toggle":
								if (headingPositions.has(meta.pos)) {
									collapsedHeadingPositions = new Set(
										collapsedHeadingPositions,
									);
									if (collapsedHeadingPositions.has(meta.pos)) {
										collapsedHeadingPositions.delete(meta.pos);
									} else {
										collapsedHeadingPositions.add(meta.pos);
									}
								}
								break;
							case "heading-expand-ancestors":
								collapsedHeadingPositions = expandAncestorPositions(
									headings,
									collapsedHeadingPositions,
									meta.pos,
								);
								break;
							case "headings-enabled":
								headingsEnabled = meta.enabled;
								break;
							case "headings-collapsed":
								collapsedHeadingPositions = meta.collapsed
									? new Set(headings.map((heading) => heading.pos))
									: new Set<number>();
								break;
							case "list-toggle":
								if (listPositions.has(meta.pos)) {
									collapsedListPositions = new Set(collapsedListPositions);
									if (collapsedListPositions.has(meta.pos)) {
										collapsedListPositions.delete(meta.pos);
									} else {
										collapsedListPositions.add(meta.pos);
									}
								}
								break;
							case "lists-enabled":
								listsEnabled = meta.enabled;
								break;
							case "lists-collapsed": {
								const keys = new Set(meta.keys);
								collapsedListPositions = new Set(
									branches
										.filter((branch) => keys.has(branch.key))
										.map((branch) => branch.pos),
								);
								break;
							}
						}

						const state = {
							headingsEnabled,
							collapsedHeadingPositions,
							listsEnabled,
							collapsedListPositions,
							decorations: DecorationSet.empty,
						};
						return {
							...state,
							decorations: buildDecorations(
								nextState.doc,
								state,
								headings,
								branches,
								onListCollapseToggle,
							),
						};
					},
				},
				props: {
					decorations(state) {
						return headingCollapsePluginKey.getState(state)?.decorations;
					},
				},
				view: () => {
					let collapsedKeys = "";
					return {
						update(view, previousState) {
							if (view.state.doc.eq(previousState.doc)) return;
							const state = headingCollapsePluginKey.getState(view.state);
							const previous = headingCollapsePluginKey.getState(previousState);
							if (
								!state?.listsEnabled ||
								state.collapsedListPositions.size === 0
							) {
								if (previous?.collapsedListPositions.size) {
									onListCollapseToggle([]);
								}
								collapsedKeys = "";
								return;
							}
							const keys = collapsedListBranchKeys(view.state.doc, state);
							const nextCollapsedKeys = keys.join("\0");
							if (nextCollapsedKeys === collapsedKeys) return;
							collapsedKeys = nextCollapsedKeys;
							onListCollapseToggle(keys);
						},
					};
				},
			}),
		];
	},
});
