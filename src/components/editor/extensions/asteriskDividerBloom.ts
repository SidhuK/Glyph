import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import {
	changedRangesFromTransactions,
	visitNodesInRanges,
} from "./changedRanges";

const ASTERISK_DIVIDER_BLOOM_KEY = new PluginKey<AsteriskBloomState>(
	"asterisk-divider-bloom",
);
const ASTERISK_DIVIDER = "***";
const BLOOM_DURATION_MS = 720;

let nextBloomId = 0;

type AsteriskBloomMeta =
	| { kind: "activate"; blooms: Array<{ id: string; pos: number }> }
	| { kind: "finish"; id: string };

interface AsteriskBloomState {
	blooms: Map<string, number>;
	decorations: DecorationSet;
}

function isAsteriskDivider(node: ProseMirrorNode): boolean {
	return (
		node.type.name === "paragraph" && node.textContent === ASTERISK_DIVIDER
	);
}

function prefersReducedMotion(): boolean {
	return (
		typeof window !== "undefined" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	);
}

function isBloomPayload(value: unknown): value is { id: string; pos: number } {
	return (
		value !== null &&
		typeof value === "object" &&
		"id" in value &&
		typeof value.id === "string" &&
		"pos" in value &&
		typeof value.pos === "number"
	);
}

function isAsteriskBloomMeta(value: unknown): value is AsteriskBloomMeta {
	if (!value || typeof value !== "object" || !("kind" in value)) return false;
	if (value.kind === "finish") {
		return "id" in value && typeof value.id === "string";
	}
	if (
		value.kind !== "activate" ||
		!("blooms" in value) ||
		!Array.isArray(value.blooms)
	) {
		return false;
	}
	return value.blooms.every(isBloomPayload);
}

function dispatchBloomFinish(view: EditorView, id: string): void {
	if (view.isDestroyed) return;
	view.dispatch(
		view.state.tr.setMeta(ASTERISK_DIVIDER_BLOOM_KEY, {
			kind: "finish",
			id,
		} satisfies AsteriskBloomMeta),
	);
}

function createBloomAsterisks(view: EditorView, id: string): HTMLElement {
	const bloom = document.createElement("span");
	bloom.className = "asterisk-divider-bloom";
	bloom.setAttribute("aria-hidden", "true");
	bloom.style.display = "inline-flex";
	bloom.style.width = "3ch";
	bloom.style.marginRight = "-3ch";
	bloom.style.pointerEvents = "none";

	const colors = [
		"var(--glyph-inline-color-orange)",
		"var(--glyph-inline-color-blue)",
		"var(--glyph-inline-color-red)",
	];
	for (const color of colors) {
		const asterisk = document.createElement("span");
		asterisk.textContent = ASTERISK_DIVIDER[0];
		asterisk.style.color = color;
		asterisk.style.display = "inline-block";
		asterisk.style.width = "1ch";
		bloom.append(asterisk);
	}

	let finished = false;
	const finish = () => {
		if (finished) return;
		finished = true;
		dispatchBloomFinish(view, id);
	};
	const animation = bloom.animate(
		[
			{ opacity: 0, transform: "translateY(0.18em) scale(0.7)" },
			{ opacity: 1, transform: "translateY(0) scale(1)", offset: 0.35 },
			{ opacity: 0, transform: "translateY(-0.08em) scale(1.08)" },
		],
		{ duration: BLOOM_DURATION_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
	);
	animation.onfinish = finish;
	animation.oncancel = finish;
	return bloom;
}

function buildBloomDecorations(
	doc: ProseMirrorNode,
	blooms: Map<string, number>,
): DecorationSet {
	const decorations: Decoration[] = [];
	for (const [id, pos] of blooms) {
		const node = doc.nodeAt(pos);
		if (!node || !isAsteriskDivider(node)) continue;
		decorations.push(
			Decoration.inline(pos + 1, pos + 4, {
				style: "color: transparent",
			}),
			Decoration.widget(pos + 1, (view) => createBloomAsterisks(view, id), {
				side: -1,
				key: id,
			}),
		);
	}
	return decorations.length
		? DecorationSet.create(doc, decorations)
		: DecorationSet.empty;
}

const AsteriskDividerBloom = Extension.create({
	name: "asterisk-divider-bloom",
	addProseMirrorPlugins() {
		return [
			new Plugin<AsteriskBloomState>({
				key: ASTERISK_DIVIDER_BLOOM_KEY,
				state: {
					init: () => ({
						blooms: new Map(),
						decorations: DecorationSet.empty,
					}),
					apply(transaction, previous) {
						const rawMeta: unknown = transaction.getMeta(
							ASTERISK_DIVIDER_BLOOM_KEY,
						);
						const meta = isAsteriskBloomMeta(rawMeta) ? rawMeta : undefined;
						const blooms = new Map<string, number>();
						let bloomsChanged = false;
						for (const [id, pos] of previous.blooms) {
							if (meta?.kind === "finish" && meta.id === id) {
								bloomsChanged = true;
								continue;
							}
							const mappedPos = transaction.docChanged
								? transaction.mapping.map(pos, -1)
								: pos;
							const node = transaction.doc.nodeAt(mappedPos);
							if (node && isAsteriskDivider(node)) {
								blooms.set(id, mappedPos);
							} else {
								bloomsChanged = true;
							}
						}
						if (meta?.kind === "activate") {
							for (const bloom of meta.blooms) blooms.set(bloom.id, bloom.pos);
							bloomsChanged = true;
						}
						if (bloomsChanged) {
							return {
								blooms,
								decorations: buildBloomDecorations(transaction.doc, blooms),
							};
						}
						if (!transaction.docChanged) return previous;
						return {
							blooms,
							decorations: previous.decorations.map(
								transaction.mapping,
								transaction.doc,
							),
						};
					},
				},
				appendTransaction(transactions, _oldState, newState) {
					if (
						prefersReducedMotion() ||
						!transactions.some((transaction) => transaction.docChanged)
					) {
						return null;
					}
					const activePositions = new Set(
						ASTERISK_DIVIDER_BLOOM_KEY.getState(newState)?.blooms.values() ??
							[],
					);
					const blooms: Array<{ id: string; pos: number }> = [];
					const ranges = changedRangesFromTransactions(
						transactions,
						newState.doc.content.size,
					);
					visitNodesInRanges(newState, ranges, (node, pos) => {
						if (
							!isAsteriskDivider(node) ||
							activePositions.has(pos) ||
							pos + node.nodeSize - 1 !== newState.selection.from
						) {
							return;
						}
						blooms.push({ id: `bloom-${nextBloomId++}`, pos });
					});
					if (!blooms.length) return null;
					return newState.tr.setMeta(ASTERISK_DIVIDER_BLOOM_KEY, {
						kind: "activate",
						blooms,
					} satisfies AsteriskBloomMeta);
				},
				props: {
					decorations(state) {
						return (
							ASTERISK_DIVIDER_BLOOM_KEY.getState(state)?.decorations ??
							DecorationSet.empty
						);
					},
				},
			}),
		];
	},
});

export { AsteriskDividerBloom };
