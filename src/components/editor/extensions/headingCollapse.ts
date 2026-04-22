import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

interface HeadingRange {
	pos: number;
	end: number;
	level: number;
	nodeSize: number;
}

interface HeadingCollapseState {
	enabled: boolean;
	collapsedPositions: Set<number>;
	decorations: DecorationSet;
	headings: HeadingRange[];
}

type HeadingCollapseMeta =
	| { type: "toggle"; pos: number }
	| { type: "expand-ancestors"; pos: number }
	| { type: "set-enabled"; enabled: boolean }
	| { type: "set-all-collapsed"; collapsed: boolean };

export const headingCollapsePluginKey = new PluginKey<HeadingCollapseState>(
	"heading-collapse",
);

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

function createToggleButton(
	pos: number,
	level: number,
	collapsed: boolean,
): (view: EditorView) => HTMLElement {
	return (view) => {
		const button = document.createElement("button");
		button.type = "button";
		button.className = "headingCollapseToggle";
		button.setAttribute("data-heading-collapse-toggle", "true");
		button.setAttribute("data-heading-level", String(level));
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
					type: "toggle",
					pos,
				} satisfies HeadingCollapseMeta),
			);
		});

		return button;
	};
}

function buildDecorations(
	doc: ProseMirrorNode,
	enabled: boolean,
	collapsedPositions: Set<number>,
	headings: HeadingRange[],
): DecorationSet {
	if (!enabled) {
		return DecorationSet.empty;
	}
	const decorations: Decoration[] = [];

	for (const heading of headings) {
		const collapsed = collapsedPositions.has(heading.pos);
		decorations.push(
			Decoration.node(heading.pos, heading.pos + heading.nodeSize, {
				class: "headingCollapseHeading",
				"data-heading-collapsed": collapsed ? "true" : "false",
			}),
		);
		decorations.push(
			Decoration.widget(
				heading.pos + 1,
				createToggleButton(heading.pos, heading.level, collapsed),
				{
					side: -1,
					key: `heading-collapse-toggle-${heading.pos}`,
				},
			),
		);

		if (!collapsed) continue;
		decorations.push(
			...collapseDecorationsForRange(
				doc,
				heading.pos + heading.nodeSize,
				heading.end,
			),
		);
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

function applyMappedPositions(
	positions: Set<number>,
	transaction: Transaction,
): Set<number> {
	const mapped = new Set<number>();
	for (const pos of positions) {
		const result = transaction.mapping.mapResult(pos, -1);
		if (!result.deleted) {
			mapped.add(result.pos);
		}
	}
	return mapped;
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		headingCollapse: {
			toggleHeadingCollapse: (pos: number) => ReturnType;
			expandHeadingAncestors: (pos: number) => ReturnType;
			setHeadingCollapseEnabled: (enabled: boolean) => ReturnType;
			collapseAllHeadings: () => ReturnType;
			expandAllHeadings: () => ReturnType;
		};
	}
}

export const HeadingCollapse = Extension.create({
	name: "headingCollapse",
	addCommands() {
		return {
			toggleHeadingCollapse:
				(pos: number) =>
				({ state, dispatch }) => {
					dispatch?.(
						state.tr.setMeta(headingCollapsePluginKey, {
							type: "toggle",
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
							type: "expand-ancestors",
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
							type: "set-enabled",
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
							type: "set-all-collapsed",
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
							type: "set-all-collapsed",
							collapsed: false,
						} satisfies HeadingCollapseMeta),
					);
					return true;
				},
		};
	},
	addProseMirrorPlugins() {
		return [
			new Plugin<HeadingCollapseState>({
				key: headingCollapsePluginKey,
				state: {
					init: (_config, state) => {
						const headings = extractHeadingRanges(state.doc);
						const collapsedPositions = new Set<number>();
						return {
							enabled: false,
							collapsedPositions,
							headings,
							decorations: buildDecorations(
								state.doc,
								false,
								collapsedPositions,
								headings,
							),
						};
					},
					apply: (transaction, pluginState, _oldState, newState) => {
						const headings = extractHeadingRanges(newState.doc);
						const headingPositions = new Set(
							headings.map((heading) => heading.pos),
						);
						let enabled = pluginState.enabled;
						let collapsedPositions = applyMappedPositions(
							pluginState.collapsedPositions,
							transaction,
						);
						collapsedPositions = new Set(
							[...collapsedPositions].filter((pos) =>
								headingPositions.has(pos),
							),
						);

						const meta = transaction.getMeta(
							headingCollapsePluginKey,
						) as HeadingCollapseMeta | null;
						if (meta?.type === "toggle") {
							const next = new Set(collapsedPositions);
							if (next.has(meta.pos)) {
								next.delete(meta.pos);
							} else if (headingPositions.has(meta.pos)) {
								next.add(meta.pos);
							}
							collapsedPositions = next;
						}
						if (meta?.type === "expand-ancestors") {
							collapsedPositions = expandAncestorPositions(
								headings,
								collapsedPositions,
								meta.pos,
							);
						}
						if (meta?.type === "set-enabled") {
							enabled = meta.enabled;
						}
						if (meta?.type === "set-all-collapsed") {
							collapsedPositions = meta.collapsed
								? new Set(headings.map((heading) => heading.pos))
								: new Set<number>();
						}

						return {
							enabled,
							collapsedPositions,
							headings,
							decorations: buildDecorations(
								newState.doc,
								enabled,
								collapsedPositions,
								headings,
							),
						};
					},
				},
				props: {
					decorations(state) {
						return (
							headingCollapsePluginKey.getState(state)?.decorations ??
							DecorationSet.empty
						);
					},
				},
			}),
		];
	},
});
