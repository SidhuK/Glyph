import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

interface ZenFocusPluginState {
	decorations: DecorationSet;
	enabled: boolean;
	refreshKey: number;
}

const zenFocusPluginKey = new PluginKey<ZenFocusPluginState>("zen-focus");

function buildDecorations(
	doc: ProseMirrorNode,
	selectionFrom: number,
	isEnabled: boolean,
): DecorationSet {
	if (!isEnabled) return DecorationSet.empty;

	const blocks: Array<{ index: number; pos: number; size: number }> = [];
	doc.forEach((node, offset, index) => {
		blocks.push({ index, pos: offset, size: node.nodeSize });
	});
	if (!blocks.length) return DecorationSet.empty;

	const activeIndex = blocks.findIndex(
		(block) =>
			selectionFrom >= block.pos && selectionFrom < block.pos + block.size,
	);
	if (activeIndex === -1) return DecorationSet.empty;

	const decorations = blocks.map((block) => {
		let className = "zenFocusBlock zenFocusBlockDim";
		if (block.index === activeIndex) {
			className = "zenFocusBlock zenFocusBlockActive";
		} else if (Math.abs(block.index - activeIndex) === 1) {
			className = "zenFocusBlock zenFocusBlockNeighbor";
		}

		return Decoration.node(block.pos, block.pos + block.size, {
			class: className,
		});
	});

	return DecorationSet.create(doc, decorations);
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		zenFocus: {
			refreshZenFocus: () => ReturnType;
		};
	}
}

export const ZenFocus = Extension.create<{
	getZenModeEnabled?: () => boolean;
}>({
	name: "zen-focus",

	addOptions() {
		return {
			getZenModeEnabled: () => false,
		};
	},

	addCommands() {
		return {
			refreshZenFocus:
				() =>
				({ tr, dispatch }) => {
					if (!dispatch) return true;
					dispatch(
						tr.setMeta(
							zenFocusPluginKey,
							(zenFocusPluginKey.getState(this.editor.state)?.refreshKey ?? 0) +
								1,
						),
					);
					return true;
				},
		};
	},

	addProseMirrorPlugins() {
		const getEnabled = () => this.options.getZenModeEnabled?.() ?? false;
		return [
			new Plugin({
				key: zenFocusPluginKey,
				state: {
					init: (_config, state) => {
						const enabled = getEnabled();
						return {
							decorations: buildDecorations(
								state.doc,
								state.selection.from,
								enabled,
							),
							enabled,
							refreshKey: 0,
						};
					},
					apply(tr, value) {
						const next = tr.getMeta(zenFocusPluginKey);
						const enabled = getEnabled();
						const refreshKey =
							typeof next === "number" ? next : value.refreshKey;
						if (
							!tr.docChanged &&
							!tr.selectionSet &&
							enabled === value.enabled &&
							refreshKey === value.refreshKey
						) {
							return value;
						}
						return {
							decorations: buildDecorations(tr.doc, tr.selection.from, enabled),
							enabled,
							refreshKey,
						};
					},
				},
				props: {
					decorations: (state) =>
						zenFocusPluginKey.getState(state)?.decorations ??
						DecorationSet.empty,
				},
			}),
		];
	},
});
