import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, type PluginKey, type Transaction } from "@tiptap/pm/state";
import { DecorationSet } from "@tiptap/pm/view";

export interface FoldingState {
	collapsedPositions: Set<number>;
	decorations: DecorationSet;
	enabled: boolean;
}

export interface FoldingUpdate<Range, Meta> {
	collapsedPositions: Set<number>;
	enabled: boolean;
	meta: Meta | undefined;
	ranges: Range[];
}

export interface FoldingStateUpdate {
	collapsedPositions: Set<number>;
	enabled: boolean;
}

interface FoldingPluginOptions<Range, Meta> {
	buildDecorations: (
		doc: ProseMirrorNode,
		enabled: boolean,
		collapsedPositions: Set<number>,
		ranges: Range[],
	) => DecorationSet;
	extractRanges: (doc: ProseMirrorNode) => Range[];
	key: PluginKey<FoldingState>;
	mappingBias: -1 | 1;
	positionOf: (range: Range) => number;
	reduce: (state: FoldingUpdate<Range, Meta>) => FoldingStateUpdate;
}

function mapCollapsedPositions(
	transaction: Transaction,
	positions: Set<number>,
	validPositions: Set<number>,
	mappingBias: -1 | 1,
): Set<number> {
	return new Set(
		[...positions]
			.map((pos) => transaction.mapping.mapResult(pos, mappingBias))
			.filter((result) => !result.deleted && validPositions.has(result.pos))
			.map((result) => result.pos),
	);
}

export function createFoldingPlugin<Range, Meta>({
	buildDecorations,
	extractRanges,
	key,
	mappingBias,
	positionOf,
	reduce,
}: FoldingPluginOptions<Range, Meta>): Plugin<FoldingState> {
	return new Plugin<FoldingState>({
		key,
		state: {
			init: (_config, state) => {
				const ranges = extractRanges(state.doc);
				const collapsedPositions = new Set<number>();
				return {
					collapsedPositions,
					decorations: buildDecorations(
						state.doc,
						false,
						collapsedPositions,
						ranges,
					),
					enabled: false,
				};
			},
			apply: (transaction, pluginState, _oldState, newState) => {
				const meta = transaction.getMeta(key) as Meta | undefined;
				if (
					!pluginState.enabled &&
					pluginState.collapsedPositions.size === 0 &&
					!meta
				) {
					return pluginState;
				}

				const ranges = extractRanges(newState.doc);
				const mappedPositions = mapCollapsedPositions(
					transaction,
					pluginState.collapsedPositions,
					new Set(ranges.map(positionOf)),
					mappingBias,
				);
				const next = reduce({
					collapsedPositions: mappedPositions,
					enabled: pluginState.enabled,
					meta,
					ranges,
				});
				return {
					...next,
					decorations: buildDecorations(
						newState.doc,
						next.enabled,
						next.collapsedPositions,
						ranges,
					),
				};
			},
		},
		props: {
			decorations(state) {
				return key.getState(state)?.decorations ?? DecorationSet.empty;
			},
		},
	});
}
